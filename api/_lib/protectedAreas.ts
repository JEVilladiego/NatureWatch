export type ProtectedZoneCategory = 'nipas' | 'llda_zomap' | 'kba_georeserve' | 'local_mountain';

export type ProtectedZoneType =
  | 'protected_landscape'
  | 'forest_reserve'
  | 'wildlife_sanctuary'
  | 'aquatic_sanctuary'
  | 'shoreland_buffer'
  | 'key_biodiversity_area'
  | 'georeserve'
  | 'cultural_reserve'
  | 'local_reserve'
  | 'watershed'
  | 'sanctuary'
  | 'shoreline_easement'
  | 'national_park';

export interface ProtectedAreaHit {
  id: string;
  name: string;
  shortName: string;
  category: ProtectedZoneCategory;
  type: ProtectedZoneType;
  severityBonus: number;
  municipality: string;
  legalBasis: string;
  legalNote: string;
  center?: [number, number]; // [lat, lng]
}

interface ProtectedZoneRecord {
  id: string;
  name: string;
  shortName: string;
  category: ProtectedZoneCategory;
  type: ProtectedZoneType;
  severityBonus: number;
  municipality: string;
  legalBasis: string;
  legalNote: string;
  center: [number, number]; // [lat, lng]
  polygon: [number, number][]; // [lng, lat]
}

// Authoritative protected ecological zones in Rizal Province (DENR-NIPAS, LLDA ZOMAP, KBAs, Georeserves, Local Watersheds)
export const RIZAL_PROTECTED_ZONES: ProtectedZoneRecord[] = [
  {
    id: 'umrbpl',
    name: 'Upper Marikina River Basin Protected Landscape (UMRBPL)',
    shortName: 'Upper Marikina Watershed',
    category: 'nipas',
    type: 'protected_landscape',
    severityBonus: 2,
    municipality: 'Rodriguez, Antipolo City, Baras, San Mateo, Tanay',
    legalBasis: 'Executive Order No. 33 (1904), Presidential Proclamation No. 296 (2011), Republic Act No. 11038',
    legalNote:
      'Protected Landscape under RA 11038 (E-NIPAS). Encompasses 26,125.60 hectares across Boso-Boso, Tayabasan, Wawa, Montalban, and Puray sub-watersheds. Timber cutting, unauthorized quarrying, and slash-and-burn (kaingin) carry statutory penalties.',
    center: [14.6711, 121.2139],
    polygon: [
      [121.1750, 14.6550],
      [121.1920, 14.7150],
      [121.2150, 14.7600],
      [121.2480, 14.7950],
      [121.3150, 14.8150],
      [121.3650, 14.7850],
      [121.3850, 14.7400],
      [121.3700, 14.6650],
      [121.3350, 14.5950],
      [121.2850, 14.5750],
      [121.2350, 14.5900],
      [121.1950, 14.6250],
      [121.1750, 14.6550],
    ],
  },
  {
    id: 'kaliwa-river-forest-reserve',
    name: 'Kaliwa River Forest Reserve (KRFR)',
    shortName: 'Kaliwa Forest Reserve',
    category: 'nipas',
    type: 'forest_reserve',
    severityBonus: 2,
    municipality: 'Tanay, Rizal / General Nakar, Quezon',
    legalBasis: 'Presidential Proclamation No. 573 (1969) / Initial NIPAS Component',
    legalNote:
      'Covers ~27,608 hectares spanning Tanay (Rizal) and Gen. Nakar (Quezon). Protects the headwaters of Kaliwa River. Logging, forest burning, and illegal road cuts carry strict penalties under PD 705 and RA 11038.',
    center: [14.6167, 121.3667],
    polygon: [
      [121.3050, 14.5800],
      [121.3120, 14.6400],
      [121.3350, 14.6950],
      [121.3850, 14.7250],
      [121.4350, 14.6850],
      [121.4500, 14.6250],
      [121.4350, 14.5650],
      [121.3950, 14.5450],
      [121.3450, 14.5500],
      [121.3050, 14.5800],
    ],
  },
  {
    id: 'pamitinan-protected-landscape',
    name: 'Pamitinan Protected Landscape (PPL)',
    shortName: 'Pamitinan Protected Landscape',
    category: 'nipas',
    type: 'protected_landscape',
    severityBonus: 2,
    municipality: 'Rodriguez (Montalban)',
    legalBasis: 'Presidential Proclamation No. 901 (1996), Republic Act No. 11038',
    legalNote:
      '608.64 hectares encompassing Wawa Gorge, Mt. Pamitinan, Mt. Binacayan, Wawa Dam, and Pamitinan Cave in Sitio Wawa. Any rock extraction, slope alteration, or waste disposal is legally prohibited.',
    center: [14.7339, 121.1900],
    polygon: [
      [121.1820, 14.7260],
      [121.1850, 14.7430],
      [121.1980, 14.7440],
      [121.2020, 14.7350],
      [121.1970, 14.7240],
      [121.1880, 14.7230],
      [121.1820, 14.7260],
    ],
  },
  {
    id: 'hinulugang-taktak-park',
    name: 'Hinulugang Taktak Protected Landscape',
    shortName: 'Hinulugang Taktak Park',
    category: 'nipas',
    type: 'protected_landscape',
    severityBonus: 1,
    municipality: 'Antipolo City',
    legalBasis: 'Proclamation No. 330 (1952), Republic Act No. 6964 (1990), Proclamation No. 412 (2000), RA 11038',
    legalNote:
      '3.20 hectares of historical waterfall riparian basin along upper Taktak River. Direct wastewater discharge, commercial littering, and unauthorized building structures are strictly prohibited.',
    center: [14.5972, 121.1653],
    polygon: [
      [121.1610, 14.5980],
      [121.1710, 14.5990],
      [121.1730, 14.5900],
      [121.1620, 14.5890],
      [121.1610, 14.5980],
    ],
  },
  {
    id: 'proc-1636-wildlife-sanctuary',
    name: 'National Park, Wildlife Sanctuary & Game Preserve (Proc. 1636)',
    shortName: 'Proc. 1636 Wildlife Sanctuary',
    category: 'nipas',
    type: 'wildlife_sanctuary',
    severityBonus: 2,
    municipality: 'Rodriguez, San Mateo, Antipolo, Baras, Tanay, Pililla',
    legalBasis: 'Presidential Proclamation No. 1636 (April 18, 1977)',
    legalNote:
      '~46,310-hectare multi-provincial reserve safeguarding the Sierra Madre biodiversity corridor. Hunting, wildlife trapping, slash-and-burn, and unpermitted resource gathering carry statutory criminal penalties.',
    center: [14.7500, 121.4722],
    polygon: [
      [121.3600, 14.8500],
      [121.4200, 14.8800],
      [121.5100, 14.8400],
      [121.5200, 14.6500],
      [121.4600, 14.5200],
      [121.4100, 14.5400],
      [121.4200, 14.6800],
      [121.3800, 14.7700],
      [121.3600, 14.8500],
    ],
  },
  {
    id: 'la-mesa-watershed-buffer',
    name: 'La Mesa Watershed Reservation Buffer (Rizal Flank)',
    shortName: 'La Mesa Watershed Buffer',
    category: 'nipas',
    type: 'watershed',
    severityBonus: 2,
    municipality: 'San Mateo, Rodriguez',
    legalBasis: 'Presidential Proclamation No. 1336 & Executive Order No. 601',
    legalNote:
      'Critical eastern buffer protection for the Greater Manila potable water reservoir. Land conversion, industrial runoff, illegal excavation, and trash dumping along tributary streams carry immediate cease-and-desist mandates.',
    center: [14.7150, 121.1450],
    polygon: [
      [121.1350, 14.6900],
      [121.1380, 14.7350],
      [121.1550, 14.7450],
      [121.1620, 14.7250],
      [121.1540, 14.6920],
      [121.1350, 14.6900],
    ],
  },
  {
    id: 'rayap-fish-sanctuary',
    name: 'Rayap Fish Sanctuary (LLDA Central Bay Fish Sanctuary)',
    shortName: 'Rayap Fish Sanctuary',
    category: 'llda_zomap',
    type: 'aquatic_sanctuary',
    severityBonus: 2,
    municipality: 'Binangonan, Cardona, Jalajala',
    legalBasis: 'Republic Act No. 4826, LLDA Board Resolution No. 136 (Series of 2000)',
    legalNote:
      '5,000 hectares covering ~5% of Laguna de Bay in Central Bay. Demarcated from Punta (Jalajala) to Habagatan/Rayap (Talim Island) to Malahi/Pihan/Bunga islets, Nagsabya Point (Cardona), and Bayugo (Jalajala). Commercial fishpens, motorized trawling, and toxic dumping strictly banned.',
    center: [14.3300, 121.2500],
    polygon: [
      [121.3200, 14.3100],
      [121.2380, 14.3050],
      [121.2350, 14.3250],
      [121.2480, 14.3480],
      [121.2650, 14.3650],
      [121.3150, 14.3580],
      [121.3250, 14.3350],
      [121.3200, 14.3100],
    ],
  },
  {
    id: 'laguna-shoreland-buffer',
    name: 'Laguna de Bay Protected Shoreland Buffer Zone (12.5m Elevation)',
    shortName: 'Laguna 12.5m Shoreland Buffer',
    category: 'llda_zomap',
    type: 'shoreland_buffer',
    severityBonus: 1,
    municipality: 'Taytay, Angono, Binangonan, Cardona, Morong, Baras, Tanay, Pililla, Jalajala',
    legalBasis: 'LLDA ZOMAP, Presidential Decree No. 1067 (Water Code), LLDA Res. 136 (s. 2000)',
    legalNote:
      'Public shoreland buffer at or below 12.50m elevation across all 9 lakeshore LGUs of Rizal. Protects littoral wetlands and regulates flood plains. Solid waste dumping, illegal reclamation, and untreated wastewater runoff are prohibited.',
    center: [14.4500, 121.2200],
    polygon: [
      [121.1450, 14.5200],
      [121.1700, 14.5250],
      [121.1980, 14.4850],
      [121.2250, 14.4600],
      [121.2550, 14.4850],
      [121.2900, 14.4800],
      [121.3250, 14.4500],
      [121.3400, 14.4100],
      [121.3250, 14.3600],
      [121.2900, 14.4200],
      [121.2500, 14.4400],
      [121.2150, 14.4250],
      [121.1850, 14.4450],
      [121.1600, 14.4800],
      [121.1450, 14.5200],
    ],
  },
  {
    id: 'mounts-irid-angilo-kba',
    name: 'Mounts Irid–Angilo & Binuang Key Biodiversity Area (KBA 9720)',
    shortName: 'Mts. Irid–Angilo KBA',
    category: 'kba_georeserve',
    type: 'key_biodiversity_area',
    severityBonus: 2,
    municipality: 'Rodriguez (Montalban)',
    legalBasis: 'DENR-BMB National Key Biodiversity Area Directory (KBA No. 9720), RA 8371 (IPRA)',
    legalNote:
      '170,572-hectare regional KBA centered on Mt. Irid (1,469 MASL), the highest peak in Rizal. Overlaps Dumagat-Remontado ancestral domain. Poaching endangered flora/fauna, commercial logging, and unpermitted mining are strictly penalized.',
    center: [14.7889, 121.3383],
    polygon: [
      [121.2650, 14.7600],
      [121.2850, 14.8350],
      [121.3550, 14.8600],
      [121.3950, 14.8250],
      [121.3800, 14.7600],
      [121.3200, 14.7450],
      [121.2650, 14.7600],
    ],
  },
  {
    id: 'masungi-georeserve',
    name: 'Masungi Georeserve & Karst Conservation Area',
    shortName: 'Masungi Georeserve',
    category: 'kba_georeserve',
    type: 'georeserve',
    severityBonus: 2,
    municipality: 'Baras, Tanay',
    legalBasis: 'DENR-Masungi Reforestation Agreement / Karst Conservation, DAO 96-37',
    legalNote:
      '~2,700-hectare ancient Paleocene–Eocene limestone karst formation and watershed headwater divide between Marikina and Kaliwa. Quarrying, blasting, unauthorized fencing, and land speculation are strictly prohibited under special conservation status.',
    center: [14.5986, 121.3183],
    polygon: [
      [121.3020, 14.5880],
      [121.3120, 14.6150],
      [121.3340, 14.6160],
      [121.3400, 14.5940],
      [121.3250, 14.5820],
      [121.3080, 14.5810],
      [121.3020, 14.5880],
    ],
  },
  {
    id: 'angono-binangonan-petroglyphs',
    name: 'Angono–Binangonan Petroglyphs Site & Micro-Forest Reserve',
    shortName: 'Petroglyphs Cultural Reserve',
    category: 'kba_georeserve',
    type: 'cultural_reserve',
    severityBonus: 2,
    municipality: 'Binangonan, Angono',
    legalBasis: 'Presidential Decree No. 260 (1973, National Cultural Treasure), Proclamation No. 2146',
    legalNote:
      'Declared National Cultural Treasure. Protects the oldest known prehistoric rock art in the Philippines and its secondary forest buffer. Vandalism, rock face defacement, quarrying, and unauthorized excavations carry severe statutory penalties.',
    center: [14.5328, 121.1872],
    polygon: [
      [121.1810, 14.5290],
      [121.1820, 14.5380],
      [121.1940, 14.5390],
      [121.1950, 14.5280],
      [121.1870, 14.5260],
      [121.1810, 14.5290],
    ],
  },
  {
    id: 'mt-tagapo-sanctuary',
    name: 'Mount Tagapo Local Forest & Ecotourism Zone',
    shortName: 'Mount Tagapo Sanctuary',
    category: 'local_mountain',
    type: 'local_reserve',
    severityBonus: 2,
    municipality: 'Binangonan, Cardona (Talim Island)',
    legalBasis: 'Municipal Ecological Reserve Ordinances (Binangonan & Cardona)',
    legalNote:
      '438 MASL volcanic peak forming the central spine of Talim Island. Tree cutting, open burning (siga), quarrying, and unauthorized trail blazes carry mandatory municipal statutory fines.',
    center: [14.3310, 121.2280],
    polygon: [
      [121.2160, 14.3680],
      [121.2280, 14.3690],
      [121.2380, 14.3610],
      [121.2430, 14.3450],
      [121.2420, 14.3250],
      [121.2320, 14.3150],
      [121.2180, 14.3200],
      [121.2120, 14.3380],
      [121.2140, 14.3580],
      [121.2160, 14.3680],
    ],
  },
  {
    id: 'mt-sembrano-watershed',
    name: 'Mount Sembrano Watershed & Forest Reserve',
    shortName: 'Mount Sembrano Watershed',
    category: 'local_mountain',
    type: 'watershed',
    severityBonus: 2,
    municipality: 'Pililla, Jalajala',
    legalBasis: 'Municipal Environmental Ordinances (Pililla & Jalajala), Upland Watershed Co-Management Framework',
    legalNote:
      '743–745 MASL volcanic ridge separating Pililla and Jalajala. Protects headwaters of Manggahan and seasonal streams feeding eastern Laguna de Bay. Kaingin, illegal charcoal making, and stream pollution strictly banned.',
    center: [14.3856, 121.3639],
    polygon: [
      [121.3450, 14.3720],
      [121.3520, 14.4120],
      [121.3780, 14.4180],
      [121.3920, 14.3850],
      [121.3850, 14.3620],
      [121.3620, 14.3550],
      [121.3450, 14.3720],
    ],
  },
  {
    id: 'mt-balagbag-maranat',
    name: 'Mount Balagbag–Mount Maranat Foothills',
    shortName: 'Mt. Balagbag Foothills',
    category: 'local_mountain',
    type: 'local_reserve',
    severityBonus: 1,
    municipality: 'Rodriguez (Montalban)',
    legalBasis: 'Rodriguez Municipal Ecotourism & Watershed Buffer Resolution, Southern Ipo-Angat Buffer Corridor',
    legalNote:
      'Upland headwater corridor in northwestern Rodriguez bordering San Jose del Monte (Bulacan) and Ipo Watershed. Unlicensed land clearing, off-road vegetation destruction, and waste abandonment are prohibited.',
    center: [14.8219, 121.1761],
    polygon: [
      [121.1580, 14.8080],
      [121.1620, 14.8380],
      [121.1850, 14.8450],
      [121.1960, 14.8280],
      [121.1880, 14.8050],
      [121.1680, 14.8020],
      [121.1580, 14.8080],
    ],
  },
  {
    id: 'daranak-batlag-sanctuary',
    name: 'Daranak & Batlag Falls Ecotourism Sanctuary',
    shortName: 'Daranak Falls Sanctuary',
    category: 'local_mountain',
    type: 'local_reserve',
    severityBonus: 1,
    municipality: 'Tanay',
    legalBasis: 'Tanay Municipal Environmental Protection Ordinance No. 2, Tanay Ecotourism Master Plan',
    legalNote:
      '~150 hectares surrounding Daranak River, Batlag Falls, and Calinawan Cave. Discharging untreated contaminants into streamways, defacing rock formations, and littering carry statutory municipal penalties.',
    center: [14.5428, 121.3533],
    polygon: [
      [121.3450, 14.5360],
      [121.3480, 14.5520],
      [121.3620, 14.5540],
      [121.3650, 14.5410],
      [121.3560, 14.5340],
      [121.3450, 14.5360],
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

  // Specific micro-reserves and conservation pockets take precedence over broad watersheds
  const broadZones = new Set(['umrbpl', 'proc-1636-wildlife-sanctuary', 'kaliwa-river-forest-reserve', 'laguna-shoreland-buffer']);
  const sorted = [...RIZAL_PROTECTED_ZONES].sort((a, b) => {
    const aBroad = broadZones.has(a.id) ? 1 : 0;
    const bBroad = broadZones.has(b.id) ? 1 : 0;
    return aBroad - bBroad;
  });

  for (const zone of sorted) {
    if (pointInRing(point, zone.polygon)) {
      return {
        id: zone.id,
        name: zone.name,
        shortName: zone.shortName,
        category: zone.category,
        type: zone.type,
        severityBonus: zone.severityBonus,
        municipality: zone.municipality,
        legalBasis: zone.legalBasis,
        legalNote: zone.legalNote,
        center: zone.center,
      };
    }
  }

  return null;
}
