import { route, verifyOfficial, getDb, sendUrgentAlert, HttpError } from './_lib/admin.js';

/** POST /api/alert  { reportId }  (officials only). Reads report data from Firestore. */
export default route('POST', async (req, res) => {
  await verifyOfficial(req);
  const reportId = req.body?.reportId;
  if (typeof reportId !== 'string' || !reportId) throw new HttpError(400, 'Missing reportId.');

  const snap = await getDb().collection('reports').doc(reportId).get();
  if (!snap.exists) throw new HttpError(404, 'Report not found.');
  const r = snap.data()!;

  const severity = r.final?.severity || r.aiTriage?.severity || 4;
  const category = r.final?.category || r.aiTriage?.category || 'incident';
  const barangay = r.location?.barangay || 'Binangonan';

  const sent = await sendUrgentAlert({
    reportId,
    referenceCode: r.referenceCode,
    severity,
    category,
    summary: r.aiTriage?.summary || String(r.rawInput?.description || '').slice(0, 200),
    barangay,
  });

  return res.json({
    success: sent,
    message: sent
      ? `Alert sent for ${barangay}.`
      : 'Alert could not be sent. Check Firebase Cloud Messaging setup.',
  });
});
