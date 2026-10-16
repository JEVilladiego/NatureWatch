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
  Menu,
  X,
  Map as MapIcon,
  Layout,
  Sun,
  Moon,
} from 'lucide-react';
import { Language, translations } from '../lib/i18n';
import { useTheme } from '../lib/theme';

export type Tab = 'report' | 'status' | 'workbench' | 'map';

interface NavbarProps {
  currentTab: Tab;
  setCurrentTab: (tab: Tab) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  officialUser: any | null;
  onOpenLogin: () => void;
  onLogout: () => void;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 dark:focus-visible:ring-stone-100 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-950';

/** Desktop tab with refined pill background and smooth underline indicator. */
const NavTab: React.FC<{ active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }> = ({
  active,
  onClick,
  label,
  icon,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`relative h-9 px-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide transition-all duration-200 ease-out cursor-pointer rounded-lg active:scale-95 select-none ${FOCUS_RING} ${
      active
        ? 'bg-stone-100 text-stone-900 font-bold dark:bg-stone-900 dark:text-white'
        : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-900/60'
    }`}
  >
    {icon && (
      <span className={`w-3.5 h-3.5 transition-colors duration-200 ${active ? 'text-stone-900 dark:text-white' : 'text-stone-400 dark:text-stone-500'}`}>
        {icon}
      </span>
    )}
    <span>{label}</span>
    <span
      aria-hidden="true"
      className={`absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-stone-900 dark:bg-emerald-500 origin-center transition-all duration-250 ease-out ${
        active ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
      }`}
    />
  </button>
);

/** Full-width row used inside the mobile dropdown. */
const MobileRow: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  tone?: 'default' | 'danger';
}> = ({ onClick, icon, label, active = false, tone = 'default' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`w-full min-h-12 flex items-center gap-3 px-4 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${FOCUS_RING} ${
      active
        ? 'bg-stone-100 text-stone-950 font-semibold dark:bg-stone-900 dark:text-white'
        : tone === 'danger'
          ? 'text-stone-700 font-medium hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30'
          : 'text-stone-700 font-medium hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-900'
    }`}
  >
    <span className={active ? 'text-stone-900 dark:text-white' : 'text-stone-400 dark:text-stone-500'}>{icon}</span>
    <span>{label}</span>
  </button>
);

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
  const { theme, toggleTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Close the desktop officer menu on outside click or Escape
  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsUserMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  // Close the mobile dropdown on outside click or Escape
  useEffect(() => {
    if (!isMobileOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setIsMobileOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileOpen]);

  const username = officialUser?.email?.split('@')[0] || 'Officer';

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = officialUser
    ? [
        { id: 'map', label: t.officerNavMap, icon: <MapIcon className="w-5 h-5" /> },
        { id: 'workbench', label: t.officerNavWorkbench, icon: <Layout className="w-5 h-5" /> },
        { id: 'status', label: t.officerNavStatus, icon: <Search className="w-5 h-5" /> },
      ]
    : [
        { id: 'report', label: t.navReport, icon: <MapPin className="w-5 h-5" /> },
        { id: 'status', label: t.navStatus, icon: <FileText className="w-5 h-5" /> },
      ];

  const goTo = (tab: Tab) => {
    setCurrentTab(tab);
    setIsMobileOpen(false);
  };

  const themeToggleButton = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Lumipat sa light mode' : 'Lumipat sa dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-900 transition-all cursor-pointer ${FOCUS_RING}`}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 text-stone-600 transition-transform duration-200 hover:-rotate-12" />
      )}
    </button>
  );

  const langToggle = (
    <div className="flex items-center text-xs font-semibold bg-stone-100 dark:bg-stone-850 p-0.5 rounded-lg border border-transparent dark:border-stone-800" role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => setLang('fil')}
        aria-pressed={lang === 'fil'}
        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${FOCUS_RING} ${
          lang === 'fil'
            ? 'text-stone-900 dark:text-stone-100 font-bold bg-white dark:bg-stone-750 shadow-2xs'
            : 'text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
        }`}
      >
        FIL
      </button>
      <span className="text-stone-300 dark:text-stone-700 px-0.5" aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${FOCUS_RING} ${
          lang === 'en'
            ? 'text-stone-900 dark:text-stone-100 font-bold bg-white dark:bg-stone-750 shadow-2xs'
            : 'text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
        }`}
      >
        EN
      </button>
    </div>
  );

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-white/90 dark:bg-stone-950/90 backdrop-blur-md border-b border-stone-200 dark:border-stone-850"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-14 gap-3">
          {/* Brand */}
          <button
            type="button"
            onClick={() => goTo(officialUser ? 'map' : 'report')}
            className={`flex items-center gap-2.5 select-none cursor-pointer rounded-md ${FOCUS_RING}`}
            title="NatureWatch"
          >
            <span className="w-7 h-7 rounded-lg bg-tagapo-800 dark:bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
              <ShieldCheck className="w-4 h-4" strokeWidth={2.2} />
            </span>
            <span className="font-bold text-[17px] tracking-tight text-stone-950 dark:text-white">
              NatureWatch
            </span>
            {officialUser && (
              <span className="hidden md:flex items-center gap-2.5 text-xs text-stone-500 dark:text-stone-400">
                <span className="h-4 w-px bg-stone-300 dark:bg-stone-800" aria-hidden="true" />
                <span className="font-semibold text-xs text-stone-600 dark:text-stone-300">{t.operationsLabel}</span>
              </span>
            )}
          </button>

          {/* Desktop navigation */}
          <nav className="hidden sm:flex items-center h-full gap-1" aria-label="Primary">
            {tabs.map((tab) => (
              <NavTab
                key={tab.id}
                active={currentTab === tab.id}
                onClick={() => setCurrentTab(tab.id)}
                label={tab.label}
                icon={tab.icon}
              />
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Only shown when something needs attention */}
            {(!isOnline || pendingSyncCount > 0) && (
              <div
                className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-400"
                role="status"
                title={!isOnline ? 'Offline mode active' : `${pendingSyncCount} reports waiting to sync`}
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden md:inline">{!isOnline ? 'Offline' : 'Syncing'}</span>
                {pendingSyncCount > 0 && (
                  <span className="tabular-nums px-1.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-xs font-bold">
                    {pendingSyncCount}
                  </span>
                )}
              </div>
            )}

            {/* Language & Theme Switchers (shown directly on navbar only for public visitors) */}
            {!officialUser && (
              <>
                <div className="hidden sm:flex items-center">
                  {langToggle}
                </div>
                {themeToggleButton}
              </>
            )}

            {/* Desktop account area */}
            <div className="hidden sm:flex items-center gap-3">
              {officialUser ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen((open) => !open)}
                    aria-expanded={isUserMenuOpen}
                    aria-haspopup="menu"
                    className={`flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-stone-100 dark:hover:bg-stone-900 active:scale-95 transition-all duration-150 cursor-pointer select-none border border-transparent hover:border-stone-200 dark:hover:border-stone-800 ${
                      isUserMenuOpen ? 'bg-stone-100 dark:bg-stone-850 border-stone-200 dark:border-stone-800 ring-2 ring-stone-900/10 dark:ring-white/10' : ''
                    } ${FOCUS_RING}`}
                    title="Account & System Preferences"
                  >
                    <span className="w-7 h-7 rounded-full bg-stone-900 dark:bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                      {username[0].toUpperCase()}
                    </span>
                    <span className="text-xs font-semibold max-w-[140px] truncate text-stone-800 dark:text-stone-200">
                      {username}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-stone-400 dark:text-stone-500 transition-transform duration-200 ease-out ${
                        isUserMenuOpen ? 'rotate-180 text-stone-700 dark:text-stone-300' : 'rotate-0'
                      }`}
                    />
                  </button>

                  {isUserMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-72 bg-white dark:bg-stone-900 rounded-2xl shadow-xl ring-1 ring-stone-200/90 dark:ring-stone-800 p-3 animate-nav-dropdown border border-stone-100 dark:border-stone-800 select-none z-50 divide-y divide-stone-100 dark:divide-stone-800"
                    >
                      {/* Officer Identity Header */}
                      <div className="pb-3 px-1">
                        <div className="flex items-center gap-2.5">
                          <span className="w-9 h-9 rounded-full bg-stone-900 dark:bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shadow-2xs">
                            {username[0].toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                              {username}
                            </p>
                            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                              {officialUser.email}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                          <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>{t.accountOfficerRole || 'PG-ENRO Officer'}</span>
                        </div>
                      </div>

                      {/* Display / Theme Selection */}
                      <div className="py-2.5 px-1 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-stone-600 dark:text-stone-400">
                          <span>{t.displayLabel || 'Display'}</span>
                          <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 capitalize">
                            {theme === 'dark' ? 'Dark' : 'Light'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 dark:bg-stone-850 rounded-xl" role="group" aria-label="Theme">
                          <button
                            type="button"
                            onClick={() => theme !== 'light' && toggleTheme()}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              theme === 'light'
                                ? 'bg-white text-stone-950 shadow-xs ring-1 ring-stone-200/60 font-bold'
                                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                            }`}
                          >
                            <Sun className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-500' : 'text-stone-400'}`} />
                            <span>Light</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => theme !== 'dark' && toggleTheme()}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              theme === 'dark'
                                ? 'bg-stone-800 text-white shadow-xs ring-1 ring-stone-700 font-bold'
                                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                            }`}
                          >
                            <Moon className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-emerald-400' : 'text-stone-400'}`} />
                            <span>Dark</span>
                          </button>
                        </div>
                      </div>

                      {/* Language Selection */}
                      <div className="py-2.5 px-1 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-stone-600 dark:text-stone-400">
                          <span>{t.languageLabel || 'Language'}</span>
                          <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 uppercase">
                            {lang}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 dark:bg-stone-850 rounded-xl" role="group" aria-label="Language">
                          <button
                            type="button"
                            onClick={() => setLang('fil')}
                            aria-pressed={lang === 'fil'}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              lang === 'fil'
                                ? 'bg-white dark:bg-stone-800 text-stone-950 dark:text-white shadow-xs ring-1 ring-stone-200/60 dark:ring-stone-700 font-bold'
                                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                            }`}
                          >
                            <span>Filipino</span>
                            <span className="text-[9px] text-stone-400 dark:text-stone-500 font-mono">FIL</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setLang('en')}
                            aria-pressed={lang === 'en'}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              lang === 'en'
                                ? 'bg-white dark:bg-stone-800 text-stone-950 dark:text-white shadow-xs ring-1 ring-stone-200/60 dark:ring-stone-700 font-bold'
                                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                            }`}
                          >
                            <span>English</span>
                            <span className="text-[9px] text-stone-400 dark:text-stone-500 font-mono">EN</span>
                          </button>
                        </div>
                      </div>

                      {/* Sign Out Action */}
                      <div className="pt-2 px-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onLogout();
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 dark:hover:text-rose-400 transition-colors cursor-pointer group ${FOCUS_RING}`}
                        >
                          <div className="flex items-center gap-2">
                            <LogOut className="w-4 h-4 text-stone-400 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors" />
                            <span>{t.signOutBtn}</span>
                          </div>
                          <span className="text-[10px] text-stone-400 font-mono group-hover:text-rose-500">ESC</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className={`flex items-center gap-1.5 text-sm font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 active:scale-95 transition-all cursor-pointer rounded-md px-1 py-1 ${FOCUS_RING}`}
                >
                  <Lock className="w-4 h-4" />
                  <span>{t.officerLoginBtn}</span>
                </button>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setIsMobileOpen((open) => !open)}
              aria-expanded={isMobileOpen}
              aria-controls="mobile-nav-panel"
              aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
              className={`sm:hidden -mr-2 w-11 h-11 flex items-center justify-center rounded-lg text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-900 active:scale-90 transition-all cursor-pointer ${FOCUS_RING}`}
            >
              <span className={`transition-transform duration-200 ease-out ${isMobileOpen ? 'rotate-90' : 'rotate-0'}`}>
                {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {isMobileOpen && (
        <div
          id="mobile-nav-panel"
          className="sm:hidden absolute inset-x-0 top-full bg-white dark:bg-stone-950 border-b border-stone-200 dark:border-stone-850 shadow-lg animate-mobile-drawer"
        >
          <nav className="px-3 py-2" aria-label="Primary">
            {tabs.map((tab) => (
              <MobileRow
                key={tab.id}
                active={currentTab === tab.id}
                onClick={() => goTo(tab.id)}
                icon={tab.icon}
                label={tab.label}
              />
            ))}
          </nav>

          {/* Mobile Theme Toggle Row */}
          <div className="border-t border-stone-100 dark:border-stone-850 px-3 py-2">
            <div className="px-4 pb-2 pt-1 text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>Theme</span>
              <span className="text-[11px] font-mono uppercase text-stone-400 dark:text-stone-500">
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 px-1 pb-1" role="group" aria-label="Theme">
              <button
                type="button"
                onClick={() => theme !== 'light' && toggleTheme()}
                className={`min-h-11 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${FOCUS_RING} ${
                  theme === 'light'
                    ? 'bg-stone-900 text-white font-semibold'
                    : 'text-stone-600 dark:text-stone-400 ring-1 ring-stone-200 dark:ring-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={`min-h-11 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${FOCUS_RING} ${
                  theme === 'dark'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-stone-600 dark:text-stone-400 ring-1 ring-stone-200 dark:ring-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark</span>
              </button>
            </div>
          </div>

          <div className="border-t border-stone-100 dark:border-stone-850 px-3 py-2">
            <div className="px-4 pb-2 pt-1 text-xs font-medium text-stone-500 dark:text-stone-400">Language</div>
            <div className="grid grid-cols-2 gap-2 px-1 pb-1" role="group" aria-label="Language">
              {(['fil', 'en'] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={`min-h-11 rounded-lg text-sm font-medium transition-colors cursor-pointer ${FOCUS_RING} ${
                    lang === code
                      ? 'bg-stone-900 dark:bg-emerald-700 text-white font-semibold'
                      : 'text-stone-600 dark:text-stone-400 ring-1 ring-stone-200 dark:ring-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
                  }`}
                >
                  {code === 'fil' ? 'Filipino' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-stone-100 dark:border-stone-850 px-3 py-2">
            {officialUser ? (
              <>
                <p className="px-4 pt-1 pb-1 text-xs text-stone-500 dark:text-stone-400 truncate">{officialUser.email}</p>
                <MobileRow
                  tone="danger"
                  onClick={() => {
                    setIsMobileOpen(false);
                    onLogout();
                  }}
                  icon={<LogOut className="w-5 h-5" />}
                  label={t.signOutBtn}
                />
              </>
            ) : (
              <MobileRow
                onClick={() => {
                  setIsMobileOpen(false);
                  onOpenLogin();
                }}
                icon={<Lock className="w-5 h-5" />}
                label={t.officerLoginBtn}
              />
            )}
          </div>
        </div>
      )}
    </header>
  );
};
