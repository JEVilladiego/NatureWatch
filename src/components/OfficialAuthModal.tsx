import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, X, Check, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

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
      const cred = await signInWithEmailAndPassword(auth, email, password);
      onLoginSuccess(cred.user);
      onClose();
    } catch (err: any) {
      console.warn('Sign-in failed:', err);
      // If user doesn't exist, try creating for official demo access
      try {
        const newCred = await createUserWithEmailAndPassword(auth, email, password);
        onLoginSuccess(newCred.user);
        onClose();
      } catch (createErr: any) {
        setError(createErr.message || 'Invalid official credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoOfficialLogin = () => {
    // Quick official access for testing/demonstration
    const demoOfficial = {
      uid: 'official_demo_menro',
      email: 'menro.binangonan@rizal.gov.ph',
      displayName: 'Officer Santos (MENRO Binangonan)',
      role: 'official',
    };
    onLoginSuccess(demoOfficial);
    onClose();
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
            <h2 className="text-lg font-black text-gray-900">MENRO Official Login</h2>
            <p className="text-xs text-gray-500">Municipality of Binangonan, Rizal</p>
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
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Official Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@binangonan.gov.ph"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition shadow"
          >
            {loading ? 'Authenticating...' : 'Sign In with Firebase Auth'}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-400 font-semibold">Or Quick Demo</span>
          </div>
        </div>

        {/* 1-Click Demo Login */}
        <button
          onClick={handleDemoOfficialLogin}
          type="button"
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-extrabold text-xs rounded-xl transition shadow flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>Demo as MENRO Officer (Instant Access)</span>
        </button>
      </div>
    </div>
  );
};
