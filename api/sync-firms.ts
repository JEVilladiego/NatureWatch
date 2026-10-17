import { route } from './_lib/admin.js';
import { ingestFirmsHotspots } from './_lib/firms.js';

export const config = { maxDuration: 60 };

/**
 * On-demand satellite synchronization endpoint called by PG-ENRO officers from the dashboard.
 * Queries NASA FIRMS VIIRS sensor for thermal anomalies across Rizal Province and ingests new incidents.
 */
export default route('POST', async (req, res) => {
  const dayRange = typeof req.body?.dayRange === 'number' ? req.body.dayRange : 3;
  const result = await ingestFirmsHotspots(dayRange);
  return res.json({
    ...result,
    created: result.ingestedCount,
    scanned: result.totalHotspotsDetected,
  });
});
