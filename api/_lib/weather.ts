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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m&timezone=Asia%2FManila`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[Open-Meteo] HTTP ${res.status}: ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const current = data?.current;
    if (!current) return null;

    return {
      temperature: Math.round(Number(current.temperature_2m) * 10) / 10,
      humidity: Math.round(Number(current.relative_humidity_2m)),
      precipitation: Math.round(Number(current.precipitation) * 10) / 10,
      windSpeed: Math.round(Number(current.wind_speed_10m) * 10) / 10,
      windGusts:
        typeof current.wind_gusts_10m === 'number'
          ? Math.round(Number(current.wind_gusts_10m) * 10) / 10
          : null,
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
  aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor';
  fetchedAt: string;
}

/**
 * Fetches real-time atmospheric particulate and air quality metrics from Open-Meteo Air Quality API.
 * Free, non-commercial API without requiring an API key.
 * Used to verify citizen reports of open burning, toxic smoke, and industrial emissions.
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

    let aqiLabel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' = 'Good';
    if (eaqi > 80 || pm25 > 50) aqiLabel = 'Very Poor';
    else if (eaqi > 60 || pm25 > 35) aqiLabel = 'Poor';
    else if (eaqi > 40 || pm25 > 20) aqiLabel = 'Moderate';
    else if (eaqi > 20 || pm25 > 10) aqiLabel = 'Fair';

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
