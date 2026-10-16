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
} from 'lucide-react';
import { Language, translations } from '../lib/i18n';

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
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tagapo-800 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

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
    className={`relative h-9 px-3 flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase transition-all duration-200 ease-out cursor-pointer rounded-lg active:scale-95 select-none ${FOCUS_RING} ${
      active
        ? 'bg-tagapo-50/90 text-tagapo-950 shadow-2xs font-extrabold'
        : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100/70'
    }`}
  >
    {icon && (
      <span className={`w-3.5 h-3.5 transition-colors duration-200 ${active ? 'text-tagapo-800' : 'text-stone-400'}`}>
        {icon}
      </span>
    )}
    <span>{label}</span>
    <span
      aria-hidden="true"
      className={`absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-tagapo-800 origin-center transition-all duration-250 ease-out ${
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
    className={`w-full min-h-12 flex items-center gap-3 px-4 font-display text-sm font-bold tracking-wide uppercase rounded-lg transition-colors cursor-pointer ${FOCUS_RING} ${
      active
        ? 'bg-tagapo-50 text-tagapo-950 font-bold'
        : tone === 'danger'
          ? 'text-stone-700 font-medium hover:bg-rose-50 hover:text-rose-700'
          : 'text-stone-700 font-medium hover:bg-stone-100'
    }`}
  >
    <span className={active ? 'text-tagapo-800' : 'text-stone-400'}>{icon}</span>
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

  const langToggle = (
    <div className="flex items-center text-xs font-semibold" role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => setLang('fil')}
        aria-pressed={lang === 'fil'}
        className={`px-1 py-0.5 rounded cursor-pointer transition-colors ${FOCUS_RING} ${
          lang === 'fil' ? 'text-stone-900' : 'text-stone-400 hover:text-stone-700'
        }`}
      >
        FIL
      </button>
      <span className="text-stone-300" aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`px-1 py-0.5 rounded cursor-pointer transition-colors ${FOCUS_RING} ${
          lang === 'en' ? 'text-stone-900' : 'text-stone-400 hover:text-stone-700'
        }`}
      >
        EN
      </button>
    </div>
  );

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-200"
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
            <span className="w-7 h-7 rounded-lg bg-tagapo-900 text-tagapo-50 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" strokeWidth={2.2} />
            </span>
            <span className="font-display font-extrabold text-[16px] tracking-wide text-stone-950 uppercase">
              NatureWatch
            </span>
            {officialUser && (
              <span className="hidden md:flex items-center gap-2.5 text-xs text-stone-500">
                <span className="h-4 w-px bg-stone-300" aria-hidden="true" />
                <span className="font-display font-bold uppercase tracking-wider text-tagapo-900">{t.operationsLabel}</span>
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
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Only shown when something needs attention */}
            {(!isOnline || pendingSyncCount > 0) && (
              <div
                className="flex items-center gap-1.5 text-xs font-medium text-amber-800"
                role="status"
                title={!isOnline ? 'Offline mode active' : `${pendingSyncCount} reports waiting to sync`}
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden md:inline">{!isOnline ? 'Offline' : 'Syncing'}</span>
                {pendingSyncCount > 0 && (
                  <span className="tabular-nums px-1.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
                    {pendingSyncCount}
                  </span>
                )}
              </div>
            )}

            {/* Desktop account / language area */}
            <div className="hidden sm:flex items-center gap-4">
              {officialUser ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen((open) => !open)}
                    aria-expanded={isUserMenuOpen}
                    aria-haspopup="menu"
                    className={`flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-full hover:bg-stone-100 active:scale-95 transition-all duration-150 cursor-pointer select-none ${FOCUS_RING}`}
                  >
                    <span className="w-7 h-7 rounded-full bg-tagapo-900 text-white flex items-center justify-center text-xs font-semibold">
                      {username[0].toUpperCase()}
                    </span>
                    <span className="text-sm font-medium max-w-[140px] truncate text-stone-800">
                      {username}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ease-out ${
                        isUserMenuOpen ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>

                  {isUserMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg ring-1 ring-stone-200 py-1.5 animate-nav-dropdown"
                    >
                      <p className="px-3.5 pt-1 pb-2 text-xs text-stone-500 truncate">
                        {officialUser.email}
                      </p>

                      <div className="px-3.5 py-2 border-y border-stone-100 flex items-center justify-between">
                        <span className="text-xs font-medium text-stone-600">Language</span>
                        {langToggle}
                      </div>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onLogout();
                        }}
                        className={`mt-1 w-full flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 hover:text-rose-700 transition-colors cursor-pointer ${FOCUS_RING}`}
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{t.signOutBtn}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {langToggle}
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className={`flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 active:scale-95 transition-all cursor-pointer rounded-md px-1 py-1 ${FOCUS_RING}`}
                  >
                    <Lock className="w-4 h-4" />
                    <span>{t.officerLoginBtn}</span>
                  </button>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setIsMobileOpen((open) => !open)}
              aria-expanded={isMobileOpen}
              aria-controls="mobile-nav-panel"
              aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
              className={`sm:hidden -mr-2 w-11 h-11 flex items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 active:scale-90 transition-all cursor-pointer ${FOCUS_RING}`}
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
          className="sm:hidden absolute inset-x-0 top-full bg-white border-b border-stone-200 shadow-lg animate-mobile-drawer"
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

          <div className="border-t border-stone-100 px-3 py-2">
            <div className="px-4 pb-2 pt-1 text-xs font-medium text-stone-500">Language</div>
            <div className="grid grid-cols-2 gap-2 px-1 pb-1" role="group" aria-label="Language">
              {(['fil', 'en'] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={`min-h-11 rounded-lg text-sm font-medium transition-colors cursor-pointer ${FOCUS_RING} ${
                    lang === code
                      ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                      : 'text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {code === 'fil' ? 'Filipino' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-stone-100 px-3 py-2">
            {officialUser ? (
              <>
                <p className="px-4 pt-1 pb-1 text-xs text-stone-500 truncate">{officialUser.email}</p>
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
