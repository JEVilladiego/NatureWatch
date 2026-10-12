import { route, rateLimit, HttpError } from './_lib/admin.js';
import { triageReport } from './_lib/triage.js';

/**
 * POST /api/triage  { reportId }
 * Called by the resident's client after the report is saved. It only ever reads the
 * description/image from Firestore (never from the request) and only triages reports
 * that are still pending, so it cannot be used as a free Gemini proxy.
 */
export const config = { maxDuration: 60 };

export default route('POST', async (req, res) => {
  rateLimit(req, 20);
  const reportId = req.body?.reportId;
  if (typeof reportId !== 'string' || !reportId) throw new HttpError(400, 'Missing reportId.');

  const outcome = await triageReport(reportId);
  return res.json({ reportId, triageStatus: outcome });
});
