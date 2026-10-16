/**
 * NatureWatch: Environmental Incident Reporting & AI Triage
 * Rizal Province • PG-ENRO
 */

import React, { useState, useEffect } from 'react';
import { Navbar, type Tab } from './components/Navbar';
import { ResidentReporter } from './components/ResidentReporter';
import { PublicStatusPage } from './components/PublicStatusPage';
import { Dashboard } from './components/Dashboard';
import { OfficialAuthModal } from './components/OfficialAuthModal';
import { Language } from './lib/i18n';
import { onPendingSyncChange } from './lib/offlineQueue';
import { auth } from './lib/firebase';
import { isOfficialUser } from './lib/auth';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';

export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('report');
  const [lang, setLang] = useState<Language>('fil');
  const [statusLookupCode, setStatusLookupCode] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [officialUser, setOfficialUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const isFullMap = !!officialUser && currentTab === 'map';

  // Initialize and check connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Count report submissions Firestore has not yet acknowledged (offline queue)
    const unsubscribePending = onPendingSyncChange(setPendingSyncCount);

    // Only users verified as officials get dashboard access
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user && (await isOfficialUser(user))) {
        setOfficialUser(user);
      } else {
        setOfficialUser(null);
        if (user) {
          // Signed in but not an official: do not keep the session around
          signOut(auth).catch(() => {});
        }
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribePending();
      unsubscribeAuth();
    };
  }, []);

  // Prevent authenticated officers from accessing citizen reporting form; default to LikasMap GIS
  useEffect(() => {
    if (officialUser && currentTab === 'report') {
      setCurrentTab('map');
    }
  }, [officialUser, currentTab]);

  const handleViewStatus = (referenceCode: string) => {
    setStatusLookupCode(referenceCode);
    setCurrentTab('status');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {}
    setOfficialUser(null);
    setCurrentTab('report');
  };

  return (
    <div className={`bg-white flex flex-col font-sans text-stone-900 ${isFullMap ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* Primary Navigation Bar (Smoothly glides out of view in LikasMap GIS full-screen mode) */}
      <div
        className={`sticky top-0 z-50 w-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isFullMap
            ? '-translate-y-full opacity-0 pointer-events-none -mb-14'
            : 'translate-y-0 opacity-100 shadow-xs'
        }`}
        aria-hidden={isFullMap}
      >
        <Navbar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          lang={lang}
          setLang={setLang}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          officialUser={officialUser}
          onOpenLogin={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Content View */}
      <main className={isFullMap ? 'w-screen h-screen fixed inset-0 overflow-hidden p-0 m-0 z-0' : 'flex-1 py-4 sm:py-8'}>
        {currentTab === 'report' && (
          <ResidentReporter
            lang={lang}
            onViewStatus={handleViewStatus}
            isOnline={isOnline}
          />
        )}

        {currentTab === 'status' && (
          <PublicStatusPage
            initialCode={statusLookupCode}
            lang={lang}
            isOfficial={!!officialUser}
            onBackToReport={() => setCurrentTab('report')}
          />
        )}

        {(currentTab === 'workbench' || currentTab === 'map') && (
          <Dashboard
            lang={lang}
            setLang={setLang}
            officialUser={officialUser}
            onOpenLogin={() => setIsAuthModalOpen(true)}
            viewMode={currentTab === 'map' ? 'full_map' : 'workbench'}
            onViewModeChange={(mode) => setCurrentTab(mode === 'full_map' ? 'map' : 'workbench')}
            onNavigateTab={(tab) => setCurrentTab(tab as any)}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Footer (hidden in Full Map mode to ensure edge-to-edge canvas) */}
      {!isFullMap && (
        <footer className="bg-stone-50 text-stone-600 py-8 border-t border-stone-200 text-xs">
          <div className="max-w-7xl mx-auto px-4 text-center space-y-1.5">
            <p className="font-semibold text-stone-900 text-xs">
              NatureWatch • Provincial Government of Rizal Environment and Natural Resources Office (PG-ENRO)
            </p>
            <p className="text-stone-500 text-[11px]">
              Pamahalaang Lalawigan ng Rizal • Republic of the Philippines
            </p>
            <div className="pt-2.5 text-[11px] text-stone-400 border-t border-stone-200 max-w-xl mx-auto">
              Protektado sa ilalim ng Republic Act No. 10173 (Data Privacy Act of 2012). Walang personal na datos ng mamamayan ang kinokolekta.
            </div>
          </div>
        </footer>
      )}

      {/* Official Sign-In Modal */}
      <OfficialAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setOfficialUser(user);
          setCurrentTab('map');
        }}
      />
    </div>
  );
}
