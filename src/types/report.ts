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

export type ReportStatus = 'pending' | 'in_progress' | 'resolved';

export type TriageStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface LocationInfo {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  geohash: string;
  source: 'gps' | 'manual_pin';
  barangay?: string;
  landmark?: string;
}

export interface RawInput {
  description: string;
  /** True when a compressed photo exists in the `report_images/{reportId}` document. */
  hasImage: boolean;
}

export interface AITriage {
  category: IncidentCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  confidence: number; // 0 to 1
  summary: string; // 1-2 sentences in English
  reasoning: string; // Explanation shown to officials only
  model: string;
  triagedAt: string;
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
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  water_pollution: {
    id: 'water_pollution',
    labelEn: 'Water Pollution',
    labelFil: 'Polusyon sa Tubig',
    descriptionEn: 'Chemical discharge, foul wastewater flowing to Laguna de Bay or canals.',
    descriptionFil: 'Maruming tubig, mabahong kanal, o dumi sa Laguna de Bay.',
    icon: 'droplets',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  },
  air_pollution_burning: {
    id: 'air_pollution_burning',
    labelEn: 'Open Burning & Smoke',
    labelFil: 'Pagsisiga at Usok',
    descriptionEn: 'Open burning of trash, plastics, or heavy agricultural/industrial smoke.',
    descriptionFil: 'Pagsisiga ng plastic/dahon, makapal at nakalalasong usok.',
    icon: 'flame',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  illegal_logging_vegetation: {
    id: 'illegal_logging_vegetation',
    labelEn: 'Illegal Tree Cutting',
    labelFil: 'Ilegal na Pagputol ng Puno',
    descriptionEn: 'Unauthorized cutting of protected trees or vegetation in upland areas.',
    descriptionFil: 'Pagputol ng mga puno sa kabundukan o protektadong lugar.',
    icon: 'trees',
    badgeColor: 'bg-green-100 text-green-800 border-green-300',
  },
  illegal_quarrying_extraction: {
    id: 'illegal_quarrying_extraction',
    labelEn: 'Illegal Quarrying',
    labelFil: 'Ilegal na Quarrying',
    descriptionEn: 'Unauthorized excavation, gravel extraction, or hillside stripping.',
    descriptionFil: 'Ilegal na paghuhukay ng lupa, bato, o buhangin sa kabundukan.',
    icon: 'pickaxe',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  wildlife: {
    id: 'wildlife',
    labelEn: 'Wildlife Concern',
    labelFil: 'Buhay-Ilang / Hayop',
    descriptionEn: 'Endangered animal poaching, captive migratory birds, or reptile distress.',
    descriptionFil: 'Panghuhuli o pangangalakal ng ligaw na hayop, ibon sa lawa.',
    icon: 'paw-print',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  noise_other: {
    id: 'noise_other',
    labelEn: 'Noise & Vibration',
    labelFil: 'Labis na Ingay',
    descriptionEn: 'Industrial machine noise, constant loud disturbance disrupting communities.',
    descriptionFil: 'Labis na ingay mula sa makina o pabrika na perwisyo sa komunidad.',
    icon: 'volume-2',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  other: {
    id: 'other',
    labelEn: 'Other Environmental Concern',
    labelFil: 'Iba Pang Isyung Pangkalikasan',
    descriptionEn: 'Other environmental hazard not listed above.',
    descriptionFil: 'Iba pang panganib sa kalikasan o komunidad.',
    icon: 'alert-triangle',
    badgeColor: 'bg-stone-100 text-stone-800 border-stone-300',
  },
  not_environmental: {
    id: 'not_environmental',
    labelEn: 'Non-Environmental / Inapplicable',
    labelFil: 'Hindi Pangkalikasan',
    descriptionEn: 'Report is unrelated to MENRO mandates (e.g. traffic, pothole, vandalism).',
    descriptionFil: 'Hindi sakop ng MENRO (hal. sira sa kalsada, trapiko, away-kapitbahay).',
    icon: 'x-circle',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
  },
};

export const BINANGONAN_BARANGAYS = [
  'Bangad',
  'Batingan',
  'Biluso',
  'Binitagan (Talim)',
  'Bombongan',
  'Buhangin (Talim)',
  'Calumpang',
  'Ginoong San Pedro (Talim)',
  'Gulod (Talim)',
  'Habagatan (Talim)',
  'Ithan',
  'Janosa (Talim)',
  'Kalawaan (Talim)',
  'Kassim (Talim)',
  'Kaytome (Talim)',
  'Kinaboogan (Talim)',
  'Kinagatan (Talim)',
  'Layunan',
  'Libid',
  'Libis',
  'Limbon-limbon',
  'Lunsad',
  'Mahabang Parang',
  'Malakaban (Talim)',
  'Mambog',
  'Pag-asa',
  'Palangoy',
  'Pantok',
  'Pila-pila',
  'Pinagdilawan (Talim)',
  'Pipindan',
  'Rayap (Talim)',
  'San Carlos',
  'Sapang (Talim)',
  'Tabon (Talim)',
  'Tagpos',
  'Tatala',
  'Tayuman',
  'Rayap',
] as const;

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
