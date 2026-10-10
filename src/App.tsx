/**
 * BantayKalikasan: Environmental Incident Reporting & AI Triage
 * Binangonan, Rizal MENRO
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ResidentReporter } from './components/ResidentReporter';
import { PublicStatusPage } from './components/PublicStatusPage';
import { Dashboard } from './components/Dashboard';
import { OfficialAuthModal } from './components/OfficialAuthModal';
import { Language } from './lib/i18n';
import { processOfflineQueue, getPendingUploads } from './lib/offlineQueue';
import { testFirestoreConnection, auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'report' | 'status' | 'dashboard'>('report');
  const [lang, setLang] = useState<Language>('fil');
  const [statusLookupCode, setStatusLookupCode] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [officialUser, setOfficialUser] = useState<any | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Initialize and check connectivity
  useEffect(() => {
    testFirestoreConnection();

    const handleOnline = () => {
      setIsOnline(true);
      processOfflineQueue((remaining) => setPendingSyncCount(remaining));
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check of offline queue
    getPendingUploads().then((items) => {
      setPendingSyncCount(items.length);
      if (items.length > 0 && navigator.onLine) {
        processOfflineQueue((remaining) => setPendingSyncCount(remaining));
      }
    });

    // Check Firebase Auth state for officials
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setOfficialUser(user);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeAuth();
    };
  }, []);

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
    <div className="min-h-screen bg-stone-100 flex flex-col font-sans text-gray-900 selection:bg-emerald-200">
      {/* Navigation */}
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

      {/* Main Content View */}
      <main className="flex-1 py-4 sm:py-6">
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
            onBackToReport={() => setCurrentTab('report')}
          />
        )}

        {currentTab === 'dashboard' && (
          <Dashboard
            lang={lang}
            officialUser={officialUser}
            onOpenLogin={() => setIsAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-emerald-950 text-emerald-200 py-6 border-t border-emerald-900 text-xs">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-2">
          <p className="font-semibold text-white">
            BantayKalikasan • Municipal Environment and Natural Resources Office (MENRO)
          </p>
          <p className="text-emerald-400 text-[11px]">
            Pamahalaang Bayan ng Binangonan, Lalawigan ng Rizal • Republic of the Philippines
          </p>
          <div className="pt-2 text-[10px] text-emerald-500 border-t border-emerald-900/60 max-w-xl mx-auto">
            Protektado sa ilalim ng Republic Act No. 10173 (Data Privacy Act of 2012). Walang personal na datos ng mamamayan ang kinokolekta.
          </div>
        </div>
      </footer>

      {/* Official Sign-In Modal */}
      <OfficialAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setOfficialUser(user);
          setCurrentTab('dashboard');
        }}
      />
    </div>
  );
}
