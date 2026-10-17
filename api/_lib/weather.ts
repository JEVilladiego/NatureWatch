import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

export interface WeatherSnapshot {
  temperature: number; // °C
  humidity: number; // %
  precipitation: number; // mm
  windSpeed: number; // km/h
  windGusts?: number | null; // km/h
  windDirection?: number | null; // degrees (0-360)
  windDirectionCompass?: string | null; // 16-point compass
  fetchedAt: string;
}

/**
 * Fetches real-time meteorological conditions from Open-Meteo for the incident coordinates.
 * Free, non-commercial API without requiring an API key.
 * Fails gracefully (returns null) on network timeouts or invalid coordinates so triage is never blocked.
 */
export async function fetchWeatherContext(lat: number, lng: number): Promise<WeatherSnapshot | null> {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=Asia%2FManila`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[Open-Meteo] HTTP ${res.status}: ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const current = data?.current;
    if (!current) return null;

    const windDir = typeof current.wind_direction_10m === 'number' ? Math.round(Number(current.wind_direction_10m)) : null;
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const windDirectionCompass = windDir !== null
      ? directions[Math.round((((windDir % 360) + 360) % 360) / 22.5) % 16]
      : null;

    return {
      temperature: Math.round(Number(current.temperature_2m) * 10) / 10,
      humidity: Math.round(Number(current.relative_humidity_2m)),
      precipitation: Math.round(Number(current.precipitation) * 10) / 10,
      windSpeed: Math.round(Number(current.wind_speed_10m) * 10) / 10,
      windGusts:
        typeof current.wind_gusts_10m === 'number'
          ? Math.round(Number(current.wind_gusts_10m) * 10) / 10
          : null,
      windDirection: windDir,
      windDirectionCompass,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[Open-Meteo] Request timed out after 2500ms');
    } else {
      console.warn('[Open-Meteo] Fetch failed:', err?.message || err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface AirQualitySnapshot {
  pm25: number;
  pm10: number;
  carbonMonoxide: number;
  europeanAqi: number;
  aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Hazardous';
  fetchedAt: string;
}

/**
 * Fetches real-time atmospheric particulate and air quality metrics from Open-Meteo Air Quality API.
 * Free, non-commercial API without requiring an API key.
 * Provides objective ambient atmospheric readings for incident locations.
 */
export async function fetchAirQualityContext(lat: number, lng: number): Promise<AirQualitySnapshot | null> {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=pm10,pm2_5,carbon_monoxide,european_aqi&timezone=Asia%2FManila`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[Open-Meteo AQI] HTTP ${res.status}: ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const current = data?.current;
    if (!current) return null;

    const pm25 = Math.round(Number(current.pm2_5 || 0) * 10) / 10;
    const pm10 = Math.round(Number(current.pm10 || 0) * 10) / 10;
    const co = Math.round(Number(current.carbon_monoxide || 0) * 10) / 10;
    const eaqi = Math.round(Number(current.european_aqi || 0));

    // Official European Environment Agency (EEA) standard EAQI index brackets:
    let aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Hazardous' = 'Good';
    if (eaqi > 100) aqiLabel = 'Hazardous';
    else if (eaqi > 80) aqiLabel = 'Very Poor';
    else if (eaqi > 60) aqiLabel = 'Poor';
    else if (eaqi > 40) aqiLabel = 'Moderate';
    else if (eaqi > 20) aqiLabel = 'Fair';

    return {
      pm25,
      pm10,
      carbonMonoxide: co,
      europeanAqi: eaqi,
      aqiLabel,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[Open-Meteo AQI] Request timed out after 2500ms');
    } else {
      console.warn('[Open-Meteo AQI] Fetch failed:', err?.message || err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
