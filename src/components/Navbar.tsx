import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  WifiOff,
  Lock,
  FileText,
  MapPin,
  Radio,
  Search,
  LogOut,
  ChevronDown,
  Globe,
} from 'lucide-react';
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
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown menu on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-200/80 transition-colors shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15">
          {/* Brand Lockup */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none group"
            onClick={() => setCurrentTab(officialUser ? 'dashboard' : 'report')}
            title="BantayKalikasan Home"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center shadow-xs ring-1 ring-emerald-950/20 group-hover:bg-emerald-700 transition-colors">
              <ShieldCheck className="w-4.5 h-4.5 text-emerald-100" strokeWidth={2.2} />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight text-stone-900 group-hover:text-emerald-900 transition-colors">
                BantayKalikasan
              </span>
              <span className="hidden sm:inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                {officialUser ? t.officerBadge : t.citizenBadge}
              </span>
            </div>
          </div>

          {/* Unified Segmented Navigation Control */}
          <nav className="flex items-center p-1 bg-stone-100/90 rounded-full border border-stone-200/70 shadow-2xs">
            {officialUser ? (
              // -------------------------------------------------------------
              // Officer Navigation Tabs (Triage Console, Field Intake, Lookup)
              // -------------------------------------------------------------
              <>
                <button
                  type="button"
                  onClick={() => setCurrentTab('dashboard')}
                  className={`px-3 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    currentTab === 'dashboard'
                      ? 'bg-white text-emerald-950 font-semibold shadow-2xs ring-1 ring-black/5'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                  }`}
                  title="Live Incident Triage & Map Console"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>{t.officerNavTriage}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('report')}
                  className={`px-3 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    currentTab === 'report'
                      ? 'bg-white text-emerald-950 font-semibold shadow-2xs ring-1 ring-black/5'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                  }`}
                  title="Log Incident in Field"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{t.officerNavFieldIntake}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('status')}
                  className={`px-3 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    currentTab === 'status'
                      ? 'bg-white text-emerald-950 font-semibold shadow-2xs ring-1 ring-black/5'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                  }`}
                  title="Lookup Report Code"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.officerNavStatus}</span>
                  <span className="sm:hidden">{lang === 'fil' ? 'Code' : 'Code'}</span>
                </button>
              </>
            ) : (
              // -------------------------------------------------------------
              // Public Citizen Navigation Tabs (Report Incident, Track Status)
              // -------------------------------------------------------------
              <>
                <button
                  type="button"
                  onClick={() => setCurrentTab('report')}
                  className={`px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    currentTab === 'report'
                      ? 'bg-white text-emerald-950 font-semibold shadow-2xs ring-1 ring-black/5'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{t.navReport}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('status')}
                  className={`px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    currentTab === 'status'
                      ? 'bg-white text-emerald-950 font-semibold shadow-2xs ring-1 ring-black/5'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t.navStatus}</span>
                </button>
              </>
            )}
          </nav>

          {/* Right Utilities: Offline/Sync Status, and Role Action */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Offline / Syncing Warning Beacon (ONLY displayed when not normal) */}
            {(!isOnline || pendingSyncCount > 0) && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200/80 rounded-full text-[11px] font-semibold text-amber-900"
                title={!isOnline ? 'Offline mode active' : `${pendingSyncCount} reports waiting to sync`}
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden md:inline">
                  {!isOnline ? 'Offline' : 'Syncing'}
                </span>
                {pendingSyncCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-amber-200 text-amber-950 rounded-full text-[10px] font-bold">
                    {pendingSyncCount}
                  </span>
                )}
              </div>
            )}

            {/* Officer User Menu Dropdown OR Citizen Utilities */}
            {officialUser ? (
              // -------------------------------------------------------------
              // Officer Dropdown Menu (Contains Language and Sign Out)
              // -------------------------------------------------------------
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200/70 border border-stone-200/80 text-stone-800 transition-colors cursor-pointer select-none"
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center text-xs font-bold">
                    {(officialUser.email?.[0] || 'O').toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold max-w-[120px] sm:max-w-[150px] truncate text-stone-900">
                    {officialUser.email?.split('@')[0] || 'Officer'}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-stone-500 transition-transform duration-150 ${
                      isUserMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu Popover */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-stone-200/80 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* Header info */}
                    <div className="px-3 py-2 border-b border-stone-100">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        PG-ENRO Officer
                      </div>
                      <div className="text-xs font-medium text-stone-900 truncate">
                        {officialUser.email || 'officer@rizal.gov.ph'}
                      </div>
                    </div>

                    {/* Language Switcher */}
                    <div className="p-2 border-b border-stone-100">
                      <div className="text-[11px] font-semibold text-stone-500 mb-1.5 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-stone-400" />
                        <span>Language / Wika</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 p-0.5 bg-stone-100 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setLang('fil')}
                          className={`py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                            lang === 'fil'
                              ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          Filipino
                        </button>
                        <button
                          type="button"
                          onClick={() => setLang('en')}
                          className={`py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                            lang === 'en'
                              ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          English
                        </button>
                      </div>
                    </div>

                    {/* Sign Out Button */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{t.signOutBtn}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // -------------------------------------------------------------
              // Public Citizen Controls (Language Switcher and Login Button)
              // -------------------------------------------------------------
              <>
                <div className="flex items-center bg-stone-100 p-0.5 rounded-full border border-stone-200/80 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setLang('fil')}
                    className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                      lang === 'fil'
                        ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Wikang Filipino"
                  >
                    FIL
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                      lang === 'en'
                        ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="English"
                  >
                    EN
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-950 hover:bg-stone-100 px-3 py-1.5 rounded-full border border-stone-200/80 hover:border-stone-300 transition-colors cursor-pointer"
                  title="Official Portal Login"
                >
                  <Lock className="w-3.5 h-3.5 text-stone-400" />
                  <span className="hidden sm:inline">{t.officerLoginBtn}</span>
                  <span className="sm:hidden">Login</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
