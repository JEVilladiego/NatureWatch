import { route, verifyOfficial, HttpError } from './_lib/admin.js';
import { triageReport } from './_lib/triage.js';

/** POST /api/retry-triage  { reportId }  (officials only) */
export const config = { maxDuration: 60 };

export default route('POST', async (req, res) => {
  await verifyOfficial(req);
  const reportId = req.body?.reportId;
  if (typeof reportId !== 'string' || !reportId) throw new HttpError(400, 'Missing reportId.');

  const outcome = await triageReport(reportId, { retryFailed: true });
  return res.json({ reportId, triageStatus: outcome });
});
