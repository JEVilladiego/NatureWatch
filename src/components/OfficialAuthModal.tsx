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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-700">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-display font-extrabold text-xl text-stone-900 tracking-tight uppercase">PG-ENRO / MENRO Login</h2>
            <p className="text-xs text-stone-500">Provincial Government of Rizal</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block font-display text-xs font-bold uppercase tracking-wide text-stone-700 mb-1">
              Official Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@rizal.gov.ph"
                required
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-tagapo-800 focus:border-tagapo-800 focus:outline-none"
              />
              <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block font-display text-xs font-bold uppercase tracking-wide text-stone-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-tagapo-800 focus:border-tagapo-800 focus:outline-none"
              />
              <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-tagapo-900 hover:bg-tagapo-800 text-white font-display font-bold uppercase tracking-wider text-xs rounded-xl transition shadow-xs cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign In with Firebase Auth'}
          </button>
        </form>
      </div>
    </div>
  );
};
