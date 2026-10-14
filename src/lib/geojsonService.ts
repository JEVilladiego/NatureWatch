export interface GeoJSONGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: any;
}

export interface MunicipalityFeatureProperties {
  name: string;
  adm3_en?: string;
  adm3_pcode?: string;
  psgc_name?: string;
  area_sqkm?: number;
}

export interface ProvinceFeatureProperties {
  name: string;
  adm2_en?: string;
  adm2_pcode?: string;
  area_sqkm?: number;
}

export interface GeoJSONFeature<P = any> {
  type: 'Feature';
  properties: P;
  geometry: GeoJSONGeometry;
}

export interface GeoJSONFeatureCollection<P = any> {
  type: 'FeatureCollection';
  features: GeoJSONFeature<P>[];
}

// In-memory singletons to avoid re-fetching
let cachedProvince: GeoJSONFeatureCollection<ProvinceFeatureProperties> | null = null;
let cachedMunicipalities: GeoJSONFeatureCollection<MunicipalityFeatureProperties> | null = null;
let cachedInvertedMask: GeoJSONFeature | null = null;

const WORLD_MASK_RING: [number, number][] = [
  [-180, 85],
  [180, 85],
  [180, -85],
  [-180, -85],
  [-180, 85],
];

export async function fetchRizalProvinceGeoJSON(): Promise<GeoJSONFeatureCollection<ProvinceFeatureProperties>> {
  if (cachedProvince) return cachedProvince;
  const res = await fetch('/geojson/rizal-province.geojson');
  if (!res.ok) throw new Error(`Failed to load rizal-province.geojson: ${res.statusText}`);
  cachedProvince = await res.json();
  return cachedProvince!;
}

export async function fetchRizalMunicipalitiesGeoJSON(): Promise<GeoJSONFeatureCollection<MunicipalityFeatureProperties>> {
  if (cachedMunicipalities) return cachedMunicipalities;
  const res = await fetch('/geojson/rizal-municipalities.geojson');
  if (!res.ok) throw new Error(`Failed to load rizal-municipalities.geojson: ${res.statusText}`);
  cachedMunicipalities = await res.json();
  return cachedMunicipalities!;
}

/**
 * Generates an inverted polygon GeoJSON feature covering the entire world
 * with interior holes cut out precisely for Rizal Province mainland and islands.
 * Rendered with SVG evenodd fill-rule, this grays out everything outside Rizal.
 */
export async function fetchRizalInvertedMaskGeoJSON(): Promise<GeoJSONFeature> {
  if (cachedInvertedMask) return cachedInvertedMask;
  const province = await fetchRizalProvinceGeoJSON();
  const feature = province.features[0];
  const holes = feature.geometry.coordinates.map((poly: any) => poly[0]);
  cachedInvertedMask = {
    type: 'Feature',
    properties: { name: 'Non-Rizal Inverted Mask' },
    geometry: {
      type: 'Polygon',
      coordinates: [WORLD_MASK_RING, ...holes],
    },
  };
  return cachedInvertedMask;
}

/**
 * Standard ray-casting algorithm to test if a point [lng, lat] is inside a polygon ring
 */
function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  const [lng, lat] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Tests if point [lng, lat] is inside a Polygon or MultiPolygon geometry
 */
export function isPointInGeometry(point: [number, number], geometry: GeoJSONGeometry): boolean {
  if (!geometry || !geometry.coordinates) return false;

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as [number, number][][];
    if (!rings.length || !pointInRing(point, rings[0])) return false;
    for (let k = 1; k < rings.length; k++) {
      if (pointInRing(point, rings[k])) return false; // Inside a hole
    }
    return true;
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates as [number, number][][][];
    for (const rings of polygons) {
      if (rings.length && pointInRing(point, rings[0])) {
        let inHole = false;
        for (let k = 1; k < rings.length; k++) {
          if (pointInRing(point, rings[k])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Checks if a lat/lng is within Rizal Province borders
 */
export async function isPointInRizal(lat: number, lng: number): Promise<boolean> {
  try {
    const provGeo = await fetchRizalProvinceGeoJSON();
    if (!provGeo?.features?.length) return true; // Fail-open gracefully
    return isPointInGeometry([lng, lat], provGeo.features[0].geometry);
  } catch (err) {
    console.warn('[geojsonService] Province check error:', err);
    return true;
  }
}

/**
 * Identifies which Rizal municipality a lat/lng point falls into
 */
export async function findMunicipalityByPoint(lat: number, lng: number): Promise<string | null> {
  try {
    const munGeo = await fetchRizalMunicipalitiesGeoJSON();
    if (!munGeo?.features?.length) return null;

    for (const feature of munGeo.features) {
      if (isPointInGeometry([lng, lat], feature.geometry)) {
        return feature.properties.name;
      }
    }
    return null;
  } catch (err) {
    console.warn('[geojsonService] Municipality lookup error:', err);
    return null;
  }
}

/**
 * Calculates Leaflet-compatible bounding box [[south, west], [north, east]]
 */
export function getGeometryBounds(geometry: GeoJSONGeometry): [[number, number], [number, number]] | null {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  let hasPoints = false;

  const processCoord = (c: [number, number]) => {
    const [lng, lat] = c;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    hasPoints = true;
  };

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      for (const pt of ring) processCoord(pt);
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) {
        for (const pt of ring) processCoord(pt);
      }
    }
  }

  if (!hasPoints) return null;
  return [[minLat, minLng], [maxLat, maxLng]];
}

/**
 * Generates choropleth style based on active complaint density.
 * Opacity steps:
 *   - 0 reports: 0% opacity (dashed border)
 *   - 1 report:  20% opacity
 *   - 2 reports: 40% opacity
 *   - 3 reports: 60% opacity
 *   - 4 reports: 80% opacity
 *   - 5+ reports: 100% opacity
 */
export function getChoroplethStyle(count: number, maxCount: number, isHovered = false) {
  if (count === 0) {
    return {
      fillColor: '#059669',
      fillOpacity: isHovered ? 0.08 : 0,
      weight: isHovered ? 2 : 1,
      color: isHovered ? '#047857' : '#059669',
      dashArray: '3, 4',
    };
  }

  // Exact opacity steps per user specification
  let fillOpacity = 0.20;
  let fillColor = '#059669';

  if (count >= 5) {
    fillOpacity = 1.00;
    fillColor = '#064e3b'; // Deep emerald pine
  } else if (count === 4) {
    fillOpacity = 0.80;
    fillColor = '#047857'; // Deep emerald
  } else if (count === 3) {
    fillOpacity = 0.60;
    fillColor = '#047857';
  } else if (count === 2) {
    fillOpacity = 0.40;
    fillColor = '#059669'; // Rich emerald
  } else {
    fillOpacity = 0.20;
    fillColor = '#059669'; // 1 report: 20% opacity
  }

  return {
    fillColor,
    fillOpacity,
    weight: isHovered ? 2.5 : 1.5,
    color: isHovered ? '#022c22' : '#064e3b',
    dashArray: undefined,
  };
}
