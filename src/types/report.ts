export type IncidentCategory =
  | 'solid_waste'
  | 'water_pollution'
  | 'air_pollution_burning'
  | 'illegal_logging_vegetation'
  | 'illegal_quarrying_extraction'
  | 'wildlife'
  | 'noise_other'
  | 'other'
  | 'not_environmental';

export type ReportStatus = 'pending' | 'in_progress' | 'resolved' | 'spam';

export type TriageStatus = 'pending' | 'processing' | 'done' | 'failed';

export type EvidenceSlotRole = 'primary' | 'wide_scene' | 'landmark';

export interface ExifSummary {
  hasExif: boolean;
  capturedAt?: string | null;
  isRecent?: boolean | null;
  ageHours?: number | null;
  distanceFromReportKm?: number | null;
  locationMismatch?: boolean;
  cameraModel?: string | null;
  isPossibleSyntheticOrEdited?: boolean;
  notes?: string[];
}

export interface ReportImageItem {
  data: string;
  mimeType: string;
  role: EvidenceSlotRole;
  isLiveCamera?: boolean;
}

export type ReportSource = 'gps' | 'manual_pin' | 'satellite_firms';

export interface LocationInfo {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  geohash: string;
  source: ReportSource;
  municipality?: string;
  barangay?: string;
  landmark?: string;
}

export interface RawInput {
  description: string;
  /** True when at least one compressed photo exists in the `report_images/{reportId}` document. */
  hasImage: boolean;
  imageCount?: number;
  captureMethod?: 'live_camera' | 'gallery' | 'mixed';
  exif?: ExifSummary | null;
}

export interface WeatherContext {
  temperature: number; // in °C
  humidity: number; // in %
  precipitation: number; // in mm
  windSpeed: number; // in km/h
  windGusts?: number; // in km/h
  windDirection?: number; // in degrees (0-360)
  windDirectionCompass?: string; // e.g. 'NE', 'SSW'
  fetchedAt: string;
}

export interface AirQualitySnapshot {
  pm25: number; // in μg/m³
  pm2_5?: number; // alias for pm25
  pm10: number; // in μg/m³
  carbonMonoxide: number; // in μg/m³
  ozone?: number; // in μg/m³
  europeanAqi: number; // EAQI (0-25 Good, 25-50 Fair, 50-75 Moderate, 75-100 Poor, 100-125 Very Poor, >125 Hazardous)
  aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Hazardous';
  fetchedAt: string;
}

export interface SatelliteHotspotData {
  satellite: string; // 'VIIRS Suomi-NPP' | 'VIIRS NOAA-20' | 'MODIS'
  instrument: string; // 'VIIRS' | 'MODIS'
  frp: number; // Fire Radiative Power (MW)
  brightnessTemp: number; // Kelvin (bright_ti4)
  brightnessTemperature?: number; // alias for brightnessTemp
  confidence: string; // 'nominal' | 'high' | 'low'
  acqDate?: string; // YYYY-MM-DD
  acqTime?: string; // HHMM UTC
  dayNight?: 'D' | 'N';
  daynight?: 'D' | 'N';
}

export interface MgbQuarryTenementHit {
  isInsidePermittedTenement: boolean;
  tenementName?: string;
  operator?: string;
  commodity?: string;
  permitType?: 'MPSA' | 'CSAG' | 'ISAG';
  regulatoryStatus?: string;
}

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

export interface ProtectedZoneHit {
  id: string;
  name: string;
  shortName: string;
  category?: ProtectedZoneCategory;
  type: ProtectedZoneType;
  severityBonus: number;
  municipality: string;
  legalBasis?: string;
  legalNote: string;
  center?: [number, number];
}

export interface AuthenticityScore {
  isPlausible: boolean;
  isSyntheticOrStock: boolean;
  consistencyScore: number; // 0 to 1
  forensicNotes?: string;
}

export interface AITriage {
  category: IncidentCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  confidence: number; // 0 to 1
  summary: string; // 1-2 sentences in English
  reasoning: string; // Explanation shown to officials only
  model: string;
  triagedAt: string;
  weather?: WeatherContext | null;
  airQuality?: AirQualitySnapshot | null;
  protectedZone?: ProtectedZoneHit | null;
  mgbQuarryContext?: MgbQuarryTenementHit | null;
  isSpam?: boolean;
  authenticity?: AuthenticityScore | null;
}

export interface FinalReview {
  category: IncidentCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  reviewedBy: string;
  reviewedAt: string;
  notes: string;
}

export interface StatusHistoryItem {
  status: ReportStatus;
  changedBy: string;
  changedAt: string;
  notes?: string;
}

export interface IncidentReport {
  id: string;
  referenceCode: string;
  createdAt: string;
  status: ReportStatus;
  statusHistory: StatusHistoryItem[];
  location: LocationInfo;
  rawInput: RawInput;
  triageStatus: TriageStatus;
  aiTriage: AITriage | null;
  final: FinalReview | null;
  duplicateClusterId: string | null;
  isSpam?: boolean;
  source?: ReportSource;
  satelliteData?: SatelliteHotspotData;
  satelliteHotspot?: SatelliteHotspotData;
  mgbQuarryContext?: MgbQuarryTenementHit | null;
}

export interface CategoryMetadata {
  id: IncidentCategory;
  labelEn: string;
  labelFil: string;
  descriptionEn: string;
  descriptionFil: string;
  icon: string;
  badgeColor: string;
}

export const CATEGORIES: Record<IncidentCategory, CategoryMetadata> = {
  solid_waste: {
    id: 'solid_waste',
    labelEn: 'Solid Waste & Trash',
    labelFil: 'Basura at Dumpsite',
    descriptionEn: 'Illegal dumping, uncollected garbage, or waste clogging waterways.',
    descriptionFil: 'Tambak ng basura, kalat sa kalsada o baradong estero.',
    icon: 'trash-2',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  water_pollution: {
    id: 'water_pollution',
    labelEn: 'Water Pollution',
    labelFil: 'Polusyon sa Tubig',
    descriptionEn: 'Chemical discharge, foul wastewater flowing to Laguna de Bay or canals.',
    descriptionFil: 'Maruming tubig, mabahong kanal, o dumi sa Laguna de Bay.',
    icon: 'droplets',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  air_pollution_burning: {
    id: 'air_pollution_burning',
    labelEn: 'Open Burning & Smoke',
    labelFil: 'Pagsisiga at Usok',
    descriptionEn: 'Open burning of trash, plastics, or heavy agricultural/industrial smoke.',
    descriptionFil: 'Pagsisiga ng plastic/dahon, makapal at nakalalasong usok.',
    icon: 'flame',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  illegal_logging_vegetation: {
    id: 'illegal_logging_vegetation',
    labelEn: 'Illegal Tree Cutting',
    labelFil: 'Ilegal na Pagputol ng Puno',
    descriptionEn: 'Unauthorized cutting of protected trees or vegetation in upland areas.',
    descriptionFil: 'Pagputol ng mga puno sa kabundukan o protektadong lugar.',
    icon: 'trees',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  illegal_quarrying_extraction: {
    id: 'illegal_quarrying_extraction',
    labelEn: 'Illegal Quarrying',
    labelFil: 'Ilegal na Quarrying',
    descriptionEn: 'Unauthorized excavation, gravel extraction, or hillside stripping.',
    descriptionFil: 'Ilegal na paghuhukay ng lupa, bato, o buhangin sa kabundukan.',
    icon: 'pickaxe',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  wildlife: {
    id: 'wildlife',
    labelEn: 'Wildlife Concern',
    labelFil: 'Buhay-Ilang / Hayop',
    descriptionEn: 'Endangered animal poaching, captive migratory birds, or reptile distress.',
    descriptionFil: 'Panghuhuli o pangangalakal ng ligaw na hayop, ibon sa lawa.',
    icon: 'paw-print',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  noise_other: {
    id: 'noise_other',
    labelEn: 'Noise & Vibration',
    labelFil: 'Labis na Ingay',
    descriptionEn: 'Industrial machine noise, constant loud disturbance disrupting communities.',
    descriptionFil: 'Labis na ingay mula sa makina o pabrika na perwisyo sa komunidad.',
    icon: 'volume-2',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  other: {
    id: 'other',
    labelEn: 'Other Environmental Concern',
    labelFil: 'Iba Pang Isyung Pangkalikasan',
    descriptionEn: 'Other environmental hazard not listed above.',
    descriptionFil: 'Iba pang panganib sa kalikasan o komunidad.',
    icon: 'alert-triangle',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  not_environmental: {
    id: 'not_environmental',
    labelEn: 'Non-Environmental / Inapplicable',
    labelFil: 'Hindi Pangkalikasan',
    descriptionEn: 'Report is unrelated to MENRO mandates (e.g. traffic, pothole, vandalism).',
    descriptionFil: 'Hindi sakop ng MENRO (hal. sira sa kalsada, trapiko, away-kapitbahay).',
    icon: 'x-circle',
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  },
};

/**
 * All 14 Local Government Units (1 component city, 13 municipalities) in the Province of Rizal,
 * with their respective barangays.
 *
 * Binangonan and Cardona are split across the mainland and Talim Island. Their areas are
 * listed in `RIZAL_BARANGAY_AREAS` so forms can group them; `RIZAL_LGUS` keeps the flat list.
 */
export const RIZAL_BARANGAY_AREAS: Record<string, { label: string; barangays: readonly string[] }[]> = {
  Binangonan: [
    {
      label: 'Mainland',
      barangays: [
        'Batingan', 'Bilibiran', 'Calumpang', 'Ithan', 'Kalawaan', 'Kalinawan', 'Layunan', 'Libid',
        'Libis', 'Limbon-limbon', 'Lunsad', 'Macamot', 'Mahabang Parang', 'Mambog', 'Pag-asa',
        'Palangoy', 'Pantok', 'Pila-pila', 'Pipindan', 'San Carlos', 'Tagpos', 'Tatala', 'Tayuman',
      ],
    },
    {
      label: 'Talim Island',
      barangays: [
        'Bangad', 'Binitagan', 'Bombong', 'Buhangin', 'Ginoong Sanay', 'Gulod', 'Habagatan', 'Janosa',
        'Kasile', 'Kaytome', 'Kinaboogan', 'Kinagatan', 'Malakaban', 'Pinagdilawan', 'Rayap', 'Sapang',
        'Tabon',
      ],
    },
  ],
  Cardona: [
    {
      label: 'Mainland',
      barangays: [
        'Calahan', 'Dalig', 'Del Remedio', 'Iglesia', 'Looc', 'Nagsulo', 'Ocampo', 'Patunhay', 'Real',
        'Sampad', 'San Roque',
      ],
    },
    {
      label: 'Talim Island',
      barangays: [
        'Balibago', 'Boor', 'Lambac', 'Malanggam-Calubacan', 'Navotas', 'Subay', 'Tuna',
      ],
    },
  ],
};

const flattenAreas = (municipality: string): string[] =>
  RIZAL_BARANGAY_AREAS[municipality].flatMap((area) => [...area.barangays]);

export const RIZAL_LGUS: Record<string, readonly string[]> = {
  'Antipolo City': [
    'Bagong Nayon', 'Beverly Hills', 'Calawis', 'Cupang', 'Dalig', 'Dela Paz', 'Inarawan',
    'Mambugan', 'Mayamot', 'Muntindilaw', 'San Isidro', 'San Jose', 'San Juan', 'San Luis',
    'San Roque', 'Santa Cruz',
  ],
  Angono: [
    'Bagumbayan', 'Kalayaan', 'Mahabang Parang', 'Poblacion Ibaba', 'Poblacion Itaas', 'San Isidro',
    'San Pedro', 'San Roque', 'San Vicente', 'Santo Niño',
  ],
  Baras: [
    'Concepcion', 'Evangelista', 'Mabini', 'Pinugay', 'Rizal', 'San Jose', 'San Juan', 'San Miguel',
    'San Salvador', 'Santiago',
  ],
  Binangonan: flattenAreas('Binangonan'),
  Cainta: [
    'San Andres', 'San Isidro', 'San Juan', 'San Roque', 'Santa Rosa', 'Santo Domingo', 'Santo Niño',
  ],
  Cardona: flattenAreas('Cardona'),
  Jalajala: [
    'Bagumbong', 'Bayugo', 'Lubo', 'Lukang', 'Paalaman', 'Pagkalinawan', 'Palaypalay', 'Punta',
    'Sipsipin', 'Special District', 'Third District',
  ],
  Morong: [
    'Bombongan', 'Can-Cal-Lan', 'Lagundi', 'Maybancal', 'San Guillermo', 'San Jose', 'San Juan',
    'San Pedro',
  ],
  Pililla: [
    'Bagumbayan', 'Halayhayin', 'Hulo', 'Imatong', 'Malaya', 'Niogan', 'Quisao', 'Takungan', 'Wawa',
  ],
  'Rodriguez (Montalban)': [
    'Balite', 'Burgos', 'Geronimo', 'Macabud', 'Manggahan', 'Mascap', 'Puray', 'Rosario',
    'San Isidro', 'San Jose', 'San Rafael',
  ],
  'San Mateo': [
    'Ampid I', 'Ampid II', 'Banaba', 'Dulong Bayan 1', 'Dulong Bayan 2', 'Guinayang',
    'Guitnang Bayan I', 'Guitnang Bayan II', 'Gulod Malaya', 'Malanday', 'Maly', 'Pintong Bocawe',
    'Santa Ana', 'Santo Niño', 'Silangan',
  ],
  Tanay: [
    'Cayabu', 'Cuyambay', 'Daraitan', 'Katipunan-Bayan', 'Kaybuto', 'Laiban', 'Madilay-dilay',
    'Mag-Ampon', 'Mamuyao', 'Pinagkamaligan', 'Plaza Aldea', 'Sampaloc', 'San Andres', 'San Isidro',
    'Santa Inez', 'Santo Niño', 'Tabing Ilog', 'Tandang Kutyo', 'Tinucan', 'Wawa',
  ],
  Taytay: ['Dolores', 'Muzon', 'San Isidro', 'San Juan', 'Santa Ana'],
  Teresa: [
    'Bagumbayan', 'Calumpang Santo Cristo', 'Dalig', 'Dulumbayan', 'May-iba', 'Poblacion', 'Prinza',
    'San Gabriel', 'San Roque',
  ],
} as const;

export const RIZAL_MUNICIPALITIES = Object.keys(RIZAL_LGUS);

export const MUNICIPALITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
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

// Kept for backwards compatibility
export const BINANGONAN_BARANGAYS = RIZAL_LGUS['Binangonan'];

export const SEVERITY_LEVELS: Record<1 | 2 | 3 | 4 | 5, { labelEn: string; labelFil: string; color: string; descEn: string }> = {
  1: {
    labelEn: 'Minor / Cosmetic',
    labelFil: 'Magaan / Minor',
    color: 'bg-emerald-500 text-white',
    descEn: 'Isolated litter, low impact; can be scheduled with routine cleanups.',
  },
  2: {
    labelEn: 'Low Concern',
    labelFil: 'Mababang Panganib',
    color: 'bg-blue-500 text-white',
    descEn: 'Moderate nuisance; minor clogging or localized dust.',
  },
  3: {
    labelEn: 'Moderate Hazard',
    labelFil: 'Katamtaman',
    color: 'bg-amber-500 text-white',
    descEn: 'Needs MENRO action within 3-5 days; risk of worsening.',
  },
  4: {
    labelEn: 'High / Urgent Hazard',
    labelFil: 'Mataas / Apurahan',
    color: 'bg-orange-600 text-white',
    descEn: 'Imminent threat to water source, recurring burning, or steep slope clearing.',
  },
  5: {
    labelEn: 'Critical Emergency',
    labelFil: 'Kritikal / Agaran',
    color: 'bg-red-600 text-white',
    descEn: 'Immediate public health or ecological disaster; instant response required.',
  },
};
