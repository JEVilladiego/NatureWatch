import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { Language, translations } from '../lib/i18n';

interface PublicStatusPageProps {
  initialCode?: string;
  lang: Language;
  onBackToReport?: () => void;
  isOfficial?: boolean;
}

interface StatusResult {
  referenceCode: string;
  status: 'pending' | 'in_progress' | 'resolved';
  createdAt: string;
  municipality?: string;
  barangay: string;
  triageStatus: string;
  finalCategory?: string;
  statusHistory?: Array<{ status: string; changedBy: string; changedAt: string; notes?: string }>;
}

export const PublicStatusPage: React.FC<PublicStatusPageProps> = ({
  initialCode = '',
  lang,
  onBackToReport,
  isOfficial = false,
}) => {
  const t = translations[lang];
  const [code, setCode] = useState<string>(initialCode);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCode) {
      handleLookup(initialCode);
    }
  }, [initialCode]);

  const handleLookup = async (lookupCode: string) => {
    const cleanCode = lookupCode.trim().toUpperCase();
    if (!cleanCode) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/status?code=${encodeURIComponent(cleanCode)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError(
            lang === 'fil'
              ? 'Hindi nahanap ang reference code. Pakisuri muli ang iyong code (hal. BK-7F3K9).'
              : 'Reference code not found. Please verify your reference code (e.g. BK-7F3K9).'
          );
        } else {
          setError('Failed to fetch status. Please try again.');
        }
        setResult(null);
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch {
      setError(
        lang === 'fil'
          ? 'Hindi makakonekta sa server. Pakisubukang muli.'
          : 'Network error connecting to status service. Please try again.'
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="px-2.5 py-1 bg-tagapo-50 text-tagapo-950 border border-tagapo-200 font-display font-bold text-xs uppercase tracking-wider rounded-md flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-tagapo-800" />
            <span>{t.statusResolved}</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-950 border border-amber-200 font-display font-bold text-xs uppercase tracking-wider rounded-md flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>{t.statusInProgress}</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-stone-100 text-stone-900 border border-stone-200 font-display font-bold text-xs uppercase tracking-wider rounded-md flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-stone-600" />
            <span>{t.statusPending}</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6">
      {/* Top Utility Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-stone-200">
        {!isOfficial && onBackToReport ? (
          <button
            onClick={onBackToReport}
            className="inline-flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-tagapo-900 hover:text-tagapo-700 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{lang === 'fil' ? 'Bumalik sa Pag-uulat' : 'Back to Reporting'}</span>
          </button>
        ) : (
          <span className="font-display text-xs font-bold uppercase tracking-wider text-stone-500">
            {lang === 'fil' ? 'Suriin ang Status ng Code' : 'Reference Code Lookup'}
          </span>
        )}
        <span className="text-[11px] font-mono text-stone-400">RA 10173 Protected</span>
      </div>

      <div className="pt-6 pb-1">
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-stone-950 tracking-tight uppercase leading-none">
          {lang === 'fil' ? 'Subaybayan ang Katayuan ng Ulat' : 'Track Incident Report Status'}
        </h1>
        <p className="text-sm text-stone-600 mt-1.5">
          {lang === 'fil'
            ? 'Ilagay ang iyong Reference Code upang makita ang kasalukuyang opisyal na aksyon ng MENRO.'
            : 'Enter your Reference Code to view current municipal action.'}
        </p>
      </div>

      {/* Code Search Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLookup(code);
        }}
        className="mt-5 flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Hal. BK-7K2M9"
            className="w-full pl-10 pr-4 py-2.5 text-sm font-mono uppercase bg-white border border-stone-200 rounded-lg focus:ring-1 focus:ring-tagapo-800 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="px-5 py-2.5 bg-tagapo-900 hover:bg-tagapo-800 active:bg-tagapo-950 disabled:bg-stone-200 disabled:text-stone-400 text-white font-display font-bold uppercase tracking-wider text-xs rounded-lg shadow-2xs transition cursor-pointer"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="mt-4 flex items-center gap-1.5 text-xs text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-8 border border-stone-200 rounded-xl p-5 sm:p-6 space-y-6 bg-white shadow-2xs">
          {/* Reference & Badge Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-stone-100 gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-stone-400 block">
                Reference Code
              </span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-stone-950 mt-0.5 tracking-wider">
                {result.referenceCode}
              </div>
            </div>
            <div>{getStatusBadge(result.status)}</div>
          </div>

          {/* Key Metadata Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-stone-400 block">
                Location / LGU
              </span>
              <span className="font-semibold text-stone-900 mt-0.5 block text-sm">
                {[result.barangay, result.municipality || 'Rizal Province'].filter(Boolean).join(', ')}
              </span>
            </div>
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-stone-400 block">
                Date Reported
              </span>
              <span className="font-semibold text-stone-900 mt-0.5 block text-sm">
                {new Date(result.createdAt).toLocaleDateString()}
              </span>
            </div>
            {result.finalCategory && (
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-stone-400 block">
                  Classification
                </span>
                <span className="font-semibold text-stone-900 mt-0.5 block text-sm uppercase">
                  {result.finalCategory.replace(/_/g, ' ')}
                </span>
              </div>
            )}
          </div>

          {/* Action Timeline */}
          {result.statusHistory && result.statusHistory.length > 0 && (
            <div className="border-t border-stone-100 pt-5 space-y-4">
              <h3 className="font-display text-xs font-bold text-stone-900 uppercase tracking-wider">
                Official Action Timeline
              </h3>
              <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-stone-200">
                {result.statusHistory.map((item, idx) => (
                  <div key={idx} className="relative pl-6 text-xs">
                    <div className="absolute left-1 top-1.5 w-2 h-2 rounded-full bg-tagapo-900" />
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900 capitalize text-sm">
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-stone-400 font-mono">
                        {new Date(item.changedAt).toLocaleString()}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-stone-600 mt-1 italic text-xs">
                        "{item.notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footnote Privacy Note */}
          <div className="border-t border-stone-100 pt-4 text-[11px] text-stone-400 leading-relaxed flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-tagapo-800 shrink-0" />
            <span>
              <strong className="text-stone-600 font-semibold">RA 10173 Protected: </strong>
              Photos and GPS telemetry are restricted from public disclosure to protect resident anonymity.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
