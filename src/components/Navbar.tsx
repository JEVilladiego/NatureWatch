import React from 'react';
import { ShieldCheck, Wifi, WifiOff, Globe, Lock, FileText, MapPin } from 'lucide-react';
import { Language, translations } from '../lib/i18n';

interface NavbarProps {
  currentTab: 'report' | 'status' | 'dashboard';
  setCurrentTab: (tab: 'report' | 'status' | 'dashboard') => void;
  lang: Language;
  setLang: (lang: Language) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  officialUser: any | null;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  lang,
  setLang,
  isOnline,
  pendingSyncCount,
  officialUser,
  onOpenLogin,
  onLogout,
}) => {
  const t = translations[lang];

  return (
    <header className="sticky top-0 z-40 bg-emerald-900 text-white shadow-md border-b border-emerald-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none"
            onClick={() => setCurrentTab('report')}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-inner border border-emerald-400">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white font-mono">
                  BantayKalikasan
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-800 text-emerald-200 rounded border border-emerald-700">
                  Binangonan
                </span>
              </div>
              <p className="text-xs text-emerald-200 font-medium">
                MENRO Incident Reporting
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setCurrentTab('report')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'report'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-100 hover:bg-emerald-800 hover:text-white'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>{t.navReport}</span>
            </button>

            <button
              onClick={() => setCurrentTab('status')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'status'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-100 hover:bg-emerald-800 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>{t.navStatus}</span>
            </button>

            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'dashboard'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-emerald-100 hover:bg-emerald-800 hover:text-white'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>{t.navDashboard}</span>
            </button>
          </nav>

          {/* Utilities: Sync status, Language toggle, Auth */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Online / Offline / Sync Indicator */}
            <div className="flex items-center">
              {isOnline ? (
                <div
                  className="flex items-center gap-1.5 px-2 py-1 bg-emerald-950/60 rounded-full text-[11px] text-emerald-300 border border-emerald-700"
                  title="Online"
                >
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  {pendingSyncCount > 0 && (
                    <span className="font-bold bg-amber-500 text-emerald-950 px-1.5 py-0.2 rounded-full text-[10px]">
                      {pendingSyncCount}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 px-2 py-1 bg-amber-950/80 rounded-full text-[11px] text-amber-300 border border-amber-700 animate-pulse"
                  title="Offline Mode"
                >
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline">Offline</span>
                  {pendingSyncCount > 0 && (
                    <span className="font-bold bg-amber-400 text-amber-950 px-1.5 py-0.2 rounded-full text-[10px]">
                      {pendingSyncCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === 'fil' ? 'en' : 'fil')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 border border-emerald-700 transition-colors"
              title="Toggle Language"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'fil' ? 'FIL' : 'EN'}</span>
            </button>

            {/* Official Auth Status */}
            {officialUser ? (
              <div className="flex items-center gap-2">
                <span className="hidden lg:inline-block text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  MENRO Official
                </span>
                <button
                  onClick={onLogout}
                  className="text-xs font-bold px-2.5 py-1 bg-rose-700/80 hover:bg-rose-600 text-white rounded-lg transition-colors"
                >
                  {t.signOutBtn}
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="hidden sm:flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg border border-emerald-700 transition-colors"
              >
                <Lock className="w-3 h-3" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
