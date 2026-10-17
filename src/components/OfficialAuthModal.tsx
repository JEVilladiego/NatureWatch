import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, X, Check, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { isOfficialUser, checkOfficialStatus } from '../lib/auth';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

interface OfficialAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
}

export const OfficialAuthModal: React.FC<OfficialAuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const check = await checkOfficialStatus(cred.user);
      if (!check.isOfficial) {
        await signOut(auth);
        setError(check.error || 'This account is not authorized as a MENRO official. Contact your administrator.');
        return;
      }
      onLoginSuccess(cred.user);
      setPassword('');
      onClose();
    } catch (err: any) {
      console.warn('Sign-in failed:', err?.code || err);
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-stone-800 relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-tagapo-800 dark:text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-stone-900 dark:text-white tracking-tight">PG-ENRO / MENRO Login</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">Provincial Government of Rizal</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Official Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@rizal.gov.ph"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-800 rounded-lg text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 focus:outline-none"
              />
              <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-800 rounded-lg text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 focus:outline-none"
              />
              <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition shadow-2xs cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
