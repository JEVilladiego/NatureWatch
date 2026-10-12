/**
 * Tracks report submissions whose Firestore write has not yet been acknowledged by the server.
 *
 * Firestore's persistent local cache already queues writes made while offline and replays
 * them when connectivity returns, so no separate IndexedDB queue is needed. This module
 * simply counts unacknowledged submissions (for the "pending sync" badge) and fires the
 * AI triage request once the server has confirmed the write.
 */

let pending = 0;
const listeners = new Set<(count: number) => void>();

function emit() {
  listeners.forEach((l) => l(pending));
}

export function onPendingSyncChange(listener: (count: number) => void): () => void {
  listeners.add(listener);
  listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

/** Request AI triage for a saved report. Failures are fine: officials can retry from the dashboard. */
export function requestTriage(reportId: string): void {
  fetch('/api/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId }),
  }).catch(() => {});
}

/**
 * Register a Firestore commit promise. Resolves when the server acknowledged the write,
 * which may be much later if the device is offline (as long as the tab stays open).
 */
export function trackSubmission(reportId: string, commit: Promise<void>): void {
  pending++;
  emit();
  commit
    .then(() => requestTriage(reportId))
    .catch((err) => console.error('Report write was rejected by Firestore:', err))
    .finally(() => {
      pending = Math.max(0, pending - 1);
      emit();
    });
}
