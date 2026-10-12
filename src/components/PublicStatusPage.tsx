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
  onBackToReport: () => void;
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
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs rounded-full flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{t.statusResolved}</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-xs rounded-full flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>{t.statusInProgress}</span>
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-blue-100 text-blue-800 border border-blue-300 font-extrabold text-xs rounded-full flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{t.statusPending}</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 bg-white rounded-2xl shadow-xl border border-gray-100 my-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBackToReport}
          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === 'fil' ? 'Bumalik sa Pag-uulat' : 'Back to Reporting'}</span>
        </button>
        <span className="text-[11px] font-semibold text-gray-400">RA 10173 Protected</span>
      </div>

      <h1 className="text-xl font-black text-gray-900 tracking-tight">
        {lang === 'fil' ? 'Subaybayan ang Katayuan ng Ulat' : 'Track Incident Report Status'}
      </h1>
      <p className="text-xs text-gray-500 mt-0.5">
        {lang === 'fil'
          ? 'Ilagay ang iyong Reference Code upang makita ang kasalukuyang aksyon ng MENRO.'
          : 'Enter your Reference Code to view current municipal action.'}
      </p>

      {/* Code Search Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLookup(code);
        }}
        className="mt-4 flex gap-2"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Hal. BK-7K2M9"
            className="w-full pl-9 pr-3 py-2.5 text-sm font-mono uppercase bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
        </div>
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 text-white font-bold text-xs rounded-xl shadow transition"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-5 animate-in fade-in duration-300">
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Reference Code
              </span>
              <div className="text-xl font-mono font-black text-emerald-950">
                {result.referenceCode}
              </div>
            </div>
            <div>{getStatusBadge(result.status)}</div>
          </div>

          {/* Details summary */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-2">
              <Building className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-gray-400 font-semibold block text-[10px]">Municipality / Area</span>
                <span className="font-bold text-gray-800">
                  {[result.barangay, result.municipality || 'Rizal Province'].filter(Boolean).join(', ')}
                </span>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-gray-400 font-semibold block text-[10px]">Date Reported</span>
                <span className="font-bold text-gray-800">
                  {new Date(result.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Category */}
          {result.finalCategory && (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-2 text-xs">
              <Tag className="w-4 h-4 text-emerald-600" />
              <div>
                <span className="text-gray-400 font-semibold block text-[10px]">Category Classification</span>
                <span className="font-bold text-gray-800 uppercase">
                  {result.finalCategory.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          )}

          {/* Status History Timeline */}
          {result.statusHistory && result.statusHistory.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
                Action Timeline
              </h3>
              <div className="space-y-3 relative before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-200">
                {result.statusHistory.map((item, idx) => (
                  <div key={idx} className="relative pl-7 text-xs">
                    <div className="absolute left-1.5 top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-600 border-2 border-white ring-2 ring-emerald-200" />
                    <div className="font-bold text-gray-900 capitalize">
                      {item.status.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {new Date(item.changedAt).toLocaleString()} • {item.changedBy}
                    </div>
                    {item.notes && (
                      <p className="text-gray-600 mt-1 italic bg-gray-50 p-2 rounded-lg">
                        "{item.notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Note */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600 flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Privacy Note: </span>
              In strict compliance with RA 10173, incident photos and precise GPS telemetry are not publicly disclosed on this page to prevent surveillance and protect resident anonymity.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
