/**
 * NatureWatch Live Doppler Weather Radar Service
 * Powered by RainViewer's Free & Open-Source Weather Maps API.
 * Provides public Doppler precipitation radar tile paths for Leaflet without any API keys.
 */

export interface RadarFrameInfo {
  tileUrl: string;
  timestamp: number;
  formattedTime: string;
  host: string;
  path: string;
}

let cachedFrame: { data: RadarFrameInfo; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Format unix timestamp to human-friendly local time string (e.g., "3:10 PM")
 */
export function formatRadarTime(unixSeconds: number): string {
  try {
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Recent';
  }
}

/**
 * Fetches the latest precipitation radar frame metadata from RainViewer
 */
export async function fetchLatestRadarFrame(): Promise<RadarFrameInfo | null> {
  const now = Date.now();
  if (cachedFrame && cachedFrame.expiresAt > now) {
    return cachedFrame.data;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[RainViewer] HTTP ${res.status} received`);
      return null;
    }

    const data = await res.json();
    const host: string = data.host || 'https://tilecache.rainviewer.com';
    const pastFrames: Array<{ time: number; path: string }> = data.radar?.past || [];

    if (!pastFrames.length) {
      console.warn('[RainViewer] No past radar frames found in response');
      return null;
    }

    const latest = pastFrames[pastFrames.length - 1];
    // RainViewer Tile URL format: {host}{path}/{size}/{z}/{x}/{y}/{colorScheme}/{smooth}_{snow}.png
    // Color scheme 2: Universal Rainbow (green=light, yellow=moderate, red/magenta=severe)
    // 1_1: smooth=1, snow=1
    const tileUrl = `${host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;

    const frameInfo: RadarFrameInfo = {
      tileUrl,
      timestamp: latest.time,
      formattedTime: formatRadarTime(latest.time),
      host,
      path: latest.path,
    };

    cachedFrame = {
      data: frameInfo,
      expiresAt: now + CACHE_TTL_MS,
    };

    return frameInfo;
  } catch (err: any) {
    console.warn('[RainViewer] Failed to fetch radar metadata:', err?.message || err);
    return null;
  }
}
