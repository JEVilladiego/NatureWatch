import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  MapPin,
  Sparkles,
  Edit3,
  Database,
  Search,
  Eye,
  RefreshCw,
  Layers,
  BarChart3,
  Check,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  Plus,
  Minus,
  ArrowLeft,
  Layout,
  Maximize2,
  Crosshair,
  CloudRain,
  Thermometer,
  Wind,
  Droplets,
  ShieldCheck,
  LogOut,
  Map as MapIcon,
  Globe,
  Mountain,
  Moon,
  Sun,
  Trash2,
  Camera,
  Upload,
  Trees,
  Scale,
  Flame,
  Satellite,
  Pickaxe,
  Activity,
  CloudSun,
  Cloud,
  Compass,
} from 'lucide-react';
import {
  RIZAL_LGU_PRESETS,
  RizalLguPreset,
  FullAtmosphericData,
  fetchFullAtmosphericTelemetry,
  fetchAllRizalLgusTelemetry,
  getAqiMeta,
  getWeatherInterpretation,
  getWindFlowTrajectory,
  computeEmpiricalWeatherIndices,
} from '../lib/weatherService';
import {
  IncidentReport,
  IncidentCategory,
  CATEGORIES,
  SEVERITY_LEVELS,
  ReportStatus,
  RIZAL_MUNICIPALITIES,
  MUNICIPALITY_COORDINATES,
  WeatherContext,
  AirQualitySnapshot,
  SatelliteHotspotData,
  ProtectedZoneHit,
  ReportImageItem,
} from '../types/report';
import { LeafletMap, MapLayerMode, BasemapMode } from './LeafletMap';
import { resolveReportCoordinates } from '../lib/barangayCoordinates';
import {
  checkMgbQuarryTenement,
  MgbQuarryFeatureProperties,
  fetchRizalMgbQuarriesGeoJSON,
  GeoJSONFeature,
} from '../lib/geojsonService';
import { calculateDistanceMeters } from '../lib/geohash';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { Language, translations } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { authHeaders } from '../lib/auth';

interface DashboardProps {
  lang: Language;
  setLang?: (lang: Language) => void;
  officialUser: any | null;
  onOpenLogin: () => void;
  viewMode?: 'workbench' | 'full_map';
  onViewModeChange?: (mode: 'workbench' | 'full_map') => void;
  onNavigateTab?: (tab: string) => void;
  onLogout?: () => void;
}

interface CuratedProtectedZoneItem {
  id: string;
  name: string;
  shortName: string;
  category: 'nipas' | 'llda_zomap' | 'kba_georeserve' | 'local_mountain';
  categoryLabel: string;
  type: string;
  color: string;
  lat: number;
  lng: number;
  zoom: number;
  municipality: string;
  areaHectares: string;
  elevation: string;
  legalBasis: string;
  prohibitions: string[];
  penalties: string;
  barangays: string[];
  ecosystemRole: string;
  polygon: [number, number][];
}

function isPointInPolygonRing(point: [number, number], ring: [number, number][]): boolean {
  const [lng, lat] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getQuarryCenter(feature: GeoJSONFeature<MgbQuarryFeatureProperties>): { lat: number; lng: number } {
  try {
    const coords = feature.geometry.coordinates;
    const ring = feature.geometry.type === 'Polygon' ? coords[0] : coords[0]?.[0];
    if (ring && ring.length > 0) {
      let sumLng = 0;
      let sumLat = 0;
      for (const pt of ring) {
        sumLng += pt[0];
        sumLat += pt[1];
      }
      return { lat: sumLat / ring.length, lng: sumLng / ring.length };
    }
  } catch (e) {
    // fallback
  }
  return { lat: 14.5800, lng: 121.2800 };
}

const RIZAL_PROTECTED_ZONES_CATALOG: CuratedProtectedZoneItem[] = [
  // DENR-NIPAS
  {
    id: 'umrbpl',
    name: 'Upper Marikina River Basin Protected Landscape (UMRBPL)',
    shortName: 'Upper Marikina Watershed',
    category: 'nipas',
    categoryLabel: 'DENR-NIPAS',
    type: 'Protected Landscape',
    color: '#047857',
    lat: 14.6711,
    lng: 121.2139,
    zoom: 12,
    municipality: 'Rodriguez, Antipolo, San Mateo, Baras, Tanay',
    areaHectares: '26,125.60 ha',
    elevation: '120m – 1,469m ASL',
    legalBasis: 'Executive Order No. 33 (1904), Presidential Proclamation No. 296 (2011), Republic Act No. 11038',
    prohibitions: [
      'Timber harvesting & unauthorized tree cutting',
      'Slash-and-burn (kaingin) & charcoal making (ulingan)',
      'Quarrying, gravel extraction & slope alteration',
      'Motorized recreational trail blazes in core zones',
      'Solid waste dumping & illegal structural expansion',
    ],
    penalties: 'Mandatory criminal prosecution under RA 11038 Sec. 21 with fines up to ₱5,000,000 and 6–12 years imprisonment.',
    barangays: ['Mascap', 'Puray', 'San Rafael', 'Calawis', 'San Jose', 'San Juan', 'Pinugay', 'Pintong Bocawe', 'Cuyambay'],
    ecosystemRole: 'Primary headwater catchment for Boso-Boso, Tayabasan, Wawa, and Puray sub-basins. Critical natural buffer mitigating flash floods down into Marikina and Metro Manila.',
    polygon: [
      [121.1750, 14.6550], [121.1920, 14.7150], [121.2150, 14.7600], [121.2480, 14.7950],
      [121.3150, 14.8150], [121.3650, 14.7850], [121.3850, 14.7400], [121.3700, 14.6650],
      [121.3350, 14.5950], [121.2850, 14.5750], [121.2350, 14.5900], [121.1950, 14.6250],
      [121.1750, 14.6550]
    ],
  },
  {
    id: 'kaliwa-river-forest-reserve',
    name: 'Kaliwa River Forest Reserve (KRFR)',
    shortName: 'Kaliwa Forest Reserve',
    category: 'nipas',
    categoryLabel: 'DENR-NIPAS',
    type: 'Forest Reserve',
    color: '#065f46',
    lat: 14.6167,
    lng: 121.3667,
    zoom: 12,
    municipality: 'Tanay (Rizal) / Gen. Nakar (Quezon)',
    areaHectares: '~27,608 ha',
    elevation: '200m – 1,200m ASL',
    legalBasis: 'Presidential Proclamation No. 573 (1969) / Initial NIPAS Component',
    prohibitions: [
      'Commercial logging & illegal timber transport',
      'Slash-and-burn agriculture (kaingin) in upland forests',
      'Unpermitted road construction & river diversion',
      'Wildlife poaching & bird trapping',
    ],
    penalties: 'Statutory imprisonment and fines under PD 705 (Revised Forestry Code) and RA 11038.',
    barangays: ['Cayabu', 'Laiban', 'Sta. Ines', 'Sto. Niño', 'San Andres', 'Tinucan', 'Daraitan'],
    ecosystemRole: 'Upland Sierra Madre headwater corridor sustaining the Kaliwa River system and ancestral domain territory of indigenous Dumagat-Remontado communities.',
    polygon: [
      [121.3050, 14.5800], [121.3120, 14.6400], [121.3350, 14.6950], [121.3850, 14.7250],
      [121.4350, 14.6850], [121.4500, 14.6250], [121.4350, 14.5650], [121.3950, 14.5450],
      [121.3450, 14.5500], [121.3050, 14.5800]
    ],
  },
  {
    id: 'pamitinan-protected-landscape',
    name: 'Pamitinan Protected Landscape (PPL)',
    shortName: 'Pamitinan Landscape',
    category: 'nipas',
    categoryLabel: 'DENR-NIPAS',
    type: 'Protected Landscape',
    color: '#0f766e',
    lat: 14.7339,
    lng: 121.1900,
    zoom: 14,
    municipality: 'Rodriguez (Montalban)',
    areaHectares: '608.64 ha',
    elevation: '80m – 426m ASL',
    legalBasis: 'Presidential Proclamation No. 901 (1996), Republic Act No. 11038',
    prohibitions: [
      'Rock quarrying & limestone karst destruction',
      'Disfiguring caves (Pamitinan Cave & geological formations)',
      'Discharging waste into Wawa Gorge & Dam basin',
      'Squatting & unauthorized permanent structures',
    ],
    penalties: 'Strict penalties under RA 11038 and National Cave Protection Act (RA 9072).',
    barangays: ['San Rafael (Sitio Wawa)'],
    ecosystemRole: 'Iconic geological water gap between Mt. Pamitinan and Mt. Binacayan, enclosing Wawa Dam, historical cavern networks, and riparian wildlife habitats.',
    polygon: [
      [121.1820, 14.7260], [121.1850, 14.7430], [121.1980, 14.7440], [121.2020, 14.7350],
      [121.1970, 14.7240], [121.1880, 14.7230], [121.1820, 14.7260]
    ],
  },
  {
    id: 'hinulugang-taktak-park',
    name: 'Hinulugang Taktak Protected Landscape',
    shortName: 'Hinulugang Taktak',
    category: 'nipas',
    categoryLabel: 'DENR-NIPAS',
    type: 'Protected Landscape',
    color: '#b45309',
    lat: 14.5972,
    lng: 121.1653,
    zoom: 15,
    municipality: 'Antipolo City',
    areaHectares: '3.20 ha',
    elevation: '160m – 180m ASL',
    legalBasis: 'Proclamation No. 330 (1952), RA 6964 (1990), Proclamation No. 412 (2000), RA 11038',
    prohibitions: [
      'Discharging untreated sewage & commercial runoff into Taktak River',
      'Littering, plastic waste abandonment & open burning',
      'Unauthorized commercial encroachment & informal structures',
      'Tree hacking & floral vandalism',
    ],
    penalties: 'Fines up to ₱1,000,000 and mandatory environmental rehabilitation orders under RA 11038 and Clean Water Act (RA 9275).',
    barangays: ['Dela Paz (Sitio Taktak)', 'Santa Cruz'],
    ecosystemRole: 'Historical Antipolo pilgrimage waterfall and urban riparian sanctuary serving as a public ecological education and recreation park.',
    polygon: [
      [121.1610, 14.5980], [121.1710, 14.5990], [121.1730, 14.5900], [121.1620, 14.5890], [121.1610, 14.5980]
    ],
  },
  {
    id: 'proc-1636-wildlife-sanctuary',
    name: 'National Park, Wildlife Sanctuary & Game Preserve (Proc. 1636)',
    shortName: 'Proc. 1636 Sanctuary',
    category: 'nipas',
    categoryLabel: 'DENR-NIPAS',
    type: 'Wildlife Sanctuary',
    color: '#115e59',
    lat: 14.7500,
    lng: 121.4722,
    zoom: 11,
    municipality: 'Rodriguez, San Mateo, Antipolo, Baras, Tanay, Pililla',
    areaHectares: '~46,310 ha (Multi-Provincial)',
    elevation: '300m – 1,400m ASL',
    legalBasis: 'Presidential Proclamation No. 1636 (April 18, 1977)',
    prohibitions: [
      'Hunting, capturing or trading wildlife (birds, mammals, reptiles)',
      'Clearing forest cover for settlement or agriculture',
      'Operating unregistered chainsaws & timber equipment',
      'Mineral prospecting & commercial extraction',
    ],
    penalties: 'Criminal penalties under Wildlife Resources Conservation Act (RA 9147) and NIPAS Act.',
    barangays: ['Puray', 'Calawis', 'Cuyambay', 'Daraitan', 'Sierra Madre High Ridge'],
    ecosystemRole: 'Regional mega-biodiversity spine connecting the eastern highlands of Rizal to Bulacan, Laguna, and Quezon; habitat for endemic Philippine wildlife.',
    polygon: [
      [121.3600, 14.8500], [121.4200, 14.8800], [121.5100, 14.8400], [121.5200, 14.6500],
      [121.4600, 14.5200], [121.4100, 14.5400], [121.4200, 14.6800], [121.3800, 14.7700],
      [121.3600, 14.8500]
    ],
  },
  {
    id: 'la-mesa-watershed-buffer',
    name: 'La Mesa Watershed Reservation Buffer (Rizal Flank)',
    shortName: 'La Mesa Buffer',
    category: 'nipas',
    categoryLabel: 'DENR-NIPAS',
    type: 'Watershed Reservation',
    color: '#047857',
    lat: 14.7150,
    lng: 121.1450,
    zoom: 13,
    municipality: 'San Mateo & Rodriguez',
    areaHectares: '~2,700 ha (Buffer Corridor)',
    elevation: '100m – 350m ASL',
    legalBasis: 'Presidential Proclamation No. 1336 & Executive Order No. 601',
    prohibitions: [
      'Commercial land conversion & unauthorized subdivisions',
      'Industrial and chemical runoff into reservoir feeder streams',
      'Illegal excavation, land leveling & soil dumping',
      'Open burning & solid waste accumulation',
    ],
    penalties: 'Immediate cease-and-desist orders, structural demolition, and criminal prosecution under Water Code (PD 1067).',
    barangays: ['Pintong Bocawe', 'Guinayang', 'Ampid', 'San Jose', 'Burgos'],
    ecosystemRole: 'Direct catchment buffer protecting the last remaining rainforest parcel in the Metro Manila border, feeding raw water into the La Mesa Dam potable reservoir.',
    polygon: [
      [121.1350, 14.6900], [121.1380, 14.7350], [121.1550, 14.7450], [121.1620, 14.7250],
      [121.1540, 14.6920], [121.1350, 14.6900]
    ],
  },
  // LLDA ZOMAP
  {
    id: 'rayap-fish-sanctuary',
    name: 'Rayap Fish Sanctuary (LLDA Central Bay)',
    shortName: 'Rayap Fish Sanctuary',
    category: 'llda_zomap',
    categoryLabel: 'LLDA ZOMAP',
    type: 'Aquatic Fish Sanctuary',
    color: '#0284c7',
    lat: 14.3300,
    lng: 121.2500,
    zoom: 12,
    municipality: 'Binangonan, Cardona, Jalajala',
    areaHectares: '5,000 ha (~5% of Laguna de Bay)',
    elevation: '12.5m (Mean Lower Low Water)',
    legalBasis: 'Republic Act No. 4826, LLDA Board Resolution No. 136 (Series of 2000)',
    prohibitions: [
      'Commercial fishpen & fishcage construction in open sanctuary',
      'Motorized commercial trawling & destructive fishing gears',
      'Toxic industrial discharge & chemical dumping',
      'Reclaiming lake bed or creating artificial islets',
    ],
    penalties: 'Demolition of structures, vessel confiscation, and LLDA statutory fines under RA 4826 and Fisheries Code (RA 8550/10654).',
    barangays: ['Rayap', 'Habagatan', 'Janosa', 'Subay', 'Malahi Island', 'Punta', 'Bayugo'],
    ecosystemRole: 'Central Bay aquatic nursery and breeding sanctuary for native fish species (kanduli, ayungin, bangus) safeguarding the ecological equilibrium of Laguna de Bay.',
    polygon: [
      [121.3200, 14.3100], [121.2380, 14.3050], [121.2350, 14.3250], [121.2480, 14.3480],
      [121.2650, 14.3650], [121.3150, 14.3580], [121.3250, 14.3350], [121.3200, 14.3100]
    ],
  },
  {
    id: 'laguna-shoreland-buffer',
    name: 'Laguna de Bay Protected Shoreland Buffer Zone (12.5m Contour)',
    shortName: 'Laguna 12.5m Buffer',
    category: 'llda_zomap',
    categoryLabel: 'LLDA ZOMAP',
    type: 'Shoreland Buffer',
    color: '#2563eb',
    lat: 14.4500,
    lng: 121.2200,
    zoom: 11,
    municipality: '9 Coastal LGUs across Rizal',
    areaHectares: '~4,200 ha (Linear Lakeshore Corridor)',
    elevation: 'At or below 12.50m reglementary mark',
    legalBasis: 'LLDA ZOMAP, Presidential Decree No. 1067, LLDA Res. 136',
    prohibitions: [
      'Unauthorized reclamation & backfilling of shoreline wetlands',
      'Dumping municipal solid waste & construction debris',
      'Direct discharge of untreated sewage & septic overflow',
      'Building non-compliant structures within public easement',
    ],
    penalties: 'Administrative fines, summary eviction, and demolition by LLDA and Provincial Government of Rizal.',
    barangays: ['Littoral wetlands across Taytay, Angono, Binangonan, Cardona, Morong, Baras, Tanay, Pililla, Jalajala'],
    ecosystemRole: 'Natural flood attenuation buffer, filtration zone for terrestrial runoff entering Laguna de Bay, and coastal wetland bird habitat.',
    polygon: [
      [121.1450, 14.5200], [121.1700, 14.5250], [121.1980, 14.4850], [121.2250, 14.4600],
      [121.2550, 14.4850], [121.2900, 14.4800], [121.3250, 14.4500], [121.3400, 14.4100],
      [121.3250, 14.3600], [121.2900, 14.4200], [121.2500, 14.4400], [121.2150, 14.4250],
      [121.1850, 14.4450], [121.1600, 14.4800], [121.1450, 14.5200]
    ],
  },
  // KBA & Georeserves
  {
    id: 'mounts-irid-angilo-kba',
    name: 'Mounts Irid–Angilo & Binuang Key Biodiversity Area (KBA 9720)',
    shortName: 'Mts. Irid–Angilo KBA',
    category: 'kba_georeserve',
    categoryLabel: 'KBA / Karst',
    type: 'Key Biodiversity Area',
    color: '#6366f1',
    lat: 14.7889,
    lng: 121.3383,
    zoom: 12,
    municipality: 'Rodriguez (Puray / San Rafael)',
    areaHectares: '170,572 ha (Regional KBA 9720)',
    elevation: '400m – 1,469m ASL (Highest in Rizal)',
    legalBasis: 'DENR-BMB National KBA Directory, RA 8371 (IPRA)',
    prohibitions: [
      'Unlawful entry into ancestral domain without Free, Prior and Informed Consent (FPIC)',
      'Poaching endemic montane wildlife & rare orchid harvesting',
      'Illegal logging of old-growth dipterocarp forests',
      'Unpermitted mining or mineral exploratory work',
    ],
    penalties: 'Severe penal prosecution under IPRA Law (RA 8371) and National Integrated Protected Areas System.',
    barangays: ['Puray', 'San Rafael', 'Mt. Irid Summit', 'Mt. Tukduan Banoi'],
    ecosystemRole: 'Crowning mountain massif of Rizal Province; pristine cloud forest and primary refuge for threatened Sierra Madre avian and mammalian species.',
    polygon: [
      [121.2650, 14.7600], [121.2850, 14.8350], [121.3550, 14.8600], [121.3950, 14.8250],
      [121.3800, 14.7600], [121.3200, 14.7450], [121.2650, 14.7600]
    ],
  },
  {
    id: 'masungi-georeserve',
    name: 'Masungi Georeserve & Karst Conservation Area',
    shortName: 'Masungi Georeserve',
    category: 'kba_georeserve',
    categoryLabel: 'KBA / Karst',
    type: 'Karst Georeserve',
    color: '#16a34a',
    lat: 14.5986,
    lng: 121.3183,
    zoom: 13,
    municipality: 'Baras & Tanay',
    areaHectares: '~2,700 ha (Lot A & Restoration Area)',
    elevation: '300m – 680m ASL',
    legalBasis: 'DENR-Masungi Reforestation Agreement, DAO 96-37, Cave Protection Act',
    prohibitions: [
      'Quarrying, limestone blasting & mechanical rock crushing',
      'Illegal fencing, barbed wire enclosures & land-grabbing',
      'Armed intimidation of environmental rangers & personnel',
      'Unpermitted construction of private resorts & piggery waste',
    ],
    penalties: 'Permanent revocation of ECCs, criminal charges under NIPAS Act, Cave Act (RA 9072), and Provincial Ordinances.',
    barangays: ['Pinugay (Baras)', 'Cuyambay (Tanay)'],
    ecosystemRole: '66-million-year-old Paleocene limestone karst sanctuary acting as natural water catchment divide between the Marikina River and Kaliwa River systems.',
    polygon: [
      [121.3020, 14.5880], [121.3120, 14.6150], [121.3340, 14.6160], [121.3400, 14.5940],
      [121.3250, 14.5820], [121.3080, 14.5810], [121.3020, 14.5880]
    ],
  },
  {
    id: 'angono-binangonan-petroglyphs',
    name: 'Angono–Binangonan Petroglyphs Site & Micro-Forest',
    shortName: 'Petroglyphs Reserve',
    category: 'kba_georeserve',
    categoryLabel: 'KBA / Karst',
    type: 'Cultural-Ecological Reserve',
    color: '#c2410c',
    lat: 14.5328,
    lng: 121.1872,
    zoom: 15,
    municipality: 'Binangonan & Angono',
    areaHectares: '~12 ha (Core & Forest Buffer)',
    elevation: '140m – 210m ASL',
    legalBasis: 'Presidential Decree No. 260 (1973), Proclamation No. 2146',
    prohibitions: [
      'Defacing, scratching, or painting rock art panels',
      'Vandalism, graffiti & unauthorized archaeological digging',
      'Quarrying & dynamite blasting in secondary forest buffer',
      'Littering & unattended open flames near shelter',
    ],
    penalties: 'Mandatory criminal prosecution under National Cultural Heritage Act (RA 10066) with heavy fines and prison terms.',
    barangays: ['Bilibiran (Binangonan)', 'Mahabang Parang (Angono)'],
    ecosystemRole: 'Oldest known prehistoric rock art in the Philippines (circa 3000 BC) set within a preserved volcanic tuff rock shelter and secondary biodiversity grove.',
    polygon: [
      [121.1810, 14.5290], [121.1820, 14.5380], [121.1940, 14.5390], [121.1950, 14.5280],
      [121.1870, 14.5260], [121.1810, 14.5290]
    ],
  },
  // Local Mountain Watersheds
  {
    id: 'mt-tagapo-sanctuary',
    name: 'Mount Tagapo Local Forest & Ecotourism Zone',
    shortName: 'Mt. Tagapo Sanctuary',
    category: 'local_mountain',
    categoryLabel: 'Local Mountain',
    type: 'Local Mountain Reserve',
    color: '#059669',
    lat: 14.3310,
    lng: 121.2280,
    zoom: 13,
    municipality: 'Binangonan & Cardona (Talim)',
    areaHectares: '~1,200 ha (Talim Mountain Spine)',
    elevation: '438 MASL',
    legalBasis: 'Binangonan & Cardona Municipal Ecological Reserve Ordinances',
    prohibitions: [
      'Tree cutting & harvesting endemic bamboo/timber',
      'Open burning (siga) & setting brushfires on grass slopes',
      'Quarrying volcanic basalt & unauthorized excavation',
      'Unregulated mountaineering & leaving non-biodegradable trash',
    ],
    penalties: 'Municipal statutory fines, mandatory community ecological service, and blacklisting from Talim ecotourism.',
    barangays: ['Janosa', 'Sapang', 'Kaytome', 'Binitagan', 'Rayap', 'Tuna', 'Balibago', 'Subay'],
    ecosystemRole: 'Heart of Talim Island; cone-shaped volcanic peak ("Susong Dalaga") acting as the primary island watershed and microclimate regulator.',
    polygon: [
      [121.2160, 14.3680], [121.2280, 14.3690], [121.2380, 14.3610], [121.2430, 14.3450],
      [121.2420, 14.3250], [121.2320, 14.3150], [121.2180, 14.3200], [121.2120, 14.3380],
      [121.2140, 14.3580], [121.2160, 14.3680]
    ],
  },
  {
    id: 'mt-sembrano-watershed',
    name: 'Mount Sembrano Watershed & Forest Reserve',
    shortName: 'Mt. Sembrano Watershed',
    category: 'local_mountain',
    categoryLabel: 'Local Mountain',
    type: 'Municipal Watershed',
    color: '#4d7c0f',
    lat: 14.3856,
    lng: 121.3639,
    zoom: 13,
    municipality: 'Pililla & Jalajala',
    areaHectares: '~2,400 ha (Peninsula Ridge)',
    elevation: '743m – 745m ASL',
    legalBasis: 'Pililla & Jalajala Municipal Environmental Ordinances',
    prohibitions: [
      'Kaingin (slash-and-burn) on steep mountain slopes',
      'Illegal charcoal kilns & clearing of mango/forest groves',
      'Contaminating Manggahan waterfalls & feeder creeks',
      'Unregistered camping & wildfire risks',
    ],
    penalties: 'Ordinance penalties and confiscation of cutting/charcoal tools by joint Pililla-Jalajala Task Force.',
    barangays: ['Malaya', 'Niogan', 'Quisao', 'Halayhayin', 'Sipsipin', 'Bagumbong', 'Lubo', 'Pagkalinawan'],
    ecosystemRole: 'Volcanic divide separating the windward slopes of Pililla and Jalajala, protecting headwater springs feeding eastern Laguna de Bay.',
    polygon: [
      [121.3450, 14.3720], [121.3520, 14.4120], [121.3780, 14.4180], [121.3920, 14.3850],
      [121.3850, 14.3620], [121.3620, 14.3550], [121.3450, 14.3720]
    ],
  },
  {
    id: 'mt-balagbag-maranat',
    name: 'Mount Balagbag–Mount Maranat Foothills',
    shortName: 'Mt. Balagbag Foothills',
    category: 'local_mountain',
    categoryLabel: 'Local Mountain',
    type: 'Local Ecotourism Buffer',
    color: '#475569',
    lat: 14.8219,
    lng: 121.1761,
    zoom: 13,
    municipality: 'Rodriguez (San Isidro)',
    areaHectares: '~1,800 ha (Northern Foothills)',
    elevation: '350m – 777m ASL',
    legalBasis: 'Rodriguez Municipal Ecotourism & Watershed Buffer Resolution',
    prohibitions: [
      'Unlicensed off-road 4x4 / motorcycle trail destruction',
      'Kaingin & land clearing along Ipo-Angat perimeter',
      'Commercial waste dumping & illegal cottages',
      'Unpermitted bonfire / fireworks lighting',
    ],
    penalties: 'Impoundment of off-road vehicles and local municipal environmental citations.',
    barangays: ['San Isidro (Sitio Balagbag / Macaingalan)'],
    ecosystemRole: 'Headwater corridor linking Rodriguez with the southern boundary of the Ipo-Angat watershed reserve, safeguarding Metro Manila drinking catchments.',
    polygon: [
      [121.1580, 14.8080], [121.1620, 14.8380], [121.1850, 14.8450], [121.1960, 14.8280],
      [121.1880, 14.8050], [121.1680, 14.8020], [121.1580, 14.8080]
    ],
  },
  {
    id: 'daranak-batlag-sanctuary',
    name: 'Daranak & Batlag Falls Ecotourism Sanctuary',
    shortName: 'Daranak Falls Sanctuary',
    category: 'local_mountain',
    categoryLabel: 'Local Mountain',
    type: 'Municipal Sanctuary',
    color: '#0d9488',
    lat: 14.5428,
    lng: 121.3533,
    zoom: 14,
    municipality: 'Tanay',
    areaHectares: '~150 ha',
    elevation: '220m – 340m ASL',
    legalBasis: 'Tanay Municipal Environmental Protection Ordinance No. 2',
    prohibitions: [
      'Dumping solid or chemical waste into Daranak River',
      'Defacing rock formations & limestone cliff faces',
      'Soap washing / bathing animals in natural river pools',
      'Hacking riverside vegetation & tree branches',
    ],
    penalties: 'Mandatory spot fines up to ₱5,000, eviction from park premises, and prosecution under Clean Water Act.',
    barangays: ['Tandang Kutyo', 'Plaza Aldea'],
    ecosystemRole: 'Critical riparian headwaters fed by Sierra Madre mountain streams, surrounding Daranak Falls, Batlag Falls, and Calinawan Cave.',
    polygon: [
      [121.3450, 14.5360], [121.3480, 14.5520], [121.3620, 14.5540], [121.3650, 14.5410],
      [121.3560, 14.5340], [121.3450, 14.5360]
    ],
  },
];

export const Dashboard: React.FC<DashboardProps> = ({
  lang,
  setLang,
  officialUser,
  onOpenLogin,
  viewMode: controlledViewMode,
  onViewModeChange,
  onNavigateTab,
  onLogout,
}) => {
  const t = translations[lang];

  // View Mode: 'workbench' (Option 1 default) vs 'full_map' (Option 2 GIS Canvas)
  const [internalViewMode, setInternalViewMode] = useState<'workbench' | 'full_map'>('workbench');

  const viewMode = controlledViewMode !== undefined ? controlledViewMode : internalViewMode;

  const handleViewModeChange = (mode: 'workbench' | 'full_map') => {
    if (mode === 'full_map') {
      setSelectedReport(null);
      setSelectedProtectedZoneId(null);
      setActiveProtectedZoneFilter(null);
      setActiveClusterFilter(null);
      setMapLayerMode('boundaries');
      setShowMgbQuarries(false);
      setIsSheetOpen(false);
      setIsLayersPanelOpen(false);
      setMunicipalityFilter('all');
      setStatusFilter('all');
      setCategoryFilter('all');
      setSeverityFilter('all');
      setSearchTerm('');
      setMapCenter({ lat: 14.5800, lng: 121.2800 });
      setMapZoom(11);
      setFitProvinceKey((prev) => prev + 1);
    }
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  // LikasMap-inspired Full Map layout states
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isLegendExpanded, setIsLegendExpanded] = useState<boolean>(true);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState<boolean>(false);

  // Reports state
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);

  // Filters
  const [queueTab, setQueueTab] = useState<'active' | 'spam'>('active');
  const [municipalityFilter, setMunicipalityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  // Active cluster filter from clicking a multi-report map marker
  const [activeClusterFilter, setActiveClusterFilter] = useState<{
    reportIds: string[];
    label: string;
    municipality?: string;
    barangay?: string;
  } | null>(null);

  // Evidence Deck & Multi-Photo states
  const [evidenceImages, setEvidenceImages] = useState<ReportImageItem[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);

  // Spam Quarantine & Permanent Delete states
  const [isDeletingReport, setIsDeletingReport] = useState<boolean>(false);
  const [isRestoringReport, setIsRestoringReport] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Human-in-the-loop Override Form state
  const [overrideCategory, setOverrideCategory] = useState<IncidentCategory>('solid_waste');
  const [overrideSeverity, setOverrideSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [officerNotes, setOfficerNotes] = useState<string>('');
  const [isSavingOverride, setIsSavingOverride] = useState<boolean>(false);
  const [overrideSuccess, setOverrideSuccess] = useState<boolean>(false);

  // Status transition state
  const [newStatus, setNewStatus] = useState<ReportStatus>('in_progress');
  const [statusChangeNotes, setStatusChangeNotes] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Errors, photo and triage retry
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isRetryingTriage, setIsRetryingTriage] = useState<boolean>(false);

  // Floating Left Sheet, Lightbox and Unified Action states
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isLegalNoteExpanded, setIsLegalNoteExpanded] = useState<boolean>(false);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState<boolean>(false);
  const [isSavingUnified, setIsSavingUnified] = useState<boolean>(false);
  const [unifiedSuccess, setUnifiedSuccess] = useState<boolean>(false);

  const { theme, toggleTheme } = useTheme();

  // Map viewport & layer state
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5800, lng: 121.2800 });
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('boundaries');
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('street');
  const [isMaskActive, setIsMaskActive] = useState<boolean>(true);
  const [fitProvinceKey, setFitProvinceKey] = useState<number>(0);
  const [activeZoneCatFilter, setActiveZoneCatFilter] = useState<'all' | 'nipas' | 'llda_zomap' | 'kba_georeserve' | 'local_mountain'>('all');
  const [selectedProtectedZoneId, setSelectedProtectedZoneId] = useState<string | null>(null);
  const [activeProtectedZoneFilter, setActiveProtectedZoneFilter] = useState<string | null>(null);
  const [isProhibitionsExpanded, setIsProhibitionsExpanded] = useState<boolean>(true);
  const [showMgbQuarries, setShowMgbQuarries] = useState<boolean>(false);
  const [isSyncingSatellites, setIsSyncingSatellites] = useState<boolean>(false);
  const [syncSatelliteToast, setSyncSatelliteToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeMgbQuarryHit, setActiveMgbQuarryHit] = useState<MgbQuarryFeatureProperties | null | undefined>(undefined);

  // Left Drawer multi-tab intelligence state
  const [activeLeftDrawerTab, setActiveLeftDrawerTab] = useState<'queue' | 'firms' | 'protected_zones' | 'quarries' | 'weather'>('queue');
  const [mgbQuarriesFeatures, setMgbQuarriesFeatures] = useState<GeoJSONFeature<MgbQuarryFeatureProperties>[]>([]);
  const [quarrySearchTerm, setQuarrySearchTerm] = useState<string>('');
  const [protectedZoneSearchTerm, setProtectedZoneSearchTerm] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

  // Tab 5: Live Weather & Air Quality State
  const [selectedWeatherLguId, setSelectedWeatherLguId] = useState<string>('rizal-center');
  const [atmosphericData, setAtmosphericData] = useState<FullAtmosphericData | null>(null);
  const [isLoadingAtmosphere, setIsLoadingAtmosphere] = useState<boolean>(false);
  const [atmosphereError, setAtmosphereError] = useState<string | null>(null);

  // Atmospheric & Radar Overlays on Map
  const [showRainRadar, setShowRainRadar] = useState<boolean>(false);
  const [showWeatherMarkers, setShowWeatherMarkers] = useState<boolean>(false);
  const [allLguWeather, setAllLguWeather] = useState<Record<string, FullAtmosphericData>>({});
  const [isLoadingAllLguWeather, setIsLoadingAllLguWeather] = useState<boolean>(false);

  // On-demand Case Dossier Live Atmospheric Telemetry
  const [liveCaseAtmosphere, setLiveCaseAtmosphere] = useState<Record<string, FullAtmosphericData>>({});
  const [loadingCaseAtmosphereId, setLoadingCaseAtmosphereId] = useState<string | null>(null);

  // Omnibox Category Chips Scroll Controller
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);
  const [isDraggingChips, setIsDraggingChips] = useState<boolean>(false);
  const chipsDragStartX = useRef<number>(0);
  const chipsDragStartScrollLeft = useRef<number>(0);
  const hasDraggedChips = useRef<boolean>(false);

  const checkChipsScroll = () => {
    const el = chipsScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  };

  useEffect(() => {
    const el = chipsScrollRef.current;
    if (!el) return;

    checkChipsScroll();

    const onWheelHandler = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0 && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += delta;
        checkChipsScroll();
      }
    };

    el.addEventListener('wheel', onWheelHandler, { passive: false });
    el.addEventListener('scroll', checkChipsScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      checkChipsScroll();
    });
    resizeObserver.observe(el);

    const timer = setTimeout(checkChipsScroll, 100);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('wheel', onWheelHandler);
      el.removeEventListener('scroll', checkChipsScroll);
      resizeObserver.disconnect();
    };
  }, [reports.length, mgbQuarriesFeatures.length]);

  const scrollChips = (direction: 'left' | 'right') => {
    const el = chipsScrollRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -150 : 150;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleChipsMouseDown = (e: React.MouseEvent) => {
    const el = chipsScrollRef.current;
    if (!el) return;
    setIsDraggingChips(true);
    hasDraggedChips.current = false;
    chipsDragStartX.current = e.pageX - el.offsetLeft;
    chipsDragStartScrollLeft.current = el.scrollLeft;
  };

  const handleChipsMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingChips) return;
    const el = chipsScrollRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - chipsDragStartX.current) * 1.3;
    if (Math.abs(walk) > 4) {
      hasDraggedChips.current = true;
    }
    el.scrollLeft = chipsDragStartScrollLeft.current - walk;
    checkChipsScroll();
  };

  const handleChipsMouseUp = () => {
    setIsDraggingChips(false);
  };

  // When switching to Full Map mode, enforce default clean state: nothing selected except Rizal's boundaries
  useEffect(() => {
    if (viewMode === 'full_map') {
      setSelectedReport(null);
      setSelectedProtectedZoneId(null);
      setActiveProtectedZoneFilter(null);
      setActiveClusterFilter(null);
      setMapLayerMode('boundaries');
      setShowMgbQuarries(false);
      setIsSheetOpen(false);
      setIsLayersPanelOpen(false);
      setMunicipalityFilter('all');
      setStatusFilter('all');
      setCategoryFilter('all');
      setSeverityFilter('all');
      setSearchTerm('');
    }
  }, [viewMode]);

  useEffect(() => {
    let isMounted = true;
    fetchRizalMgbQuarriesGeoJSON()
      .then((coll) => {
        if (isMounted && coll?.features) {
          setMgbQuarriesFeatures(coll.features);
        }
      })
      .catch((err) => {
        console.warn('Failed to load MGB quarries geojson:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSwitchLeftDrawerTab = (tab: 'queue' | 'firms' | 'protected_zones' | 'quarries' | 'weather') => {
    setActiveLeftDrawerTab(tab);
    if (tab !== 'protected_zones') {
      setSelectedProtectedZoneId(null);
    }
    if (tab === 'protected_zones') {
      setShowMgbQuarries(false);
      setMapLayerMode('protected_zones');
    } else if (tab === 'quarries') {
      setShowMgbQuarries(true);
      setMapLayerMode('quarries');
    } else if (tab === 'weather') {
      setShowMgbQuarries(false);
      setMapLayerMode('boundaries');
    } else if (tab === 'firms' || tab === 'queue') {
      setShowMgbQuarries(false);
      setMapLayerMode('boundaries');
    }
  };

  const handleCloseDrawer = () => {
    setIsSheetOpen(false);
    setSelectedProtectedZoneId(null);
    if (activeLeftDrawerTab === 'quarries') {
      setShowMgbQuarries(false);
      setMapLayerMode('boundaries');
    } else if (activeLeftDrawerTab === 'protected_zones') {
      setMapLayerMode('boundaries');
    }
  };

  const handleToggleDrawerTab = (tab: 'queue' | 'firms' | 'protected_zones' | 'quarries' | 'weather') => {
    if (selectedReport) {
      setSelectedReport(null);
      if (activeLeftDrawerTab === tab && isSheetOpen) {
        handleCloseDrawer();
        return;
      }
    } else if (isSheetOpen && activeLeftDrawerTab === tab) {
      handleCloseDrawer();
      return;
    }
    handleSwitchLeftDrawerTab(tab);
    setIsSheetOpen(true);
  };

  const loadAtmosphericData = async (lguPreset?: RizalLguPreset) => {
    const target = lguPreset || RIZAL_LGU_PRESETS.find((p) => p.id === selectedWeatherLguId) || RIZAL_LGU_PRESETS[0];
    setIsLoadingAtmosphere(true);
    setAtmosphereError(null);
    try {
      const data = await fetchFullAtmosphericTelemetry(target.lat, target.lng, target.name);
      if (data) {
        setAtmosphericData(data);
      } else {
        setAtmosphereError('Unable to connect to Open-Meteo telemetry stream. Please check connection and retry.');
      }
    } catch (err: any) {
      setAtmosphereError(err?.message || 'Failed to fetch atmospheric conditions');
    } finally {
      setIsLoadingAtmosphere(false);
    }
  };

  const loadAllLguTelemetry = async () => {
    if (Object.keys(allLguWeather).length > 0 || isLoadingAllLguWeather) return;
    setIsLoadingAllLguWeather(true);
    try {
      const data = await fetchAllRizalLgusTelemetry();
      if (data) {
        setAllLguWeather(data);
      }
    } catch (err) {
      console.warn('Failed to load all LGU weather telemetry:', err);
    } finally {
      setIsLoadingAllLguWeather(false);
    }
  };

  useEffect(() => {
    if (activeLeftDrawerTab === 'weather') {
      setShowWeatherMarkers(true);
      loadAllLguTelemetry();
      if (!atmosphericData && !isLoadingAtmosphere) {
        loadAtmosphericData();
      }
    }
  }, [activeLeftDrawerTab]);

  useEffect(() => {
    if (showWeatherMarkers) {
      loadAllLguTelemetry();
    }
  }, [showWeatherMarkers]);

  const handleSelectWeatherLgu = (preset: RizalLguPreset) => {
    setSelectedWeatherLguId(preset.id);
    setMapCenter({ lat: preset.lat, lng: preset.lng });
    setMapZoom(preset.id === 'rizal-center' ? 11 : 13);
    loadAtmosphericData(preset);
  };

  const handleWeatherMarkerClick = (presetId: string) => {
    const preset = RIZAL_LGU_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedWeatherLguId(preset.id);
    handleSwitchLeftDrawerTab('weather');
    setIsSheetOpen(true);
    setMapCenter({ lat: preset.lat, lng: preset.lng });
    setMapZoom(13);
    loadAtmosphericData(preset);
  };

  // On-demand fetch of weather & air quality for individual incident reports
  useEffect(() => {
    if (!selectedReport) return;
    if (selectedReport.aiTriage?.airQuality && selectedReport.aiTriage?.weather) return;
    if (liveCaseAtmosphere[selectedReport.id]) return;

    const coords = resolveReportCoordinates(selectedReport);
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;

    let isMounted = true;
    setLoadingCaseAtmosphereId(selectedReport.id);
    fetchFullAtmosphericTelemetry(coords.lat, coords.lng, selectedReport.location?.municipality || 'Rizal')
      .then((res) => {
        if (!isMounted || !res) return;
        setLiveCaseAtmosphere((prev) => ({ ...prev, [selectedReport.id]: res }));
      })
      .catch((err) => {
        console.warn('Failed to fetch on-demand live atmospheric telemetry for report:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingCaseAtmosphereId(null);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedReport]);

  useEffect(() => {
    if (!selectedReport) {
      setActiveMgbQuarryHit(undefined);
      return;
    }
    const isQuarry =
      selectedReport.final?.category === 'illegal_quarrying_extraction' ||
      selectedReport.aiTriage?.category === 'illegal_quarrying_extraction';
    if (!isQuarry) {
      setActiveMgbQuarryHit(undefined);
      return;
    }
    const coords = resolveReportCoordinates(selectedReport);
    let isMounted = true;
    checkMgbQuarryTenement(coords.lat, coords.lng).then((res) => {
      if (isMounted) setActiveMgbQuarryHit(res);
    });
    return () => {
      isMounted = false;
    };
  }, [selectedReport]);

  const handleSyncSatellites = async () => {
    setIsSyncingSatellites(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/sync-firms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const createdCount = data.created ?? data.ingestedCount ?? 0;
        const scannedCount = data.scanned ?? data.totalHotspotsDetected ?? 0;
        const msg = data.message || (createdCount > 0
          ? `NASA FIRMS: Ingested ${createdCount} new thermal anomaly incident${createdCount === 1 ? '' : 's'} across Rizal.`
          : `NASA FIRMS: Satellite scan complete. ${scannedCount} hotspots analyzed; 0 new anomalies.`);
        setSyncSatelliteToast({ message: msg, type: 'success' });
        setTimeout(() => setSyncSatelliteToast(null), 7000);
      } else {
        setSyncSatelliteToast({ message: data.error || 'Failed to sync NASA satellite hotspots', type: 'error' });
        setTimeout(() => setSyncSatelliteToast(null), 7000);
      }
    } catch (err: any) {
      setSyncSatelliteToast({ message: `Satellite sync error: ${err?.message || 'Network error'}`, type: 'error' });
      setTimeout(() => setSyncSatelliteToast(null), 7000);
    } finally {
      setIsSyncingSatellites(false);
    }
  };

  // Selected protected zone data lookup
  const selectedProtectedZone = useMemo(() => {
    if (!selectedProtectedZoneId) return null;
    return RIZAL_PROTECTED_ZONES_CATALOG.find((z) => z.id === selectedProtectedZoneId) || null;
  }, [selectedProtectedZoneId]);

  // NASA FIRMS satellite thermal anomaly hotspots
  const satelliteReports = useMemo(() => {
    return reports.filter(
      (r) => r.source === 'satellite_firms' || r.id.startsWith('SAT-') || !!r.satelliteHotspot
    );
  }, [reports]);

  // Spatial index: maps each protected zone ID to legitimate active/historical reports situated within its boundaries
  const reportsByProtectedZone = useMemo(() => {
    const map: Record<string, IncidentReport[]> = {};
    for (const zone of RIZAL_PROTECTED_ZONES_CATALOG) {
      map[zone.id] = [];
    }

    const legitimateReports = reports.filter((r) => r.status !== 'spam');

    for (const report of legitimateReports) {
      const coords = resolveReportCoordinates(report);
      const point: [number, number] = [coords.lng, coords.lat];

      for (const zone of RIZAL_PROTECTED_ZONES_CATALOG) {
        if (zone.polygon && zone.polygon.length >= 3) {
          if (isPointInPolygonRing(point, zone.polygon)) {
            map[zone.id].push(report);
          }
        }
      }
    }

    return map;
  }, [reports]);

  // Aggregated incident counts per municipality for real-time choropleth shading
  const choroplethCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const report of reports) {
      const status = report.status || 'pending';
      if (status !== 'resolved' && report.location?.municipality) {
        const mun = report.location.municipality;
        counts[mun] = (counts[mun] || 0) + 1;
      }
    }
    return counts;
  }, [reports]);

  // Real-time Unified GIS Search suggestions across Municipalities, Reserves, Quarries, and Incidents
  const searchSuggestions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return null;

    const munResults = Object.keys(MUNICIPALITY_COORDINATES)
      .filter((k) => k.toLowerCase().includes(query))
      .slice(0, 3)
      .map((k) => ({
        type: 'municipality' as const,
        id: `mun-${k}`,
        title: k,
        subtitle: 'Rizal LGU • Boundary fly-to',
        payload: k,
      }));

    const zoneResults = RIZAL_PROTECTED_ZONES_CATALOG
      .filter((z) => z.name.toLowerCase().includes(query) || z.municipality.toLowerCase().includes(query))
      .slice(0, 3)
      .map((z) => ({
        type: 'reserve' as const,
        id: `zone-${z.id}`,
        title: z.name,
        subtitle: `${z.municipality} • Protected Reserve`,
        payload: z,
      }));

    const quarryResults = mgbQuarriesFeatures
      .filter((f) => {
        const name = f.properties?.name || '';
        const op = f.properties?.operator || '';
        const mun = f.properties?.municipality || '';
        return name.toLowerCase().includes(query) || op.toLowerCase().includes(query) || mun.toLowerCase().includes(query);
      })
      .slice(0, 3)
      .map((f, idx) => ({
        type: 'quarry' as const,
        id: `quarry-${idx}-${f.properties?.permitNumber || f.properties?.name || idx}`,
        title: f.properties?.name || 'MGB Quarry Concession',
        subtitle: `${f.properties?.operator || f.properties?.municipality || 'Permitted Mining Tenement'}`,
        payload: f,
      }));

    const reportResults = reports
      .filter((r) => {
        const cat = r.final?.category || r.aiTriage?.category || '';
        const desc = r.rawInput?.description || '';
        const brgy = r.location?.barangay || '';
        return (
          r.referenceCode.toLowerCase().includes(query) ||
          desc.toLowerCase().includes(query) ||
          brgy.toLowerCase().includes(query) ||
          cat.toLowerCase().includes(query)
        );
      })
      .slice(0, 3)
      .map((r) => {
        const cat = r.final?.category || r.aiTriage?.category || 'Incident';
        const summary = r.aiTriage?.summary || r.rawInput?.description?.slice(0, 35) || cat;
        return {
          type: 'report' as const,
          id: `report-${r.id}`,
          title: `${r.referenceCode} • ${summary}`,
          subtitle: `${r.location?.barangay ? `${r.location.barangay}, ` : ''}${r.location?.municipality || 'Rizal'}`,
          payload: r,
        };
      });

    const totalCount = munResults.length + zoneResults.length + quarryResults.length + reportResults.length;
    if (totalCount === 0) return null;

    return {
      municipalities: munResults,
      reserves: zoneResults,
      quarries: quarryResults,
      reports: reportResults,
      totalCount,
    };
  }, [searchTerm, mgbQuarriesFeatures, reports]);

  // Cluster marker click handler: filters the Incident Queue to the co-located reports
  const handleClusterClick = (group: {
    reports: IncidentReport[];
    municipality?: string;
    barangay?: string;
    lat: number;
    lng: number;
  }) => {
    const label = [group.barangay, group.municipality].filter(Boolean).join(', ') || 'Spatial Cluster';
    setActiveClusterFilter({
      reportIds: group.reports.map((r) => r.id),
      label,
      municipality: group.municipality,
      barangay: group.barangay,
    });
    if (group.municipality) {
      const matchedKey =
        Object.keys(MUNICIPALITY_COORDINATES).find(
          (k) =>
            k === group.municipality ||
            k.toLowerCase().includes(group.municipality!.toLowerCase()) ||
            group.municipality!.toLowerCase().includes(k.toLowerCase())
        ) || group.municipality;
      setMunicipalityFilter(matchedKey);
    }
    setSelectedReport(null);
    setSelectedProtectedZoneId(null);
    setIsSheetOpen(true);
    handleSwitchLeftDrawerTab('queue');
    setMapCenter({ lat: group.lat, lng: group.lng });
    setMapZoom(14);
  };

  // Open-Meteo telemetry widget for active report
  const renderWeatherWidget = (weather?: WeatherContext | null, reportId?: string) => {
    let activeWeather: WeatherContext | null | undefined = weather;
    if (!activeWeather && reportId && liveCaseAtmosphere[reportId]) {
      const w = liveCaseAtmosphere[reportId].weather;
      activeWeather = {
        temperature: w.temperature,
        humidity: w.relativeHumidity,
        precipitation: w.precipitation,
        windSpeed: w.windSpeed,
        windGusts: w.windGusts ?? undefined,
        windDirection: w.windDirection,
        windDirectionCompass: w.windDirectionCompass,
        fetchedAt: w.fetchedAt,
      };
    }

    if (!activeWeather) {
      if (reportId && loadingCaseAtmosphereId === reportId) {
        return (
          <div className="pt-2 mt-2 border-t border-stone-200/80 dark:border-stone-800 animate-pulse">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5" />
                <span>Reading Live Weather Telemetry...</span>
              </span>
            </div>
            <div className="h-10 bg-stone-100 dark:bg-stone-800 rounded-lg"></div>
          </div>
        );
      }
      return null;
    }

    const windTraj = activeWeather.windDirection !== undefined
      ? getWindFlowTrajectory(activeWeather.windDirection, activeWeather.windSpeed)
      : null;

    return (
      <div className="pt-2 mt-2 border-t border-stone-200/80 dark:border-stone-800">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
            <span>{t.weatherTelemetryTitle}</span>
          </span>
          <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">
            {new Date(activeWeather.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 p-2 bg-stone-50 dark:bg-stone-950/70 border border-stone-200/80 dark:border-stone-800 rounded-lg text-center divide-x divide-stone-200/70 dark:divide-stone-800">
          <div className="px-1">
            <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium block leading-tight">{t.weatherTemp}</span>
            <span className="font-mono font-semibold text-xs text-stone-900 dark:text-stone-100">{activeWeather.temperature}°C</span>
          </div>
          <div className="px-1" title={windTraj ? (windTraj.isCalm ? windTraj.summary : `${windTraj.summary} at ${activeWeather.windSpeed} km/h`) : undefined}>
            <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium block leading-tight">{t.weatherWind}</span>
            <span className="font-mono font-semibold text-xs text-stone-900 dark:text-stone-100 truncate block">
              {windTraj?.isCalm
                ? '0 km/h (Calm)'
                : `${activeWeather.windSpeed} km/h ${activeWeather.windDirectionCompass ? activeWeather.windDirectionCompass : ''}`}
            </span>
          </div>
          <div className="px-1">
            <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium block leading-tight">{t.weatherHumidity}</span>
            <span className="font-mono font-semibold text-xs text-stone-900 dark:text-stone-100">{activeWeather.humidity}%</span>
          </div>
          <div className="px-1">
            <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium block leading-tight">{t.weatherPrecipitation}</span>
            <span className="font-mono font-semibold text-xs text-stone-900 dark:text-stone-100">{activeWeather.precipitation} mm</span>
          </div>
        </div>
      </div>
    );
  };

  // Protected Ecological Zone alert banner
  const renderProtectedZoneBadge = (zone?: ProtectedZoneHit | null, compact?: boolean) => {
    if (!zone) return null;
    let catLabel = 'Statutory Reserve';
    if (zone.category === 'nipas') catLabel = 'DENR-NIPAS Protected Area';
    else if (zone.category === 'llda_zomap') catLabel = 'LLDA Aquatic Sanctuary / Buffer';
    else if (zone.category === 'kba_georeserve') catLabel = 'Key Biodiversity Area / Karst';
    else if (zone.category === 'local_mountain') catLabel = 'Local Mountain Watershed';

    return (
      <div className="p-3 bg-stone-50 dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1.5 my-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldAlert className="w-3.5 h-3.5 text-stone-700 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-semibold text-stone-900 dark:text-stone-100 truncate">
              {t.protectedZoneAlertTitle}
            </span>
          </div>
          <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-300/70 dark:border-stone-700 uppercase shrink-0">
            {zone.type.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="text-xs font-semibold text-stone-900 dark:text-emerald-400 leading-snug">
          {zone.name}
        </div>
        <div className="text-[10px] text-stone-500 dark:text-stone-400 flex items-center gap-1">
          <span>{catLabel}</span>
          {zone.legalBasis && <span>• {zone.legalBasis}</span>}
        </div>
        {zone.legalNote && (
          compact ? (
            <div>
              <button
                type="button"
                onClick={() => setIsLegalNoteExpanded(!isLegalNoteExpanded)}
                className="text-[10px] text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 font-medium flex items-center gap-1 cursor-pointer mt-1"
              >
                <span>{isLegalNoteExpanded ? 'Hide statutory basis' : 'View statutory basis'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isLegalNoteExpanded ? 'rotate-180' : ''}`} />
              </button>
              {isLegalNoteExpanded && (
                <div className="text-[10px] text-stone-600 dark:text-stone-300 leading-relaxed pt-1.5 mt-1 border-t border-stone-200/60 dark:border-stone-800 font-sans">
                  {zone.legalNote}
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed font-sans pt-1 border-t border-stone-200/60 dark:border-stone-800">
              {zone.legalNote}
            </div>
          )
        )}
      </div>
    );
  };

  // NASA FIRMS Satellite Hotspot Orbital Telemetry Card
  const renderSatelliteHotspotCard = (report?: IncidentReport | null) => {
    if (!report) return null;
    const isSat = report.source === 'satellite_firms' || report.id.startsWith('SAT-') || !!report.satelliteHotspot;
    if (!isSat) return null;

    const sat = report.satelliteHotspot;
    const frp = sat?.frp !== undefined ? sat.frp.toFixed(2) : 'N/A';
    const tempK = sat?.brightnessTemperature !== undefined ? sat.brightnessTemperature.toFixed(1) : 'N/A';
    const tempC = sat?.brightnessTemperature !== undefined ? (sat.brightnessTemperature - 273.15).toFixed(1) : 'N/A';
    const confidence = sat?.confidence || 'Nominal';
    const pass = sat?.daynight === 'N' ? 'Night Overpass' : sat?.daynight === 'D' ? 'Day Overpass' : 'Orbital Scan';
    const sensor = sat?.instrument || 'VIIRS 375m (S-NPP / NOAA-20)';

    return (
      <div className="p-3 bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 dark:border-amber-700/50 rounded-xl space-y-2 my-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Satellite className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-[11px] font-bold tracking-wide uppercase text-amber-900 dark:text-amber-200 truncate">
              NASA FIRMS Orbital Telemetry
            </span>
          </div>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/40 uppercase shrink-0 flex items-center gap-1">
            <Flame className="w-2.5 h-2.5 text-orange-600" />
            {frp} MW FRP
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center p-1.5 bg-white/70 dark:bg-stone-900/80 rounded-lg border border-amber-500/20">
          <div className="px-1">
            <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">Radiant Temp</span>
            <span className="font-mono font-bold text-xs text-stone-900 dark:text-amber-200">{tempK} K ({tempC}°C)</span>
          </div>
          <div className="px-1 border-x border-stone-200 dark:border-stone-800">
            <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">Confidence</span>
            <span className="font-mono font-bold text-xs text-amber-700 dark:text-amber-300 capitalize">{confidence}</span>
          </div>
          <div className="px-1">
            <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">Overpass</span>
            <span className="font-mono font-bold text-xs text-stone-800 dark:text-stone-200 truncate block">{pass}</span>
          </div>
        </div>

        <div className="text-[10px] text-stone-600 dark:text-stone-400 flex items-center justify-between font-mono pt-1 border-t border-amber-500/20">
          <span>Sensor: {sensor}</span>
          <span>Res: 375m Ground IFOV</span>
        </div>
      </div>
    );
  };

  // Open-Meteo Air Quality Telemetry Card
  const renderAirQualityCard = (aq?: AirQualitySnapshot | null, reportId?: string) => {
    let activeAq: AirQualitySnapshot | null | undefined = aq;
    if (!activeAq && reportId && liveCaseAtmosphere[reportId]) {
      const a = liveCaseAtmosphere[reportId].airQuality;
      activeAq = {
        pm25: a.pm2_5,
        pm2_5: a.pm2_5,
        pm10: a.pm10,
        carbonMonoxide: a.carbonMonoxide ?? 0,
        ozone: a.ozone ?? undefined,
        europeanAqi: a.europeanAqi,
        aqiLabel: a.aqiLabel,
        fetchedAt: a.fetchedAt,
      };
    }

    if (!activeAq) {
      if (reportId && loadingCaseAtmosphereId === reportId) {
        return (
          <div className="p-3 bg-stone-50 dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-xl space-y-2 my-2 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] font-bold tracking-wide uppercase text-stone-600 dark:text-stone-400">
                  Measuring Live Air Quality...
                </span>
              </div>
              <span className="text-[9px] font-mono text-stone-400">Open-Meteo CAMS</span>
            </div>
            <div className="h-10 bg-stone-100 dark:bg-stone-800 rounded-lg"></div>
          </div>
        );
      }
      return null;
    }

    const meta = getAqiMeta(activeAq.europeanAqi, activeAq.pm2_5 ?? activeAq.pm25, activeAq.pm10);

    return (
      <div className="p-3 bg-stone-50 dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-xl space-y-2 my-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-bold tracking-wide uppercase text-stone-900 dark:text-stone-100 truncate">
              Atmospheric Air Quality
            </span>
          </div>
          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}>
            AQI {activeAq.europeanAqi} • {meta.label}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1 p-2 bg-white dark:bg-stone-900/80 border border-stone-200 dark:border-stone-800 rounded-lg text-center divide-x divide-stone-200 dark:divide-stone-800">
          <div className="px-1">
            <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">PM2.5</span>
            <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">
              {activeAq.pm2_5 ?? activeAq.pm25} μg/m³
            </span>
          </div>
          <div className="px-1">
            <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">PM10</span>
            <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">{activeAq.pm10} μg/m³</span>
          </div>
          <div className="px-1">
            <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">CO</span>
            <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">{activeAq.carbonMonoxide ?? 'N/A'} μg/m³</span>
          </div>
          <div className="px-1">
            <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">Ozone</span>
            <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">{activeAq.ozone ?? 'N/A'} μg/m³</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-stone-600 dark:text-stone-300 pt-0.5">
          <span>DENR DAO 2020-14: <strong className="font-semibold text-stone-800 dark:text-stone-200">{meta.denrStatus}</strong></span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
            Dominant: {meta.dominantPollutant ?? 'PM2.5'}
          </span>
        </div>

        <div className="text-[10px] text-stone-500 dark:text-stone-400 flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-stone-800/60">
          <span>European CAMS & Philippine Clean Air Act Standards</span>
          <span className="font-mono">{new Date(activeAq.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    );
  };

  // MGB Region IV-A Permitted Quarry Concession Check Card
  const renderMgbQuarryCard = (report?: IncidentReport | null) => {
    if (!report) return null;
    const isQuarrying =
      report.final?.category === 'illegal_quarrying_extraction' ||
      report.aiTriage?.category === 'illegal_quarrying_extraction';
    if (!isQuarrying) return null;

    if (activeMgbQuarryHit === undefined) {
      return (
        <div className="p-3 bg-stone-50 dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-xl my-2 text-xs text-stone-500 italic">
          Cross-referencing MGB cadastre...
        </div>
      );
    }

    if (activeMgbQuarryHit) {
      const hit = activeMgbQuarryHit;
      return (
        <div className="p-3 bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 dark:border-amber-800/60 rounded-xl space-y-1.5 my-2">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Pickaxe className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-[11px] font-bold tracking-wide uppercase text-amber-900 dark:text-amber-200 truncate">
                MGB Permitted Quarry Cadastre
              </span>
            </div>
            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 uppercase shrink-0">
              Inside Permitted Tenement
            </span>
          </div>
          <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
            {hit.tenementName || hit.name}
          </div>
          <div className="text-[10px] text-stone-600 dark:text-stone-300">
            <strong>Permit:</strong> <span className="font-mono">{hit.permitNumber}</span> • <strong>Operator:</strong> {hit.operator}
          </div>
          <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed pt-1 border-t border-amber-500/20">
            Coordinates intersect an authorized MGB Region IV-A concession. Officers should verify whether on-ground activities exceed permitted boundaries, bench depths, or Environmental Compliance Certificate (ECC) conditions.
          </div>
        </div>
      );
    }

    return (
      <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/60 rounded-xl space-y-1.5 my-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="text-[11px] font-bold tracking-wide uppercase text-rose-900 dark:text-rose-200 truncate">
              MGB Cadastre Cross-Reference
            </span>
          </div>
          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700 uppercase shrink-0 animate-pulse">
            Wildcat Quarry Alert
          </span>
        </div>
        <div className="text-xs font-semibold text-rose-950 dark:text-rose-200 leading-snug">
          Zero Authorized Concessions Found at Coordinates
        </div>
        <div className="text-[10px] text-stone-600 dark:text-stone-300 leading-relaxed pt-1 border-t border-rose-200 dark:border-rose-900/40">
          Report coordinates do NOT intersect any authorized MGB Region IV-A mining or quarrying concessions in Rizal Province. High probability of illegal or unpermitted extraction. Immediate ENRO / LGU field verification advised.
        </div>
      </div>
    );
  };

  const handleQuickJump = (munKey: string) => {
    setActiveClusterFilter(null);
    setActiveProtectedZoneFilter(null);
    setSelectedProtectedZoneId(null);
    if (munKey === 'all') {
      setMunicipalityFilter('all');
      setSelectedReport(null);
      setFitProvinceKey((prev) => prev + 1);
      setMapCenter({ lat: 14.5800, lng: 121.2800 });
      setMapZoom(11);
    } else {
      const matchedKey =
        Object.keys(MUNICIPALITY_COORDINATES).find(
          (k) =>
            k === munKey ||
            k.toLowerCase().includes(munKey.toLowerCase()) ||
            munKey.toLowerCase().includes(k.toLowerCase())
        ) || munKey;
      setMunicipalityFilter(matchedKey);
      if (MUNICIPALITY_COORDINATES[matchedKey]) {
        setMapCenter(MUNICIPALITY_COORDINATES[matchedKey]);
        setMapZoom(13);
      }
    }
  };

  // Sync selected report inputs when selection changes
  useEffect(() => {
    if (selectedReport) {
      const activeCat = selectedReport.final?.category || selectedReport.aiTriage?.category || 'solid_waste';
      const activeSev = selectedReport.final?.severity || selectedReport.aiTriage?.severity || 3;
      setOverrideCategory(activeCat as IncidentCategory);
      setOverrideSeverity(activeSev as any);
      setOfficerNotes(selectedReport.final?.notes || '');
      setNewStatus(selectedReport.status);
      setStatusChangeNotes('');
      setOverrideSuccess(false);
      setUnifiedSuccess(false);
      setIsLightboxOpen(false);
      setIsLegalNoteExpanded(false);
      setIsReasoningExpanded(false);
      if (selectedReport.location) {
        const coords = resolveReportCoordinates(selectedReport);
        setMapCenter(coords);
        setMapZoom(14);
      }
    }
  }, [selectedReport?.id]);

  // Keyboard shortcut: Esc closes lightbox, bottom inspection dock, or returns to Workbench
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLightboxOpen) {
          setIsLightboxOpen(false);
          return;
        }
        if (viewMode === 'full_map') {
          if (selectedReport) {
            setSelectedReport(null);
          } else {
            handleViewModeChange('workbench');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, selectedReport, isLightboxOpen]);

  // Firestore live listener: newest 100 reports. Status filtering happens client-side.
  useEffect(() => {
    setLoading(true);
    setLoadError(null);

    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: IncidentReport[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            referenceCode: data.referenceCode,
            createdAt: data.createdAt?.toDate
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString(),
            status: data.status || 'pending',
            statusHistory: data.statusHistory || [],
            location: data.location || { lat: 14.4791, lng: 121.1895, accuracyMeters: null, geohash: '', source: 'gps' },
            rawInput: data.rawInput || { description: '', hasImage: false },
            triageStatus: data.triageStatus || 'pending',
            aiTriage: data.aiTriage || null,
            final: data.final || null,
            duplicateClusterId: data.duplicateClusterId || null,
          };
        });

        setReports(list);
        // Keep the current selection (refreshed) or keep null (no initial selection)
        setSelectedReport((prev) =>
          prev ? list.find((r) => r.id === prev.id) ?? prev : null
        );
        setLoading(false);
      },
      (err) => {
        console.error('Firestore reports listener failed:', err);
        setLoadError(
          'Could not load reports. Make sure your account is registered as an official and Firestore rules are deployed.'
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load the evidence photos for the selected report from Firestore
  useEffect(() => {
    setPhotoDataUrl(null);
    setEvidenceImages([]);
    setActivePhotoIndex(0);
    setShowDeleteConfirm(false);
    if (!selectedReport?.rawInput.hasImage) return;
    let cancelled = false;
    getDoc(doc(db, 'report_images', selectedReport.id))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          const d = snap.data();
          const legacyData = d.data as string;
          const multiImages = (d.images as ReportImageItem[]) || [];
          if (multiImages.length > 0) {
            setEvidenceImages(multiImages);
            setPhotoDataUrl(multiImages[0].data);
          } else if (legacyData) {
            setPhotoDataUrl(legacyData);
            setEvidenceImages([
              {
                data: legacyData,
                mimeType: d.mimeType || 'image/jpeg',
                role: 'primary',
                isLiveCamera: selectedReport.rawInput.captureMethod === 'live_camera',
              },
            ]);
          }
        }
      })
      .catch((err) => console.error('Photo load failed:', err));
    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id]);

  // Duplicate spatial clustering calculation
  // Reports within ~100m, same category, within 48 hours grouped under duplicateClusterId
  const clusteredReports = useMemo(() => {
    const list = reports.map((r) => ({ ...r }));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const r1 = list[i];
        const r2 = list[j];
        const cat1 = r1.final?.category || r1.aiTriage?.category;
        const cat2 = r2.final?.category || r2.aiTriage?.category;

        if (cat1 && cat2 && cat1 === cat2) {
          const timeDiffHours = Math.abs(
            new Date(r1.createdAt).getTime() - new Date(r2.createdAt).getTime()
          ) / (1000 * 3600);

          if (timeDiffHours <= 48) {
            const distMeters = calculateDistanceMeters(
              r1.location.lat,
              r1.location.lng,
              r2.location.lat,
              r2.location.lng
            );

            if (distMeters <= 100) {
              const clusterId = r1.duplicateClusterId || r2.duplicateClusterId || `cluster_${r1.referenceCode}`;
              r1.duplicateClusterId = clusterId;
              r2.duplicateClusterId = clusterId;
            }
          }
        }
      }
    }
    return list;
  }, [reports]);

  // Reports visible on the map (preserves municipal/category/severity context & protected zone filters)
  const mapVisibleReports = useMemo(() => {
    return clusteredReports.filter((report) => {
      // Spam queue separation
      if (queueTab === 'active' && report.status === 'spam') return false;
      if (queueTab === 'spam' && report.status !== 'spam') return false;

      // Active protected zone filter
      if (activeProtectedZoneFilter) {
        const zoneReports = reportsByProtectedZone[activeProtectedZoneFilter] || [];
        if (!zoneReports.some((r) => r.id === report.id)) return false;
      }

      if (municipalityFilter !== 'all' && report.location?.municipality !== municipalityFilter) return false;
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;
      const activeCat = report.final?.category || report.aiTriage?.category || 'other';
      if (categoryFilter !== 'all' && activeCat !== categoryFilter) return false;
      const activeSev = report.final?.severity || report.aiTriage?.severity || 0;
      if (severityFilter === 'urgent' && activeSev < 4) return false;
      if (severityFilter !== 'all' && severityFilter !== 'urgent' && activeSev !== Number(severityFilter)) return false;
      return true;
    });
  }, [clusteredReports, queueTab, activeProtectedZoneFilter, reportsByProtectedZone, municipalityFilter, statusFilter, categoryFilter, severityFilter]);

  // Filtered reports for queue stream (narrows by activeClusterFilter and searchTerm)
  const filteredReports = useMemo(() => {
    return mapVisibleReports.filter((report) => {
      // Cluster filter from map marker click
      if (activeClusterFilter && !activeClusterFilter.reportIds.includes(report.id)) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesCode = report.referenceCode.toLowerCase().includes(term);
        const matchesDesc = report.rawInput.description.toLowerCase().includes(term);
        const matchesBrgy = (report.location.barangay || '').toLowerCase().includes(term);
        const matchesMun = (report.location.municipality || '').toLowerCase().includes(term);
        if (!matchesCode && !matchesDesc && !matchesBrgy && !matchesMun) return false;
      }

      return true;
    });
  }, [mapVisibleReports, activeClusterFilter, searchTerm]);

  // Statistics calculation (strictly excludes quarantined spam reports from operational metrics)
  const stats = useMemo(() => {
    const legitimateReports = reports.filter((r) => r.status !== 'spam');
    const openCount = legitimateReports.filter((r) => r.status !== 'resolved').length;
    const urgentCount = legitimateReports.filter((r) => {
      const sev = r.final?.severity || r.aiTriage?.severity || 0;
      return sev >= 4 && r.status !== 'resolved';
    }).length;
    const resolvedCount = legitimateReports.filter((r) => r.status === 'resolved').length;

    // Category breakdown
    const categoryCounts: Record<string, number> = {};
    legitimateReports.forEach((r) => {
      const cat = r.final?.category || r.aiTriage?.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    return { openCount, urgentCount, resolvedCount, categoryCounts };
  }, [reports]);

  const activeReportsCount = useMemo(() => {
    return reports.filter((r) => r.status !== 'spam').length;
  }, [reports]);

  const spamReportsCount = useMemo(() => {
    return reports.filter((r) => r.status === 'spam').length;
  }, [reports]);

  // Human-in-the-loop override submission
  const handleSaveOverride = async () => {
    if (!selectedReport || !officialUser) return;
    setIsSavingOverride(true);
    setOverrideSuccess(false);
    setActionError(null);

    const finalData = {
      category: overrideCategory,
      severity: overrideSeverity,
      reviewedBy: officialUser.uid,
      reviewedAt: new Date().toISOString(),
      notes: officerNotes.trim(),
    };

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), { final: finalData });

      const updated = { ...selectedReport, final: finalData };
      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);

      setOverrideSuccess(true);
      setTimeout(() => setOverrideSuccess(false), 3000);
    } catch (err) {
      console.error('Override update failed:', err);
      setActionError('Could not save the review. You may not have permission, or you are offline.');
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Status transition handler (automatically records statusHistory)
  const handleUpdateStatus = async () => {
    if (!selectedReport || !officialUser) return;
    setIsUpdatingStatus(true);
    setActionError(null);

    const notes = statusChangeNotes.trim();
    const newHistoryItem = {
      status: newStatus,
      changedBy: officialUser.displayName || officialUser.email || 'PG-ENRO Officer',
      changedAt: new Date().toISOString(),
      // Firestore rejects `undefined`, so only include notes when present
      ...(notes ? { notes } : {}),
    };

    const updatedHistory = [...(selectedReport.statusHistory || []), newHistoryItem];

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: newStatus,
        statusHistory: updatedHistory,
      });

      const updated = {
        ...selectedReport,
        status: newStatus,
        statusHistory: updatedHistory,
      };
      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);
      setStatusChangeNotes('');
    } catch (err) {
      console.error('Status transition failed:', err);
      setActionError('Could not update the status. You may not have permission, or you are offline.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Restore spam report back to active pending queue
  const handleRestoreReport = async () => {
    if (!selectedReport || !officialUser) return;
    setIsRestoringReport(true);
    setActionError(null);

    const updatedHistory = [
      ...(selectedReport.statusHistory || []),
      {
        status: 'pending' as ReportStatus,
        changedBy: officialUser.displayName || officialUser.email || 'PG-ENRO Officer',
        changedAt: new Date().toISOString(),
        notes: 'Restored from Spam Quarantine by officer',
      },
    ];

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: 'pending',
        isSpam: false,
        statusHistory: updatedHistory,
      });

      const updated: IncidentReport = {
        ...selectedReport,
        status: 'pending',
        statusHistory: updatedHistory,
        aiTriage: selectedReport.aiTriage ? { ...selectedReport.aiTriage, isSpam: false } : null,
      };

      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Failed to restore report:', err);
      setActionError('Could not restore report from spam. Check permissions.');
    } finally {
      setIsRestoringReport(false);
    }
  };

  // Permanently delete spam report and associated photo
  const handleDeletePermanently = async () => {
    if (!selectedReport || !officialUser) return;
    setIsDeletingReport(true);
    setActionError(null);

    const reportIdToDelete = selectedReport.id;

    try {
      try {
        await deleteDoc(doc(db, 'report_images', reportIdToDelete));
      } catch (imgErr) {
        console.warn('Image doc delete skipped or already gone:', imgErr);
      }

      await deleteDoc(doc(db, 'reports', reportIdToDelete));

      const remaining = reports.filter((r) => r.id !== reportIdToDelete);
      setReports(remaining);
      const nextInQueue =
        remaining.find((r) => (queueTab === 'spam' ? r.status === 'spam' : r.status !== 'spam')) ||
        remaining[0] ||
        null;
      setSelectedReport(nextInQueue);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Permanent delete failed:', err);
      setActionError('Failed to delete report. Only registered officials can permanently delete reports.');
    } finally {
      setIsDeletingReport(false);
    }
  };

  // Mark active report as spam
  const handleMarkAsSpam = async () => {
    if (!selectedReport || !officialUser) return;
    setActionError(null);

    const updatedHistory = [
      ...(selectedReport.statusHistory || []),
      {
        status: 'spam' as ReportStatus,
        changedBy: officialUser.displayName || officialUser.email || 'PG-ENRO Officer',
        changedAt: new Date().toISOString(),
        notes: 'Quarantined to spam queue by officer',
      },
    ];

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: 'spam',
        isSpam: true,
        statusHistory: updatedHistory,
      });

      const updated: IncidentReport = {
        ...selectedReport,
        status: 'spam',
        statusHistory: updatedHistory,
        aiTriage: selectedReport.aiTriage ? { ...selectedReport.aiTriage, isSpam: true } : null,
      };

      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);
    } catch (err) {
      console.error('Failed to mark report as spam:', err);
      setActionError('Could not mark report as spam.');
    }
  };

  // Unified Save & Update Action for the Bottom Command Dock
  const handleSaveUnifiedAction = async () => {
    if (!selectedReport || !officialUser) return;
    setIsSavingUnified(true);
    setUnifiedSuccess(false);
    setActionError(null);

    const notes = officerNotes.trim() || statusChangeNotes.trim();
    const finalData = {
      category: overrideCategory,
      severity: overrideSeverity,
      reviewedBy: officialUser.uid,
      reviewedAt: new Date().toISOString(),
      notes: notes,
    };

    const statusChanged = newStatus !== selectedReport.status;
    let updatedHistory = selectedReport.statusHistory || [];
    const updates: Record<string, any> = { final: finalData };

    if (statusChanged || notes) {
      const newHistoryItem = {
        status: newStatus,
        changedBy: officialUser.displayName || officialUser.email || 'PG-ENRO Officer',
        changedAt: new Date().toISOString(),
        ...(notes ? { notes } : {}),
      };
      updatedHistory = [...updatedHistory, newHistoryItem];
      updates.status = newStatus;
      updates.statusHistory = updatedHistory;
    }

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), updates);

      const updated = {
        ...selectedReport,
        final: finalData,
        ...(updates.status ? { status: updates.status, statusHistory: updatedHistory } : {}),
      };
      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);
      setUnifiedSuccess(true);
      setTimeout(() => setUnifiedSuccess(false), 3500);
    } catch (err) {
      console.error('Unified update failed:', err);
      setActionError('Could not save the assessment. You may not have permission or are offline.');
    } finally {
      setIsSavingUnified(false);
    }
  };

  // Re-run AI triage for a failed/stuck report (official-only API)
  const handleRetryTriage = async () => {
    if (!selectedReport) return;
    setIsRetryingTriage(true);
    setActionError(null);
    try {
      const res = await fetch('/api/retry-triage', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ reportId: selectedReport.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('Retry triage failed:', err);
      setActionError('Could not start AI triage. Try again in a moment.');
    } finally {
      setIsRetryingTriage(false);
    }
  };

  const retryTriageButton = (
    <button
      type="button"
      onClick={handleRetryTriage}
      disabled={isRetryingTriage}
      className="px-3 py-1.5 bg-stone-900 hover:bg-black disabled:bg-stone-200 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isRetryingTriage ? 'animate-spin' : ''}`} />
      <span>{isRetryingTriage ? 'Running AI triage...' : 'Run AI triage again'}</span>
    </button>
  );

  // If user is not authenticated as official, display access gate
  if (!officialUser) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-stone-200 shadow-sm text-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="font-bold text-2xl text-stone-900 tracking-tight">
          {t.officialPortalTitle}
        </h2>
        <p className="text-sm text-stone-600 mt-2 max-w-md mx-auto">
          {t.officialPortalDesc}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onOpenLogin}
            className="py-3 px-6 bg-stone-900 hover:bg-black text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            {t.loginOfficialBtn}
          </button>
        </div>

        <p className="text-xs text-stone-400 mt-6 font-mono">
          Authorized PG-ENRO, local MENRO, and Provincial Quick Response Team access only.
        </p>
      </div>
    );
  }

  const activeCategory =
    selectedReport?.final?.category || selectedReport?.aiTriage?.category || 'other';
  const activeSeverity =
    selectedReport?.final?.severity || selectedReport?.aiTriage?.severity || 3;
  const activeMetadata = CATEGORIES[activeCategory as IncidentCategory] || CATEGORIES.other;

  return (
    <div className={viewMode === 'full_map' ? 'w-full h-full relative overflow-hidden flex-1' : 'mx-auto space-y-4 max-w-7xl px-4 sm:px-6 lg:px-8 py-2 sm:py-4'}>
      {/* Optional Alert Notification Toast */}
      {(loadError || actionError) && (
        <div role="alert" className={`p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between gap-2 shadow-xs ${viewMode === 'full_map' ? 'absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-md w-full' : ''}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{loadError || actionError}</span>
          </div>
          <button
            onClick={() => {
              setLoadError(null);
              setActionError(null);
            }}
            className="text-rose-500 hover:text-rose-800 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* NASA Satellite Sync Notification Toast */}
      {syncSatelliteToast && (
        <div
          role="status"
          className={`p-3 rounded-xl flex items-center justify-between gap-2 shadow-md text-xs font-medium z-50 ${
            syncSatelliteToast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/80 dark:border-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-950/80 dark:border-rose-800 dark:text-rose-200'
          } ${viewMode === 'full_map' ? 'absolute top-16 left-1/2 -translate-x-1/2 max-w-md w-full' : 'mb-3'}`}
        >
          <div className="flex items-center gap-2">
            <Satellite className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{syncSatelliteToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncSatelliteToast(null)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}



      {/* ========================================================= */}
      {/* VIEW MODE 1: OPTION 1 (SPLIT-SCREEN TACTICAL WORKBENCH)   */}
      {/* ========================================================= */}
      {viewMode === 'workbench' && (
        <div className="space-y-4">
          {/* Unified Operations Telemetry Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/40 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3.5 sm:p-4 bg-white/60 dark:bg-stone-900/60">
              <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                {t.statsOpen}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-stone-950 dark:text-stone-100">
                  {stats.openCount}
                </span>
                <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">active cases</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-rose-50/40 dark:bg-rose-950/20">
              <div className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                {t.statsUrgent}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-rose-700 dark:text-rose-400">
                  {stats.urgentCount}
                </span>
                <span className="text-[11px] text-rose-600 dark:text-rose-500 font-medium">severity 4-5</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white/60 dark:bg-stone-900/60">
              <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                {t.statsResolved}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100">
                  {stats.resolvedCount}
                </span>
                <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">closed cases</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white/60 dark:bg-stone-900/60">
              <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                {t.statsAvgTime}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100">
                  18.4 hrs
                </span>
                <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">provincial SLA</span>
              </div>
            </div>
          </div>

          {/* Integrated Tactical Command Toolbar */}
          <div className="p-2.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-2xs flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search reference code, description, or barangay..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 placeholder:text-stone-400 dark:placeholder:text-stone-600"
              />
            </div>

            {/* Municipality Filter */}
            <select
              value={municipalityFilter}
              onChange={(e) => {
                const mun = e.target.value;
                setMunicipalityFilter(mun);
                if (mun !== 'all' && MUNICIPALITY_COORDINATES[mun]) {
                  setMapCenter(MUNICIPALITY_COORDINATES[mun]);
                  setMapZoom(13);
                }
              }}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-lg focus:outline-none max-w-[170px] truncate"
            >
              <option value="all">{t.allMunicipalitiesFilter}</option>
              {RIZAL_MUNICIPALITIES.map((mun) => (
                <option key={mun} value={mun}>
                  {mun}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-lg focus:outline-none"
            >
              <option value="all">{lang === 'fil' ? 'Lahat ng Katayuan' : 'All Statuses'}</option>
              <option value="pending">{lang === 'fil' ? 'Nakabinbin (Pending)' : 'Pending'}</option>
              <option value="in_progress">{lang === 'fil' ? 'Inaaksyunan (In Progress)' : 'In Progress'}</option>
              <option value="resolved">{lang === 'fil' ? 'Naresolba (Resolved)' : 'Resolved'}</option>
              <option value="spam">{lang === 'fil' ? 'Spam / Naka-quarantine' : 'Spam / Quarantined'}</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-lg focus:outline-none max-w-[170px] truncate"
            >
              <option value="all">{lang === 'fil' ? 'Lahat ng Kategorya' : 'All Categories'}</option>
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>
                  {lang === 'fil' ? cat.labelFil : cat.labelEn}
                </option>
              ))}
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-lg focus:outline-none"
            >
              <option value="all">{lang === 'fil' ? 'Lahat ng Panganib' : 'All Severities'}</option>
              <option value="urgent">{lang === 'fil' ? 'Kagyat (4-5)' : 'Urgent Hazards (4-5)'}</option>
              <option value="1">1 - {lang === 'fil' ? 'Maliit' : 'Minor'}</option>
              <option value="2">2 - {lang === 'fil' ? 'Mababa' : 'Low'}</option>
              <option value="3">3 - {lang === 'fil' ? 'Katamtaman' : 'Moderate'}</option>
              <option value="4">4 - {lang === 'fil' ? 'Mataas' : 'High'}</option>
              <option value="5">5 - {lang === 'fil' ? 'Kritikal' : 'Critical'}</option>
            </select>

            {(municipalityFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all' || searchTerm) && (
              <button
                onClick={() => {
                  setMunicipalityFilter('all');
                  setStatusFilter('all');
                  setCategoryFilter('all');
                  setSeverityFilter('all');
                  setSearchTerm('');
                  setMapCenter({ lat: 14.5800, lng: 121.2800 });
                  setMapZoom(11);
                }}
                className="font-display text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300 px-2 py-1 cursor-pointer"
              >
                Reset
              </button>
            )}

            {/* Sync NASA FIRMS Satellites Button */}
            <button
              type="button"
              onClick={handleSyncSatellites}
              disabled={isSyncingSatellites}
              title="Sync NASA FIRMS VIIRS satellite thermal anomaly hotspots for Rizal Province"
              className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300/80 dark:border-amber-800 disabled:opacity-40 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ml-auto"
            >
              <Satellite className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 ${isSyncingSatellites ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncingSatellites ? 'Syncing...' : 'Sync Satellites'}</span>
            </button>

            {/* Re-run AI Triage Button */}
            <button
              type="button"
              onClick={handleRetryTriage}
              disabled={isRetryingTriage || !selectedReport}
              title={selectedReport ? "Re-run AI triage on selected incident" : "Select an incident to re-run triage"}
              className="px-2.5 py-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 disabled:hover:bg-stone-100 dark:disabled:hover:bg-stone-800 text-stone-700 dark:text-stone-200 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingTriage ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRetryingTriage ? 'Triaging...' : 'AI Triage'}</span>
            </button>
          </div>

          {/* Split-Screen Tactical Workbench Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column (7 cols): Map Stage with In-Map HUD & Queue Stream */}
            <div className="lg:col-span-7 space-y-4">
              {/* Map Canvas with Integrated HUD */}
              <div className="relative border border-stone-300 dark:border-stone-800 rounded-xl overflow-hidden shadow-xs bg-stone-100 dark:bg-stone-950">
                {/* Top-Right Shortcut: Maximize to Full Map */}
                <button
                  type="button"
                  onClick={() => handleViewModeChange('full_map')}
                  title="Expand to Full Map Canvas"
                  className="absolute top-2.5 right-2.5 z-20 px-2.5 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md bg-white/95 dark:bg-stone-900/95 hover:bg-stone-50 dark:hover:bg-stone-850 active:bg-stone-100 dark:active:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200/90 dark:border-stone-800 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 dark:ring-white/5 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-stone-700 dark:text-stone-300" />
                  <span className="hidden sm:inline">Full Map</span>
                </button>

                {/* Bottom-right Severity Indication Legend */}
                <div className="absolute bottom-9 right-2.5 z-20 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md px-3 py-1 rounded-xl text-[10px] font-display font-bold uppercase tracking-wide border border-stone-200/90 dark:border-stone-800 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 dark:ring-white/5 flex items-center gap-2.5 text-stone-700 dark:text-stone-300 pointer-events-none select-none">
                  <span className="flex items-center gap-1 text-emerald-800 dark:text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    1-2 Minor
                  </span>
                  <span className="flex items-center gap-1 text-amber-800 dark:text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    3 Mod
                  </span>
                  <span className="flex items-center gap-1 text-rose-800 dark:text-rose-400">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                    4-5 Urgent
                  </span>
                  <span className="hidden sm:inline-block text-stone-300 dark:text-stone-700">|</span>
                  <span className="hidden sm:inline-block text-stone-500 dark:text-stone-400 font-medium normal-case">
                    num = count
                  </span>
                </div>

                {/* Map Component: Plain map with markers */}
                <LeafletMap
                  mode="dashboard"
                  center={mapCenter}
                  zoom={mapZoom}
                  fitProvinceKey={fitProvinceKey}
                  reports={mapVisibleReports}
                  selectedReportId={selectedReport?.id}
                  layerMode="standard"
                  basemap={basemapMode}
                  activeMunicipality={municipalityFilter !== 'all' ? municipalityFilter : null}
                  onMunicipalityClick={(mun) => handleQuickJump(mun)}
                  onClusterClick={(group) => handleClusterClick(group)}
                  choroplethCounts={choroplethCounts}
                  maskNonRizal={false}
                  showMgbQuarries={showMgbQuarries}
                  onSelectReport={(r) => {
                    setSelectedReport(r);
                    const coords = resolveReportCoordinates(r);
                    setMapCenter(coords);
                    setMapZoom(14);
                  }}
                  className="h-[440px] sm:h-[480px] w-full"
                />
              </div>

              {/* Incident Queue Stream */}
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs overflow-hidden">
                <div className="px-4 py-2.5 bg-stone-50 dark:bg-stone-950/80 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQueueTab('active')}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                        queueTab === 'active'
                          ? 'bg-stone-900 dark:bg-stone-800 text-white shadow-2xs'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800'
                      }`}
                    >
                      <span>{lang === 'fil' ? 'Aktibo' : 'Active'}</span>
                      <span className="font-mono text-[10px] opacity-80">({activeReportsCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQueueTab('spam')}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                        queueTab === 'spam'
                          ? 'bg-rose-900 text-white shadow-2xs dark:bg-rose-950 dark:border dark:border-rose-800'
                          : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{lang === 'fil' ? 'Spam' : 'Spam'}</span>
                      {spamReportsCount > 0 && (
                        <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          queueTab === 'spam' ? 'bg-rose-800 text-rose-100' : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300'
                        }`}>
                          {spamReportsCount}
                        </span>
                      )}
                    </button>
                  </div>

                  <span className="text-xs font-mono font-semibold text-stone-500 dark:text-stone-400">
                    {filteredReports.length} {filteredReports.length === 1 ? 'incident' : 'incidents'}
                  </span>
                </div>

                <div className="divide-y divide-stone-100 dark:divide-stone-850 max-h-[380px] overflow-y-auto">
                  {filteredReports.length === 0 ? (
                    <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                      No incident reports match your current filters.
                    </div>
                  ) : (
                    filteredReports.map((report) => {
                      const isSelected = selectedReport?.id === report.id;
                      const sev = report.final?.severity || report.aiTriage?.severity || 3;
                      const cat = report.final?.category || report.aiTriage?.category || 'other';
                      const catMeta = CATEGORIES[cat as IncidentCategory] || CATEGORIES.other;

                      return (
                        <div
                          key={report.id}
                          onClick={() => {
                            setSelectedReport(report);
                            const coords = resolveReportCoordinates(report);
                            setMapCenter(coords);
                            setMapZoom(14);
                          }}
                          className={`p-3.5 hover:bg-stone-50 dark:hover:bg-stone-850/60 cursor-pointer transition flex items-start justify-between gap-3 ${
                            isSelected ? 'bg-stone-100 dark:bg-stone-800/80 ring-1 ring-stone-900/10 dark:ring-stone-700' : ''
                          }`}
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">
                                {report.referenceCode}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${catMeta.badgeColor}`}
                              >
                                {lang === 'fil' ? catMeta.labelFil : catMeta.labelEn}
                              </span>
                              {report.duplicateClusterId && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 flex items-center gap-0.5">
                                  <Layers className="w-2.5 h-2.5" />
                                  Cluster
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-1">
                              {report.aiTriage?.summary || report.rawInput.description}
                            </p>

                            <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-stone-500 font-mono">
                              <span>{[report.location.barangay, report.location.municipality || 'Rizal'].filter(Boolean).join(', ')}</span>
                              <span>•</span>
                              <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                sev >= 4
                                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                                  : sev === 3
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700'
                              }`}
                            >
                              SEV {sev}
                            </span>
                            {report.status === 'resolved' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Closed
                              </span>
                            ) : report.status === 'in_progress' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                In Prog
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 dark:text-rose-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column (5 cols): Incident Target Dossier & Actions */}
            <div className="lg:col-span-5 space-y-4">
              {selectedReport ? (
                <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xs p-5 space-y-5">
                  {/* Dossier Header */}
                  <div className="flex items-start justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                          Report File
                        </span>
                        <span className="font-mono font-bold text-xl text-stone-950 dark:text-stone-100">
                          {selectedReport.referenceCode}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 font-mono mt-0.5">
                        Logged {new Date(selectedReport.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedReport.status !== 'spam' && (
                        <button
                          type="button"
                          onClick={handleMarkAsSpam}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold text-stone-500 dark:text-stone-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-stone-200 dark:border-stone-800 transition cursor-pointer flex items-center gap-1"
                          title="Quarantine report to Spam Queue"
                        >
                          <AlertTriangle className="w-3 h-3 text-stone-400 dark:text-stone-500" />
                          <span>Flag as Spam</span>
                        </button>
                      )}
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 inline-flex items-center gap-1.5 capitalize">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            selectedReport.status === 'resolved'
                              ? 'bg-emerald-500'
                              : selectedReport.status === 'in_progress'
                              ? 'bg-amber-500'
                              : selectedReport.status === 'spam'
                              ? 'bg-rose-700'
                              : 'bg-rose-500'
                          }`}
                        />
                        {selectedReport.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* SPAM / QUARANTINE WARNING BANNER */}
                  {(selectedReport.status === 'spam' || selectedReport.aiTriage?.isSpam) && (
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900 rounded-xl space-y-2.5 text-xs text-rose-950 dark:text-rose-200 shadow-2xs">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 min-w-0">
                          <span className="font-bold uppercase tracking-wide text-rose-900 dark:text-rose-300 block text-[11px]">
                            Quarantined in Spam Queue
                          </span>
                          <p className="text-[11px] text-rose-800 dark:text-rose-300/80 leading-snug">
                            {selectedReport.aiTriage?.authenticity?.forensicNotes ||
                              'Flagged as suspected troll submission, AI-generated synthetic media, or unverified incident.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-rose-200 dark:border-rose-900">
                        <button
                          type="button"
                          onClick={handleRestoreReport}
                          disabled={isRestoringReport || isDeletingReport}
                          className="flex-1 py-1.5 px-2.5 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                          <span>{isRestoringReport ? 'Restoring...' : t.retrieveBtn}</span>
                        </button>

                        {!showDeleteConfirm ? (
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            disabled={isRestoringReport || isDeletingReport}
                            className="flex-1 py-1.5 px-2.5 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t.deletePermanentlyBtn}</span>
                          </button>
                        ) : (
                          <div className="flex-1 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleDeletePermanently}
                              disabled={isDeletingReport}
                              className="flex-1 py-1.5 px-2 bg-rose-900 hover:bg-black text-white font-bold text-[11px] rounded-lg transition cursor-pointer flex items-center justify-center gap-1 animate-pulse"
                            >
                              {isDeletingReport ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              <span>Confirm Delete</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowDeleteConfirm(false)}
                              className="py-1.5 px-2 border border-rose-300 dark:border-rose-800 bg-white dark:bg-stone-800 hover:bg-rose-100 dark:hover:bg-stone-700 text-rose-800 dark:text-rose-300 text-[11px] font-semibold rounded-lg transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Linked duplicate cluster notice */}
                  {clusteredReports.find((r) => r.id === selectedReport.id)?.duplicateClusterId ? (
                    <div className="p-3 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200 dark:border-stone-800 space-y-1 text-xs text-stone-700 dark:text-stone-300">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                          <Layers className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                          <span>{t.duplicateClusterDetected}</span>
                        </div>
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-300/60 dark:border-stone-700">
                          Linked Cluster
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                        {t.duplicateClusterDesc}
                      </p>
                    </div>
                  ) : null}

                  {/* Photo Display (Secured Image Preview) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-display text-xs font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400 block">
                        Incident Evidence Photos
                      </label>
                      {evidenceImages.length > 0 && (
                        <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 font-medium">
                          Photo {activePhotoIndex + 1} of {evidenceImages.length}
                        </span>
                      )}
                    </div>
                    <div className="relative rounded-xl overflow-hidden bg-stone-950 aspect-video flex items-center justify-center border border-stone-200 dark:border-stone-800">
                      {photoDataUrl ? (
                        <img
                          src={photoDataUrl}
                          alt="Incident evidence"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-4 text-stone-400 dark:text-stone-500 text-xs">
                          <Eye className="w-6 h-6 mx-auto mb-1 text-stone-500 dark:text-stone-400" />
                          <span>{selectedReport.rawInput.hasImage ? 'Loading photo...' : 'No photo was submitted'}</span>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-stone-900/80 backdrop-blur-xs text-[9px] font-mono text-stone-300 rounded border border-white/10 flex items-center gap-1">
                        <ShieldCheck className="w-2.5 h-2.5 text-stone-400" />
                        <span>RA 10173 SECURED</span>
                      </div>
                    </div>

                    {/* Multi-Photo Evidence Deck Thumbnails */}
                    {evidenceImages.length > 1 && (
                      <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                        {evidenceImages.map((img, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setActivePhotoIndex(idx);
                              setPhotoDataUrl(img.data);
                            }}
                            className={`relative w-16 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition cursor-pointer ${
                              activePhotoIndex === idx
                                ? 'border-stone-900 dark:border-emerald-500 ring-2 ring-stone-900/20 dark:ring-emerald-500/20 shadow-2xs'
                                : 'border-stone-200 dark:border-stone-700 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={img.data} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-stone-950/80 text-white text-[8px] font-mono text-center py-0.2 capitalize truncate px-0.5">
                              {img.role.replace('_', ' ')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Forensic & Authenticity Metadata Card */}
                  <div className="p-3.5 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wide text-stone-700 dark:text-stone-300">
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                        <span>Forensic & Authenticity Inspector</span>
                      </div>
                      {selectedReport.status === 'spam' || selectedReport.aiTriage?.isSpam ? (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          SPAM / TROLL
                        </span>
                      ) : selectedReport.rawInput.captureMethod === 'live_camera' ? (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          LIVE CAMERA
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                          DEVICE UPLOAD
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-white dark:bg-stone-900 rounded-lg border border-stone-200/70 dark:border-stone-800">
                        <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 block">Capture Source</span>
                        <span className="font-semibold text-stone-900 dark:text-stone-100 capitalize">
                          {selectedReport.rawInput.captureMethod ? selectedReport.rawInput.captureMethod.replace('_', ' ') : 'Single Photo'}
                        </span>
                      </div>
                      <div className="p-2 bg-white dark:bg-stone-900 rounded-lg border border-stone-200/70 dark:border-stone-800">
                        <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 block">Evidence Photos</span>
                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                          {selectedReport.rawInput.imageCount || (selectedReport.rawInput.hasImage ? 1 : 0)} photo(s)
                        </span>
                      </div>
                    </div>

                    {selectedReport.rawInput.exif && (
                      <div className="p-2.5 bg-white dark:bg-stone-900 rounded-lg border border-stone-200/70 dark:border-stone-800 space-y-1 text-xs">
                        {selectedReport.rawInput.exif.cameraModel && (
                          <div className="flex items-center justify-between">
                            <span className="text-stone-500 dark:text-stone-400 text-[11px]">Hardware Camera:</span>
                            <span className="font-mono text-stone-800 dark:text-stone-200 font-semibold text-[11px]">{selectedReport.rawInput.exif.cameraModel}</span>
                          </div>
                        )}
                        {selectedReport.rawInput.exif.distanceFromReportKm !== null && selectedReport.rawInput.exif.distanceFromReportKm !== undefined && (
                          <div className="flex items-center justify-between">
                            <span className="text-stone-500 dark:text-stone-400 text-[11px]">EXIF vs Pin Distance:</span>
                            <span className={`font-mono font-semibold text-[11px] ${selectedReport.rawInput.exif.distanceFromReportKm > 5 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                              {selectedReport.rawInput.exif.distanceFromReportKm} km
                            </span>
                          </div>
                        )}
                        {selectedReport.rawInput.exif.capturedAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-stone-500 dark:text-stone-400 text-[11px]">EXIF Timestamp:</span>
                            <span className="font-mono text-stone-700 dark:text-stone-300 text-[11px]">{selectedReport.rawInput.exif.capturedAt}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedReport.aiTriage?.authenticity?.forensicNotes && (
                      <div className="text-[11px] text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-900 p-2 rounded-lg leading-relaxed border border-stone-200/70 dark:border-stone-800">
                        <span className="font-semibold text-stone-800 dark:text-stone-200">Forensic Analysis: </span>
                        {selectedReport.aiTriage.authenticity.forensicNotes}
                      </div>
                    )}
                  </div>

                  {/* Resident Description */}
                  <div className="p-3.5 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200/80 dark:border-stone-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                      <span>Resident Description</span>
                      <span className="text-[9px] font-mono text-stone-500 dark:text-stone-400 bg-stone-200/70 dark:bg-stone-800 px-1.5 py-0.2 rounded border border-stone-300/60 dark:border-stone-700">
                        Untrusted Input
                      </span>
                    </div>
                    <p className="text-xs text-stone-900 dark:text-stone-100 italic leading-relaxed border-l-2 border-stone-300 dark:border-stone-700 pl-2.5 py-0.5">
                      "{selectedReport.rawInput.description}"
                    </p>
                    <div className="text-xs text-stone-500 dark:text-stone-400 font-mono pt-1">
                      Loc: {selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)} • {[selectedReport.location.barangay, selectedReport.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                    </div>
                  </div>

                  {/* AI Multimodal Triage Assessment */}
                  <div className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wide text-stone-800 dark:text-stone-200">
                        <Sparkles className="w-4 h-4 text-tagapo-800 dark:text-emerald-400" />
                        <span>{t.aiTriageTitle}</span>
                      </div>
                      {selectedReport.aiTriage && (
                        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                          {t.aiConfidence}: {(selectedReport.aiTriage.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {selectedReport.triageStatus === 'failed' ? (
                      <div className="space-y-2">
                        <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-lg text-rose-800 dark:text-rose-300 text-xs font-bold border border-rose-200 dark:border-rose-900 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          <span>{t.needsReviewBadge}</span>
                        </div>
                        {retryTriageButton}
                      </div>
                    ) : selectedReport.aiTriage ? (
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 block">
                            {t.aiSummary}
                          </span>
                          <p className="text-stone-900 dark:text-stone-100 font-semibold mt-0.5">
                            {selectedReport.aiTriage.summary}
                          </p>
                        </div>

                        {renderSatelliteHotspotCard(selectedReport)}

                        {renderProtectedZoneBadge(selectedReport.aiTriage.protectedZone)}

                        {renderMgbQuarryCard(selectedReport)}

                        {renderAirQualityCard(selectedReport.aiTriage?.airQuality, selectedReport.id)}

                        <div className="pt-2 border-t border-stone-200/70 dark:border-stone-800">
                          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 block">
                            {t.aiReasoning}
                          </span>
                          <p className="text-stone-700 dark:text-stone-300 text-xs mt-0.5 leading-relaxed">
                            {selectedReport.aiTriage.reasoning}
                          </p>
                        </div>

                        {renderWeatherWidget(selectedReport.aiTriage?.weather, selectedReport.id)}

                        <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
                          Engine: {selectedReport.aiTriage.model}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-stone-500 dark:text-stone-400 italic">Triage in progress...</p>
                        {retryTriageButton}
                      </div>
                    )}
                  </div>

                  {/* Human-in-the-Loop Override Form */}
                  <div className="p-4 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200 dark:border-stone-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-stone-700 dark:text-stone-300" />
                        <span>{t.humanOverrideTitle}</span>
                      </h3>
                      {selectedReport.final && (
                        <span className="font-mono text-[10px] font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                          Human Verified
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
                          {t.overrideCategory}
                        </label>
                        <select
                          value={overrideCategory}
                          onChange={(e) => setOverrideCategory(e.target.value as any)}
                          className="w-full text-xs px-2.5 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500"
                        >
                          {Object.entries(CATEGORIES).map(([key, cat]) => (
                            <option key={key} value={key}>
                              {lang === 'fil' ? cat.labelFil : cat.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
                          {t.overrideSeverity}
                        </label>
                        <select
                          value={overrideSeverity}
                          onChange={(e) => setOverrideSeverity(Number(e.target.value) as any)}
                          className="w-full text-xs px-2.5 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 font-bold"
                        >
                          <option value="1">1 - Minor / Cosmetic</option>
                          <option value="2">2 - Low Concern</option>
                          <option value="3">3 - Moderate</option>
                          <option value="4">4 - High Hazard</option>
                          <option value="5">5 - Critical Emergency</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
                        {t.officerNotes}
                      </label>
                      <textarea
                        value={officerNotes}
                        onChange={(e) => setOfficerNotes(e.target.value)}
                        rows={2}
                        placeholder="Enter assessment findings or regulatory directives..."
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveOverride}
                      disabled={isSavingOverride}
                      className="w-full py-2.5 bg-stone-900 hover:bg-black active:bg-stone-950 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSavingOverride ? 'Saving...' : t.saveOverrideBtn}</span>
                    </button>

                    {overrideSuccess && (
                      <p className="text-xs text-stone-900 dark:text-emerald-400 font-semibold text-center">
                        Final assessment saved and applied to live dashboard!
                      </p>
                    )}
                  </div>

                  {/* Status Transition Workflow */}
                  <div className="p-4 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200 dark:border-stone-800 space-y-3">
                    <label className="text-xs font-semibold text-stone-800 dark:text-stone-200 block">
                      Update Incident Status
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['pending', 'in_progress', 'resolved'] as ReportStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setNewStatus(st)}
                          className={`py-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                            newStatus === st
                              ? 'bg-stone-900 dark:bg-emerald-600 text-white border-stone-900 dark:border-emerald-500 shadow-xs'
                              : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
                          }`}
                        >
                          {st.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={statusChangeNotes}
                      onChange={(e) => setStatusChangeNotes(e.target.value)}
                      placeholder="Notes (e.g. 'Field team dispatched', 'Cleanup finished')..."
                      className="w-full text-xs px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500"
                    />

                    <button
                      type="button"
                      onClick={handleUpdateStatus}
                      disabled={isUpdatingStatus || newStatus === selectedReport.status}
                      className="w-full py-2.5 bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-700 disabled:bg-stone-200 dark:disabled:bg-stone-800 text-white font-semibold text-xs rounded-lg transition shadow-xs cursor-pointer"
                    >
                      {isUpdatingStatus ? 'Updating...' : 'Log Status Transition'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-stone-50 dark:bg-stone-900/40 rounded-xl border border-stone-200 dark:border-stone-800 p-12 text-center text-xs text-stone-500 dark:text-stone-400 space-y-2">
                  <MapPin className="w-8 h-8 text-stone-400 dark:text-stone-600 mx-auto" />
                  <div className="font-display font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200 text-sm">
                    Standby for Target Selection
                  </div>
                  <p className="text-stone-500 dark:text-stone-400 max-w-xs mx-auto">
                    Select an incident pin on the geospatial map or a row in the incident queue stream to inspect telemetry and perform human-in-the-loop triage.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW MODE 2: FULL MAP CANVAS (GOOGLE / APPLE MAPS GIS UI) */}
      {/* ========================================================= */}
      {viewMode === 'full_map' && (
        <div className="relative w-full h-full overflow-hidden bg-stone-100">
          {/* ========================================================= */}
          {/* 1. EDGE-TO-EDGE GEOSPATIAL MAP CANVAS (100% Full Screen)  */}
          {/* ========================================================= */}
          <div className="absolute inset-0 z-0">
            <LeafletMap
              mode="dashboard"
              center={mapCenter}
              zoom={mapZoom}
              fitProvinceKey={fitProvinceKey}
              reports={mapVisibleReports}
              selectedReportId={selectedReport?.id}
              layerMode={mapLayerMode}
              basemap={basemapMode}
              activeMunicipality={municipalityFilter !== 'all' ? municipalityFilter : null}
              onMunicipalityClick={(mun) => handleQuickJump(mun)}
              onClusterClick={(group) => handleClusterClick(group)}
              choroplethCounts={choroplethCounts}
              maskNonRizal={isMaskActive}
              showMgbQuarries={showMgbQuarries}
              showRainRadar={showRainRadar}
              showWeatherMarkers={showWeatherMarkers}
              weatherTelemetry={allLguWeather}
              onWeatherMarkerClick={handleWeatherMarkerClick}
              selectedProtectedZoneId={selectedProtectedZoneId}
              onSelectProtectedZone={(zoneId) => {
                setSelectedProtectedZoneId(zoneId);
                // On narrow viewports, close the left sheet to ensure drawer visibility
                if (window.innerWidth < 640) {
                  setIsSheetOpen(false);
                }
              }}
              onMapBackgroundClick={() => {
                if (selectedProtectedZoneId) {
                  setSelectedProtectedZoneId(null);
                }
              }}
              onSelectReport={(r) => {
                setSelectedProtectedZoneId(null);
                setSelectedReport(r);
                setIsSheetOpen(true);
                const coords = resolveReportCoordinates(r);
                setMapCenter(coords);
                setMapZoom(14);
              }}
              className="h-full w-full"
            />
          </div>

          {/* ========================================================= */}
          {/* 2. GOOGLE & APPLE MAPS HYBRID OMNIBOX & INTELLIGENCE HUB   */}
          {/* ========================================================= */}
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-40 w-[calc(100vw-24px)] sm:w-[440px] pointer-events-auto flex flex-col min-h-0">
            {/* Master Omnibox Card (Google layout + Apple frosted glass) */}
            <div className="bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border border-stone-200/90 dark:border-stone-800 shadow-xl rounded-2xl p-2.5 sm:p-3 space-y-2.5 select-none transition-all">
              {/* Row 1: App Header & View Mode Switcher */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateTab) onNavigateTab('workbench');
                    else handleViewModeChange('workbench');
                  }}
                  className="flex items-center gap-2 select-none px-1 py-0.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer text-left"
                  title="NatureWatch Operations"
                >
                  <span className="w-6 h-6 rounded-lg bg-tagapo-800 dark:bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </span>
                  <div className="flex flex-col">
                    <span className="font-bold text-xs tracking-tight text-stone-950 dark:text-stone-100 leading-tight">
                      NatureWatch
                    </span>
                    <span className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 leading-none">
                      {t.operationsLabel}
                    </span>
                  </div>
                </button>

                {/* Segmented [Workbench | Map] App Switcher */}
                <div className="flex items-center bg-stone-100 dark:bg-stone-800/90 p-0.5 rounded-xl border border-stone-200/80 dark:border-stone-750">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateTab) onNavigateTab('workbench');
                      else handleViewModeChange('workbench');
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-750 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                    title={t.officerNavWorkbench}
                  >
                    <Layout className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                    <span>{t.officerNavWorkbench}</span>
                  </button>

                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs cursor-default flex items-center gap-1.5 transition-all"
                  >
                    <MapIcon className="w-3.5 h-3.5 text-tagapo-700 dark:text-emerald-400" />
                    <span>{t.officerNavMap}</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Unified GIS Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsSearchFocused(true);
                  }}
                  placeholder="Search incidents, LGUs, reserves, quarries..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-stone-50 hover:bg-stone-100/70 focus:bg-white dark:bg-stone-950 dark:hover:bg-stone-950/80 dark:focus:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 font-sans transition placeholder:text-stone-400 dark:placeholder:text-stone-600"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setIsSearchFocused(false);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}

                {/* Autocomplete / Live GIS Jump Suggestions Dropdown */}
                {isSearchFocused && searchSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl rounded-2xl overflow-hidden z-50 divide-y divide-stone-100 dark:divide-stone-800 max-h-72 overflow-y-auto custom-scrollbar select-none">
                    {/* Municipalities Section */}
                    {searchSuggestions.municipalities.length > 0 && (
                      <div className="p-1.5">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 block">
                          Rizal LGUs
                        </span>
                        {searchSuggestions.municipalities.map((item) => (
                          <div
                            key={item.id}
                            onMouseDown={() => {
                              setSelectedProtectedZoneId(null);
                              handleQuickJump(item.payload);
                              setSearchTerm('');
                              setIsSearchFocused(false);
                            }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-tagapo-600 dark:text-emerald-400 shrink-0" />
                              <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                                {item.title}
                              </span>
                            </div>
                            <span className="text-[10px] text-stone-400 dark:text-stone-500">
                              Fly to boundary
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Protected Reserves Section */}
                    {searchSuggestions.reserves.length > 0 && (
                      <div className="p-1.5">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 block">
                          Protected Reserves
                        </span>
                        {searchSuggestions.reserves.map((item) => (
                          <div
                            key={item.id}
                            onMouseDown={() => {
                              const z = item.payload;
                              setMapCenter({ lat: z.lat, lng: z.lng });
                              setMapZoom(z.zoom);
                              setSelectedProtectedZoneId(z.id);
                              handleSwitchLeftDrawerTab('protected_zones');
                              setIsSheetOpen(true);
                              setSearchTerm('');
                              setIsSearchFocused(false);
                            }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <ShieldAlert className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                                  {item.title}
                                </span>
                                <span className="text-[10px] text-stone-400 dark:text-stone-500 truncate">
                                  {item.subtitle}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-3 h-3 text-stone-400 shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* MGB Quarries Section */}
                    {searchSuggestions.quarries.length > 0 && (
                      <div className="p-1.5">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 block">
                          MGB Quarries Cadastre
                        </span>
                        {searchSuggestions.quarries.map((item) => (
                          <div
                            key={item.id}
                            onMouseDown={() => {
                              setSelectedProtectedZoneId(null);
                              const f = item.payload;
                              setShowMgbQuarries(true);
                              setMapLayerMode('quarries');
                              handleSwitchLeftDrawerTab('quarries');
                              setIsSheetOpen(true);
                              if (f.geometry?.coordinates) {
                                let lat = 14.5800;
                                let lng = 121.2800;
                                if (f.geometry.type === 'Polygon') {
                                  const ring = f.geometry.coordinates[0];
                                  if (ring && ring.length > 0) {
                                    lng = ring[0][0];
                                    lat = ring[0][1];
                                  }
                                } else if (f.geometry.type === 'MultiPolygon') {
                                  const firstPoly = f.geometry.coordinates[0];
                                  if (firstPoly && firstPoly[0] && firstPoly[0].length > 0) {
                                    lng = firstPoly[0][0][0];
                                    lat = firstPoly[0][0][1];
                                  }
                                }
                                setMapCenter({ lat, lng });
                                setMapZoom(14);
                              }
                              setSearchTerm('');
                              setIsSearchFocused(false);
                            }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Pickaxe className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                                  {item.title}
                                </span>
                                <span className="text-[10px] text-stone-400 dark:text-stone-500 truncate">
                                  {item.subtitle}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-3 h-3 text-stone-400 shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Citizen Incidents Section */}
                    {searchSuggestions.reports.length > 0 && (
                      <div className="p-1.5">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 block">
                          Citizen Reports
                        </span>
                        {searchSuggestions.reports.map((item) => (
                          <div
                            key={item.id}
                            onMouseDown={() => {
                              setSelectedProtectedZoneId(null);
                              const r = item.payload;
                              setSelectedReport(r);
                              setIsSheetOpen(true);
                              const coords = resolveReportCoordinates(r);
                              setMapCenter(coords);
                              setMapZoom(14);
                              setSearchTerm('');
                              setIsSearchFocused(false);
                            }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                                  {item.title}
                                </span>
                                <span className="text-[10px] text-stone-400 dark:text-stone-500 truncate">
                                  {item.subtitle}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-3 h-3 text-stone-400 shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Row 3: Horizontal Category Chips with Scroll Affordances */}
              <div className="w-full min-w-0 relative">
                {/* Left Scroll Gradient & Button */}
                {canScrollLeft && (
                  <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center pr-2.5 bg-gradient-to-r from-white via-white/90 to-transparent dark:from-stone-900 dark:via-stone-900/90 dark:to-transparent pointer-events-none">
                    <button
                      type="button"
                      onClick={() => scrollChips('left')}
                      className="w-5 h-5 rounded-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-xs hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 flex items-center justify-center transition cursor-pointer active:scale-95 pointer-events-auto"
                      title="Scroll left"
                      aria-label="Scroll left"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Chips Scrollport */}
                <div
                  ref={chipsScrollRef}
                  onMouseDown={handleChipsMouseDown}
                  onMouseMove={handleChipsMouseMove}
                  onMouseUp={handleChipsMouseUp}
                  onMouseLeave={handleChipsMouseUp}
                  onWheel={(e) => {
                    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                    if (delta !== 0) {
                      e.currentTarget.scrollLeft += delta;
                      checkChipsScroll();
                    }
                  }}
                  className="w-full flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 scroll-smooth overscroll-x-contain touch-pan-x cursor-grab active:cursor-grabbing select-none"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {/* Chip 1: Queue */}
                  <button
                    type="button"
                    onClick={() => {
                      if (hasDraggedChips.current) return;
                      handleToggleDrawerTab('queue');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 cursor-pointer border ${
                      isSheetOpen && (activeLeftDrawerTab === 'queue' || selectedReport)
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white border-stone-900 dark:border-emerald-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-stone-200/80 dark:border-stone-700/80 hover:bg-stone-100 dark:hover:bg-stone-750'
                    }`}
                    title="Citizen Incident Reports Queue"
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>Queue ({filteredReports.length})</span>
                  </button>

                  {/* Chip 2: FIRMS */}
                  <button
                    type="button"
                    onClick={() => {
                      if (hasDraggedChips.current) return;
                      handleToggleDrawerTab('firms');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 cursor-pointer border ${
                      isSheetOpen && !selectedReport && activeLeftDrawerTab === 'firms'
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white border-stone-900 dark:border-emerald-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-stone-200/80 dark:border-stone-700/80 hover:bg-stone-100 dark:hover:bg-stone-750'
                    }`}
                    title="NASA FIRMS Satellite Thermal Watchdog"
                  >
                    <Satellite className="w-3.5 h-3.5 shrink-0" />
                    <span>FIRMS ({satelliteReports.length})</span>
                  </button>

                  {/* Chip 3: Reserves */}
                  <button
                    type="button"
                    onClick={() => {
                      if (hasDraggedChips.current) return;
                      handleToggleDrawerTab('protected_zones');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 cursor-pointer border ${
                      isSheetOpen && !selectedReport && activeLeftDrawerTab === 'protected_zones'
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white border-stone-900 dark:border-emerald-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-stone-200/80 dark:border-stone-700/80 hover:bg-stone-100 dark:hover:bg-stone-750'
                    }`}
                    title="Protected Ecological Reserves & Watersheds"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>Reserves (15)</span>
                  </button>

                  {/* Chip 4: Quarries */}
                  <button
                    type="button"
                    onClick={() => {
                      if (hasDraggedChips.current) return;
                      handleToggleDrawerTab('quarries');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 cursor-pointer border ${
                      isSheetOpen && !selectedReport && activeLeftDrawerTab === 'quarries'
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white border-stone-900 dark:border-emerald-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-stone-200/80 dark:border-stone-700/80 hover:bg-stone-100 dark:hover:bg-stone-750'
                    }`}
                    title="MGB Permitted Mining & Quarry Concessions"
                  >
                    <Pickaxe className="w-3.5 h-3.5 shrink-0" />
                    <span>Quarries ({mgbQuarriesFeatures.length || 10})</span>
                  </button>

                  {/* Chip 5: Weather & Air Quality */}
                  <button
                    type="button"
                    onClick={() => {
                      if (hasDraggedChips.current) return;
                      handleToggleDrawerTab('weather');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 cursor-pointer border ${
                      isSheetOpen && !selectedReport && activeLeftDrawerTab === 'weather'
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white border-stone-900 dark:border-emerald-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-stone-200/80 dark:border-stone-700/80 hover:bg-stone-100 dark:hover:bg-stone-750'
                    }`}
                    title="Real-Time Weather & Atmospheric Air Quality Telemetry"
                  >
                    <CloudSun className="w-3.5 h-3.5 shrink-0" />
                    <span>Weather</span>
                  </button>
                </div>

                {/* Right Scroll Gradient & Button */}
                {canScrollRight && (
                  <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-3 bg-gradient-to-l from-white via-white/95 to-transparent dark:from-stone-900 dark:via-stone-900/95 dark:to-transparent">
                    <button
                      type="button"
                      onClick={() => scrollChips('right')}
                      className="w-5 h-5 rounded-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-xs hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 flex items-center justify-center transition cursor-pointer active:scale-95 animate-pulse hover:animate-none"
                      title="Scroll right to view more buttons"
                      aria-label="Scroll right"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Connected Intelligence Results Drawer */}
            <AnimatePresence>
              {isSheetOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-2 bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border border-stone-200/90 dark:border-stone-800 shadow-2xl rounded-2xl overflow-hidden max-h-[calc(100vh-190px)] min-h-0 flex flex-col"
                >
                  <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {!selectedReport ? (
                    <div key="intelligence-drawer" className="flex flex-col flex-1 min-h-0 overflow-hidden animate-sheet-morph">
                    {/* TAB 1: INCIDENT QUEUE */}
                    {activeLeftDrawerTab === 'queue' && (
                      <div key="tab-queue" className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        {/* Queue Header & Active Summary */}
                        <div className="px-3.5 py-2.5 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 shrink-0">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-tagapo-700 dark:text-emerald-400" />
                            <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                              Citizen Incident Reports
                            </span>
                            <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
                              ({filteredReports.length})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCloseDrawer}
                            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer shrink-0"
                            title="Close Queue"
                            aria-label="Close Queue"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>


                  {/* Quick telemetry chips & LGU horizontal scroll */}
                  <div className="px-3 py-2 bg-stone-50 dark:bg-stone-950 border-b border-stone-200/80 dark:border-stone-800 space-y-2 shrink-0">
                    {/* Active count badge summary & Queue Tab Switcher */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQueueTab('active')}
                          className={`px-2 py-0.5 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                            queueTab === 'active'
                              ? 'bg-stone-900 dark:bg-stone-800 text-white shadow-2xs'
                              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                          }`}
                        >
                          <span>Active</span>
                          <span className="font-mono text-[10px] opacity-80">({activeReportsCount})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setQueueTab('spam')}
                          className={`px-2 py-0.5 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                            queueTab === 'spam'
                              ? 'bg-rose-900 text-white shadow-2xs dark:bg-rose-950 dark:border dark:border-rose-800'
                              : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Spam</span>
                          {spamReportsCount > 0 && (
                            <span className={`font-mono text-[9px] px-1 py-0.2 rounded font-bold ${
                              queueTab === 'spam' ? 'bg-rose-800 text-rose-100' : 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300'
                            }`}>
                              {spamReportsCount}
                            </span>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono font-medium">
                        <span className="text-stone-700 dark:text-stone-300"><span className="text-emerald-600 font-bold">●</span> {stats.openCount}</span>
                        <span className="text-rose-700 dark:text-rose-400"><span className="text-rose-600 font-bold">●</span> {stats.urgentCount}</span>
                      </div>
                    </div>

                    {/* Horizontal LGU Filter Chips */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                      <button
                        type="button"
                        onClick={() => handleQuickJump('all')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                          municipalityFilter === 'all'
                            ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-xs'
                            : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200/70 dark:hover:bg-stone-800 bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800'
                        }`}
                      >
                        All LGUs
                      </button>
                      {RIZAL_MUNICIPALITIES.map((mun) => {
                        const isSelected = municipalityFilter === mun;
                        const shortName = mun.replace('Municipality of ', '').replace('City of ', '');
                        return (
                          <button
                            key={mun}
                            type="button"
                            onClick={() => handleQuickJump(mun)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                              isSelected
                                ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-xs'
                                : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200/70 dark:hover:bg-stone-800 bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800'
                            }`}
                          >
                            {shortName}
                          </button>
                        );
                      })}
                    </div>

                    {/* Secondary Filters: Category & Severity */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-[11px] font-semibold px-2 py-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 truncate"
                      >
                        <option value="all">{lang === 'fil' ? 'Lahat ng Kategorya' : 'All Categories'}</option>
                        {Object.entries(CATEGORIES).map(([key, cat]) => (
                          <option key={key} value={key}>
                            {lang === 'fil' ? cat.labelFil : cat.labelEn}
                          </option>
                        ))}
                      </select>

                      <select
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value)}
                        className="text-[11px] font-semibold px-2 py-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 truncate"
                      >
                        <option value="all">{lang === 'fil' ? 'Lahat ng Panganib' : 'All Severities'}</option>
                        <option value="urgent">{lang === 'fil' ? 'Kagyat (4-5)' : 'Urgent (4-5)'}</option>
                        <option value="1">1 - {lang === 'fil' ? 'Maliit' : 'Minor'}</option>
                        <option value="2">2 - {lang === 'fil' ? 'Mababa' : 'Low'}</option>
                        <option value="3">3 - {lang === 'fil' ? 'Katamtaman' : 'Moderate'}</option>
                        <option value="4">4 - {lang === 'fil' ? 'Mataas' : 'High'}</option>
                        <option value="5">5 - {lang === 'fil' ? 'Kritikal' : 'Critical'}</option>
                      </select>
                    </div>

                    {/* Active Cluster Pill Banner */}
                    {activeClusterFilter && (
                      <div className="flex items-center justify-between px-2.5 py-1.5 bg-stone-100 dark:bg-stone-850 border border-stone-200 dark:border-stone-750 rounded-lg text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Layers className="w-3.5 h-3.5 text-stone-700 dark:text-stone-300 shrink-0" />
                          <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                            Cluster: {activeClusterFilter.label}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 dark:bg-stone-750 text-stone-700 dark:text-stone-300 font-medium shrink-0">
                            {filteredReports.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveClusterFilter(null)}
                          className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-0.5 rounded transition cursor-pointer shrink-0 ml-1"
                          title="Clear cluster filter"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Active Protected Zone Pill Banner */}
                    {activeProtectedZoneFilter && (
                      <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ShieldAlert className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <span className="font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                            Zone: {RIZAL_PROTECTED_ZONES_CATALOG.find((z) => z.id === activeProtectedZoneFilter)?.shortName || 'Protected Reserve'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-200/80 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 font-medium shrink-0">
                            {filteredReports.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveProtectedZoneFilter(null)}
                          className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 p-0.5 rounded transition cursor-pointer shrink-0 ml-1"
                          title="Clear zone filter"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {(activeClusterFilter || activeProtectedZoneFilter || municipalityFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all' || searchTerm) && (
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium">Filters active</span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveClusterFilter(null);
                            setActiveProtectedZoneFilter(null);
                            setMunicipalityFilter('all');
                            setStatusFilter('all');
                            setCategoryFilter('all');
                            setSeverityFilter('all');
                            setSearchTerm('');
                            setMapCenter({ lat: 14.5800, lng: 121.2800 });
                            setMapZoom(11);
                          }}
                          className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300 cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Scrollable Incident Stream */}
                  <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-850 custom-scrollbar overscroll-contain">
                    {filteredReports.length === 0 ? (
                      <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400 space-y-1">
                        <p className="font-semibold text-stone-700 dark:text-stone-300">No incident reports found</p>
                        <p className="text-stone-400 dark:text-stone-500">Try adjusting your municipality or severity filters.</p>
                      </div>
                    ) : (
                      filteredReports.map((report) => {
                        const sev = report.final?.severity || report.aiTriage?.severity || 3;
                        const cat = report.final?.category || report.aiTriage?.category || 'other';
                        const catMeta = CATEGORIES[cat as IncidentCategory] || CATEGORIES.other;

                        return (
                          <div
                            key={report.id}
                            onClick={() => {
                              setSelectedReport(report);
                              const coords = resolveReportCoordinates(report);
                              setMapCenter(coords);
                              setMapZoom(14);
                            }}
                            className="p-3 cursor-pointer transition hover:bg-stone-50 dark:hover:bg-stone-850/60 flex items-start justify-between gap-2.5 group"
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100 group-hover:text-stone-700 dark:group-hover:text-stone-300 transition-colors">
                                  {report.referenceCode}
                                </span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${catMeta.badgeColor}`}>
                                  {lang === 'fil' ? catMeta.labelFil : catMeta.labelEn}
                                </span>
                                {report.duplicateClusterId && (
                                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-200/70 dark:border-amber-900 flex items-center gap-0.5">
                                    <Layers className="w-2.5 h-2.5" />
                                    Cluster
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-2 leading-relaxed">
                                {report.aiTriage?.summary || report.rawInput.description}
                              </p>

                              <div className="flex items-center gap-1.5 text-[10px] text-stone-400 dark:text-stone-500 font-mono pt-0.5">
                                <span className="truncate">
                                  {[report.location.barangay, report.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                                </span>
                                <span>•</span>
                                <span className="shrink-0">{new Date(report.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  sev >= 4
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                                    : sev === 3
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700'
                                }`}
                              >
                                SEV {sev}
                              </span>
                              {report.status === 'resolved' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Closed
                                </span>
                              ) : report.status === 'in_progress' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  In Prog
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 dark:text-rose-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: NASA FIRMS SATELLITE WATCHDOG */}
              {activeLeftDrawerTab === 'firms' && (
                <div key="tab-firms" className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {/* FIRMS Header with Sync Satellites button */}
                  <div className="p-3 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0">
                        <Satellite className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 leading-tight">
                          NASA FIRMS Watchdog
                        </h4>
                        <span className="text-[10px] text-stone-500 dark:text-stone-400 block">
                          VIIRS 375m Thermal Anomaly Detection
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleSyncSatellites}
                        disabled={isSyncingSatellites}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-500 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                        title="Sync NASA FIRMS VIIRS satellite thermal hotspots for Rizal Province"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSatellites ? 'animate-spin' : ''}`} />
                        <span>{isSyncingSatellites ? 'Syncing...' : 'Sync Satellites'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseDrawer}
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                        title="Close FIRMS"
                        aria-label="Close FIRMS"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* FIRMS Telemetry Overview */}
                  <div className="px-3 py-2 bg-stone-50 dark:bg-stone-950 border-b border-stone-200/80 dark:border-stone-800 shrink-0">
                    <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                      <div>
                        <span className="text-[9px] font-bold uppercase text-stone-400 dark:text-stone-500 block">
                          Active Hotspots
                        </span>
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100 font-mono mt-0.5 block">
                          {satelliteReports.length}
                        </span>
                      </div>
                      <div className="border-x border-stone-200 dark:border-stone-800">
                        <span className="text-[9px] font-bold uppercase text-stone-400 dark:text-stone-500 block">
                          Peak Radiance
                        </span>
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5 block">
                          {satelliteReports.length > 0
                            ? `${Math.max(...satelliteReports.map((r) => r.satelliteHotspot?.frp || 0)).toFixed(1)} MW`
                            : '0.0 MW'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold uppercase text-stone-400 dark:text-stone-500 block">
                          Sensor
                        </span>
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100 font-mono mt-0.5 block truncate">
                          VIIRS 375m
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 text-center pt-1.5">
                      Near real-time orbital feeds via NASA LANCE / EOSDIS
                    </div>
                  </div>

                  {/* List of Satellite Hotspots */}
                  <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/80 custom-scrollbar overscroll-contain">
                    {satelliteReports.length === 0 ? (
                      <div className="p-8 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                          <Satellite className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-stone-800 dark:text-stone-200">
                            No Active Satellite Hotspots
                          </p>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 max-w-xs mx-auto leading-relaxed">
                            No thermal anomalies or forest fire hotspots currently detected by VIIRS over Rizal Province.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSyncSatellites}
                          disabled={isSyncingSatellites}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 dark:bg-stone-800 text-white hover:bg-black transition cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncingSatellites ? 'animate-spin' : ''}`} />
                          <span>Check for Updates</span>
                        </button>
                      </div>
                    ) : (
                      satelliteReports.map((satReport) => {
                        const coords = resolveReportCoordinates(satReport);
                        const sat = satReport.satelliteHotspot;
                        const frp = sat?.frp !== undefined ? sat.frp.toFixed(1) : 'N/A';
                        const tempC = sat?.brightnessTemperature !== undefined ? (sat.brightnessTemperature - 273.15).toFixed(1) : 'N/A';
                        const locationText = [satReport.location?.barangay, satReport.location?.municipality || 'Rizal'].filter(Boolean).join(', ');
                        const desc = satReport.aiTriage?.summary || satReport.rawInput?.description || 'NASA VIIRS Thermal Anomaly';

                        return (
                          <div
                            key={satReport.id}
                            onClick={() => {
                              setMapCenter({ lat: coords.lat, lng: coords.lng });
                              setMapZoom(14);
                              setSelectedReport(satReport);
                              if (window.innerWidth < 640) setIsSheetOpen(false);
                            }}
                            className="p-3 transition-colors cursor-pointer text-left space-y-1.5 group hover:bg-stone-50 dark:hover:bg-stone-850/80 bg-white dark:bg-stone-900"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400">
                                {satReport.referenceCode}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                                <Flame className="w-2.5 h-2.5 text-orange-600" />
                                {frp} MW FRP
                              </span>
                            </div>

                            <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 line-clamp-1">
                              {desc}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400 pt-0.5">
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                                {locationText}
                              </span>
                              <span className="font-mono text-stone-600 dark:text-stone-300 shrink-0">
                                {tempC}°C • {sat?.confidence || 'Nominal'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: PROTECTED RESERVES & WATERSHEDS */}
              {activeLeftDrawerTab === 'protected_zones' && (
                <div key="tab-reserves" className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {/* Reserves Header & Search */}
                  <div className="p-3 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0">
                          <ShieldAlert className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 leading-tight">
                            Protected Reserves & Buffers
                          </h4>
                          <span className="text-[10px] text-stone-500 dark:text-stone-400 block">
                            15 Curated Ecological Zones
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-semibold">
                          15 Zones
                        </span>
                        <button
                          type="button"
                          onClick={handleCloseDrawer}
                          className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                          title="Close Reserves"
                          aria-label="Close Reserves"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={protectedZoneSearchTerm}
                        onChange={(e) => setProtectedZoneSearchTerm(e.target.value)}
                        placeholder="Filter reserves by name or municipality..."
                        className="w-full pl-8 pr-7 py-1.5 text-xs bg-stone-50 hover:bg-white focus:bg-white dark:bg-stone-950 dark:hover:bg-stone-950 dark:focus:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:border-emerald-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition placeholder:text-stone-400 dark:placeholder:text-stone-600"
                      />
                      {protectedZoneSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setProtectedZoneSearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5 cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Category filter chips */}
                  <div className="px-3 py-2 bg-stone-50 dark:bg-stone-950 border-b border-stone-200/80 dark:border-stone-800 shrink-0">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-xs">
                      {[
                        { id: 'all', label: 'All (15)' },
                        { id: 'nipas', label: 'NIPAS (6)' },
                        { id: 'llda_zomap', label: 'LLDA (2)' },
                        { id: 'kba_georeserve', label: 'KBA (3)' },
                        { id: 'local_mountain', label: 'Local (4)' },
                      ].map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveZoneCatFilter(cat.id as any)}
                          className={`px-2 py-1 rounded-md text-xs font-semibold shrink-0 transition cursor-pointer whitespace-nowrap ${
                            activeZoneCatFilter === cat.id
                              ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-xs'
                              : 'bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Reserve Highlight Status Bar */}
                  {selectedProtectedZoneId && (
                    <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200/60 dark:border-emerald-850 flex items-center justify-between text-xs shrink-0">
                      <span className="text-[11px] font-medium text-emerald-900 dark:text-emerald-200 truncate pr-2">
                        Highlighting: <strong className="font-semibold">{selectedProtectedZone?.shortName || selectedProtectedZone?.name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedProtectedZoneId(null)}
                        className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer shrink-0"
                      >
                        Show all reserves
                      </button>
                    </div>
                  )}

                  {/* Interactive Zone List */}
                  <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/80 custom-scrollbar overscroll-contain">
                    {RIZAL_PROTECTED_ZONES_CATALOG
                      .filter((zone) => activeZoneCatFilter === 'all' || zone.category === activeZoneCatFilter)
                      .filter((zone) => {
                        if (!protectedZoneSearchTerm.trim()) return true;
                        const q = protectedZoneSearchTerm.toLowerCase();
                        return (
                          zone.name.toLowerCase().includes(q) ||
                          zone.shortName.toLowerCase().includes(q) ||
                          zone.municipality.toLowerCase().includes(q)
                        );
                      })
                      .map((zone) => {
                        const isSelected = selectedProtectedZoneId === zone.id;
                        const threatReports = reportsByProtectedZone[zone.id] || [];
                        const activeThreats = threatReports.filter((r) => r.status !== 'resolved');

                        return (
                          <div
                            key={zone.id}
                            onClick={() => {
                              if (selectedProtectedZoneId === zone.id) {
                                setSelectedProtectedZoneId(null);
                              } else {
                                setMapCenter({ lat: zone.lat, lng: zone.lng });
                                setMapZoom(zone.zoom);
                                setSelectedProtectedZoneId(zone.id);
                                if (window.innerWidth < 640) setIsSheetOpen(false);
                              }
                            }}
                            className={`p-3 transition-colors cursor-pointer text-left space-y-1.5 group ${
                              isSelected
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-500/40'
                                : 'hover:bg-stone-50 dark:hover:bg-stone-850/80 bg-white dark:bg-stone-900'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: zone.color }}
                                />
                                <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                                  {zone.name}
                                </span>
                              </span>
                              {activeThreats.length > 0 ? (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 font-bold border border-rose-300 dark:border-rose-800 shrink-0">
                                  {activeThreats.length} Active
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-medium border border-emerald-300 dark:border-emerald-800 shrink-0">
                                  Clear
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-400">
                              <span className="truncate">{zone.municipality}</span>
                              <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 shrink-0">
                                {zone.areaHectares}
                              </span>
                            </div>

                            {zone.legalBasis && (
                              <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
                                {zone.legalBasis}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* TAB 4: MGB PERMITTED QUARRIES CADASTRE */}
              {activeLeftDrawerTab === 'quarries' && (
                <div key="tab-quarries" className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {/* Quarries Header & Search */}
                  <div className="p-3 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0">
                          <Pickaxe className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 leading-tight">
                            MGB Permitted Cadastre
                          </h4>
                          <span className="text-[10px] text-stone-500 dark:text-stone-400 block">
                            Authorized Concessions (Region IV-A)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-semibold">
                          {mgbQuarriesFeatures.length || 10} Active
                        </span>
                        <button
                          type="button"
                          onClick={handleCloseDrawer}
                          className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                          title="Close Quarries"
                          aria-label="Close Quarries"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={quarrySearchTerm}
                        onChange={(e) => setQuarrySearchTerm(e.target.value)}
                        placeholder="Filter by operator, permit number, or municipality..."
                        className="w-full pl-8 pr-7 py-1.5 text-xs bg-stone-50 hover:bg-white focus:bg-white dark:bg-stone-950 dark:hover:bg-stone-950 dark:focus:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:border-amber-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 transition placeholder:text-stone-400 dark:placeholder:text-stone-600"
                      />
                      {quarrySearchTerm && (
                        <button
                          type="button"
                          onClick={() => setQuarrySearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5 cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Regulatory Authority Notice */}
                  <div className="px-3 py-2 bg-stone-50 dark:bg-stone-950 border-b border-stone-200/80 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-400 flex items-center justify-between shrink-0">
                    <span>Official MGB Region IV-A mining tenement boundaries</span>
                    <span className="font-mono text-amber-700 dark:text-amber-400 font-semibold">MPSA / CSAG</span>
                  </div>

                  {/* Concession Cards List */}
                  <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/80 custom-scrollbar overscroll-contain">
                    {mgbQuarriesFeatures
                      .filter((feat) => {
                        if (!quarrySearchTerm.trim()) return true;
                        const q = quarrySearchTerm.toLowerCase();
                        const p = feat.properties;
                        return (
                          p.name.toLowerCase().includes(q) ||
                          p.operator.toLowerCase().includes(q) ||
                          p.permitNumber.toLowerCase().includes(q) ||
                          p.municipality.toLowerCase().includes(q) ||
                          p.commodity.toLowerCase().includes(q)
                        );
                      })
                      .map((feat) => {
                        const p = feat.properties;
                        const center = getQuarryCenter(feat);

                        return (
                          <div
                            key={feat.id || p.id}
                            onClick={() => {
                              setMapCenter(center);
                              setMapZoom(14);
                              if (window.innerWidth < 640) setIsSheetOpen(false);
                            }}
                            className="p-3 hover:bg-stone-50 dark:hover:bg-stone-850/80 transition-colors cursor-pointer text-left space-y-1.5 group bg-white dark:bg-stone-900"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                                {p.name}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800 shrink-0">
                                {p.permitType}
                              </span>
                            </div>

                            <div className="text-[11px] text-stone-600 dark:text-stone-400 leading-snug">
                              <strong>Operator:</strong> {p.operator}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400 pt-0.5">
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                                {p.municipality}
                              </span>
                              <span className="font-mono text-stone-600 dark:text-stone-300 shrink-0">
                                {p.areaHectares}
                              </span>
                            </div>

                            <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400 truncate">
                              Permit: {p.permitNumber} • {p.commodity}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* TAB 5: WEATHER & ATMOSPHERIC AIR QUALITY */}
              {activeLeftDrawerTab === 'weather' && (
                <div key="tab-weather" className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {/* Header */}
                  <div className="p-3 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                          <CloudSun className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 leading-tight">
                            Atmospheric & Weather Intelligence
                          </h4>
                          <span className="text-[10px] text-stone-500 dark:text-stone-400 block">
                            Open-Meteo & European CAMS Live Telemetry
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadAtmosphericData()}
                          disabled={isLoadingAtmosphere}
                          className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                          title="Refresh Live Telemetry"
                          aria-label="Refresh Telemetry"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAtmosphere ? 'animate-spin text-emerald-600' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={handleCloseDrawer}
                          className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                          title="Close Weather"
                          aria-label="Close Weather"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* LGU Preset Chips */}
                    <div
                      onWheel={(e) => {
                        if (e.deltaY !== 0) {
                          e.currentTarget.scrollLeft += e.deltaY;
                        }
                      }}
                      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full scroll-smooth overscroll-x-contain touch-pan-x"
                    >
                      {RIZAL_LGU_PRESETS.map((preset) => {
                        const isActive = selectedWeatherLguId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectWeatherLgu(preset)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium shrink-0 transition flex items-center gap-1 cursor-pointer border ${
                              isActive
                                ? 'bg-stone-900 dark:bg-emerald-600 text-white border-stone-900 dark:border-emerald-600 shadow-2xs'
                                : 'bg-stone-50 dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 border-stone-200/80 dark:border-stone-700/80 hover:bg-stone-100 dark:hover:bg-stone-750'
                            }`}
                            title={`${preset.name} (${preset.elevation})`}
                          >
                            <span>{preset.shortName}</span>
                            <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-stone-200/70 dark:bg-stone-700 text-stone-500 dark:text-stone-400'}`}>
                              {preset.tag}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scrollable Weather Body */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 custom-scrollbar overscroll-contain">
                    {isLoadingAtmosphere && !atmosphericData ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                        <div className="w-10 h-10 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin flex items-center justify-center">
                          <CloudSun className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                            Connecting to Open-Meteo Satellite Feed...
                          </p>
                          <p className="text-[10px] text-stone-400 mt-0.5">
                            Reading live meteorological and atmospheric CAMS models for Rizal
                          </p>
                        </div>
                      </div>
                    ) : atmosphereError && !atmosphericData ? (
                      <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2 text-center">
                        <AlertTriangle className="w-6 h-6 text-rose-600 mx-auto" />
                        <p className="text-xs text-rose-800 dark:text-rose-300 font-semibold">{atmosphereError}</p>
                        <button
                          type="button"
                          onClick={() => loadAtmosphericData()}
                          className="px-3 py-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 rounded-lg text-xs font-medium hover:bg-stone-50 transition cursor-pointer"
                        >
                          Retry Connection
                        </button>
                      </div>
                    ) : atmosphericData ? (
                      <>
                        {(() => {
                          const activePreset = RIZAL_LGU_PRESETS.find((p) => p.id === selectedWeatherLguId) || RIZAL_LGU_PRESETS[0];
                          const aqiMeta = getAqiMeta(atmosphericData.airQuality.europeanAqi, atmosphericData.airQuality.pm2_5, atmosphericData.airQuality.pm10);
                          const windTraj = getWindFlowTrajectory(atmosphericData.weather.windDirection, atmosphericData.weather.windSpeed);
                          const indices = computeEmpiricalWeatherIndices(atmosphericData.weather, atmosphericData.airQuality);

                          return (
                            <>
                              {/* Active Preset Subheader */}
                              <div className="p-2.5 bg-stone-50 dark:bg-stone-950/60 border border-stone-200/80 dark:border-stone-800 rounded-xl flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <span className="font-bold text-xs text-stone-900 dark:text-stone-100 truncate">
                                      {activePreset.name}
                                    </span>
                                    <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 shrink-0">
                                      ({activePreset.elevation})
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                                    {activePreset.ecologicalRole}
                                  </p>
                                </div>
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300 shrink-0">
                                  {new Date(atmosphericData.weather.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>

                              {/* 1. Live Meteorological Card */}
                              <div className="p-3.5 bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-xl shadow-2xs space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
                                      <Thermometer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wide text-stone-800 dark:text-stone-200">
                                      Current Weather
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                                    {atmosphericData.weather.weatherDescription}
                                  </span>
                                </div>

                                <div className="flex items-baseline justify-between pt-1">
                                  <div>
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-50">
                                        {atmosphericData.weather.temperature}°C
                                      </span>
                                      <span className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                                        Feels like {atmosphericData.weather.apparentTemperature}°C
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
                                      Cloud Cover: {atmosphericData.weather.cloudCover}%
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    {windTraj.isCalm ? (
                                      <>
                                        <span className="font-mono text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center justify-end gap-1">
                                          <Wind className="w-3.5 h-3.5 text-stone-400" />
                                          {atmosphericData.weather.windSpeed} km/h (Calm)
                                        </span>
                                        <span className="text-[10px] text-stone-500 dark:text-stone-400 block font-mono">
                                          No prevailing direction
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="font-mono text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center justify-end gap-1">
                                          <Wind className="w-3.5 h-3.5 text-stone-500" />
                                          {atmosphericData.weather.windSpeed} km/h from {windTraj.fromCompass}
                                        </span>
                                        <span className="text-[10px] text-stone-500 dark:text-stone-400 block font-mono">
                                          &rarr; Blowing toward {windTraj.toCompass}
                                        </span>
                                      </>
                                    )}
                                    {atmosphericData.weather.windGusts !== null && (
                                      <span className="text-[9.5px] text-stone-400 block font-mono">
                                        Gusts up to {atmosphericData.weather.windGusts} km/h
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-100 dark:border-stone-800/80 text-center">
                                  <div className="p-2 bg-stone-50 dark:bg-stone-950/50 rounded-lg border border-stone-200/60 dark:border-stone-800/60">
                                    <div className="flex items-center justify-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 font-medium">
                                      <Droplets className="w-3 h-3 text-sky-500" />
                                      <span>Humidity</span>
                                    </div>
                                    <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100 mt-0.5 block">
                                      {atmosphericData.weather.relativeHumidity}%
                                    </span>
                                  </div>

                                  <div className="p-2 bg-stone-50 dark:bg-stone-950/50 rounded-lg border border-stone-200/60 dark:border-stone-800/60">
                                    <div className="flex items-center justify-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 font-medium">
                                      <CloudRain className="w-3 h-3 text-blue-500" />
                                      <span>Rainfall</span>
                                    </div>
                                    <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100 mt-0.5 block">
                                      {atmosphericData.weather.precipitation} mm
                                    </span>
                                  </div>

                                  <div className="p-2 bg-stone-50 dark:bg-stone-950/50 rounded-lg border border-stone-200/60 dark:border-stone-800/60">
                                    <div className="flex items-center justify-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 font-medium">
                                      <Compass className="w-3 h-3 text-emerald-500" />
                                      <span>Trajectory</span>
                                    </div>
                                    {windTraj.isCalm ? (
                                      <>
                                        <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100 mt-0.5 block">
                                          Calm
                                        </span>
                                        <span className="text-[9px] text-stone-400 block font-mono">
                                          &lt; 1 km/h
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100 mt-0.5 block" title={windTraj.summary}>
                                          {windTraj.fromCompass} &rarr; {windTraj.toCompass}
                                        </span>
                                        <span className="text-[9px] text-stone-400 block font-mono">
                                          {windTraj.fromBearing}° origin
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 2. Atmospheric Air Quality (AQI) Card */}
                              <div className="p-3.5 bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-xl shadow-2xs space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 flex items-center justify-center">
                                      <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    </div>
                                    <div>
                                      <span className="text-xs font-bold uppercase tracking-wide text-stone-800 dark:text-stone-200 block">
                                        Atmospheric Air Quality
                                      </span>
                                      <span className="text-[10px] text-stone-400 block">
                                        European CAMS & Philippine Clean Air Act
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${aqiMeta.badgeBg} ${aqiMeta.badgeText} ${aqiMeta.badgeBorder}`}>
                                      AQI {atmosphericData.airQuality.europeanAqi} • {aqiMeta.label}
                                    </span>
                                    <span className="text-[9px] font-mono text-stone-500 dark:text-stone-400">
                                      Dominant: {aqiMeta.dominantPollutant ?? 'PM2.5'}
                                    </span>
                                  </div>
                                </div>

                                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                                  {aqiMeta.description}
                                </p>

                                <div className="grid grid-cols-4 gap-1.5 p-2 bg-stone-50 dark:bg-stone-950/60 border border-stone-200/80 dark:border-stone-800 rounded-lg text-center divide-x divide-stone-200 dark:divide-stone-800">
                                  <div className="px-1">
                                    <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">PM2.5 (Fine)</span>
                                    <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">
                                      {atmosphericData.airQuality.pm2_5} μg/m³
                                    </span>
                                  </div>
                                  <div className="px-1">
                                    <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">PM10 (Dust)</span>
                                    <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">
                                      {atmosphericData.airQuality.pm10} μg/m³
                                    </span>
                                  </div>
                                  <div className="px-1">
                                    <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">CO</span>
                                    <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">
                                      {atmosphericData.airQuality.carbonMonoxide ?? '—'} μg/m³
                                    </span>
                                  </div>
                                  <div className="px-1">
                                    <span className="text-[9px] text-stone-500 dark:text-stone-400 font-medium block">Ozone</span>
                                    <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100">
                                      {atmosphericData.airQuality.ozone ?? '—'} μg/m³
                                    </span>
                                  </div>
                                </div>

                                <div className="p-2 bg-stone-50 dark:bg-stone-950/50 rounded-lg border border-stone-200/60 dark:border-stone-800/60 space-y-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-stone-600 dark:text-stone-400">DENR DAO 2020-14 (Clean Air Act) Status:</span>
                                    <strong className="font-semibold text-stone-900 dark:text-stone-100">{aqiMeta.denrStatus}</strong>
                                  </div>
                                  <p className="text-[10.5px] text-stone-500 dark:text-stone-400 leading-snug">
                                    {aqiMeta.healthSummary}
                                  </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-600 dark:text-stone-400 pt-1">
                                  <div className="flex items-center justify-between px-2 py-1 bg-stone-50 dark:bg-stone-950/40 rounded border border-stone-200/50 dark:border-stone-800/50">
                                    <span>US EPA AQI:</span>
                                    <span className="font-mono font-bold text-stone-800 dark:text-stone-200">{atmosphericData.airQuality.usAqi}</span>
                                  </div>
                                  <div className="flex items-center justify-between px-2 py-1 bg-stone-50 dark:bg-stone-950/40 rounded border border-stone-200/50 dark:border-stone-800/50">
                                    <span>Nitrogen Dioxide:</span>
                                    <span className="font-mono font-bold text-stone-800 dark:text-stone-200">{atmosphericData.airQuality.nitrogenDioxide ?? '—'} μg/m³</span>
                                  </div>
                                </div>
                              </div>

                              {/* 3. Empirical Meteorological & Scientific Data Boundaries */}
                              <div className="p-3.5 bg-stone-50 dark:bg-stone-950/60 border border-stone-200/80 dark:border-stone-800 rounded-xl space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Scale className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
                                      Empirical Meteorological Indices
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400">
                                    PAGASA & WMO Standards
                                  </span>
                                </div>

                                <div className="space-y-2 text-xs">
                                  {/* 1. Heat Index Card */}
                                  <div className="p-2.5 bg-white dark:bg-stone-900 rounded-lg border border-stone-200/70 dark:border-stone-800/70 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                                        <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                                        <span>Heat Index (Thermal Load)</span>
                                      </span>
                                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${indices.heatIndex.badgeBg} ${indices.heatIndex.badgeText} ${indices.heatIndex.badgeBorder}`}>
                                        {indices.heatIndex.category} ({indices.heatIndex.value}°C)
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-stone-600 dark:text-stone-300 font-medium">
                                      {indices.heatIndex.pagasaGuideline}
                                    </p>
                                    <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-snug italic border-t border-stone-100 dark:border-stone-800/60 pt-1">
                                      {indices.heatIndex.dataLimitation}
                                    </p>
                                  </div>

                                  {/* 2. Rainfall Intensity Card */}
                                  <div className="p-2.5 bg-white dark:bg-stone-900 rounded-lg border border-stone-200/70 dark:border-stone-800/70 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                                        <CloudRain className="w-3.5 h-3.5 text-blue-500" />
                                        <span>Precipitation (PAGASA Warning Brackets)</span>
                                      </span>
                                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${indices.rainfallIntensity.badgeBg} ${indices.rainfallIntensity.badgeText} ${indices.rainfallIntensity.badgeBorder}`}>
                                        {indices.rainfallIntensity.category}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-stone-600 dark:text-stone-300 font-medium">
                                      {indices.rainfallIntensity.classification}
                                    </p>
                                    <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-snug italic border-t border-stone-100 dark:border-stone-800/60 pt-1">
                                      {indices.rainfallIntensity.dataLimitation}
                                    </p>
                                  </div>

                                  {/* 3. Beaufort Wind Force Card */}
                                  <div className="p-2.5 bg-white dark:bg-stone-900 rounded-lg border border-stone-200/70 dark:border-stone-800/70 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                                        <Wind className="w-3.5 h-3.5 text-teal-500" />
                                        <span>Kinetic Wind Force (WMO Beaufort Scale)</span>
                                      </span>
                                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${indices.windKineticForce.badgeBg} ${indices.windKineticForce.badgeText} ${indices.windKineticForce.badgeBorder}`}>
                                        {indices.windKineticForce.category} ({indices.windKineticForce.speed} km/h)
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-stone-600 dark:text-stone-300 font-medium">
                                      {indices.windKineticForce.beaufortDescription}
                                    </p>
                                    <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-snug italic border-t border-stone-100 dark:border-stone-800/60 pt-1">
                                      {indices.windKineticForce.dataLimitation}
                                    </p>
                                  </div>

                                  {/* 4. Scientific Data Sufficiency & Forecast Limitations */}
                                  <div className="p-2.5 bg-stone-100/80 dark:bg-stone-900/80 rounded-lg border border-stone-200 dark:border-stone-800 space-y-1">
                                    <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300 font-bold text-[11px]">
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                      <span>Scientific Boundary & Data Sufficiency Notice</span>
                                    </div>
                                    <ul className="text-[10.5px] text-stone-500 dark:text-stone-400 space-y-0.5 list-disc list-inside">
                                      <li>
                                        <strong>Scope:</strong> {indices.dataSufficiency.observationScope}
                                      </li>
                                      <li>
                                        <strong>Forecast:</strong> {indices.dataSufficiency.forecastStatus}
                                      </li>
                                      <li>
                                        <strong>Ground Events:</strong> {indices.dataSufficiency.groundEventLimitation}
                                      </li>
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ) : (
                /* ------------------------------------------------------- */
                /* SHEET MODE 2: CASE INSPECTOR & DECISION CONSOLE         */
                /* ------------------------------------------------------- */
                <div key={`dossier-mode-${selectedReport.id}`} className="flex flex-col flex-1 min-h-0 overflow-hidden animate-sheet-morph">
                  {/* Header with Icon Back button & Reference Code */}
                  <div className="px-3.5 py-2.5 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedReport(null)}
                        className="p-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-950 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0"
                        title={activeClusterFilter ? 'Return to Cluster Queue' : 'Return to Incident Queue'}
                        aria-label="Back to Queue"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <span className="font-mono font-bold text-xs tracking-wider text-stone-950 dark:text-stone-100 truncate">
                        {selectedReport.referenceCode}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 inline-flex items-center gap-1.5 capitalize">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            selectedReport.status === 'resolved'
                              ? 'bg-emerald-500'
                              : selectedReport.status === 'in_progress'
                              ? 'bg-amber-500'
                              : selectedReport.status === 'spam'
                              ? 'bg-rose-700'
                              : 'bg-rose-500'
                          }`}
                        />
                        {selectedReport.status.replace(/_/g, ' ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReport(null);
                          handleCloseDrawer();
                        }}
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                        title="Close Inspector"
                        aria-label="Close Inspector"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Dossier Body */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 custom-scrollbar overscroll-contain">
                    {/* SPAM / QUARANTINE WARNING BANNER */}
                    {(selectedReport.status === 'spam' || selectedReport.aiTriage?.isSpam) && (
                      <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900 rounded-xl space-y-2 text-xs text-rose-950 dark:text-rose-200 shadow-2xs">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5 min-w-0">
                            <span className="font-bold uppercase tracking-wide text-rose-900 dark:text-rose-300 block text-[11px]">
                              Quarantined in Spam Queue
                            </span>
                            <p className="text-[11px] text-rose-800 dark:text-rose-300/80 leading-snug">
                              {selectedReport.aiTriage?.authenticity?.forensicNotes ||
                                'Flagged as suspected troll submission or unverified incident.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-rose-200 dark:border-rose-900">
                          <button
                            type="button"
                            onClick={handleRestoreReport}
                            disabled={isRestoringReport || isDeletingReport}
                            className="flex-1 py-1.5 px-2 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                          >
                            <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                            <span>{isRestoringReport ? 'Restoring...' : t.retrieveBtn}</span>
                          </button>

                          {!showDeleteConfirm ? (
                            <button
                              type="button"
                              onClick={() => setShowDeleteConfirm(true)}
                              disabled={isRestoringReport || isDeletingReport}
                              className="flex-1 py-1.5 px-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{t.deletePermanentlyBtn}</span>
                            </button>
                          ) : (
                            <div className="flex-1 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={handleDeletePermanently}
                                disabled={isDeletingReport}
                                className="flex-1 py-1 px-1.5 bg-rose-900 hover:bg-black text-white font-bold text-[10px] rounded-lg transition cursor-pointer flex items-center justify-center gap-1 animate-pulse"
                              >
                                {isDeletingReport ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                <span>Confirm Delete</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="py-1 px-2 border border-rose-300 dark:border-rose-800 bg-white dark:bg-stone-800 hover:bg-rose-100 dark:hover:bg-stone-700 text-rose-800 dark:text-rose-300 text-[10px] font-semibold rounded-lg transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Citizen Evidence & Photo */}
                    <div className="space-y-2">
                      <div
                        onClick={() => photoDataUrl && setIsLightboxOpen(true)}
                        className={`relative rounded-lg overflow-hidden bg-stone-950 h-36 sm:h-40 flex items-center justify-center border border-stone-200 dark:border-stone-800 group ${
                          photoDataUrl ? 'cursor-pointer' : ''
                        }`}
                        title={photoDataUrl ? t.photoExpandHint : undefined}
                      >
                        {photoDataUrl ? (
                          <>
                            <img
                              src={photoDataUrl}
                              alt="Incident evidence"
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="px-2 py-1 rounded bg-black/75 text-white text-[10px] font-display font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                                <ZoomIn className="w-3.5 h-3.5" />
                                <span>Expand</span>
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-2 text-stone-400 dark:text-stone-500 text-xs">
                            <Eye className="w-5 h-5 mx-auto mb-1 text-stone-500 dark:text-stone-400" />
                            <span className="text-[11px]">{selectedReport.rawInput.hasImage ? 'Loading photo...' : 'No photo submitted'}</span>
                          </div>
                        )}
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-stone-900/80 backdrop-blur-xs text-[9px] font-mono text-stone-300 rounded border border-white/10 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5 text-stone-400" />
                          <span>RA 10173 SECURED</span>
                        </div>
                      </div>

                      {/* Multi-Photo Evidence Deck Thumbnails */}
                      {evidenceImages.length > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                          {evidenceImages.map((img, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setActivePhotoIndex(idx);
                                setPhotoDataUrl(img.data);
                              }}
                              className={`relative w-14 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition cursor-pointer ${
                                activePhotoIndex === idx
                                  ? 'border-stone-900 dark:border-emerald-500 ring-2 ring-stone-900/20 dark:ring-emerald-500/20 shadow-2xs'
                                  : 'border-stone-200 dark:border-stone-700 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <img src={img.data} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                              <span className="absolute bottom-0 inset-x-0 bg-stone-950/80 text-white text-[7px] font-mono text-center py-0.2 capitalize truncate px-0.5">
                                {img.role.replace('_', ' ')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Forensic & Authenticity Metadata Card */}
                      <div className="p-3 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200 dark:border-stone-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-display font-bold uppercase tracking-wide text-stone-700 dark:text-stone-300">
                          <div className="flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-stone-600 dark:text-stone-400" />
                            <span>Forensics</span>
                          </div>
                          {selectedReport.status === 'spam' || selectedReport.aiTriage?.isSpam ? (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              SPAM / TROLL
                            </span>
                          ) : selectedReport.rawInput.captureMethod === 'live_camera' ? (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              LIVE CAMERA
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                              DEVICE UPLOAD
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <div className="p-1.5 bg-white dark:bg-stone-900 rounded border border-stone-200/70 dark:border-stone-800">
                            <span className="text-[9px] text-stone-500 dark:text-stone-400 block">Photos</span>
                            <span className="font-semibold text-stone-900 dark:text-stone-100 font-mono">
                              {selectedReport.rawInput.imageCount || (selectedReport.rawInput.hasImage ? 1 : 0)}
                            </span>
                          </div>
                          <div className="p-1.5 bg-white dark:bg-stone-900 rounded border border-stone-200/70 dark:border-stone-800">
                            <span className="text-[9px] text-stone-500 dark:text-stone-400 block">Source</span>
                            <span className="font-semibold text-stone-900 dark:text-stone-100 capitalize truncate block">
                              {selectedReport.rawInput.captureMethod ? selectedReport.rawInput.captureMethod.replace('_', ' ') : 'Single'}
                            </span>
                          </div>
                        </div>

                        {selectedReport.rawInput.exif?.cameraModel && (
                          <div className="text-[10px] text-stone-600 dark:text-stone-300 font-mono bg-white dark:bg-stone-900 p-1.5 rounded border border-stone-200/70 dark:border-stone-800 flex items-center justify-between">
                            <span className="text-stone-400 dark:text-stone-500">Device:</span>
                            <span className="font-semibold truncate max-w-[150px]">{selectedReport.rawInput.exif.cameraModel}</span>
                          </div>
                        )}

                        {selectedReport.aiTriage?.authenticity?.forensicNotes && (
                          <div className="text-[10px] text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-900 p-1.5 rounded leading-relaxed border border-stone-200/70 dark:border-stone-800">
                            <span className="font-semibold text-stone-800 dark:text-stone-200">AI Note: </span>
                            {selectedReport.aiTriage.authenticity.forensicNotes}
                          </div>
                        )}
                      </div>

                      {/* Citizen Description Card */}
                      <div className="bg-stone-50 dark:bg-stone-950/60 rounded-lg p-3 border border-stone-200/80 dark:border-stone-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-display font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          <span>Citizen Report</span>
                          <span className="text-[9px] font-mono text-stone-500 dark:text-stone-400 bg-stone-200/70 dark:bg-stone-800 px-1.5 py-0.2 rounded border border-stone-300/60 dark:border-stone-700">
                            Untrusted Input
                          </span>
                        </div>
                        <p className="text-xs text-stone-800 dark:text-stone-200 italic leading-relaxed py-0.5">
                          "{selectedReport.rawInput.description}"
                        </p>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400 font-mono pt-1 border-t border-stone-200/60 dark:border-stone-800 flex items-center justify-between">
                          <span className="truncate">
                            {[selectedReport.location.barangay, selectedReport.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                          </span>
                          <span className="shrink-0">
                            GPS: {selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Gemini AI Triage Card */}
                    <div className="p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-900 dark:text-stone-100">
                          <Sparkles className="w-3.5 h-3.5 text-stone-700 dark:text-emerald-400" />
                          <span>Gemini AI Triage</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {selectedReport.status !== 'spam' && (selectedReport.aiTriage?.isSpam || (selectedReport.aiTriage?.confidence && selectedReport.aiTriage.confidence < 0.45)) && (
                            <button
                              type="button"
                              onClick={handleMarkAsSpam}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900 transition cursor-pointer flex items-center gap-1"
                              title="Flag report as troll/spam and quarantine"
                            >
                              <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                              <span>Flag as Spam</span>
                            </button>
                          )}
                          {selectedReport.aiTriage?.confidence && (
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                              {Math.round(selectedReport.aiTriage.confidence * 100)}% Conf
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleRetryTriage}
                            disabled={isRetryingTriage}
                            title="Re-run AI triage on this report"
                            className="p-1 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRetryingTriage ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-stone-800 dark:text-stone-200 leading-relaxed font-sans font-medium">
                        {selectedReport.aiTriage?.summary || 'AI triage assessment not available or pending.'}
                      </p>

                      {/* Collapsible AI Reasoning */}
                      {selectedReport.aiTriage?.reasoning && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
                            className="text-[10px] text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isReasoningExpanded ? 'Hide AI reasoning' : 'View AI reasoning'}</span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${isReasoningExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          {isReasoningExpanded && (
                            <div className="mt-1.5 p-2 rounded-md bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-300 leading-relaxed font-sans">
                              {selectedReport.aiTriage.reasoning}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* NASA Satellite Hotspot Telemetry Card */}
                    {renderSatelliteHotspotCard(selectedReport)}

                    {/* Protected Zone Alert (if applicable) */}
                    {renderProtectedZoneBadge(
                      selectedReport.aiTriage?.protectedZone,
                      true
                    )}

                    {/* MGB Tenement Cadastre Compliance Card */}
                    {renderMgbQuarryCard(selectedReport)}

                    {/* Atmospheric Air Quality Card */}
                    {renderAirQualityCard(selectedReport.aiTriage?.airQuality, selectedReport.id)}

                    {/* Weather Telemetry */}
                    {renderWeatherWidget(selectedReport.aiTriage?.weather, selectedReport.id)}

                    {/* Duplicate Cluster Alert */}
                    {clusteredReports.find((r) => r.id === selectedReport.id)?.duplicateClusterId && (
                      <div className="p-2.5 bg-stone-50 dark:bg-stone-950/60 rounded-lg border border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400 shrink-0" />
                          <span className="font-medium truncate">{t.duplicateClusterDetected}</span>
                        </div>
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-300/60 dark:border-stone-700 shrink-0">
                          Cluster Detected
                        </span>
                      </div>
                    )}

                    {/* Officer Decision Console */}
                    <div className="bg-stone-50/70 dark:bg-stone-950/60 p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-stone-700 dark:text-stone-300 block">
                          Officer Decision Console
                        </span>
                        {selectedReport.status !== 'spam' && (
                          <button
                            type="button"
                            onClick={handleMarkAsSpam}
                            className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-stone-500 dark:text-stone-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-stone-200 dark:border-stone-800 transition cursor-pointer flex items-center gap-1"
                            title="Quarantine report to Spam Queue"
                          >
                            <AlertTriangle className="w-3 h-3 text-stone-400 dark:text-stone-500" />
                            <span>Flag as Spam</span>
                          </button>
                        )}
                      </div>

                      {/* Operational Status Selector */}
                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                          Operational Status
                        </label>
                        <div className="grid grid-cols-3 gap-1 bg-stone-100 dark:bg-stone-900 p-1 rounded-lg text-xs font-medium">
                          {(['pending', 'in_progress', 'resolved'] as ReportStatus[]).map((status) => {
                            const isActive = newStatus === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => setNewStatus(status)}
                                className={`py-1.5 px-2 rounded-md text-center transition cursor-pointer text-xs font-medium flex items-center justify-center gap-1.5 ${
                                  isActive
                                    ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-xs font-semibold'
                                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    status === 'resolved'
                                      ? 'bg-emerald-500'
                                      : status === 'in_progress'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                />
                                <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Category & Severity Override Dropdowns */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 block mb-0.5">
                            Category
                          </label>
                          <select
                            value={overrideCategory}
                            onChange={(e) => setOverrideCategory(e.target.value as any)}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 truncate"
                          >
                            {Object.entries(CATEGORIES).map(([key, cat]) => (
                              <option key={key} value={key}>
                                {lang === 'fil' ? cat.labelFil : cat.labelEn}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 block mb-0.5">
                            Severity
                          </label>
                          <select
                            value={overrideSeverity}
                            onChange={(e) => setOverrideSeverity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 truncate"
                          >
                            {Object.entries(SEVERITY_LEVELS).map(([lvl, meta]) => (
                              <option key={lvl} value={lvl}>
                                {lvl} - {lang === 'fil' ? meta.labelFil : meta.labelEn}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Action Directives / Notes */}
                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 block mb-0.5">
                          Action Directives / Notes
                        </label>
                        <textarea
                          rows={2}
                          value={officerNotes}
                          onChange={(e) => setOfficerNotes(e.target.value)}
                          placeholder="Action directives, dispatch instructions, or closure remarks..."
                          className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 placeholder:text-stone-400 dark:placeholder:text-stone-600 resize-none font-sans"
                        />
                      </div>

                      {/* Unified Save CTA */}
                      <div>
                        <button
                          type="button"
                          onClick={handleSaveUnifiedAction}
                          disabled={isSavingUnified}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                            unifiedSuccess
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-700 disabled:bg-stone-300 dark:disabled:bg-stone-800 active:scale-[0.99]'
                          }`}
                        >
                          {isSavingUnified ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : unifiedSuccess ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-100" />
                              <span>{t.saveSuccessMsg}</span>
                            </>
                          ) : (
                            <>
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>{t.saveAndApplyBtn}</span>
                            </>
                          )}
                        </button>

                        {/* Audit Log / Reviewer Timestamp */}
                        {selectedReport.final?.reviewedAt && (
                          <div className="text-[10px] text-stone-500 dark:text-stone-400 font-mono flex items-center justify-between pt-1">
                            <span>Reviewed: {new Date(selectedReport.final.reviewedAt).toLocaleDateString()}</span>
                            <span className="text-stone-700 dark:text-stone-300 font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              Assessment Logged
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ========================================================= */}
          {/* 3.5 RIGHT SLIDE-OVER PROTECTED ZONE DOSSIER & THREAT HUD  */}
          {/* ========================================================= */}
          {selectedProtectedZone && isSheetOpen && activeLeftDrawerTab === 'protected_zones' && !selectedReport && (
            <div className="absolute top-3 right-16 sm:top-4 sm:right-18 z-30 pointer-events-auto w-[calc(100vw-88px)] sm:w-[410px] max-h-[calc(100vh-88px)] bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border border-stone-200 dark:border-stone-800 shadow-2xl rounded-2xl overflow-hidden flex flex-col transition-all duration-300 animate-nav-pill min-h-0">
              {/* Header */}
              <div className="p-3.5 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 shrink-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedProtectedZone.category === 'nipas' && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <ShieldAlert className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                        DENR-NIPAS
                      </span>
                    )}
                    {selectedProtectedZone.category === 'llda_zomap' && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                        <Droplets className="w-3 h-3 text-sky-700 dark:text-sky-400" />
                        LLDA ZOMAP
                      </span>
                    )}
                    {selectedProtectedZone.category === 'kba_georeserve' && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <Trees className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                        KBA / GEORESERVE
                      </span>
                    )}
                    {selectedProtectedZone.category === 'local_mountain' && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border border-stone-300 dark:border-stone-700">
                        <Mountain className="w-3 h-3 text-stone-700 dark:text-stone-300" />
                        LOCAL MOUNTAIN
                      </span>
                    )}
                    <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {selectedProtectedZone.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setMapCenter({ lat: selectedProtectedZone.lat, lng: selectedProtectedZone.lng });
                        setMapZoom(selectedProtectedZone.zoom);
                      }}
                      className="p-1.5 text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                      title="Center map on reserve"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProtectedZoneId(null)}
                      className="p-1.5 text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                      title="Close dossier"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-display font-bold text-sm sm:text-base text-stone-900 dark:text-white leading-tight">
                    {selectedProtectedZone.name}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 mt-1">
                    <MapPin className="w-3 h-3 shrink-0 text-stone-400" />
                    <span className="truncate">{selectedProtectedZone.municipality}</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Content Body */}
              <div className="overflow-y-auto p-3.5 space-y-3 custom-scrollbar flex-1 min-h-0 overscroll-contain">
                {/* 1. Vital Statistics Grid */}
                <div className="grid grid-cols-3 gap-2 bg-stone-50 dark:bg-stone-850 border border-stone-200/80 dark:border-stone-800 rounded-lg p-2.5 text-center">
                  <div>
                    <span className="text-[9px] font-bold tracking-wider uppercase text-stone-400 dark:text-stone-500 block">
                      Declared Area
                    </span>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 mt-0.5 block truncate">
                      {selectedProtectedZone.areaHectares}
                    </span>
                  </div>
                  <div className="border-x border-stone-200/80 dark:border-stone-800 px-1">
                    <span className="text-[9px] font-bold tracking-wider uppercase text-stone-400 dark:text-stone-500 block">
                      Elevation
                    </span>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 mt-0.5 block truncate">
                      {selectedProtectedZone.elevation}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold tracking-wider uppercase text-stone-400 dark:text-stone-500 block">
                      Governance
                    </span>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 mt-0.5 block truncate">
                      {selectedProtectedZone.categoryLabel}
                    </span>
                  </div>
                </div>

                {/* 2. Live Threat Telemetry & Filter Card */}
                {(() => {
                  const zoneThreatReports = reportsByProtectedZone[selectedProtectedZone.id] || [];
                  const activeThreats = zoneThreatReports.filter((r) => r.status !== 'resolved');
                  const urgentThreats = activeThreats.filter((r) => (r.final?.severity || r.aiTriage?.severity || 0) >= 4);

                  const catBreakdown: Record<string, number> = {};
                  for (const rep of activeThreats) {
                    const c = rep.final?.category || rep.aiTriage?.category || 'other';
                    catBreakdown[c] = (catBreakdown[c] || 0) + 1;
                  }

                  return (
                    <div className="space-y-2">
                      <div className={`p-3 rounded-xl border space-y-2.5 ${
                        activeThreats.length > 0
                          ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30'
                          : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {activeThreats.length > 0 ? (
                              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            )}
                            <span className={`text-xs font-bold ${
                              activeThreats.length > 0
                                ? 'text-rose-900 dark:text-rose-200'
                                : 'text-emerald-900 dark:text-emerald-200'
                            }`}>
                              {activeThreats.length > 0
                                ? `${activeThreats.length} Active Environmental ${activeThreats.length === 1 ? 'Violation' : 'Violations'}`
                                : 'No Active Violations Detected'}
                            </span>
                          </div>

                          {urgentThreats.length > 0 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200 font-bold shrink-0">
                              {urgentThreats.length} Urgent
                            </span>
                          )}
                        </div>

                        {activeThreats.length > 0 ? (
                          <>
                            {/* Category chips */}
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(catBreakdown).map(([catKey, count]) => {
                                const info = (CATEGORIES as any)[catKey];
                                const label = info ? (lang === 'fil' ? info.labelFil : info.labelEn) : catKey;
                                return (
                                  <span
                                    key={catKey}
                                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800"
                                  >
                                    {count} {label}
                                  </span>
                                );
                              })}
                            </div>

                              {/* Interactive Zone Incidents Stream */}
                              <div className="space-y-1.5 pt-1.5 border-t border-rose-200/60 dark:border-rose-900/60">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                                    Zone Incidents ({activeThreats.length})
                                  </span>
                                  <span className="text-stone-400 dark:text-stone-500 font-medium">
                                    Click to inspect
                                  </span>
                                </div>
                                <div className="space-y-1.5 max-h-52 overflow-y-auto no-scrollbar overscroll-contain pr-0.5">
                                  {activeThreats.map((rep) => {
                                    const c = rep.final?.category || rep.aiTriage?.category;
                                    const catLabel = (CATEGORIES as any)[c || '']?.labelEn || c || 'Incident';
                                    const sev = rep.final?.severity || rep.aiTriage?.severity || 0;
                                    return (
                                      <button
                                        key={rep.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedReport(rep);
                                          setIsSheetOpen(true);
                                          const coords = resolveReportCoordinates(rep);
                                          setMapCenter(coords);
                                          setMapZoom(15);
                                        }}
                                        className="w-full text-left p-2 rounded-xl bg-white dark:bg-stone-900 hover:bg-rose-50/80 dark:hover:bg-rose-950/40 border border-stone-200/90 dark:border-stone-800 hover:border-rose-300 dark:hover:border-rose-700/60 shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between gap-2.5 active:scale-[0.99]"
                                        title={`Inspect report ${rep.referenceCode}`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 dark:text-stone-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                                            <span className="font-mono text-[10px] text-stone-400 dark:text-stone-500 font-semibold">{rep.referenceCode}</span>
                                            <span className="text-stone-300 dark:text-stone-600">•</span>
                                            <span className="truncate">{catLabel}</span>
                                          </div>
                                          <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5 flex items-center gap-1">
                                            <MapPin className="w-2.5 h-2.5 shrink-0 text-stone-400" />
                                            <span className="truncate">{rep.location.barangay ? `${rep.location.barangay}, ` : ''}{rep.location.municipality}</span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                            sev >= 4
                                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                              : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border border-stone-200 dark:border-stone-700'
                                          }`}>
                                            Sev {sev}
                                          </span>
                                          <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-rose-600 dark:group-hover:text-rose-400 group-hover:translate-x-0.5 transition-all" />
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                        ) : (
                          <div className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                            Zero active citizen violation reports are mapped within this reserve's polygon.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Statutory Safeguards & Enforceable Penalties Accordion */}
                <div className="border border-stone-200/90 dark:border-stone-800 rounded-xl overflow-hidden bg-stone-50/50 dark:bg-stone-950/40">
                  <button
                    type="button"
                    onClick={() => setIsProhibitionsExpanded(!isProhibitionsExpanded)}
                    className="w-full p-3 flex items-center justify-between text-left hover:bg-stone-100/60 dark:hover:bg-stone-850/60 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-stone-700 dark:text-stone-300 shrink-0" />
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                        Statutory Safeguards & Penalties
                      </span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-stone-400 dark:text-stone-500 transition-transform ${isProhibitionsExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isProhibitionsExpanded && (
                    <div className="p-3 pt-0 space-y-2.5 border-t border-stone-200/60 dark:border-stone-800/80">
                      {/* Legal Basis Mandate */}
                      <div className="pt-2">
                        <span className="text-[9px] font-bold tracking-wider uppercase text-stone-400 dark:text-stone-500 block mb-0.5">
                          Statutory Enactment
                        </span>
                        <div className="text-[11px] text-stone-700 dark:text-stone-300 leading-relaxed font-sans bg-white dark:bg-stone-900 p-2 rounded-lg border border-stone-200/80 dark:border-stone-800">
                          {selectedProtectedZone.legalBasis}
                        </div>
                      </div>

                      {/* Unlawful Activities */}
                      <div>
                        <span className="text-[9px] font-bold tracking-wider uppercase text-stone-400 dark:text-stone-500 block mb-1">
                          Prohibited Activities & Violations
                        </span>
                        <ul className="space-y-1">
                          {selectedProtectedZone.prohibitions.map((act, idx) => (
                            <li key={idx} className="flex items-start gap-1.5 text-[11px] text-stone-700 dark:text-stone-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                              <span className="leading-tight">{act}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Enforceable Penalties Callout */}
                      <div className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 block">
                          Enforceable Penalties & Liability:
                        </span>
                        <p className="text-[11px] text-stone-700 dark:text-stone-300 leading-relaxed font-sans">
                          {selectedProtectedZone.penalties}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Ecosystem Role Card */}
                <div className="p-3 rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    <Trees className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Ecosystem Role & Headwaters</span>
                  </div>
                  <p className="text-[11px] text-stone-700 dark:text-stone-300 leading-relaxed">
                    {selectedProtectedZone.ecosystemRole}
                  </p>
                </div>

                {/* 5. Covered Barangays Chips */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-stone-400 dark:text-stone-500">
                      Covered Barangays ({selectedProtectedZone.barangays.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedProtectedZone.barangays.map((brgy) => (
                      <span
                        key={brgy}
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200/60 dark:border-stone-750"
                      >
                        {brgy}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4. APPLE MAPS STYLE TOP-RIGHT FLOATING CAPSULE & LAYERS   */}
          {/* ========================================================= */}
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 pointer-events-auto flex items-start gap-2.5 transition-all duration-200">
            {/* Map Details Popover Card (Docked directly BESIDE the vertical capsule) */}
            {isLayersPanelOpen && (
              <div className="bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border border-stone-200/90 dark:border-stone-800 shadow-2xl rounded-2xl p-4 w-[320px] space-y-3.5 animate-in fade-in slide-in-from-right-2 duration-200 select-none">
                {/* Popover Header */}
                <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-stone-800 dark:text-stone-200" />
                    <span className="font-semibold text-xs text-stone-900 dark:text-stone-100">Map Details</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLayersPanelOpen(false)}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition cursor-pointer"
                    title="Close map details"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 1. Basemap Style: 3 Visual Cards with Icons */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 block">
                    Basemap Style
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Street Card */}
                    <button
                      type="button"
                      onClick={() => setBasemapMode('street')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition cursor-pointer text-center ${
                        basemapMode === 'street'
                          ? 'bg-stone-900 text-white border-stone-900 shadow-xs dark:bg-emerald-600 dark:border-emerald-500'
                          : 'bg-stone-50 hover:bg-stone-100/80 text-stone-700 border-stone-200/80 dark:bg-stone-800/60 dark:hover:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
                      }`}
                      title="Standard road network & LGU cartography"
                    >
                      <MapIcon className={`w-4 h-4 mb-1 ${basemapMode === 'street' ? 'text-white' : 'text-stone-600 dark:text-stone-400'}`} />
                      <span className="text-xs font-semibold leading-tight">Street</span>
                      <span className={`text-[8px] mt-0.5 leading-none ${basemapMode === 'street' ? 'text-stone-300 dark:text-emerald-100' : 'text-stone-400 dark:text-stone-500'}`}>
                        Roads
                      </span>
                    </button>

                    {/* Satellite Card */}
                    <button
                      type="button"
                      onClick={() => setBasemapMode('satellite')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition cursor-pointer text-center ${
                        basemapMode === 'satellite'
                          ? 'bg-stone-900 text-white border-stone-900 shadow-xs dark:bg-emerald-600 dark:border-emerald-500'
                          : 'bg-stone-50 hover:bg-stone-100/80 text-stone-700 border-stone-200/80 dark:bg-stone-800/60 dark:hover:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
                      }`}
                      title="High-resolution aerial satellite photography"
                    >
                      <Globe className={`w-4 h-4 mb-1 ${basemapMode === 'satellite' ? 'text-white' : 'text-stone-600 dark:text-stone-400'}`} />
                      <span className="text-xs font-semibold leading-tight">Satellite</span>
                      <span className={`text-[8px] mt-0.5 leading-none ${basemapMode === 'satellite' ? 'text-stone-300 dark:text-emerald-100' : 'text-stone-400 dark:text-stone-500'}`}>
                        Aerial
                      </span>
                    </button>

                    {/* Terrain Card */}
                    <button
                      type="button"
                      onClick={() => setBasemapMode('terrain')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition cursor-pointer text-center ${
                        basemapMode === 'terrain'
                          ? 'bg-stone-900 text-white border-stone-900 shadow-xs dark:bg-emerald-600 dark:border-emerald-500'
                          : 'bg-stone-50 hover:bg-stone-100/80 text-stone-700 border-stone-200/80 dark:bg-stone-800/60 dark:hover:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
                      }`}
                      title="Topographic elevation & mountain contours"
                    >
                      <Mountain className={`w-4 h-4 mb-1 ${basemapMode === 'terrain' ? 'text-white' : 'text-stone-600 dark:text-stone-400'}`} />
                      <span className="text-xs font-semibold leading-tight">Terrain</span>
                      <span className={`text-[8px] mt-0.5 leading-none ${basemapMode === 'terrain' ? 'text-stone-300 dark:text-emerald-100' : 'text-stone-400 dark:text-stone-500'}`}>
                        Contours
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Analysis Overlays */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 block">
                    Analysis Overlays
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-stone-100 dark:bg-stone-800/80 p-1 rounded-xl text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setMapLayerMode('boundaries');
                        setShowMgbQuarries(false);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-center transition cursor-pointer text-xs font-medium flex items-center justify-center gap-1.5 ${
                        mapLayerMode === 'boundaries'
                          ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-xs'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                      title="14 Municipal administrative borders"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Borders</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMapLayerMode('choropleth');
                        setShowMgbQuarries(false);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-center transition cursor-pointer text-xs font-medium flex items-center justify-center gap-1.5 ${
                        mapLayerMode === 'choropleth'
                          ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-xs'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                      title="Incident volume density heatmap"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Density</span>
                    </button>
                  </div>
                </div>

                {/* 3. Apple-Style Toggle Switch: Jurisdiction Spotlight */}
                <div
                  onClick={() => setIsMaskActive(!isMaskActive)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 hover:bg-stone-50 dark:hover:bg-stone-950/80 transition cursor-pointer"
                  title="Dim surrounding regions to spotlight Rizal jurisdiction"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                      isMaskActive ? 'bg-stone-900 dark:bg-emerald-600 text-white' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                    }`}>
                      <Crosshair className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-medium text-stone-900 dark:text-stone-100 block leading-tight">
                        Focus: Rizal Only
                      </span>
                      <span className="text-[10px] text-stone-400 dark:text-stone-500 block leading-tight">
                        Spotlight jurisdiction boundary
                      </span>
                    </div>
                  </div>

                  {/* Smooth Apple / iOS Sliding Toggle Switch */}
                  <div
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                      isMaskActive ? 'bg-stone-900 dark:bg-emerald-600' : 'bg-stone-300 dark:bg-stone-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
                        isMaskActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* 4. Atmospheric & Radar Overlays */}
                <div className="space-y-1.5 pt-1 border-t border-stone-100 dark:border-stone-800">
                  <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 block">
                    Atmospheric & Radar Overlays
                  </span>

                  {/* Toggle A: Live Doppler Rain Radar */}
                  <div
                    onClick={() => setShowRainRadar(!showRainRadar)}
                    className="flex items-center justify-between p-2 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 hover:bg-stone-50 dark:hover:bg-stone-950/80 transition cursor-pointer"
                    title="Live Doppler precipitation radar from open-source RainViewer API"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                        showRainRadar ? 'bg-blue-600 text-white' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                      }`}>
                        <CloudRain className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-stone-900 dark:text-stone-100 block leading-tight">
                          Live Rain Radar
                        </span>
                        <span className="text-[10px] text-stone-400 dark:text-stone-500 block leading-tight">
                          RainViewer Doppler sweeps
                        </span>
                      </div>
                    </div>

                    {/* Sliding Toggle */}
                    <div
                      className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                        showRainRadar ? 'bg-blue-600' : 'bg-stone-300 dark:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
                          showRainRadar ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Toggle B: Municipal Weather & AQI Pins */}
                  <div
                    onClick={() => setShowWeatherMarkers(!showWeatherMarkers)}
                    className="flex items-center justify-between p-2 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 hover:bg-stone-50 dark:hover:bg-stone-950/80 transition cursor-pointer"
                    title="Live Open-Meteo temperature, air quality score & wind vectors across Rizal LGUs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                        showWeatherMarkers ? 'bg-emerald-600 text-white' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                      }`}>
                        <Wind className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-stone-900 dark:text-stone-100 block leading-tight">
                          Weather & AQI Pins
                        </span>
                        <span className="text-[10px] text-stone-400 dark:text-stone-500 block leading-tight">
                          Open-Meteo live vectors
                        </span>
                      </div>
                    </div>

                    {/* Sliding Toggle */}
                    <div
                      className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                        showWeatherMarkers ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
                          showWeatherMarkers ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Refined Contextual Legend */}
                <div className="pt-2 border-t border-stone-100 dark:border-stone-800 text-[11px] space-y-1.5">
                  {showRainRadar ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 font-mono text-[9px]">
                        <span>Light (15 dBZ)</span>
                        <span>Moderate (35)</span>
                        <span>Heavy (55+ dBZ)</span>
                      </div>
                      <div className="grid grid-cols-4 gap-0.5 h-2 w-full rounded-full overflow-hidden border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800">
                        <div className="h-full bg-emerald-400" title="Light Rain" />
                        <div className="h-full bg-yellow-400" title="Moderate Rain" />
                        <div className="h-full bg-orange-500" title="Heavy Rain" />
                        <div className="h-full bg-rose-600" title="Severe Downpour" />
                      </div>
                      <div className="text-stone-400 dark:text-stone-500 text-[9px] text-center font-medium">
                        Live Doppler Precipitation Radar (RainViewer)
                      </div>
                    </div>
                  ) : mapLayerMode === 'choropleth' ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 font-mono text-[9px]">
                        <span>0</span>
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                        <span>5+ reports</span>
                      </div>
                      <div className="grid grid-cols-5 gap-0.5 h-2 w-full rounded-full overflow-hidden border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800">
                        <div className="h-full bg-emerald-600 opacity-20" title="1 report" />
                        <div className="h-full bg-emerald-600 opacity-40" title="2 reports" />
                        <div className="h-full bg-emerald-600 opacity-60" title="3 reports" />
                        <div className="h-full bg-emerald-600 opacity-80" title="4 reports" />
                        <div className="h-full bg-emerald-800 dark:bg-emerald-500 opacity-100" title="5+ reports" />
                      </div>
                      <div className="text-stone-400 dark:text-stone-500 text-[9px] text-center font-medium">
                        Incident Volume Density Scale
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-stone-600 dark:text-stone-300 text-[11px] font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Minor (1–2)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>Moderate (3)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-600" />
                          <span>Urgent (4–5)</span>
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-400 dark:text-stone-500 text-center font-normal">
                        14 LGUs of Rizal • Interactive map pins
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Apple Maps Style Vertical Floating Capsule */}
            <div className="bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border border-stone-200/90 dark:border-stone-800 shadow-xl rounded-2xl p-1 flex flex-col items-center gap-1 select-none shrink-0">
              {/* 1. Layers Toggle Button */}
              <button
                type="button"
                onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  isLayersPanelOpen
                    ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-xs'
                    : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
                title="Toggle Map Layers & Overlays"
                aria-label="Map Layers"
              >
                <Layers className="w-4 h-4" />
              </button>

              <div className="w-5 h-px bg-stone-200 dark:bg-stone-800" />

              {/* 2. Reset Province View (Home / Crosshair) */}
              <button
                type="button"
                onClick={() => handleQuickJump('all')}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition cursor-pointer"
                title="Reset view to Rizal Province"
                aria-label="Reset view to Rizal Province"
              >
                <Crosshair className="w-4 h-4" />
              </button>

              <div className="w-5 h-px bg-stone-200 dark:bg-stone-800" />

              {/* 3. Zoom Controls (+ and -) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setMapZoom((z) => Math.min(z + 1, 18))}
                  className="w-9 h-8 rounded-t-xl flex items-center justify-center text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition cursor-pointer"
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMapZoom((z) => Math.max(z - 1, 9))}
                  className="w-9 h-8 rounded-b-xl flex items-center justify-center text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition cursor-pointer"
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Live Rain Radar Active Pill */}
          {showRainRadar && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto bg-stone-900/90 dark:bg-stone-900/95 text-white backdrop-blur-md px-3.5 py-1.5 rounded-full border border-stone-700/80 shadow-xl flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-[11px] tracking-wide">Live Rain Radar</span>
              <span className="text-[10px] text-stone-400 font-mono">RainViewer Open-Source</span>
              <div className="h-2 w-14 rounded-full overflow-hidden flex ml-0.5">
                <div className="h-full w-1/4 bg-emerald-400" title="Light" />
                <div className="h-full w-1/4 bg-yellow-400" title="Moderate" />
                <div className="h-full w-1/4 bg-orange-500" title="Heavy" />
                <div className="h-full w-1/4 bg-rose-600" title="Severe" />
              </div>
              <button
                type="button"
                onClick={() => setShowRainRadar(false)}
                className="text-stone-400 hover:text-white p-0.5 ml-0.5 rounded cursor-pointer"
                title="Hide Radar Layer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* High-Resolution Photo Lightbox Modal */}
      {isLightboxOpen && photoDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider p-1.5 cursor-pointer rounded hover:bg-white/10 transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
              <span>Close (Esc)</span>
            </button>
            <img
              src={photoDataUrl}
              alt="Incident high-resolution evidence"
              className="max-h-[80vh] w-auto max-w-full rounded-xl shadow-2xl object-contain border border-white/10"
            />
            <div className="mt-3 text-center text-xs text-stone-300 font-mono">
              {selectedReport?.referenceCode} • High-Resolution Telemetry Preview
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
