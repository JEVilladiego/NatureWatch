/**
 * IndexedDB offline queue for images pending upload with exponential backoff
 */

import { ref, uploadBytes } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from './firebase';

export interface QueuedUpload {
  id: string; // Report ID
  imagePath: string;
  blob: Blob;
  mimeType: string;
  attempts: number;
  lastAttempt: number;
  addedAt: number;
}

const DB_NAME = 'bantay_kalikasan_queue';
const STORE_NAME = 'pending_uploads';

function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueImageUpload(reportId: string, imagePath: string, blob: Blob): Promise<void> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item: QueuedUpload = {
      id: reportId,
      imagePath,
      blob,
      mimeType: blob.type || 'image/jpeg',
      attempts: 0,
      lastAttempt: 0,
      addedAt: Date.now(),
    };
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingUploads(): Promise<QueuedUpload[]> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removePendingUpload(reportId: string): Promise<void> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(reportId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

let isSyncing = false;

/**
 * Process queued uploads with exponential backoff
 */
export async function processOfflineQueue(onProgress?: (remaining: number) => void): Promise<number> {
  if (isSyncing || !navigator.onLine) return 0;
  isSyncing = true;

  try {
    const items = await getPendingUploads();
    if (items.length === 0) {
      if (onProgress) onProgress(0);
      return 0;
    }

    const now = Date.now();
    let processed = 0;

    for (const item of items) {
      // Exponential backoff: 2s, 4s, 8s, 16s... up to max 60s
      const delay = Math.min(60000, Math.pow(2, item.attempts) * 2000);
      if (item.attempts > 0 && now - item.lastAttempt < delay) {
        continue;
      }

      try {
        const storageRef = ref(storage, item.imagePath);
        await uploadBytes(storageRef, item.blob, {
          contentType: item.mimeType,
        });

        // Update firestore doc to mark imageStatus as uploaded
        try {
          const reportRef = doc(db, 'reports', item.id);
          await updateDoc(reportRef, {
            'rawInput.imageStatus': 'uploaded',
          });
        } catch {
          // If Firestore offline, cache will sync later
        }

        // Trigger server-side triage webhook
        try {
          fetch('/api/triage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId: item.id }),
          }).catch(() => {});
        } catch {
          // Non-blocking
        }

        await removePendingUpload(item.id);
        processed++;
      } catch (err) {
        console.warn(`Retry failed for report ${item.id}:`, err);
        // Update attempt count in queue
        const idb = await openQueueDB();
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        item.attempts += 1;
        item.lastAttempt = Date.now();
        if (item.attempts >= 5) {
          // Mark as failed in doc if possible
          try {
            const reportRef = doc(db, 'reports', item.id);
            await updateDoc(reportRef, {
              'rawInput.imageStatus': 'failed',
            });
          } catch {}
          await removePendingUpload(item.id);
        } else {
          store.put(item);
        }
      }
    }

    const remaining = (await getPendingUploads()).length;
    if (onProgress) onProgress(remaining);
    return processed;
  } finally {
    isSyncing = false;
  }
}
