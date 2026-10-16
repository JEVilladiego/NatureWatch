import { route, HttpError } from './_lib/admin.js';
import { ingestFirmsHotspots } from './_lib/firms.js';

export const config = { maxDuration: 60 };

/**
 * Scheduled Vercel Cron endpoint: sweeps NASA FIRMS thermal anomaly feeds every 6 hours.
 * Automatically generates SAT-XXXXX tickets in Firestore for backcountry forest fires.
 * Protected by CRON_SECRET (Vercel sends Bearer token automatically).
 */
export default route('GET', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    throw new HttpError(401, 'Unauthorized');
  }

  const result = await ingestFirmsHotspots(2);
  return res.json(result);
});
