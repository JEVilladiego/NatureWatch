import { route, getDb, HttpError } from './_lib/admin.js';
import { triageReport } from './_lib/triage.js';

/**
 * Daily Vercel Cron sweep: triages reports that were never triaged (e.g. the resident
 * closed the app before the client could call /api/triage).
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token automatically).
 */
export const config = { maxDuration: 60 };

export default route('GET', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    throw new HttpError(401, 'Unauthorized');
  }

  const snap = await getDb().collection('reports').where('triageStatus', '==', 'pending').limit(5).get();
  const results: Record<string, string> = {};
  for (const doc of snap.docs) {
    results[doc.id] = await triageReport(doc.id);
  }
  return res.json({ processed: results });
});
