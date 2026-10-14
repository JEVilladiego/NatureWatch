/**
 * BantayKalikasan: Environmental Incident Reporting & AI Triage
 * Rizal Province • PG-ENRO
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
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
  const [currentTab, setCurrentTab] = useState<'report' | 'status' | 'dashboard'>('report');
  const [lang, setLang] = useState<Language>('fil');
  const [statusLookupCode, setStatusLookupCode] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [officialUser, setOfficialUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

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

  // Prevent authenticated officers from accessing citizen reporting form
  useEffect(() => {
    if (officialUser && currentTab === 'report') {
      setCurrentTab('dashboard');
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
    <div className="min-h-screen bg-white flex flex-col font-sans text-stone-900">
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
      <main className="flex-1 py-4 sm:py-8">
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

        {currentTab === 'dashboard' && (
          <Dashboard
            lang={lang}
            officialUser={officialUser}
            onOpenLogin={() => setIsAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-tagapo-950 text-tagapo-200 py-8 border-t border-tagapo-900 text-xs">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-2">
          <p className="font-display font-bold tracking-wide uppercase text-white text-sm">
            BantayKalikasan • Provincial Government of Rizal Environment and Natural Resources Office (PG-ENRO)
          </p>
          <p className="text-tagapo-300 text-[11px] tracking-wide">
            Pamahalaang Lalawigan ng Rizal • Republic of the Philippines
          </p>
          <div className="pt-3 text-[11px] text-tagapo-400 border-t border-tagapo-900/70 max-w-xl mx-auto">
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
