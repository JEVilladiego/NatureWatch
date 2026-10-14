import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Shield,
  ArrowLeft,
  Calendar,
  Building,
  Tag,
} from 'lucide-react';
import { Language, translations } from '../lib/i18n';
import { CATEGORIES, IncidentCategory } from '../types/report';

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
          <span className="px-3 py-1 bg-tagapo-50 text-tagapo-900 border border-tagapo-200 font-display font-bold text-xs uppercase tracking-wider rounded-md flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-tagapo-800" />
            <span>{t.statusResolved}</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 font-display font-bold text-xs uppercase tracking-wider rounded-md flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>{t.statusInProgress}</span>
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-navy-50 text-navy-900 border border-navy-200 font-display font-bold text-xs uppercase tracking-wider rounded-md flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-navy-700" />
            <span>{t.statusPending}</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6">
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

      <div className="pt-6 pb-2">
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-stone-950 tracking-tight uppercase leading-none">
          {lang === 'fil' ? 'Subaybayan ang Katayuan ng Ulat' : 'Track Incident Report Status'}
        </h1>
        <p className="text-sm text-stone-600 mt-2">
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
        className="mt-6 flex gap-2.5"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Hal. BK-7K2M9"
            className="w-full pl-10 pr-4 py-3 text-sm font-mono uppercase bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-tagapo-800 focus:border-tagapo-800 focus:outline-none shadow-2xs"
          />
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5" />
        </div>
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="px-6 py-3 bg-tagapo-900 hover:bg-tagapo-800 active:bg-tagapo-950 disabled:bg-stone-200 disabled:text-stone-400 text-white font-display font-bold uppercase tracking-wider text-xs rounded-xl shadow-xs hover:shadow transition cursor-pointer"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6 animate-in fade-in duration-300">
          <div className="p-5 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="font-display text-xs font-bold uppercase tracking-wider text-tagapo-900">
                Reference Code
              </span>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-stone-950 mt-1">
                {result.referenceCode}
              </div>
            </div>
            <div>{getStatusBadge(result.status)}</div>
          </div>

          {/* Details summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 bg-white rounded-xl border border-stone-200 flex items-start gap-3 shadow-2xs">
              <Building className="w-4 h-4 text-tagapo-800 shrink-0 mt-0.5" />
              <div>
                <span className="font-display text-stone-400 font-bold uppercase tracking-wide block text-[11px]">Municipality / Area</span>
                <span className="font-semibold text-stone-900 mt-0.5 block text-sm">
                  {[result.barangay, result.municipality || 'Rizal Province'].filter(Boolean).join(', ')}
                </span>
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-stone-200 flex items-start gap-3 shadow-2xs">
              <Calendar className="w-4 h-4 text-tagapo-800 shrink-0 mt-0.5" />
              <div>
                <span className="font-display text-stone-400 font-bold uppercase tracking-wide block text-[11px]">Date Reported</span>
                <span className="font-semibold text-stone-900 mt-0.5 block text-sm">
                  {new Date(result.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Category */}
          {result.finalCategory && (
            <div className="p-4 bg-white rounded-xl border border-stone-200 flex items-center gap-3 text-xs shadow-2xs">
              <Tag className="w-4 h-4 text-tagapo-800" />
              <div>
                <span className="font-display text-stone-400 font-bold uppercase tracking-wide block text-[11px]">Category Classification</span>
                <span className="font-bold text-stone-900 uppercase">
                  {result.finalCategory.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          )}

          {/* Status History Timeline */}
          {result.statusHistory && result.statusHistory.length > 0 && (
            <div className="border-t border-stone-200 pt-6">
              <h3 className="font-display text-xs font-bold text-stone-800 uppercase tracking-wider mb-4">
                Action Timeline
              </h3>
              <div className="space-y-4 relative before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                {result.statusHistory.map((item, idx) => (
                  <div key={idx} className="relative pl-7 text-xs">
                    <div className="absolute left-1.5 top-1.5 w-2.5 h-2.5 rounded-full bg-tagapo-900 border-2 border-white ring-2 ring-tagapo-200" />
                    <div className="font-bold text-stone-900 capitalize text-sm">
                      {item.status.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-stone-400 font-mono mt-0.5">
                      {new Date(item.changedAt).toLocaleString()} • {item.changedBy}
                    </div>
                    {item.notes && (
                      <p className="text-stone-700 mt-1.5 italic bg-stone-50 border border-stone-200 p-2.5 rounded-lg">
                        "{item.notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Note */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 flex items-start gap-3">
            <Shield className="w-4 h-4 text-tagapo-800 shrink-0 mt-0.5" />
            <div>
              <span className="font-display font-bold uppercase tracking-wider text-stone-900">Privacy Note: </span>
              In strict compliance with RA 10173, incident photos and precise GPS telemetry are not publicly disclosed on this page to prevent surveillance and protect resident anonymity.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
