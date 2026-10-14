import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Automatically load local .env in Node 20+ when running locally
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {}
}

/**
 * Shared Firebase Admin setup for the Vercel serverless routes.
 * Credentials come from environment variables (never committed):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   FIREBASE_DATABASE_ID (optional, defaults to "(default)")
 */

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new HttpError(500, 'Server is missing Firebase Admin credentials.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export function getDb(): Firestore {
  return getFirestore(getAdminApp(), process.env.FIREBASE_DATABASE_ID || '(default)');
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Verifies the Bearer ID token and that the user is an official (claim or officials/{uid} doc). */
export async function verifyOfficial(req: VercelRequest): Promise<{ uid: string; email?: string }> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing authentication token.');

  let decoded;
  try {
    const { getAuth } = await import('firebase-admin/auth');
    decoded = await getAuth(getAdminApp()).verifyIdToken(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired authentication token.');
  }

  if (decoded.role === 'official' || decoded.role === 'admin') {
    return { uid: decoded.uid, email: decoded.email };
  }

  const officialDoc = await getDb().collection('officials').doc(decoded.uid).get();
  if (!officialDoc.exists) throw new HttpError(403, 'Not an authorized official.');

  return { uid: decoded.uid, email: decoded.email };
}

/** Best-effort push alert for urgent reports. Never throws. */
export async function sendUrgentAlert(params: {
  reportId: string;
  referenceCode?: string;
  severity: number;
  category: string;
  summary: string;
  barangay?: string;
}): Promise<boolean> {
  try {
    const { getMessaging } = await import('firebase-admin/messaging');
    await getMessaging(getAdminApp()).send({
      topic: 'officials_urgent_alerts',
      notification: {
        title: `[URGENT SEVERITY ${params.severity}] ${params.category.toUpperCase()}`,
        body: `${params.summary} (${params.barangay || 'Rizal Province'})`,
      },
      data: {
        reportId: params.reportId,
        referenceCode: params.referenceCode || '',
        severity: String(params.severity),
      },
    });
    return true;
  } catch (err) {
    console.warn('FCM dispatch failed:', err);
    return false;
  }
}

/** Wraps a handler with method check, JSON errors and no-store caching. */
export function route(
  method: 'GET' | 'POST',
  handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== method) {
      res.setHeader('Allow', method);
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unhandled API error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/** Best-effort per-instance rate limit (serverless instances are not shared). */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(req: VercelRequest, limit: number, windowMs = 60_000) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const rec = buckets.get(ip);
  if (!rec || now > rec.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (rec.count >= limit) throw new HttpError(429, 'Too many requests. Please wait a moment.');
  rec.count++;
}
