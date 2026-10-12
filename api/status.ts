import { route, rateLimit, getDb, HttpError } from './_lib/admin.js';

/**
 * GET /api/status?code=BK-XXXXX
 * Public lookup. Returns only municipal action status: no photo, no coordinates,
 * no official identities (RA 10173).
 */
export default route('GET', async (req, res) => {
  rateLimit(req, 30);

  const code = String(req.query.code || '').trim().toUpperCase();
  if (!/^BK-[A-Z0-9]{5}$/.test(code)) throw new HttpError(400, 'Invalid reference code format.');

  const snap = await getDb().collection('reports').where('referenceCode', '==', code).limit(1).get();
  if (snap.empty) throw new HttpError(404, 'Reference code not found');

  const r = snap.docs[0].data();
  const createdAt = r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : r.createdAt;

  return res.json({
    referenceCode: r.referenceCode,
    status: r.status,
    createdAt,
    municipality: r.location?.municipality || 'Rizal Province',
    barangay: r.location?.barangay || '',
    triageStatus: r.triageStatus,
    finalCategory: r.final?.category || r.aiTriage?.category || 'Under evaluation',
    statusHistory: (r.statusHistory || []).map((h: any) => ({
      status: h.status,
      changedBy: h.changedBy === 'resident' ? 'resident' : 'PG-ENRO / MENRO',
      changedAt: h.changedAt,
      notes: h.notes,
    })),
  });
});
