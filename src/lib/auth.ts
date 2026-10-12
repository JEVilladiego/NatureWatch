import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/** True when the signed-in user is a MENRO official (officials/{uid} doc or role claim). */
export async function isOfficialUser(user: User): Promise<boolean> {
  try {
    const token = await user.getIdTokenResult();
    if (token.claims.role === 'official' || token.claims.role === 'admin') return true;
    const snap = await getDoc(doc(db, 'officials', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

/** Authorization header for calls to the official-only /api routes. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
