export interface ProtectedAreaHit {
  id: string;
  name: string;
  shortName: string;
  type: 'sanctuary' | 'shoreline_easement' | 'watershed' | 'national_park';
  severityBonus: number;
  municipality: string;
  legalNote: string;
}

interface ProtectedZoneRecord {
  id: string;
  name: string;
  shortName: string;
  type: 'sanctuary' | 'shoreline_easement' | 'watershed' | 'national_park';
  severityBonus: number;
  municipality: string;
  legalNote: string;
  polygon: [number, number][]; // [lng, lat]
}

// Curated authoritative protected zones in Rizal Province
export const RIZAL_PROTECTED_ZONES: ProtectedZoneRecord[] = [
  {
    id: 'mt-tagapo-sanctuary',
    name: 'Mount Tagapo Ecological Park & Wildlife Sanctuary',
    shortName: 'Mt. Tagapo Sanctuary',
    type: 'sanctuary',
    severityBonus: 2,
    municipality: 'Binangonan / Cardona (Talim Island)',
    legalNote:
      'Declared Municipal Ecological Reserve & Wildlife Sanctuary. Tree cutting, open burning (siga), and quarrying carry mandatory statutory penalties.',
    polygon: [
      [121.216, 14.368],
      [121.226, 14.369],
      [121.235, 14.363],
      [121.241, 14.351],
      [121.243, 14.338],
      [121.238, 14.323],
      [121.228, 14.318],
      [121.218, 14.324],
      [121.213, 14.339],
      [121.214, 14.356],
      [121.216, 14.368],
    ],
  },
  {
    id: 'laguna-lake-easement',
    name: 'Laguna de Bay Shoreline Conservation Easement (Binangonan-Cardona Corridor)',
    shortName: 'Laguna Lake 50m Shore Buffer',
    type: 'shoreline_easement',
    severityBonus: 1,
    municipality: 'Binangonan, Cardona, Angono',
    legalNote:
      'Statutory 50-meter shoreline protection easement under PD 1067 (Water Code) & LLDA regulations. Solid waste dumping, toxic effluent runoff, and illegal lakeshore reclamation strictly prohibited.',
    polygon: [
      [121.152, 14.505],
      [121.175, 14.512],
      [121.196, 14.478],
      [121.215, 14.456],
      [121.238, 14.482],
      [121.258, 14.475],
      [121.245, 14.432],
      [121.218, 14.408],
      [121.189, 14.425],
      [121.168, 14.452],
      [121.152, 14.505],
    ],
  },
  {
    id: 'upper-marikina-watershed',
    name: 'Upper Marikina River Basin Protected Landscape (UMRBPL)',
    shortName: 'Upper Marikina Protected Watershed',
    type: 'watershed',
    severityBonus: 2,
    municipality: 'Antipolo, Rodriguez, San Mateo, Tanay, Baras',
    legalNote:
      'Protected Landscape under Presidential Proclamation No. 296 & ENIPAS Act (RA 11038). Upland watershed vital for flood mitigation. Unlawful timber cutting, charcoal making (ulingan), and quarrying strictly prohibited.',
    polygon: [
      [121.175, 14.655],
      [121.235, 14.775],
      [121.325, 14.815],
      [121.385, 14.77],
      [121.415, 14.685],
      [121.375, 14.595],
      [121.315, 14.565],
      [121.245, 14.59],
      [121.195, 14.625],
      [121.175, 14.655],
    ],
  },
  {
    id: 'hinulugang-taktak-park',
    name: 'Hinulugang Taktak Protected Landscape',
    shortName: 'Hinulugang Taktak National Park',
    type: 'national_park',
    severityBonus: 1,
    municipality: 'Antipolo City',
    legalNote:
      'Protected Landscape under Republic Act No. 6964. Historical waterfall riparian basin. Discharge of untreated wastewater and unauthorized structures strictly prohibited.',
    polygon: [
      [121.161, 14.598],
      [121.171, 14.599],
      [121.173, 14.59],
      [121.162, 14.589],
      [121.161, 14.598],
    ],
  },
];

/**
 * Standard Ray-Casting algorithm to test if point [lng, lat] is inside polygon ring.
 */
function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  const [lng, lat] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if a given coordinate (lat, lng) falls within any protected zone in Rizal Province.
 * Returns the highest-priority matched zone info or null if outside all protected zones.
 */
export function findProtectedAreaByPoint(lat: number, lng: number): ProtectedAreaHit | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const point: [number, number] = [lng, lat];

  for (const zone of RIZAL_PROTECTED_ZONES) {
    if (pointInRing(point, zone.polygon)) {
      return {
        id: zone.id,
        name: zone.name,
        shortName: zone.shortName,
        type: zone.type,
        severityBonus: zone.severityBonus,
        municipality: zone.municipality,
        legalNote: zone.legalNote,
      };
    }
  }

  return null;
}
