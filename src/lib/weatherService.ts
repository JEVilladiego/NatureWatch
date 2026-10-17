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
  aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor';
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
    name: 'Rizal Province (Central)',
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
    lat: 14.5873,
    lng: 121.1758,
    elevation: '210m ASL',
    ecologicalRole: 'Mountain capital, Hinulugang Taktak Protected Landscape & eastern ridge crest.',
  },
  {
    id: 'tanay',
    name: 'Tanay (Sierra Madre Uplands)',
    shortName: 'Tanay',
    tag: 'Watershed',
    lat: 14.4983,
    lng: 121.2847,
    elevation: '340m ASL',
    ecologicalRole: 'Vast forested watersheds, Kaliwa-Kanan headwaters, and indigenous domain buffer.',
  },
  {
    id: 'rodriguez',
    name: 'Rodriguez / Montalban (Quarrying Hub)',
    shortName: 'Rodriguez',
    tag: 'Quarries',
    lat: 14.7170,
    lng: 121.1444,
    elevation: '120m ASL',
    ecologicalRole: 'Aggregates extraction corridor, Pamitinan Protected Landscape & Wawa Dam catchment.',
  },
  {
    id: 'san-mateo',
    name: 'San Mateo (Upper Marikina)',
    shortName: 'San Mateo',
    tag: 'Catchment',
    lat: 14.6967,
    lng: 121.1219,
    elevation: '45m ASL',
    ecologicalRole: 'Direct Marikina River basin floodplain and western mountain escarpment.',
  },
  {
    id: 'baras',
    name: 'Baras (Masungi Corridor)',
    shortName: 'Baras',
    tag: 'Karst Buffer',
    lat: 14.5167,
    lng: 121.2667,
    elevation: '150m ASL',
    ecologicalRole: 'Masungi Georeserve karst limestone spine and reforestation corridor.',
  },
  {
    id: 'binangonan',
    name: 'Binangonan (Laguna de Bay)',
    shortName: 'Binangonan',
    tag: 'Lakeside',
    lat: 14.4644,
    lng: 121.1925,
    elevation: '15m ASL',
    ecologicalRole: 'Laguna de Bay aquatic shoreland buffer zone and Talim Island aquatic nursery.',
  },
  {
    id: 'teresa',
    name: 'Teresa (Limestone Basin)',
    shortName: 'Teresa',
    tag: 'Mineral',
    lat: 14.5600,
    lng: 121.2100,
    elevation: '85m ASL',
    ecologicalRole: 'Limestone crushing basin and Teresa river tributary system.',
  },
  {
    id: 'pililla',
    name: 'Pililla (Windmill Heights)',
    shortName: 'Pililla',
    tag: 'Wind Corridor',
    lat: 14.4833,
    lng: 121.3000,
    elevation: '280m ASL',
    ecologicalRole: 'High-velocity wind corridor bridging Sierra Madre to Laguna de Bay.',
  },
  {
    id: 'angono',
    name: 'Angono (Bay Cultural Zone)',
    shortName: 'Angono',
    tag: 'Bay Corridor',
    lat: 14.5250,
    lng: 121.1550,
    elevation: '20m ASL',
    ecologicalRole: 'Angono Petroglyphs rock shelter buffer and northern lake shoreland.',
  },
];

// WMO Weather interpretation table (codes 0 - 99)
export function getWeatherInterpretation(code: number): { label: string; iconType: 'sun' | 'cloud-sun' | 'cloud' | 'cloud-rain' | 'cloud-lightning' | 'cloud-fog' } {
  if (code === 0) return { label: 'Clear Sky', iconType: 'sun' };
  if (code === 1) return { label: 'Mainly Clear', iconType: 'sun' };
  if (code === 2) return { label: 'Partly Cloudy', iconType: 'cloud-sun' };
  if (code === 3) return { label: 'Overcast', iconType: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Fog & Mist', iconType: 'cloud-fog' };
  if (code >= 51 && code <= 55) return { label: 'Light Drizzle', iconType: 'cloud-rain' };
  if (code >= 61 && code <= 65) return { label: 'Rain Showers', iconType: 'cloud-rain' };
  if (code >= 80 && code <= 82) return { label: 'Torrential Rain', iconType: 'cloud-rain' };
  if (code >= 95) return { label: 'Thunderstorm', iconType: 'cloud-lightning' };
  return { label: 'Cloudy', iconType: 'cloud' };
}

// Convert wind direction degrees to 16-point compass
export function getWindCompass(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

// EAQI Label and Color helper
export function getAqiMeta(europeanAqi: number, pm25: number): {
  label: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor';
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentColor: string;
  description: string;
} {
  if (europeanAqi > 80 || pm25 > 50) {
    return {
      label: 'Very Poor',
      badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
      badgeText: 'text-rose-700 dark:text-rose-300',
      badgeBorder: 'border-rose-300 dark:border-rose-800',
      accentColor: '#e11d48',
      description: 'Heavy atmospheric particulate burden. Respiratory hazard for sensitive groups.',
    };
  }
  if (europeanAqi > 60 || pm25 > 35) {
    return {
      label: 'Poor',
      badgeBg: 'bg-orange-50 dark:bg-orange-950/60',
      badgeText: 'text-orange-700 dark:text-orange-300',
      badgeBorder: 'border-orange-300 dark:border-orange-800',
      accentColor: '#f97316',
      description: 'Elevated airborne particulate concentrations. Visible haze and smoke.',
    };
  }
  if (europeanAqi > 40 || pm25 > 20) {
    return {
      label: 'Moderate',
      badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
      badgeText: 'text-amber-700 dark:text-amber-300',
      badgeBorder: 'border-amber-300 dark:border-amber-800',
      accentColor: '#f59e0b',
      description: 'Acceptable air quality with mild particulate dispersion from road or mineral activity.',
    };
  }
  if (europeanAqi > 20 || pm25 > 10) {
    return {
      label: 'Fair',
      badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
      badgeText: 'text-teal-700 dark:text-teal-300',
      badgeBorder: 'border-teal-300 dark:border-teal-800',
      accentColor: '#0d9488',
      description: 'Clean atmospheric levels within normal provincial baseline parameters.',
    };
  }
  return {
    label: 'Good',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-300 dark:border-emerald-800',
    accentColor: '#059669',
    description: 'Optimal pristine mountain & lake air quality. Minimal pollution risk.',
  };
}

// Environmental enforcement risk assessment
export function evaluateEnforcementRisks(weather: LiveWeatherConditions, aqi: LiveAirQualityConditions) {
  // 1. Kaingin / Grassland Fire Spread Vulnerability
  let fireRisk: 'Low' | 'Moderate' | 'High' | 'Extreme' = 'Low';
  let fireDesc = 'Adequate atmospheric moisture and minimal thermal drying of forest fuels.';
  if (weather.temperature >= 32 && weather.relativeHumidity < 55 && weather.windSpeed > 15) {
    fireRisk = 'Extreme';
    fireDesc = 'Severe thermal dryness and gusty winds accelerate rapid kaingin wildfire runaway.';
  } else if (weather.temperature >= 30 && weather.relativeHumidity < 65) {
    fireRisk = 'High';
    fireDesc = 'Elevated ambient heat dries grassland undergrowth; heightened watch around watershed buffers.';
  } else if (weather.temperature >= 28) {
    fireRisk = 'Moderate';
    fireDesc = 'Normal seasonal drying; regular thermal monitoring advised.';
  }

  // 2. Quarry Dust & Particulate Dispersion
  let dustRisk: 'Low' | 'Moderate' | 'High' = 'Low';
  let dustDesc = 'Ground moisture dampens mineral dust from hauling roads and crushing mills.';
  if (weather.precipitation === 0 && weather.relativeHumidity < 65 && weather.windSpeed > 12) {
    dustRisk = 'High';
    dustDesc = 'Dry surface and crosswinds blow haulage dust into nearby communities. Enforce mandatory water-truck wetting.';
  } else if (weather.precipitation === 0 && aqi.pm10 > 25) {
    dustRisk = 'Moderate';
    dustDesc = 'Noticeable particulate elevation; inspect active extraction pit perimeters.';
  }

  // 3. Watershed Siltation / Runoff Risk
  let runoffRisk: 'Minimal' | 'Moderate' | 'High' | 'Critical' = 'Minimal';
  let runoffDesc = 'Dry riverbeds and low stream turbulence; no immediate flash siltation threat.';
  if (weather.precipitation >= 15 || weather.rain >= 15) {
    runoffCritical:
    runoffRisk = 'Critical';
    runoffDesc = 'Heavy torrential downpour triggers rapid sediment runoff from deforested quarry cuts into Marikina/Laguna.';
  } else if (weather.precipitation >= 5 || weather.rain >= 5) {
    runoffRisk = 'High';
    runoffDesc = 'Significant rainfall carrying surface mud and mine runoff into downstream water tables.';
  } else if (weather.precipitation > 0) {
    runoffRisk = 'Moderate';
    runoffDesc = 'Light rainfall dampening topsoil; minor drainage turbidity.';
  }

  return {
    fire: { risk: fireRisk, desc: fireDesc },
    dust: { risk: dustRisk, desc: dustDesc },
    runoff: { risk: runoffRisk, desc: runoffDesc },
  };
}

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

    const aqiMeta = getAqiMeta(europeanAqi, pm2_5);

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
