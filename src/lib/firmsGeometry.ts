import { calculateDistanceMeters } from './geohash';
import type { IncidentReport } from '../types/report';

/**
 * Calculates the Leaflet bounding box coordinates [[southWestLat, southWestLng], [northEastLat, northEastLng]]
 * for a VIIRS 375m × 375m ground pixel centered at (lat, lng).
 *
 * VIIRS 375m I-band (I4 thermal infrared, 3.74 μm) nominal pixel dimension: 375 meters.
 * Half-width = 187.5 meters.
 */
export function getFirms375mBounds(
  lat: number,
  lng: number
): [[number, number], [number, number]] {
  const halfMeters = 187.5;
  const metersPerDegreeLat = 111132;
  const deltaLat = halfMeters / metersPerDegreeLat;

  const latRad = (lat * Math.PI) / 180;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos(latRad);
  const deltaLng = halfMeters / Math.max(metersPerDegreeLng, 1);

  return [
    [lat - deltaLat, lng - deltaLng],
    [lat + deltaLat, lng + deltaLng],
  ];
}

/**
 * Converts NASA FIRMS UTC acquisition date (YYYY-MM-DD) and acquisition time (HHMM UTC)
 * to Philippine Standard Time (PHT = UTC+8) with clean presentation formatting.
 *
 * Example: acqDate = "2026-10-17", acqTime = "0530" (05:30 UTC) -> "Oct 17, 2026 • 1:30 PM PHT"
 */
export function formatFirmsPhtTime(acqDate?: string, acqTime?: string): string {
  if (!acqDate) return 'Recent Pass';

  const cleanTime = (acqTime || '1200').padStart(4, '0');
  const hours = cleanTime.slice(0, 2);
  const minutes = cleanTime.slice(2, 4);

  const utcIso = `${acqDate}T${hours}:${minutes}:00.000Z`;
  const utcDate = new Date(utcIso);

  if (isNaN(utcDate.getTime())) {
    return `${acqDate} ${cleanTime} UTC`;
  }

  const formattedDate = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcDate);

  const formattedTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(utcDate);

  return `${formattedDate} • ${formattedTime} PHT`;
}

export interface FirmsCrossCheckResult {
  matched: boolean;
  distanceMeters: number;
  matchedReport?: IncidentReport;
  nearestReport?: IncidentReport;
}

/**
 * Automated spatial cross-check engine between a NASA FIRMS thermal anomaly and citizen reports.
 * Runs Haversine distance calculations (< 500 meters threshold).
 */
export function crossCheckFirmsWithReports(
  satReport: IncidentReport,
  communityReports: IncidentReport[],
  thresholdMeters: number = 500
): FirmsCrossCheckResult {
  const satCoords = satReport.location;
  if (!satCoords || typeof satCoords.lat !== 'number' || typeof satCoords.lng !== 'number') {
    return { matched: false, distanceMeters: Infinity };
  }

  let minDistance = Infinity;
  let closestReport: IncidentReport | undefined = undefined;

  for (const report of communityReports) {
    if (report.source === 'satellite_firms' || report.id.startsWith('SAT-') || report.satelliteHotspot) {
      continue;
    }
    if (report.status === 'spam') continue;

    const repCoords = report.location;
    if (!repCoords || typeof repCoords.lat !== 'number' || typeof repCoords.lng !== 'number') {
      continue;
    }

    const dist = calculateDistanceMeters(
      satCoords.lat,
      satCoords.lng,
      repCoords.lat,
      repCoords.lng
    );

    if (dist < minDistance) {
      minDistance = dist;
      closestReport = report;
    }
  }

  if (minDistance <= thresholdMeters && closestReport) {
    return {
      matched: true,
      distanceMeters: minDistance,
      matchedReport: closestReport,
    };
  }

  return {
    matched: false,
    distanceMeters: minDistance,
    nearestReport: closestReport,
  };
}

/**
 * Injects 2 realistic VIIRS 375m thermal anomaly data points for live demo pitches:
 * 1. Anomaly A: Overlaps an active community report (~120m away) to demonstrate multi-source corroboration.
 * 2. Anomaly B: Located in isolated Sierra Madre / Upper Marikina forest canopy to demonstrate detection of unreported wildland fires.
 */
export function generateFirmsSimulationReports(
  referenceCommunityReport?: IncidentReport | null
): IncidentReport[] {
  // If a community report is provided, anchor Anomaly A near it (~120m offset)
  const anchorLat = referenceCommunityReport?.location.lat ?? 14.5772; // Default: Cainta / Antipolo ridge
  const anchorLng = referenceCommunityReport?.location.lng ?? 121.1215;
  const anchorMun = referenceCommunityReport?.location.municipality || 'Cainta';
  const anchorBrgy = referenceCommunityReport?.location.barangay || 'San Juan';

  // Anomaly A: Matched Corroboration Hotspot (VIIRS NOAA-20 Daytime pass)
  const matchedHotspot: IncidentReport = {
    id: 'firms_sim_matched_viirs_noaa20',
    referenceCode: 'SAT-2410-882',
    createdAt: new Date('2026-10-17T05:30:00.000Z').toISOString(),
    status: 'pending',
    statusHistory: [
      {
        status: 'pending',
        changedBy: 'NASA FIRMS (NOAA-20)',
        changedAt: new Date('2026-10-17T05:30:00.000Z').toISOString(),
        notes: 'Automated satellite thermal detection: Brightness 348.6K (75.5°C), Fire Radiative Power 18.4MW, Confidence: high',
      },
    ],
    location: {
      lat: anchorLat + 0.0008,
      lng: anchorLng + 0.0007,
      accuracyMeters: 375,
      geohash: 'wdw4yq',
      source: 'satellite_firms',
      municipality: anchorMun,
      barangay: anchorBrgy,
      landmark: `${anchorMun} Residential-Agro Boundary`,
    },
    rawInput: {
      description:
        'Satellite-detected thermal hotspot from NASA VIIRS sensor (375m spatial resolution). Radiative fire power: 18.4 MW, brightness temperature: 348.6 K (75.5°C). Spaceborne infrared corroboration within 120m of citizen observation.',
      hasImage: false,
      imageCount: 0,
    },
    source: 'satellite_firms',
    satelliteHotspot: {
      satellite: 'VIIRS NOAA-20 (JPSS-1)',
      instrument: 'VIIRS',
      frp: 18.4,
      brightnessTemp: 348.6,
      brightnessTemperature: 348.6,
      confidence: 'high',
      acqDate: '2026-10-17',
      acqTime: '0530',
      dayNight: 'D',
      daynight: 'D',
    },
    triageStatus: 'done',
    aiTriage: {
      category: 'air_pollution_burning',
      severity: 5,
      confidence: 0.98,
      summary: `Critical VIIRS thermal anomaly detected over ${anchorMun} (${anchorBrgy}). Radiant power 18.4 MW. Corroborates nearby citizen alert.`,
      reasoning:
        'Orbital radiometer detected 348.6K brightness temperature and 18.4MW radiative fire power. Spatial proximity (<150m) to active citizen report warrants immediate Severity 5 statutory escalation.',
      model: 'NASA-VIIRS-NOAA20-LANCE',
      triagedAt: new Date('2026-10-17T05:30:00.000Z').toISOString(),
    },
    final: null,
    duplicateClusterId: null,
  };

  // Anomaly B: Unreported Wildland Anomaly (VIIRS Suomi-NPP Night pass in Sierra Madre canopy)
  const isolatedHotspot: IncidentReport = {
    id: 'firms_sim_isolated_viirs_snpp',
    referenceCode: 'SAT-2410-914',
    createdAt: new Date('2026-10-17T17:45:00.000Z').toISOString(),
    status: 'pending',
    statusHistory: [
      {
        status: 'pending',
        changedBy: 'NASA FIRMS (Suomi-NPP)',
        changedAt: new Date('2026-10-17T17:45:00.000Z').toISOString(),
        notes: 'Automated satellite thermal detection: Brightness 327.4K (54.3°C), Fire Radiative Power 9.2MW, Confidence: nominal',
      },
    ],
    location: {
      lat: 14.6854,
      lng: 121.3412,
      accuracyMeters: 375,
      geohash: 'wdw5m8',
      source: 'satellite_firms',
      municipality: 'Tanay',
      barangay: 'Upper Marikina Protected Landscape',
      landmark: 'Sierra Madre Upland Forest Reserve',
    },
    rawInput: {
      description:
        'Satellite-detected thermal hotspot from NASA VIIRS sensor (375m spatial resolution). Radiative fire power: 9.2 MW, brightness temperature: 327.4 K (54.3°C). Isolated upland canopy fire with zero citizen reports within 5 km.',
      hasImage: false,
      imageCount: 0,
    },
    source: 'satellite_firms',
    satelliteHotspot: {
      satellite: 'VIIRS Suomi-NPP',
      instrument: 'VIIRS',
      frp: 9.2,
      brightnessTemp: 327.4,
      brightnessTemperature: 327.4,
      confidence: 'nominal',
      acqDate: '2026-10-17',
      acqTime: '1745',
      dayNight: 'N',
      daynight: 'N',
    },
    triageStatus: 'done',
    aiTriage: {
      category: 'air_pollution_burning',
      severity: 4,
      confidence: 0.88,
      summary:
        'Unreported thermal anomaly detected in Sierra Madre canopy (Upper Marikina Protected Landscape). Radiant power 9.2 MW.',
      reasoning:
        'Spaceborne nighttime infrared sensor detected 327.4K thermal emission in dense forest reserve. Zero human reports logged within 6.4 km radius. Automated LGU dispatch recommended.',
      model: 'NASA-VIIRS-SNPP-LANCE',
      triagedAt: new Date('2026-10-17T17:45:00.000Z').toISOString(),
    },
    final: null,
    duplicateClusterId: null,
  };

  return [matchedHotspot, isolatedHotspot];
}
