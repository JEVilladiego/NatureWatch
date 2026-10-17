/**
 * NatureWatch Live Atmospheric & Meteorological Service
 * Powered directly by Open-Meteo Weather & Air Quality APIs.
 * Free, non-commercial, zero-API-key civic telemetry for Rizal Province & Sierra Madre.
 */

export interface LiveWeatherConditions {
  temperature: number; // °C
  apparentTemperature: number; // °C
  relativeHumidity: number; // %
  precipitation: number; // mm
  rain: number; // mm
  weatherCode: number;
  weatherDescription: string;
  cloudCover: number; // %
  windSpeed: number; // km/h
  windDirection: number; // degrees
  windDirectionCompass: string;
  windGusts: number | null; // km/h
  time: string;
  fetchedAt: string;
}

export interface LiveAirQualityConditions {
  europeanAqi: number;
  usAqi: number;
  aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Hazardous';
  dominantPollutant?: 'PM2.5 (Fine Particulates)' | 'PM10 (Coarse Particulates)' | 'None (Baseline)';
  pm2_5: number; // μg/m³
  pm10: number; // μg/m³
  carbonMonoxide: number | null; // μg/m³
  nitrogenDioxide: number | null; // μg/m³
  sulphurDioxide: number | null; // μg/m³
  ozone: number | null; // μg/m³
  dust: number | null; // μg/m³
  time: string;
  fetchedAt: string;
}

export interface FullAtmosphericData {
  weather: LiveWeatherConditions;
  airQuality: LiveAirQualityConditions;
  locationName: string;
  lat: number;
  lng: number;
}

export interface RizalLguPreset {
  id: string;
  name: string;
  shortName: string;
  tag: string;
  lat: number;
  lng: number;
  elevation: string;
  ecologicalRole: string;
}

export const RIZAL_LGU_PRESETS: RizalLguPreset[] = [
  {
    id: 'rizal-center',
    name: 'Rizal Province (Central Baseline)',
    shortName: 'All Rizal',
    tag: 'Centroid',
    lat: 14.5800,
    lng: 121.2800,
    elevation: '185m ASL',
    ecologicalRole: 'Macro-climatic baseline for the foothills of Sierra Madre Mountain Range.',
  },
  {
    id: 'antipolo',
    name: 'Antipolo City (Upper Slopes)',
    shortName: 'Antipolo',
    tag: 'Capital',
    lat: 14.5842,
    lng: 121.1763,
    elevation: '210m ASL',
    ecologicalRole: 'Mountain capital, Hinulugang Taktak Protected Landscape & eastern ridge crest.',
  },
  {
    id: 'angono',
    name: 'Angono (Bay Shoreland)',
    shortName: 'Angono',
    tag: 'Bay Corridor',
    lat: 14.5249,
    lng: 121.1554,
    elevation: '20m ASL',
    ecologicalRole: 'Angono Petroglyphs rock shelter buffer and northern lake shoreland.',
  },
  {
    id: 'baras',
    name: 'Baras (Masungi Corridor)',
    shortName: 'Baras',
    tag: 'Karst Buffer',
    lat: 14.5361,
    lng: 121.2678,
    elevation: '150m ASL',
    ecologicalRole: 'Masungi Georeserve karst limestone spine and reforestation corridor.',
  },
  {
    id: 'binangonan',
    name: 'Binangonan (Laguna de Bay)',
    shortName: 'Binangonan',
    tag: 'Lakeside',
    lat: 14.4644,
    lng: 121.1923,
    elevation: '15m ASL',
    ecologicalRole: 'Laguna de Bay aquatic shoreland buffer zone and Talim Island aquatic nursery.',
  },
  {
    id: 'cainta',
    name: 'Cainta (Marikina-Pasig Basin)',
    shortName: 'Cainta',
    tag: 'Urban Basin',
    lat: 14.5772,
    lng: 121.1215,
    elevation: '12m ASL',
    ecologicalRole: 'High-density urban waterway corridor, Valley Golf green lung, and Marikina-Pasig flood discharge interface.',
  },
  {
    id: 'cardona',
    name: 'Cardona (Talim Island Strait)',
    shortName: 'Cardona',
    tag: 'Fisheries',
    lat: 14.4842,
    lng: 121.2294,
    elevation: '18m ASL',
    ecologicalRole: 'Talim Island aquatic strait, freshwater aquaculture zone, and Laguna de Bay migratory bird corridor.',
  },
  {
    id: 'jalajala',
    name: 'Jalajala (Peninsula Sanctuary)',
    shortName: 'Jalajala',
    tag: 'Peninsula',
    lat: 14.3542,
    lng: 121.3250,
    elevation: '25m ASL',
    ecologicalRole: 'Southernmost Rizal peninsula, Mt. Sembrano biodiversity corridor, and pristine eastern Laguna de Bay sanctuary.',
  },
  {
    id: 'morong',
    name: 'Morong (Laguna Central Catchment)',
    shortName: 'Morong',
    tag: 'Delta',
    lat: 14.5111,
    lng: 121.2389,
    elevation: '22m ASL',
    ecologicalRole: 'Morong River agricultural floodplain, central bay delta, and low-lying alluvial siltation catchment.',
  },
  {
    id: 'pililla',
    name: 'Pililla (Windmill Heights)',
    shortName: 'Pililla',
    tag: 'Wind Corridor',
    lat: 14.4814,
    lng: 121.3354,
    elevation: '280m ASL',
    ecologicalRole: 'High-velocity wind corridor bridging Sierra Madre to Laguna de Bay.',
  },
  {
    id: 'rodriguez',
    name: 'Rodriguez / Montalban (Quarrying Hub)',
    shortName: 'Rodriguez',
    tag: 'Quarries',
    lat: 14.7333,
    lng: 121.1500,
    elevation: '120m ASL',
    ecologicalRole: 'Aggregates extraction corridor, Pamitinan Protected Landscape & Wawa Dam catchment.',
  },
  {
    id: 'san-mateo',
    name: 'San Mateo (Upper Marikina)',
    shortName: 'San Mateo',
    tag: 'Catchment',
    lat: 14.6972,
    lng: 121.1219,
    elevation: '45m ASL',
    ecologicalRole: 'Direct Marikina River basin floodplain and western mountain escarpment.',
  },
  {
    id: 'tanay',
    name: 'Tanay (Sierra Madre Uplands)',
    shortName: 'Tanay',
    tag: 'Watershed',
    lat: 14.4981,
    lng: 121.2858,
    elevation: '340m ASL',
    ecologicalRole: 'Vast forested watersheds, Kaliwa-Kanan headwaters, and indigenous domain buffer.',
  },
  {
    id: 'taytay',
    name: 'Taytay (Lakeshore Wetlands)',
    shortName: 'Taytay',
    tag: 'Wetlands',
    lat: 14.5667,
    lng: 121.1333,
    elevation: '16m ASL',
    ecologicalRole: 'Northern Laguna de Bay shoreland, Manggahan Floodway spillway, and municipal mangrove reforestation nursery.',
  },
  {
    id: 'teresa',
    name: 'Teresa (Limestone Basin)',
    shortName: 'Teresa',
    tag: 'Mineral',
    lat: 14.5606,
    lng: 121.2089,
    elevation: '85m ASL',
    ecologicalRole: 'Limestone crushing basin and Teresa river tributary system.',
  },
];

// WMO Weather interpretation table (codes 0 - 99)
export function getWeatherInterpretation(code: number): { label: string; iconType: 'sun' | 'cloud-sun' | 'cloud' | 'cloud-rain' | 'cloud-lightning' | 'cloud-fog' } {
  if (code === 0) return { label: 'Clear Sky', iconType: 'sun' };
  if (code === 1) return { label: 'Mainly Clear', iconType: 'sun' };
  if (code === 2) return { label: 'Partly Cloudy', iconType: 'cloud-sun' };
  if (code === 3) return { label: 'Overcast', iconType: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Fog & Mist', iconType: 'cloud-fog' };
  if (code === 51) return { label: 'Light Drizzle', iconType: 'cloud-rain' };
  if (code === 53) return { label: 'Moderate Drizzle', iconType: 'cloud-rain' };
  if (code === 55) return { label: 'Dense Drizzle', iconType: 'cloud-rain' };
  if (code === 56 || code === 57) return { label: 'Freezing Drizzle', iconType: 'cloud-rain' };
  if (code === 61) return { label: 'Slight Rain', iconType: 'cloud-rain' };
  if (code === 63) return { label: 'Moderate Rain', iconType: 'cloud-rain' };
  if (code === 65) return { label: 'Heavy Rain', iconType: 'cloud-rain' };
  if (code === 80) return { label: 'Passing Showers', iconType: 'cloud-rain' };
  if (code === 81) return { label: 'Moderate Showers', iconType: 'cloud-rain' };
  if (code === 82) return { label: 'Violent Showers', iconType: 'cloud-rain' };
  if (code === 95) return { label: 'Thunderstorm', iconType: 'cloud-lightning' };
  if (code >= 96) return { label: 'Severe Thunderstorm', iconType: 'cloud-lightning' };
  return { label: 'Cloudy', iconType: 'cloud' };
}

// Convert wind direction degrees to 16-point compass
export function getWindCompass(degrees: number): string {
  if (typeof degrees !== 'number' || isNaN(degrees)) return 'N';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

export interface WindTrajectory {
  fromBearing: number | null;
  fromCompass: string;
  toBearing: number | null;
  toCompass: string;
  rotationForArrow: number | null;
  isCalm: boolean;
  summary: string;
}

/**
 * Calculates meteorological wind origin and downwind dispersion trajectory.
 * Standard meteorology reports the direction FROM which wind blows.
 * An arrow indicating smoke or air movement must point TOWARD the downwind vector (bearing + 180°).
 * If wind speed is calm (< 1 km/h), wind direction is physically indeterminate (WMO standard).
 */
export function getWindFlowTrajectory(fromDegrees: number, speedKmH: number = 1): WindTrajectory {
  const isCalm = typeof speedKmH === 'number' && speedKmH < 1;
  if (isCalm) {
    return {
      fromBearing: null,
      fromCompass: 'Calm',
      toBearing: null,
      toCompass: 'Calm',
      rotationForArrow: null,
      isCalm: true,
      summary: 'Calm (< 1 km/h) — No prevailing wind direction',
    };
  }

  const from = ((fromDegrees % 360) + 360) % 360;
  const to = (from + 180) % 360;
  const fromCompass = getWindCompass(from);
  const toCompass = getWindCompass(to);

  return {
    fromBearing: Math.round(from),
    fromCompass,
    toBearing: Math.round(to),
    toCompass,
    rotationForArrow: Math.round(to),
    isCalm: false,
    summary: `From ${fromCompass} (${Math.round(from)}°) blowing toward ${toCompass} (${Math.round(to)}°)`,
  };
}

export interface AqiMetaResult {
  label: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Hazardous';
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentColor: string;
  bgColor: string;
  borderColor: string;
  description: string;
  healthSummary: string;
  denrStatus: string;
  dominantPollutant: 'PM2.5 (Fine Particulates)' | 'PM10 (Coarse Particulates)' | 'None (Baseline)';
}

// EAQI Label and Color helper aligned with European CAMS & Philippine EMB Clean Air Act standards
export function getAqiMeta(
  europeanAqi: number,
  pm25: number,
  pm10?: number
): AqiMetaResult {
  const p10 = pm10 ?? 0;
  const pm25Ratio = pm25 / 35; // DAO 2020-14 24-hr threshold: 35 ug/m3
  const pm10Ratio = p10 / 150; // DAO 2020-14 24-hr threshold: 150 ug/m3

  let dominantPollutant: 'PM2.5 (Fine Particulates)' | 'PM10 (Coarse Particulates)' | 'None (Baseline)' = 'None (Baseline)';
  if (pm25Ratio > 0.25 || pm10Ratio > 0.25) {
    dominantPollutant = pm25Ratio >= pm10Ratio ? 'PM2.5 (Fine Particulates)' : 'PM10 (Coarse Particulates)';
  }

  let denrStatus = `Within 24-hr Guideline (PM2.5: ${pm25}/35, PM10: ${p10}/150 μg/m³)`;
  if (pm25 > 35 || p10 > 150) {
    denrStatus = `Exceeds 24-hr Guideline (PM2.5: ${pm25}/35, PM10: ${p10}/150 μg/m³)`;
  } else if (pm25 > 25 || p10 > 100) {
    denrStatus = `Approaching 24-hr Guideline (PM2.5: ${pm25}/35, PM10: ${p10}/150 μg/m³)`;
  }

  // European Air Quality Index (EAQI) standard tiers strictly derived from index value:
  // Tier 6: Hazardous / Acute Advisory (> 100)
  if (europeanAqi > 100) {
    return {
      label: 'Hazardous',
      badgeBg: 'bg-purple-50 dark:bg-purple-950/60',
      badgeText: 'text-purple-700 dark:text-purple-300',
      badgeBorder: 'border-purple-300 dark:border-purple-800',
      accentColor: '#9333ea',
      bgColor: '#f3e8ff',
      borderColor: '#d8b4fe',
      description: `Ambient European Air Quality Index (${europeanAqi}) is in the acute advisory tier. Measured concentrations: ${pm25} μg/m³ PM2.5, ${p10} μg/m³ PM10.`,
      healthSummary: 'Air quality index exceeds acute health advisory levels. All populations advised to reduce prolonged outdoor physical exertion.',
      denrStatus,
      dominantPollutant,
    };
  }

  // Tier 5: Very Poor (81 - 100)
  if (europeanAqi > 80) {
    return {
      label: 'Very Poor',
      badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
      badgeText: 'text-rose-700 dark:text-rose-300',
      badgeBorder: 'border-rose-300 dark:border-rose-800',
      accentColor: '#e11d48',
      bgColor: '#ffe4e6',
      borderColor: '#fecdd3',
      description: `Elevated ambient air pollution index (${europeanAqi}). Measured concentrations: ${pm25} μg/m³ PM2.5, ${p10} μg/m³ PM10.`,
      healthSummary: 'Air quality significantly degraded. Sensitive individuals (respiratory or cardiac conditions) advised to avoid strenuous outdoor activity.',
      denrStatus,
      dominantPollutant,
    };
  }

  // Tier 4: Poor (61 - 80)
  if (europeanAqi > 60) {
    return {
      label: 'Poor',
      badgeBg: 'bg-orange-50 dark:bg-orange-950/60',
      badgeText: 'text-orange-700 dark:text-orange-300',
      badgeBorder: 'border-orange-300 dark:border-orange-800',
      accentColor: '#f97316',
      bgColor: '#ffedd5',
      borderColor: '#fed7aa',
      description: `Moderately elevated ambient air pollution index (${europeanAqi}). Measured concentrations: ${pm25} μg/m³ PM2.5, ${p10} μg/m³ PM10.`,
      healthSummary: 'Air quality moderately degraded. Sensitive groups may experience mild respiratory discomfort.',
      denrStatus,
      dominantPollutant,
    };
  }

  // Tier 3: Moderate (41 - 60)
  if (europeanAqi > 40) {
    return {
      label: 'Moderate',
      badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
      badgeText: 'text-amber-700 dark:text-amber-300',
      badgeBorder: 'border-amber-300 dark:border-amber-800',
      accentColor: '#f59e0b',
      bgColor: '#fef3c7',
      borderColor: '#fde68a',
      description: `Typical ambient background particulate concentration (${pm25} μg/m³ PM2.5, ${p10} μg/m³ PM10). Within Philippine 24-hour guidelines.`,
      healthSummary: 'Air quality acceptable for normal outdoor activity.',
      denrStatus,
      dominantPollutant,
    };
  }

  // Tier 2: Fair (21 - 40)
  if (europeanAqi > 20) {
    return {
      label: 'Fair',
      badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
      badgeText: 'text-teal-700 dark:text-teal-300',
      badgeBorder: 'border-teal-300 dark:border-teal-800',
      accentColor: '#0d9488',
      bgColor: '#ccfbf1',
      borderColor: '#99f6e4',
      description: `Good-to-fair ambient atmospheric column (${pm25} μg/m³ PM2.5, ${p10} μg/m³ PM10). Within normal provincial baseline.`,
      healthSummary: 'Air quality is fair and within normal provincial baseline.',
      denrStatus,
      dominantPollutant,
    };
  }

  // Tier 1: Good (0 - 20)
  return {
    label: 'Good',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-300 dark:border-emerald-800',
    accentColor: '#059669',
    bgColor: '#d1fae5',
    borderColor: '#a7f3d0',
    description: `Pristine ambient atmospheric quality (${pm25} μg/m³ PM2.5, ${p10} μg/m³ PM10). Minimal airborne particulate burden.`,
    healthSummary: 'Air quality is optimal. No health impacts expected.',
    denrStatus,
    dominantPollutant,
  };
}

export interface EmpiricalMeteorologicalIndices {
  heatIndex: {
    category: 'Normal' | 'Caution' | 'Extreme Caution' | 'Danger' | 'Extreme Danger';
    value: number; // in °C
    pagasaGuideline: string;
    dataLimitation: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  };
  rainfallIntensity: {
    category: 'Dry / Nil' | 'Light Rain' | 'Moderate Rain' | 'Heavy Rain (Yellow Alert)' | 'Intense Rain (Orange Alert)' | 'Torrential Rain (Red Alert)';
    rate: number; // in mm/h
    classification: string;
    dataLimitation: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  };
  windKineticForce: {
    category: 'Calm / Light Air' | 'Light / Gentle Breeze' | 'Moderate Breeze' | 'Fresh Breeze' | 'Strong Breeze' | 'High Wind / Gale';
    speed: number; // in km/h
    gusts: number | null; // in km/h
    beaufortDescription: string;
    dataLimitation: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  };
  dataSufficiency: {
    observationScope: string;
    forecastStatus: string;
    groundEventLimitation: string;
  };
}

/**
 * Computes strictly empirical meteorological and biometeorological classifications
 * derived directly from numbers without unverified assumptions.
 * Adheres to official PAGASA heat/rainfall thresholds and WMO Beaufort wind scales.
 */
export function computeEmpiricalWeatherIndices(
  weather: LiveWeatherConditions,
  _aqi?: LiveAirQualityConditions
): EmpiricalMeteorologicalIndices {
  // 1. PAGASA Heat Index (apparent temperature)
  const hi = weather.apparentTemperature;
  let heatCategory: EmpiricalMeteorologicalIndices['heatIndex']['category'] = 'Normal';
  let pagasaGuideline = 'PAGASA: Normal physiological thermal range. Minimal outdoor stress.';
  let heatBadgeBg = 'bg-emerald-50 dark:bg-emerald-950/60';
  let heatBadgeText = 'text-emerald-700 dark:text-emerald-300';
  let heatBadgeBorder = 'border-emerald-200 dark:border-emerald-800';

  if (hi >= 52) {
    heatCategory = 'Extreme Danger';
    pagasaGuideline = 'PAGASA: Heat stroke is imminent. Cessation of non-emergency outdoor exposure advised.';
    heatBadgeBg = 'bg-purple-50 dark:bg-purple-950/60';
    heatBadgeText = 'text-purple-700 dark:text-purple-300';
    heatBadgeBorder = 'border-purple-200 dark:border-purple-800';
  } else if (hi >= 42) {
    heatCategory = 'Danger';
    pagasaGuideline = 'PAGASA: Heat cramps and exhaustion likely; heat stroke probable with continued physical activity.';
    heatBadgeBg = 'bg-rose-50 dark:bg-rose-950/60';
    heatBadgeText = 'text-rose-700 dark:text-rose-300';
    heatBadgeBorder = 'border-rose-200 dark:border-rose-800';
  } else if (hi >= 33) {
    heatCategory = 'Extreme Caution';
    pagasaGuideline = 'PAGASA: Heat cramps and exhaustion possible with prolonged exposure or physical exertion.';
    heatBadgeBg = 'bg-amber-50 dark:bg-amber-950/60';
    heatBadgeText = 'text-amber-700 dark:text-amber-300';
    heatBadgeBorder = 'border-amber-200 dark:border-amber-800';
  } else if (hi >= 27) {
    heatCategory = 'Caution';
    pagasaGuideline = 'PAGASA: Fatigue possible with prolonged exposure and activity.';
    heatBadgeBg = 'bg-yellow-50 dark:bg-yellow-950/60';
    heatBadgeText = 'text-yellow-700 dark:text-yellow-300';
    heatBadgeBorder = 'border-yellow-200 dark:border-yellow-800';
  }

  // 2. Precipitation Rate & Official PAGASA Advisory Threshold
  const effectiveRain = Math.max(weather.precipitation, weather.rain);
  let rainCategory: EmpiricalMeteorologicalIndices['rainfallIntensity']['category'] = 'Dry / Nil';
  let rainClassification = '0.0 mm/h recorded. No active atmospheric rainfall detected.';
  let rainBadgeBg = 'bg-stone-50 dark:bg-stone-800/80';
  let rainBadgeText = 'text-stone-600 dark:text-stone-300';
  let rainBadgeBorder = 'border-stone-200 dark:border-stone-700';

  if (effectiveRain >= 30.0) {
    rainCategory = 'Torrential Rain (Red Alert)';
    rainClassification = `Exceeds PAGASA Red Warning threshold (≥ 30.0 mm/h). Rate measured: ${effectiveRain} mm/h.`;
    rainBadgeBg = 'bg-rose-50 dark:bg-rose-950/60';
    rainBadgeText = 'text-rose-700 dark:text-rose-300';
    rainBadgeBorder = 'border-rose-200 dark:border-rose-800';
  } else if (effectiveRain >= 15.0) {
    rainCategory = 'Intense Rain (Orange Alert)';
    rainClassification = `Exceeds PAGASA Orange Warning threshold (15.0 – 29.9 mm/h). Rate measured: ${effectiveRain} mm/h.`;
    rainBadgeBg = 'bg-orange-50 dark:bg-orange-950/60';
    rainBadgeText = 'text-orange-700 dark:text-orange-300';
    rainBadgeBorder = 'border-orange-200 dark:border-orange-800';
  } else if (effectiveRain >= 7.5) {
    rainCategory = 'Heavy Rain (Yellow Alert)';
    rainClassification = `Exceeds PAGASA Yellow Warning threshold (7.5 – 14.9 mm/h). Rate measured: ${effectiveRain} mm/h.`;
    rainBadgeBg = 'bg-amber-50 dark:bg-amber-950/60';
    rainBadgeText = 'text-amber-700 dark:text-amber-300';
    rainBadgeBorder = 'border-amber-200 dark:border-amber-800';
  } else if (effectiveRain >= 2.5) {
    rainCategory = 'Moderate Rain';
    rainClassification = `Moderate rainfall measured (${effectiveRain} mm/h). Below official advisory thresholds.`;
    rainBadgeBg = 'bg-blue-50 dark:bg-blue-950/60';
    rainBadgeText = 'text-blue-700 dark:text-blue-300';
    rainBadgeBorder = 'border-blue-200 dark:border-blue-800';
  } else if (effectiveRain > 0) {
    rainCategory = 'Light Rain';
    rainClassification = `Light precipitation measured (${effectiveRain} mm/h). Normal wetting rate.`;
    rainBadgeBg = 'bg-sky-50 dark:bg-sky-950/60';
    rainBadgeText = 'text-sky-700 dark:text-sky-300';
    rainBadgeBorder = 'border-sky-200 dark:border-sky-800';
  }

  // 3. WMO Beaufort Wind Force
  const ws = weather.windSpeed;
  let windCategory: EmpiricalMeteorologicalIndices['windKineticForce']['category'] = 'Calm / Light Air';
  let beaufortDesc = ws < 1
    ? 'WMO Beaufort 0 (Calm): Smoke rises vertically; prevailing wind direction is physically indeterminate.'
    : 'WMO Beaufort 1 (Light Air): Direction shown by smoke drift; wind vanes unaffected (1–5 km/h).';
  let windBadgeBg = 'bg-stone-50 dark:bg-stone-800/80';
  let windBadgeText = 'text-stone-600 dark:text-stone-300';
  let windBadgeBorder = 'border-stone-200 dark:border-stone-700';

  if (ws >= 50) {
    windCategory = 'High Wind / Gale';
    beaufortDesc = 'WMO Beaufort 7+: Whole trees in motion; walking resistance felt against wind.';
    windBadgeBg = 'bg-rose-50 dark:bg-rose-950/60';
    windBadgeText = 'text-rose-700 dark:text-rose-300';
    windBadgeBorder = 'border-rose-200 dark:border-rose-800';
  } else if (ws >= 39) {
    windCategory = 'Strong Breeze';
    beaufortDesc = 'WMO Beaufort 6: Large tree branches in motion; umbrellas used with difficulty.';
    windBadgeBg = 'bg-orange-50 dark:bg-orange-950/60';
    windBadgeText = 'text-orange-700 dark:text-orange-300';
    windBadgeBorder = 'border-orange-200 dark:border-orange-800';
  } else if (ws >= 29) {
    windCategory = 'Fresh Breeze';
    beaufortDesc = 'WMO Beaufort 5: Small trees in leaf begin to sway; crested wavelets on lakes.';
    windBadgeBg = 'bg-amber-50 dark:bg-amber-950/60';
    windBadgeText = 'text-amber-700 dark:text-amber-300';
    windBadgeBorder = 'border-amber-200 dark:border-amber-800';
  } else if (ws >= 20) {
    windCategory = 'Moderate Breeze';
    beaufortDesc = 'WMO Beaufort 4: Dust and loose paper raised; small branches moved.';
    windBadgeBg = 'bg-teal-50 dark:bg-teal-950/60';
    windBadgeText = 'text-teal-700 dark:text-teal-300';
    windBadgeBorder = 'border-teal-200 dark:border-teal-800';
  } else if (ws >= 6) {
    windCategory = 'Light / Gentle Breeze';
    beaufortDesc = 'WMO Beaufort 2–3: Wind felt on face; leaves rustle; vanes moved by wind.';
    windBadgeBg = 'bg-emerald-50 dark:bg-emerald-950/60';
    windBadgeText = 'text-emerald-700 dark:text-emerald-300';
    windBadgeBorder = 'border-emerald-200 dark:border-emerald-800';
  }

  return {
    heatIndex: {
      category: heatCategory,
      value: hi,
      pagasaGuideline,
      dataLimitation: `Calculated from ambient temperature (${weather.temperature}°C) and relative humidity (${weather.relativeHumidity}%). Ambient heat index measures human biometeorological thermal load. Does not measure ground fuel moisture, vegetation flammability, or fire ignition.`,
      badgeBg: heatBadgeBg,
      badgeText: heatBadgeText,
      badgeBorder: heatBadgeBorder,
    },
    rainfallIntensity: {
      category: rainCategory,
      rate: effectiveRain,
      classification: rainClassification,
      dataLimitation: 'Reflects hourly atmospheric precipitation rate. Ground siltation, river flooding, and slope stability cannot be concluded without local stream gauges and antecedent soil saturation history.',
      badgeBg: rainBadgeBg,
      badgeText: rainBadgeText,
      badgeBorder: rainBadgeBorder,
    },
    windKineticForce: {
      category: windCategory,
      speed: ws,
      gusts: weather.windGusts,
      beaufortDescription: beaufortDesc,
      dataLimitation: 'Horizontal kinetic wind velocity measured at 10m height. Ground-level particulate transport depends on micro-topography, surface roughness, and canopy obstruction.',
      badgeBg: windBadgeBg,
      badgeText: windBadgeText,
      badgeBorder: windBadgeBorder,
    },
    dataSufficiency: {
      observationScope: 'Current Timestamp Observation (Open-Meteo & European CAMS model)',
      forecastStatus: 'Current telemetry only. Multi-hour or multi-day forecasts not calculated without numerical prognostic model integration.',
      groundEventLimitation: 'Data Boundary: Ambient weather readings cannot conclude ground events (active wildfires, quarry dust emissions, or landslide collapse). Telemetry provides atmospheric context only.',
    },
  };
}

// Backwards-compatible alias for existing call sites
export const evaluateEnforcementRisks = computeEmpiricalWeatherIndices;

// In-memory cache with 10-minute TTL to keep UI snappy and prevent rate limits
const cache = new Map<string, { data: FullAtmosphericData; expiresAt: number }>();

export async function fetchFullAtmosphericTelemetry(
  lat: number,
  lng: number,
  locationName: string = 'Rizal Province'
): Promise<FullAtmosphericData | null> {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ...cached.data, locationName };
  }

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=Asia%2FManila`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust&timezone=Asia%2FManila`;

    const [weatherRes, aqiRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(aqiUrl),
    ]);

    if (!weatherRes.ok || !aqiRes.ok) {
      console.warn(`[Open-Meteo] HTTP error: Weather=${weatherRes.status}, AQI=${aqiRes.status}`);
      return null;
    }

    const [weatherData, aqiData] = await Promise.all([
      weatherRes.json(),
      aqiRes.json(),
    ]);

    const curW = weatherData?.current;
    const curA = aqiData?.current;
    if (!curW || !curA) return null;

    const weatherCode = Number(curW.weather_code || 0);
    const windDirection = Number(curW.wind_direction_10m || 0);
    const pm2_5 = Math.round(Number(curA.pm2_5 || 0) * 10) / 10;
    const pm10 = Math.round(Number(curA.pm10 || 0) * 10) / 10;
    const europeanAqi = Math.round(Number(curA.european_aqi || 0));
    const usAqi = Math.round(Number(curA.us_aqi || 0));

    const aqiMeta = getAqiMeta(europeanAqi, pm2_5, pm10);

    const weatherConditions: LiveWeatherConditions = {
      temperature: Math.round(Number(curW.temperature_2m || 0) * 10) / 10,
      apparentTemperature: Math.round(Number(curW.apparent_temperature || 0) * 10) / 10,
      relativeHumidity: Math.round(Number(curW.relative_humidity_2m || 0)),
      precipitation: Math.round(Number(curW.precipitation || 0) * 10) / 10,
      rain: Math.round(Number(curW.rain || 0) * 10) / 10,
      weatherCode,
      weatherDescription: getWeatherInterpretation(weatherCode).label,
      cloudCover: Math.round(Number(curW.cloud_cover || 0)),
      windSpeed: Math.round(Number(curW.wind_speed_10m || 0) * 10) / 10,
      windDirection,
      windDirectionCompass: getWindCompass(windDirection),
      windGusts: typeof curW.wind_gusts_10m === 'number' ? Math.round(Number(curW.wind_gusts_10m) * 10) / 10 : null,
      time: curW.time || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    };

    const airQualityConditions: LiveAirQualityConditions = {
      europeanAqi,
      usAqi,
      aqiLabel: aqiMeta.label,
      dominantPollutant: aqiMeta.dominantPollutant,
      pm2_5,
      pm10,
      carbonMonoxide: typeof curA.carbon_monoxide === 'number' ? Math.round(curA.carbon_monoxide) : null,
      nitrogenDioxide: typeof curA.nitrogen_dioxide === 'number' ? Math.round(curA.nitrogen_dioxide * 10) / 10 : null,
      sulphurDioxide: typeof curA.sulphur_dioxide === 'number' ? Math.round(curA.sulphur_dioxide * 10) / 10 : null,
      ozone: typeof curA.ozone === 'number' ? Math.round(curA.ozone) : null,
      dust: typeof curA.dust === 'number' ? Math.round(curA.dust * 10) / 10 : null,
      time: curA.time || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    };

    const result: FullAtmosphericData = {
      weather: weatherConditions,
      airQuality: airQualityConditions,
      locationName,
      lat,
      lng,
    };

    // Cache for 10 minutes (600,000 ms)
    cache.set(cacheKey, { data: result, expiresAt: now + 10 * 60 * 1000 });
    return result;
  } catch (err) {
    console.warn('[Open-Meteo] Live atmospheric fetch failed:', err);
    return null;
  }
}

/**
 * Fetch live atmospheric telemetry for all Rizal Municipalities concurrently
 */
export async function fetchAllRizalLgusTelemetry(): Promise<Record<string, FullAtmosphericData>> {
  const promises = RIZAL_LGU_PRESETS.filter((p) => p.id !== 'rizal-center').map(async (preset) => {
    const data = await fetchFullAtmosphericTelemetry(preset.lat, preset.lng, preset.name);
    return { id: preset.id, data };
  });

  const results = await Promise.all(promises);
  const map: Record<string, FullAtmosphericData> = {};
  for (const item of results) {
    if (item.data) {
      map[item.id] = item.data;
    }
  }
  return map;
}

