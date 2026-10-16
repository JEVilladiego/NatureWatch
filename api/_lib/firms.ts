import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}
import { getDb } from './admin.js';
import { findProtectedAreaByPoint, type ProtectedAreaHit } from './protectedAreas.js';

// Rizal Province bounding box [West, South, East, North]
const RIZAL_BBOX = '121.09,14.27,121.46,14.84';

// Rizal Municipal centroids for proximity resolution
const RIZAL_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  'Antipolo City': { lat: 14.5842, lng: 121.1763 },
  'Angono': { lat: 14.5249, lng: 121.1554 },
  'Baras': { lat: 14.5361, lng: 121.2678 },
  'Binangonan': { lat: 14.4644, lng: 121.1923 },
  'Cainta': { lat: 14.5772, lng: 121.1215 },
  'Cardona': { lat: 14.4842, lng: 121.2294 },
  'Jalajala': { lat: 14.3542, lng: 121.3250 },
  'Morong': { lat: 14.5111, lng: 121.2389 },
  'Pililla': { lat: 14.4814, lng: 121.3354 },
  'Rodriguez (Montalban)': { lat: 14.7333, lng: 121.1500 },
  'San Mateo': { lat: 14.6972, lng: 121.1219 },
  'Tanay': { lat: 14.4981, lng: 121.2858 },
  'Taytay': { lat: 14.5667, lng: 121.1333 },
  'Teresa': { lat: 14.5606, lng: 121.2089 },
};

function resolveClosestMunicipality(lat: number, lng: number): string {
  let closestMun = 'Tanay';
  let minDistanceSq = Infinity;
  for (const [mun, coords] of Object.entries(RIZAL_CENTROIDS)) {
    const dLat = lat - coords.lat;
    const dLng = lng - coords.lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestMun = mun;
    }
  }
  return closestMun;
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function encodeGeohash(latitude: number, longitude: number, precision: number = 8): string {
  let latMin = -90.0, latMax = 90.0, lonMin = -180.0, lonMax = 180.0;
  let geohash = '', isEven = true, bit = 0, ch = 0;
  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude > mid) { ch |= 1 << (4 - bit); lonMin = mid; } else { lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude > mid) { ch |= 1 << (4 - bit); latMin = mid; } else { latMax = mid; }
    }
    isEven = !isEven;
    if (bit < 4) { bit++; } else { geohash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return geohash;
}

export interface FirmsIngestResult {
  success: boolean;
  ingestedCount: number;
  totalHotspotsDetected: number;
  message: string;
  hotspots: Array<{ id: string; referenceCode: string; lat: number; lng: number; frp: number; municipality: string }>;
}

/**
 * Fetches NASA FIRMS orbital thermal telemetry for Rizal Province,
 * filters coordinates, calculates spatial risks, and creates SAT-XXXXX tickets in Firestore.
 */
export async function ingestFirmsHotspots(dayRange: number = 2): Promise<FirmsIngestResult> {
  const apiKey = process.env.NASA_FIRMS_MAP_KEY;
  if (!apiKey) {
    throw new Error('Missing NASA_FIRMS_MAP_KEY in server environment.');
  }

  const sources = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT'];
  const allLines: string[] = [];

  for (const source of sources) {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${source}/${RIZAL_BBOX}/${dayRange}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[FIRMS] Failed to fetch ${source}: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      const lines = text.trim().split('\n');
      if (lines.length > 1) {
        // Skip header for subsequent sources
        const rows = allLines.length === 0 ? lines : lines.slice(1);
        allLines.push(...rows);
      }
    } catch (err) {
      console.warn(`[FIRMS] Fetch error for ${source}:`, err);
    }
  }

  if (allLines.length <= 1) {
    return {
      success: true,
      ingestedCount: 0,
      totalHotspotsDetected: 0,
      message: 'No active satellite thermal hotspots detected in Rizal in the past 48 hours.',
      hotspots: [],
    };
  }

  const header = allLines[0].split(',');
  const latIdx = header.indexOf('latitude');
  const lngIdx = header.indexOf('longitude');
  const brightTi4Idx = header.indexOf('bright_ti4');
  const acqDateIdx = header.indexOf('acq_date');
  const acqTimeIdx = header.indexOf('acq_time');
  const satelliteIdx = header.indexOf('satellite');
  const confidenceIdx = header.indexOf('confidence');
  const frpIdx = header.indexOf('frp');
  const daynightIdx = header.indexOf('daynight');

  const rows = allLines.slice(1);
  const db = getDb();
  let ingestedCount = 0;
  const resultHotspots: FirmsIngestResult['hotspots'] = [];

  for (const rowStr of rows) {
    const parts = rowStr.split(',');
    if (parts.length < header.length) continue;

    const lat = Number(parts[latIdx]);
    const lng = Number(parts[lngIdx]);
    if (isNaN(lat) || isNaN(lng)) continue;

    // Strict Rizal bounding box check
    if (lat < 14.27 || lat > 14.84 || lng < 121.09 || lng > 121.46) continue;

    const brightTi4 = Number(parts[brightTi4Idx]) || 300;
    const acqDate = parts[acqDateIdx]?.trim() || new Date().toISOString().split('T')[0];
    const acqTime = parts[acqTimeIdx]?.trim() || '1200';
    const satellite = parts[satelliteIdx]?.trim() || 'VIIRS';
    const confidence = parts[confidenceIdx]?.trim() || 'nominal';
    const frp = Number(parts[frpIdx]) || 0;
    const dayNight = parts[daynightIdx]?.trim() === 'D' ? 'D' : 'N';

    // Unique deterministic document ID to prevent duplicate tickets across runs
    const docId = `firms_${acqDate}_${lat.toFixed(3)}_${lng.toFixed(3)}`;

    // Check if ticket already exists
    const existingDoc = await db.collection('reports').doc(docId).get();
    if (existingDoc.exists) {
      continue;
    }

    const closestMun = resolveClosestMunicipality(lat, lng);
    const protectedArea = findProtectedAreaByPoint(lat, lng);

    // Calculate intelligent severity
    let severity: 1 | 2 | 3 | 4 | 5 = 3;
    if (frp >= 10 || brightTi4 >= 345) {
      severity = 4;
    }
    if (protectedArea) {
      severity = 5; // Direct statutory violation inside an ecological reserve
    }

    const dateClean = acqDate.replace(/-/g, '').slice(2);
    const seq = Math.floor(100 + Math.random() * 900);
    const referenceCode = `SAT-${dateClean}-${seq}`;

    const padTime = acqTime.padStart(4, '0');
    const timeIso = `${acqDate}T${padTime.slice(0, 2)}:${padTime.slice(2)}:00.000Z`;

    const reportData = {
      id: docId,
      referenceCode,
      createdAt: timeIso,
      status: 'pending',
      statusHistory: [
        {
          status: 'pending',
          changedBy: `NASA FIRMS (${satellite === 'N' ? 'Suomi-NPP' : 'NOAA-20'})`,
          changedAt: new Date().toISOString(),
          notes: `Automated satellite thermal detection: Brightness ${brightTi4}K, Fire Radiative Power ${frp}MW, Confidence: ${confidence}`,
        },
      ],
      location: {
        lat,
        lng,
        accuracyMeters: 375,
        geohash: encodeGeohash(lat, lng),
        source: 'satellite_firms',
        municipality: closestMun,
        barangay: protectedArea ? protectedArea.shortName : 'Sierra Madre Upland',
        landmark: protectedArea ? `Inside ${protectedArea.name}` : undefined,
      },
      rawInput: {
        description: `Satellite-detected thermal hotspot from NASA VIIRS sensor (375m spatial resolution). Radiative fire power: ${frp} MW, brightness temperature: ${brightTi4} K (${(brightTi4 - 273.15).toFixed(1)}°C). Suspected active mountain fire, slash-and-burn (kaingin), or charcoal pit (ulingan).`,
        hasImage: false,
        imageCount: 0,
      },
      source: 'satellite_firms',
      satelliteData: {
        satellite: satellite === 'N' ? 'VIIRS Suomi-NPP' : `VIIRS ${satellite}`,
        instrument: 'VIIRS',
        frp,
        brightnessTemp: brightTi4,
        confidence,
        acqDate: acqDate,
        acqTime: padTime,
        dayNight: dayNight,
      },
      triageStatus: 'done',
      aiTriage: {
        category: 'air_pollution_burning',
        severity,
        confidence: confidence === 'h' ? 0.95 : 0.85,
        summary: `Orbital thermal anomaly detected by NASA VIIRS near ${closestMun}${protectedArea ? ` inside ${protectedArea.shortName}` : ''}. Active thermal power of ${frp} MW.`,
        reasoning: `Spaceborne infrared radiometer detected a ground pixel temperature of ${brightTi4}K with Fire Radiative Power of ${frp}MW.${protectedArea ? ` Situated within ${protectedArea.name} (${protectedArea.legalBasis}), triggering statutory high-priority alert.` : ''}`,
        model: 'NASA-VIIRS-LANCE',
        triagedAt: new Date().toISOString(),
        protectedZone: protectedArea
          ? {
              id: protectedArea.id,
              name: protectedArea.name,
              shortName: protectedArea.shortName,
              category: protectedArea.category,
              type: protectedArea.type,
              severityBonus: protectedArea.severityBonus,
              municipality: protectedArea.municipality,
              legalBasis: protectedArea.legalBasis,
              legalNote: protectedArea.legalNote,
              center: protectedArea.center,
            }
          : null,
      },
      final: null,
      duplicateClusterId: null,
    };

    await db.collection('reports').doc(docId).set(reportData);
    ingestedCount++;
    resultHotspots.push({
      id: docId,
      referenceCode,
      lat,
      lng,
      frp,
      municipality: closestMun,
    });
  }

  return {
    success: true,
    ingestedCount,
    totalHotspotsDetected: rows.length,
    message: `NASA FIRMS sync complete: ${ingestedCount} new autonomous tickets created out of ${rows.length} detected satellite hotspots.`,
    hotspots: resultHotspots,
  };
}
