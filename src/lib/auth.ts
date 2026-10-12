import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface OfficialCheckResult {
  isOfficial: boolean;
  error?: string;
}

/** Detailed verification of whether a user is an authorized MENRO official. */
export async function checkOfficialStatus(user: User): Promise<OfficialCheckResult> {
  try {
    const token = await user.getIdTokenResult();
    if (token.claims.role === 'official' || token.claims.role === 'admin') {
      return { isOfficial: true };
    }

    const docRef = doc(db, 'officials', user.uid);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      console.warn(
        `[auth] User ${user.email} (UID: "${user.uid}") has no document at officials/${user.uid}.\n` +
        `Make sure the Firestore Document ID is set to the user UID, not an Auto-ID with an internal field.`
      );
      return {
        isOfficial: false,
        error: `Account UID (${user.uid}) not found in 'officials' collection. Ensure the Firestore Document ID equals this UID.`,
      };
    }

    return { isOfficial: true };
  } catch (err: any) {
    console.error(`[auth] Error checking official status for UID "${user.uid}":`, err);

    if (err?.code === 'permission-denied') {
      return {
        isOfficial: false,
        error: 'Firestore permission denied. Please publish firestore.rules to Firebase Console.',
      };
    }

    return {
      isOfficial: false,
      error: err?.message || 'Failed to verify official status.',
    };
  }
}

/** True when the signed-in user is a MENRO official (officials/{uid} doc or role claim). */
export async function isOfficialUser(user: User): Promise<boolean> {
  const res = await checkOfficialStatus(user);
  return res.isOfficial;
}

/** Authorization header for calls to the official-only /api routes. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
