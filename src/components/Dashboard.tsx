import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  MapPin,
  Sparkles,
  Edit3,
  Database,
  Search,
  Eye,
  RefreshCw,
  Layers,
  BarChart3,
  Check,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Layout,
  Maximize2,
} from 'lucide-react';
import {
  IncidentReport,
  IncidentCategory,
  CATEGORIES,
  SEVERITY_LEVELS,
  ReportStatus,
  RIZAL_MUNICIPALITIES,
  MUNICIPALITY_COORDINATES,
} from '../types/report';
import { LeafletMap, MapLayerMode } from './LeafletMap';
import { resolveReportCoordinates } from '../lib/barangayCoordinates';
import { calculateDistanceMeters } from '../lib/geohash';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { Language, translations } from '../lib/i18n';
import { authHeaders } from '../lib/auth';

interface DashboardProps {
  lang: Language;
  officialUser: any | null;
  onOpenLogin: () => void;
  viewMode?: 'workbench' | 'full_map';
  onViewModeChange?: (mode: 'workbench' | 'full_map') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  lang,
  officialUser,
  onOpenLogin,
  viewMode: controlledViewMode,
  onViewModeChange,
}) => {
  const t = translations[lang];

  // View Mode: 'workbench' (Option 1 default) vs 'full_map' (Option 2 GIS Canvas)
  const [internalViewMode, setInternalViewMode] = useState<'workbench' | 'full_map'>(() => {
    try {
      const saved = localStorage.getItem('naturewatch_dashboard_view_mode');
      return saved === 'full_map' ? 'full_map' : 'workbench';
    } catch {
      return 'workbench';
    }
  });

  const viewMode = controlledViewMode !== undefined ? controlledViewMode : internalViewMode;

  const handleViewModeChange = (mode: 'workbench' | 'full_map') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
    try {
      localStorage.setItem('naturewatch_dashboard_view_mode', mode);
    } catch {}
  };

  // LikasMap-inspired Full Map layout states
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isLegendExpanded, setIsLegendExpanded] = useState<boolean>(true);

  // Reports state
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);

  // Filters
  const [municipalityFilter, setMunicipalityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Human-in-the-loop Override Form state
  const [overrideCategory, setOverrideCategory] = useState<IncidentCategory>('solid_waste');
  const [overrideSeverity, setOverrideSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [officerNotes, setOfficerNotes] = useState<string>('');
  const [isSavingOverride, setIsSavingOverride] = useState<boolean>(false);
  const [overrideSuccess, setOverrideSuccess] = useState<boolean>(false);

  // Status transition state
  const [newStatus, setNewStatus] = useState<ReportStatus>('in_progress');
  const [statusChangeNotes, setStatusChangeNotes] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Errors, photo and triage retry
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isRetryingTriage, setIsRetryingTriage] = useState<boolean>(false);

  // Map viewport & layer state
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5800, lng: 121.2800 });
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('boundaries');
  const [isMaskActive, setIsMaskActive] = useState<boolean>(true);

  // Aggregated incident counts per municipality for real-time choropleth shading
  const choroplethCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const report of reports) {
      const status = report.status || 'pending';
      if (status !== 'resolved' && report.location?.municipality) {
        const mun = report.location.municipality;
        counts[mun] = (counts[mun] || 0) + 1;
      }
    }
    return counts;
  }, [reports]);

  const handleQuickJump = (munKey: string) => {
    if (munKey === 'all') {
      setMunicipalityFilter('all');
      setMapCenter({ lat: 14.5800, lng: 121.2800 });
      setMapZoom(11);
    } else {
      const matchedKey =
        Object.keys(MUNICIPALITY_COORDINATES).find(
          (k) =>
            k === munKey ||
            k.toLowerCase().includes(munKey.toLowerCase()) ||
            munKey.toLowerCase().includes(k.toLowerCase())
        ) || munKey;
      setMunicipalityFilter(matchedKey);
      if (MUNICIPALITY_COORDINATES[matchedKey]) {
        setMapCenter(MUNICIPALITY_COORDINATES[matchedKey]);
        setMapZoom(13);
      }
    }
  };

  // Sync selected report inputs when selection changes
  useEffect(() => {
    if (selectedReport) {
      const activeCat = selectedReport.final?.category || selectedReport.aiTriage?.category || 'solid_waste';
      const activeSev = selectedReport.final?.severity || selectedReport.aiTriage?.severity || 3;
      setOverrideCategory(activeCat as IncidentCategory);
      setOverrideSeverity(activeSev as any);
      setOfficerNotes(selectedReport.final?.notes || '');
      setNewStatus(selectedReport.status);
      setStatusChangeNotes('');
      setOverrideSuccess(false);
      if (selectedReport.location) {
        const coords = resolveReportCoordinates(selectedReport);
        setMapCenter(coords);
        setMapZoom(14);
      }
    }
  }, [selectedReport?.id]);

  // Keyboard shortcut: Esc closes selected incident drawer, or returns to Workbench
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewMode === 'full_map') {
          if (selectedReport) {
            setSelectedReport(null);
          } else {
            handleViewModeChange('workbench');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, selectedReport]);

  // Firestore live listener: newest 100 reports. Status filtering happens client-side.
  useEffect(() => {
    setLoading(true);
    setLoadError(null);

    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: IncidentReport[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            referenceCode: data.referenceCode,
            createdAt: data.createdAt?.toDate
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString(),
            status: data.status || 'pending',
            statusHistory: data.statusHistory || [],
            location: data.location || { lat: 14.4791, lng: 121.1895, accuracyMeters: null, geohash: '', source: 'gps' },
            rawInput: data.rawInput || { description: '', hasImage: false },
            triageStatus: data.triageStatus || 'pending',
            aiTriage: data.aiTriage || null,
            final: data.final || null,
            duplicateClusterId: data.duplicateClusterId || null,
          };
        });

        setReports(list);
        // Keep the current selection (refreshed) or fall back to the newest report
        setSelectedReport((prev) =>
          prev ? list.find((r) => r.id === prev.id) ?? prev : list[0] ?? null
        );
        setLoading(false);
      },
      (err) => {
        console.error('Firestore reports listener failed:', err);
        setLoadError(
          'Could not load reports. Make sure your account is registered as an official and Firestore rules are deployed.'
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load the (compressed) photo for the selected report from Firestore
  useEffect(() => {
    setPhotoDataUrl(null);
    if (!selectedReport?.rawInput.hasImage) return;
    let cancelled = false;
    getDoc(doc(db, 'report_images', selectedReport.id))
      .then((snap) => {
        if (!cancelled && snap.exists()) setPhotoDataUrl(snap.data().data as string);
      })
      .catch((err) => console.error('Photo load failed:', err));
    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id]);

  // Duplicate spatial clustering calculation
  // Reports within ~100m, same category, within 48 hours grouped under duplicateClusterId
  const clusteredReports = useMemo(() => {
    const list = reports.map((r) => ({ ...r }));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const r1 = list[i];
        const r2 = list[j];
        const cat1 = r1.final?.category || r1.aiTriage?.category;
        const cat2 = r2.final?.category || r2.aiTriage?.category;

        if (cat1 && cat2 && cat1 === cat2) {
          const timeDiffHours = Math.abs(
            new Date(r1.createdAt).getTime() - new Date(r2.createdAt).getTime()
          ) / (1000 * 3600);

          if (timeDiffHours <= 48) {
            const distMeters = calculateDistanceMeters(
              r1.location.lat,
              r1.location.lng,
              r2.location.lat,
              r2.location.lng
            );

            if (distMeters <= 100) {
              const clusterId = r1.duplicateClusterId || r2.duplicateClusterId || `cluster_${r1.referenceCode}`;
              r1.duplicateClusterId = clusterId;
              r2.duplicateClusterId = clusterId;
            }
          }
        }
      }
    }
    return list;
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return clusteredReports.filter((report) => {
      // Municipality filter
      if (municipalityFilter !== 'all' && report.location?.municipality !== municipalityFilter) return false;

      // Status filter
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;

      // Category filter
      const activeCat = report.final?.category || report.aiTriage?.category || 'other';
      if (categoryFilter !== 'all' && activeCat !== categoryFilter) return false;

      // Severity filter
      const activeSev = report.final?.severity || report.aiTriage?.severity || 0;
      if (severityFilter === 'urgent' && activeSev < 4) return false;
      if (severityFilter !== 'all' && severityFilter !== 'urgent' && activeSev !== Number(severityFilter)) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesCode = report.referenceCode.toLowerCase().includes(term);
        const matchesDesc = report.rawInput.description.toLowerCase().includes(term);
        const matchesBrgy = (report.location.barangay || '').toLowerCase().includes(term);
        const matchesMun = (report.location.municipality || '').toLowerCase().includes(term);
        if (!matchesCode && !matchesDesc && !matchesBrgy && !matchesMun) return false;
      }

      return true;
    });
  }, [clusteredReports, municipalityFilter, statusFilter, categoryFilter, severityFilter, searchTerm]);

  // Statistics calculation
  const stats = useMemo(() => {
    const openCount = reports.filter((r) => r.status !== 'resolved').length;
    const urgentCount = reports.filter((r) => {
      const sev = r.final?.severity || r.aiTriage?.severity || 0;
      return sev >= 4 && r.status !== 'resolved';
    }).length;
    const resolvedCount = reports.filter((r) => r.status === 'resolved').length;

    // Category breakdown
    const categoryCounts: Record<string, number> = {};
    reports.forEach((r) => {
      const cat = r.final?.category || r.aiTriage?.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    return { openCount, urgentCount, resolvedCount, categoryCounts };
  }, [reports]);

  // Human-in-the-loop override submission
  const handleSaveOverride = async () => {
    if (!selectedReport || !officialUser) return;
    setIsSavingOverride(true);
    setOverrideSuccess(false);
    setActionError(null);

    const finalData = {
      category: overrideCategory,
      severity: overrideSeverity,
      reviewedBy: officialUser.uid,
      reviewedAt: new Date().toISOString(),
      notes: officerNotes.trim(),
    };

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), { final: finalData });

      const updated = { ...selectedReport, final: finalData };
      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);

      setOverrideSuccess(true);
      setTimeout(() => setOverrideSuccess(false), 3000);
    } catch (err) {
      console.error('Override update failed:', err);
      setActionError('Could not save the review. You may not have permission, or you are offline.');
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Status transition handler (automatically records statusHistory)
  const handleUpdateStatus = async () => {
    if (!selectedReport || !officialUser) return;
    setIsUpdatingStatus(true);
    setActionError(null);

    const notes = statusChangeNotes.trim();
    const newHistoryItem = {
      status: newStatus,
      changedBy: officialUser.displayName || officialUser.email || 'PG-ENRO Officer',
      changedAt: new Date().toISOString(),
      // Firestore rejects `undefined`, so only include notes when present
      ...(notes ? { notes } : {}),
    };

    const updatedHistory = [...(selectedReport.statusHistory || []), newHistoryItem];

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: newStatus,
        statusHistory: updatedHistory,
      });

      const updated = {
        ...selectedReport,
        status: newStatus,
        statusHistory: updatedHistory,
      };
      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);
      setStatusChangeNotes('');
    } catch (err) {
      console.error('Status transition failed:', err);
      setActionError('Could not update the status. You may not have permission, or you are offline.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Re-run AI triage for a failed/stuck report (official-only API)
  const handleRetryTriage = async () => {
    if (!selectedReport) return;
    setIsRetryingTriage(true);
    setActionError(null);
    try {
      const res = await fetch('/api/retry-triage', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ reportId: selectedReport.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('Retry triage failed:', err);
      setActionError('Could not start AI triage. Try again in a moment.');
    } finally {
      setIsRetryingTriage(false);
    }
  };

  const retryTriageButton = (
    <button
      type="button"
      onClick={handleRetryTriage}
      disabled={isRetryingTriage}
      className="px-3 py-1.5 bg-tagapo-900 hover:bg-tagapo-800 disabled:bg-stone-200 text-white rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isRetryingTriage ? 'animate-spin' : ''}`} />
      <span>{isRetryingTriage ? 'Running AI triage...' : 'Run AI triage again'}</span>
    </button>
  );

  // If user is not authenticated as official, display access gate
  if (!officialUser) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-stone-200 shadow-sm text-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="font-display font-extrabold text-2xl text-stone-900 tracking-tight uppercase">
          {t.officialPortalTitle}
        </h2>
        <p className="text-sm text-stone-600 mt-2 max-w-md mx-auto">
          {t.officialPortalDesc}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onOpenLogin}
            className="py-3 px-6 bg-tagapo-900 hover:bg-tagapo-800 text-white font-display font-bold uppercase tracking-wider text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            {t.loginOfficialBtn}
          </button>
        </div>

        <p className="text-xs text-stone-400 mt-6 font-mono">
          Authorized PG-ENRO, local MENRO, and Provincial Quick Response Team access only.
        </p>
      </div>
    );
  }

  const activeCategory =
    selectedReport?.final?.category || selectedReport?.aiTriage?.category || 'other';
  const activeSeverity =
    selectedReport?.final?.severity || selectedReport?.aiTriage?.severity || 3;
  const activeMetadata = CATEGORIES[activeCategory as IncidentCategory] || CATEGORIES.other;

  return (
    <div className={viewMode === 'full_map' ? 'w-full h-full relative overflow-hidden flex-1' : 'mx-auto space-y-4 max-w-7xl px-4 sm:px-6 lg:px-8 py-2 sm:py-4'}>
      {/* Optional Alert Notification Toast */}
      {(loadError || actionError) && (
        <div role="alert" className={`p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between gap-2 shadow-xs ${viewMode === 'full_map' ? 'absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-md w-full' : ''}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{loadError || actionError}</span>
          </div>
          <button
            onClick={() => {
              setLoadError(null);
              setActionError(null);
            }}
            className="text-rose-500 hover:text-rose-800 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Command Banner & View Mode Switcher (rendered only in Workbench mode) */}
      {viewMode === 'workbench' && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-3 border-b border-stone-200">
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-stone-950 tracking-tight uppercase leading-none">
              PG-ENRO Rizal Command Dashboard
            </h1>
            <p className="text-xs text-stone-500 mt-1.5 font-medium">
              Provincial Government of Rizal • Incident Triage & Human-in-the-Loop Operations
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tactical View Switcher Segmented Control */}
            <div className="bg-stone-100 p-1 rounded-xl border border-stone-200 flex items-center gap-1 shadow-2xs">
              <button
                type="button"
                onClick={() => handleViewModeChange('workbench')}
                className="px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer bg-tagapo-900 text-white shadow-xs"
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Workbench</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('full_map')}
                className="px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full Map</span>
              </button>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tagapo-900 text-tagapo-50 font-display text-xs font-bold uppercase tracking-wider rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Telemetry
            </span>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW MODE 1: OPTION 1 (SPLIT-SCREEN TACTICAL WORKBENCH)   */}
      {/* ========================================================= */}
      {viewMode === 'workbench' && (
        <div className="space-y-4">
          {/* Unified Operations Telemetry Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 border border-stone-200 bg-stone-50/70 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3.5 sm:p-4 bg-white/60">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500">
                {t.statsOpen}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-stone-950">
                  {stats.openCount}
                </span>
                <span className="text-[11px] text-stone-400 font-medium">active cases</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-rose-50/40">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                {t.statsUrgent}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-rose-700">
                  {stats.urgentCount}
                </span>
                <span className="text-[11px] text-rose-600 font-medium">severity 4-5</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white/60">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500">
                {t.statsResolved}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-tagapo-800">
                  {stats.resolvedCount}
                </span>
                <span className="text-[11px] text-stone-400 font-medium">closed cases</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white/60">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500">
                {t.statsAvgTime}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-navy-900">
                  18.4 hrs
                </span>
                <span className="text-[11px] text-stone-400 font-medium">provincial SLA</span>
              </div>
            </div>
          </div>

          {/* Integrated Tactical Command Toolbar */}
          <div className="p-2.5 bg-white border border-stone-200 rounded-xl shadow-2xs flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search reference code, description, or barangay..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800"
              />
            </div>

            {/* Municipality Filter */}
            <select
              value={municipalityFilter}
              onChange={(e) => {
                const mun = e.target.value;
                setMunicipalityFilter(mun);
                if (mun !== 'all' && MUNICIPALITY_COORDINATES[mun]) {
                  setMapCenter(MUNICIPALITY_COORDINATES[mun]);
                  setMapZoom(13);
                }
              }}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none max-w-[170px] truncate"
            >
              <option value="all">{t.allMunicipalitiesFilter}</option>
              {RIZAL_MUNICIPALITIES.map((mun) => (
                <option key={mun} value={mun}>
                  {mun}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none max-w-[170px] truncate"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>
                  {lang === 'fil' ? cat.labelFil : cat.labelEn}
                </option>
              ))}
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none"
            >
              <option value="all">All Severities</option>
              <option value="urgent">Urgent Hazards (4-5)</option>
              <option value="1">1 - Minor</option>
              <option value="2">2 - Low</option>
              <option value="3">3 - Moderate</option>
              <option value="4">4 - High</option>
              <option value="5">5 - Critical</option>
            </select>

            {(municipalityFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all' || searchTerm) && (
              <button
                onClick={() => {
                  setMunicipalityFilter('all');
                  setStatusFilter('all');
                  setCategoryFilter('all');
                  setSeverityFilter('all');
                  setSearchTerm('');
                  setMapCenter({ lat: 14.5800, lng: 121.2800 });
                  setMapZoom(11);
                }}
                className="font-display text-xs font-bold uppercase tracking-wider text-rose-700 hover:text-rose-900 px-2 py-1 cursor-pointer"
              >
                Reset
              </button>
            )}

            {/* Re-run AI Triage Button */}
            <button
              type="button"
              onClick={handleRetryTriage}
              disabled={isRetryingTriage || !selectedReport}
              title={selectedReport ? "Re-run AI triage on selected incident" : "Select an incident to re-run triage"}
              className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:hover:bg-stone-100 text-stone-700 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer ml-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingTriage ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRetryingTriage ? 'Triaging...' : 'AI Triage'}</span>
            </button>
          </div>

          {/* Split-Screen Tactical Workbench Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column (7 cols): Map Stage with In-Map HUD & Queue Stream */}
            <div className="lg:col-span-7 space-y-4">
              {/* Map Canvas with Integrated HUD */}
              <div className="relative border border-stone-300 rounded-xl overflow-hidden shadow-xs bg-stone-100">
                {/* Top In-Map HUD: Quick Jump LGU Chips */}
                <div className="absolute top-2.5 left-2.5 z-20 flex flex-wrap items-center gap-0.5 max-w-[calc(100%-140px)] bg-white/95 backdrop-blur-md p-1 rounded-xl border border-stone-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
                  <button
                    type="button"
                    onClick={() => handleQuickJump('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-bold uppercase tracking-wide transition cursor-pointer whitespace-nowrap ${
                      municipalityFilter === 'all'
                        ? 'bg-tagapo-800 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                  >
                    All Rizal
                  </button>
                  {['Antipolo City', 'Tanay', 'Rodriguez (Montalban)', 'Binangonan'].map((mun) => (
                    <button
                      key={mun}
                      type="button"
                      onClick={() => handleQuickJump(mun)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-bold uppercase tracking-wide transition cursor-pointer whitespace-nowrap ${
                        municipalityFilter === mun
                          ? 'bg-tagapo-800 text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                      }`}
                    >
                      {mun.replace(' City', '').replace(' (Montalban)', '')}
                    </button>
                  ))}
                </div>

                {/* Top-Right Secondary Shortcut: Maximize to Full Map */}
                <button
                  type="button"
                  onClick={() => handleViewModeChange('full_map')}
                  title="Expand to Full Map Canvas"
                  className="absolute top-2.5 right-2.5 z-20 px-2.5 py-1.5 rounded-xl text-[11px] font-display font-bold uppercase tracking-wider backdrop-blur-md bg-white/95 hover:bg-stone-50 active:bg-stone-100 text-stone-800 border border-stone-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-tagapo-800" />
                  <span className="hidden sm:inline">Full Map</span>
                </button>

                {/* Bottom-left In-Map HUD: Tactical Layer Controller */}
                <div className="absolute bottom-6 left-2.5 z-20 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-stone-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 flex items-center gap-0.5 text-[10px] font-display font-bold uppercase tracking-wider text-stone-700">
                  <button
                    type="button"
                    onClick={() => setMapLayerMode('standard')}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      mapLayerMode === 'standard' ? 'bg-tagapo-800 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title="Standard point/cluster map"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Pins</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapLayerMode('boundaries')}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      mapLayerMode === 'boundaries' ? 'bg-tagapo-800 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title="Municipal vector boundaries & active focus"
                  >
                    <span>⛶ Boundaries</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapLayerMode('choropleth')}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      mapLayerMode === 'choropleth' ? 'bg-tagapo-800 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title="Thematic incident density volume"
                  >
                    <span>⬡ Density Choropleth</span>
                  </button>

                  <div className="h-4 w-px bg-stone-200/80 mx-0.5" />

                  <button
                    type="button"
                    onClick={() => setIsMaskActive(!isMaskActive)}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      isMaskActive
                        ? 'bg-tagapo-800 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title={isMaskActive ? "Click to disable non-Rizal dimming mask" : "Click to gray out non-Rizal regions"}
                  >
                    <span>🎯 Focus: Rizal</span>
                  </button>
                </div>

                {/* Bottom-right In-Map HUD: Tactical Severity Legend */}
                <div className="absolute bottom-6 right-2.5 z-20 bg-white/95 backdrop-blur-md px-3 py-1 rounded-xl text-[10px] font-display font-bold uppercase tracking-wide border border-stone-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 flex items-center gap-2.5 text-stone-700">
                  <span className="flex items-center gap-1 text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    1-2 Minor
                  </span>
                  <span className="flex items-center gap-1 text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    3 Mod
                  </span>
                  <span className="flex items-center gap-1 text-rose-800">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                    4-5 Urgent
                  </span>
                  <span className="hidden sm:inline-block text-stone-300">|</span>
                  <span className="hidden sm:inline-block text-stone-500 font-medium normal-case">
                    num = count
                  </span>
                </div>

                {/* Map Component */}
                <LeafletMap
                  mode="dashboard"
                  center={mapCenter}
                  zoom={mapZoom}
                  reports={filteredReports}
                  selectedReportId={selectedReport?.id}
                  layerMode={mapLayerMode}
                  activeMunicipality={municipalityFilter !== 'all' ? municipalityFilter : null}
                  onMunicipalityClick={(mun) => handleQuickJump(mun)}
                  choroplethCounts={choroplethCounts}
                  maskNonRizal={isMaskActive}
                  onSelectReport={(r) => {
                    setSelectedReport(r);
                    const coords = resolveReportCoordinates(r);
                    setMapCenter(coords);
                    setMapZoom(14);
                  }}
                  className="h-[440px] sm:h-[480px] w-full"
                />
              </div>

              {/* Incident Queue Stream */}
              <div className="bg-white rounded-xl border border-stone-200 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                  <span className="font-display font-bold text-xs uppercase tracking-wider text-stone-800">
                    Incident Queue Stream
                  </span>
                  <span className="text-xs font-mono font-semibold text-stone-500">
                    {filteredReports.length} {filteredReports.length === 1 ? 'incident' : 'incidents'}
                  </span>
                </div>

                <div className="divide-y divide-stone-100 max-h-[380px] overflow-y-auto">
                  {filteredReports.length === 0 ? (
                    <div className="p-8 text-center text-xs text-stone-500">
                      No incident reports match your current filters.
                    </div>
                  ) : (
                    filteredReports.map((report) => {
                      const isSelected = selectedReport?.id === report.id;
                      const sev = report.final?.severity || report.aiTriage?.severity || 3;
                      const cat = report.final?.category || report.aiTriage?.category || 'other';
                      const catMeta = CATEGORIES[cat as IncidentCategory] || CATEGORIES.other;

                      return (
                        <div
                          key={report.id}
                          onClick={() => {
                            setSelectedReport(report);
                            const coords = resolveReportCoordinates(report);
                            setMapCenter(coords);
                            setMapZoom(14);
                          }}
                          className={`p-3.5 hover:bg-stone-50 cursor-pointer transition flex items-start justify-between gap-3 ${
                            isSelected ? 'bg-tagapo-50/70 ring-1 ring-tagapo-800' : ''
                          }`}
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-stone-900">
                                {report.referenceCode}
                              </span>
                              <span
                                className={`text-[11px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${catMeta.badgeColor}`}
                              >
                                {lang === 'fil' ? catMeta.labelFil : catMeta.labelEn}
                              </span>
                              {report.duplicateClusterId && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 flex items-center gap-0.5">
                                  <Layers className="w-2.5 h-2.5" />
                                  Cluster
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-stone-600 line-clamp-1">
                              {report.aiTriage?.summary || report.rawInput.description}
                            </p>

                            <div className="flex items-center gap-2 text-xs text-stone-400 font-mono">
                              <span>{[report.location.barangay, report.location.municipality || 'Rizal'].filter(Boolean).join(', ')}</span>
                              <span>•</span>
                              <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-display font-black uppercase tracking-wider ${
                                sev >= 4
                                  ? 'bg-rose-700 text-white animate-pulse'
                                  : sev === 3
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-tagapo-800 text-white'
                              }`}
                            >
                              Sev {sev}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column (5 cols): Incident Target Dossier & Actions */}
            <div className="lg:col-span-5 space-y-4">
              {selectedReport ? (
                <div className="bg-white rounded-xl border border-stone-200 shadow-xs p-5 space-y-5">
                  {/* Dossier Header */}
                  <div className="flex items-start justify-between border-b border-stone-200 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-bold uppercase tracking-wider text-stone-400">
                          Report File
                        </span>
                        <span className="font-mono font-bold text-xl text-stone-950">
                          {selectedReport.referenceCode}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 font-mono mt-0.5">
                        Logged {new Date(selectedReport.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded text-xs font-display font-bold uppercase tracking-wider ${
                        selectedReport.status === 'resolved'
                          ? 'bg-tagapo-50 text-tagapo-900 border border-tagapo-200'
                          : selectedReport.status === 'in_progress'
                          ? 'bg-amber-50 text-amber-900 border border-amber-200'
                          : 'bg-navy-50 text-navy-900 border border-navy-200'
                      }`}
                    >
                      {selectedReport.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Duplicate Cluster Notice */}
                  {clusteredReports.find((r) => r.id === selectedReport.id)?.duplicateClusterId && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
                      <div className="font-display font-bold uppercase tracking-wide flex items-center gap-1.5 text-amber-900">
                        <Layers className="w-4 h-4 text-amber-700" />
                        <span>{t.duplicateClusterDetected}</span>
                      </div>
                      <p className="text-[11px] leading-tight text-amber-800">
                        {t.duplicateClusterDesc}
                      </p>
                    </div>
                  )}

                  {/* Photo Display (Secured Image Preview) */}
                  <div className="space-y-1">
                    <label className="font-display text-xs font-bold uppercase tracking-wide text-stone-600 block">
                      Incident Photo (Secured Access)
                    </label>
                    <div className="relative rounded-xl overflow-hidden bg-stone-950 aspect-video flex items-center justify-center border border-stone-300">
                      {photoDataUrl ? (
                        <img
                          src={photoDataUrl}
                          alt="Incident evidence"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-4 text-stone-400 text-xs">
                          <Eye className="w-6 h-6 mx-auto mb-1 text-stone-500" />
                          <span>{selectedReport.rawInput.hasImage ? 'Loading photo...' : 'No photo was submitted'}</span>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/75 backdrop-blur-xs text-[10px] font-mono font-bold text-tagapo-300 rounded border border-white/10">
                        RA 10173 SECURED TELEMETRY
                      </div>
                    </div>
                  </div>

                  {/* Resident Description */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wide text-stone-600">
                      <span>Resident Description</span>
                      <span className="text-[10px] text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                        Untrusted Input
                      </span>
                    </div>
                    <p className="text-xs text-stone-900 italic leading-relaxed">
                      "{selectedReport.rawInput.description}"
                    </p>
                    <div className="text-xs text-stone-500 font-mono pt-1">
                      Loc: {selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)} • {[selectedReport.location.barangay, selectedReport.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                    </div>
                  </div>

                  {/* AI Multimodal Triage Assessment */}
                  <div className="p-4 bg-tagapo-50/60 rounded-xl border border-tagapo-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wide text-tagapo-950">
                        <Sparkles className="w-4 h-4 text-tagapo-800" />
                        <span>{t.aiTriageTitle}</span>
                      </div>
                      {selectedReport.aiTriage && (
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-tagapo-200 text-tagapo-950 border border-tagapo-300">
                          {t.aiConfidence}: {(selectedReport.aiTriage.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {selectedReport.triageStatus === 'failed' ? (
                      <div className="space-y-2">
                        <div className="p-2.5 bg-rose-100/80 rounded-lg text-rose-800 text-xs font-bold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{t.needsReviewBadge}</span>
                        </div>
                        {retryTriageButton}
                      </div>
                    ) : selectedReport.aiTriage ? (
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                            {t.aiSummary}
                          </span>
                          <p className="text-stone-900 font-semibold mt-0.5">
                            {selectedReport.aiTriage.summary}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-tagapo-100">
                          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                            {t.aiReasoning}
                          </span>
                          <p className="text-stone-700 text-xs mt-0.5 leading-relaxed">
                            {selectedReport.aiTriage.reasoning}
                          </p>
                        </div>

                        <div className="text-[11px] text-stone-400 font-mono">
                          Engine: {selectedReport.aiTriage.model}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-stone-500 italic">Triage in progress...</p>
                        {retryTriageButton}
                      </div>
                    )}
                  </div>

                  {/* Human-in-the-Loop Override Form */}
                  <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-xs font-bold uppercase tracking-wide text-stone-900 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-tagapo-800" />
                        <span>{t.humanOverrideTitle}</span>
                      </h3>
                      {selectedReport.final && (
                        <span className="font-display text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-navy-100 text-navy-900 border border-navy-200">
                          Human Verified
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block font-display text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1">
                          {t.overrideCategory}
                        </label>
                        <select
                          value={overrideCategory}
                          onChange={(e) => setOverrideCategory(e.target.value as any)}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800"
                        >
                          {Object.entries(CATEGORIES).map(([key, cat]) => (
                            <option key={key} value={key}>
                              {lang === 'fil' ? cat.labelFil : cat.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-display text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1">
                          {t.overrideSeverity}
                        </label>
                        <select
                          value={overrideSeverity}
                          onChange={(e) => setOverrideSeverity(Number(e.target.value) as any)}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800 font-bold"
                        >
                          <option value="1">1 - Minor / Cosmetic</option>
                          <option value="2">2 - Low Concern</option>
                          <option value="3">3 - Moderate</option>
                          <option value="4">4 - High Hazard</option>
                          <option value="5">5 - Critical Emergency</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-display text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1">
                        {t.officerNotes}
                      </label>
                      <textarea
                        value={officerNotes}
                        onChange={(e) => setOfficerNotes(e.target.value)}
                        rows={2}
                        placeholder="Enter assessment findings or regulatory directives..."
                        className="w-full text-xs px-3 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveOverride}
                      disabled={isSavingOverride}
                      className="w-full py-2.5 bg-tagapo-900 hover:bg-tagapo-800 active:bg-tagapo-950 text-white font-display font-bold uppercase tracking-wider text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSavingOverride ? 'Saving...' : t.saveOverrideBtn}</span>
                    </button>

                    {overrideSuccess && (
                      <p className="text-xs text-tagapo-800 font-bold text-center">
                        Final assessment saved and applied to live dashboard!
                      </p>
                    )}
                  </div>

                  {/* Status Transition Workflow */}
                  <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                    <label className="font-display text-xs font-bold uppercase tracking-wide text-stone-800 block">
                      Update Incident Status
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['pending', 'in_progress', 'resolved'] as ReportStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setNewStatus(st)}
                          className={`py-2 text-xs font-display font-bold uppercase tracking-wider rounded-lg border transition cursor-pointer ${
                            newStatus === st
                              ? 'bg-tagapo-900 text-white border-tagapo-950 shadow-xs'
                              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {st.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={statusChangeNotes}
                      onChange={(e) => setStatusChangeNotes(e.target.value)}
                      placeholder="Notes (e.g. 'Field team dispatched', 'Cleanup finished')..."
                      className="w-full text-xs px-3 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800"
                    />

                    <button
                      type="button"
                      onClick={handleUpdateStatus}
                      disabled={isUpdatingStatus || newStatus === selectedReport.status}
                      className="w-full py-2.5 bg-tagapo-900 hover:bg-tagapo-800 disabled:bg-stone-200 text-white font-display font-bold uppercase tracking-wider text-xs rounded-lg transition shadow-xs cursor-pointer"
                    >
                      {isUpdatingStatus ? 'Updating...' : 'Log Status Transition'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-stone-50 rounded-xl border border-stone-200 p-12 text-center text-xs text-stone-500 space-y-2">
                  <MapPin className="w-8 h-8 text-stone-400 mx-auto" />
                  <div className="font-display font-bold uppercase tracking-wider text-stone-800 text-sm">
                    Standby for Target Selection
                  </div>
                  <p className="text-stone-500 max-w-xs mx-auto">
                    Select an incident pin on the geospatial map or a row in the incident queue stream to inspect telemetry and perform human-in-the-loop triage.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW MODE 2: LIKASMAP-INSPIRED INTEGRATED FULL MAP CANVAS */}
      {/* ========================================================= */}
      {viewMode === 'full_map' && (
        <div className="relative w-full h-full overflow-hidden bg-stone-100 flex flex-col">
          {/* ========================================================= */}
          {/* 1. ANCHORED TOP SUB-BAR (Flush below navbar)              */}
          {/* ========================================================= */}
          <div className="h-14 shrink-0 bg-white/95 backdrop-blur-md border-b border-stone-200/90 px-3 sm:px-4 flex items-center justify-between gap-2.5 z-30 shadow-xs">
            {/* Left: Search input + LGU Horizontal Scrollable Tabs */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {/* Search Input */}
              <div className="relative w-40 sm:w-56 shrink-0">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search ref, barangay..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-stone-50 hover:bg-stone-100/70 focus:bg-white border border-stone-200 focus:border-tagapo-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800 font-sans transition placeholder:text-stone-400"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* LGU Filter Tabs (horizontal scrollable bar) */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                <button
                  type="button"
                  onClick={() => handleQuickJump('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-display font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap ${
                    municipalityFilter === 'all'
                      ? 'bg-tagapo-800 text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  }`}
                >
                  All Rizal
                </button>
                {RIZAL_MUNICIPALITIES.map((mun) => {
                  const shortName = mun.replace(' City', '').replace(' (Montalban)', '');
                  const isSelected = municipalityFilter === mun;
                  return (
                    <button
                      key={mun}
                      type="button"
                      onClick={() => handleQuickJump(mun)}
                      className={`px-2.5 py-1 rounded-md text-xs font-display font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? 'bg-tagapo-800 text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                      }`}
                    >
                      {shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Telemetry & Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Telemetry Metrics */}
              <div className="hidden xl:flex items-center gap-3 text-xs px-2 border-r border-stone-200">
                <span className="flex items-center gap-1.5 font-semibold text-stone-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono font-bold text-stone-900">{stats.openCount}</span> Active
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-rose-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                  <span className="font-mono font-bold text-rose-800">{stats.urgentCount}</span> Urgent
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                  <span className="font-mono font-bold text-emerald-800">{stats.resolvedCount}</span> Resolved
                </span>
              </div>

              {/* Rerun AI Triage on selection (if selected report) */}
              {selectedReport && (
                <button
                  type="button"
                  onClick={handleRetryTriage}
                  disabled={isRetryingTriage}
                  title="Re-run AI triage on selected incident"
                  className="px-2.5 py-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 active:bg-stone-200 disabled:opacity-40 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer border border-stone-200/80"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetryingTriage ? 'animate-spin' : ''}`} />
                  <span className="hidden lg:inline">{isRetryingTriage ? 'Triaging...' : 'AI Triage'}</span>
                </button>
              )}

              {/* Switch to Workbench */}
              <button
                type="button"
                onClick={() => handleViewModeChange('workbench')}
                className="px-2.5 py-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 active:bg-stone-200 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer border border-stone-200/80"
                title="Switch back to split-screen Workbench"
              >
                <Layout className="w-3.5 h-3.5 text-tagapo-800" />
                <span className="hidden sm:inline">Workbench</span>
              </button>

              {/* Sidebar Toggle Button */}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer border ${
                  isSidebarOpen
                    ? 'bg-tagapo-800 text-white border-tagapo-900 shadow-xs'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                }`}
                title={isSidebarOpen ? 'Hide side panel' : 'Show side panel'}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {selectedReport ? 'Dossier' : `Queue (${filteredReports.length})`}
                </span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2. SPLIT WORKSPACE: MAP CANVAS + DOCKED RIGHT SIDEBAR     */}
          {/* ========================================================= */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Map Canvas (Expands to 100% when sidebar is collapsed) */}
            <div className="flex-1 h-full relative min-w-0">
              <LeafletMap
                mode="dashboard"
                center={mapCenter}
                zoom={mapZoom}
                reports={filteredReports}
                selectedReportId={selectedReport?.id}
                layerMode={mapLayerMode}
                activeMunicipality={municipalityFilter !== 'all' ? municipalityFilter : null}
                onMunicipalityClick={(mun) => handleQuickJump(mun)}
                choroplethCounts={choroplethCounts}
                maskNonRizal={isMaskActive}
                onSelectReport={(r) => {
                  setSelectedReport(r);
                  setIsSidebarOpen(true);
                  const coords = resolveReportCoordinates(r);
                  setMapCenter(coords);
                  setMapZoom(14);
                }}
                className="h-full w-full"
              />

              {/* Bottom-Left Tucked Legend Card */}
              <div className="absolute bottom-4 left-4 z-20 pointer-events-auto bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-md rounded-xl p-2.5 space-y-2 max-w-[270px]">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-stone-100">
                  <span className="font-display font-bold text-[10px] uppercase tracking-wider text-stone-500">
                    Map Layers
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                    className="text-stone-400 hover:text-stone-700 p-0.5 rounded cursor-pointer"
                    title={isLegendExpanded ? 'Collapse legend' : 'Expand legend'}
                  >
                    <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${isLegendExpanded ? '-rotate-90' : 'rotate-90'}`} />
                  </button>
                </div>

                {/* Layer Mode Switcher Tabs */}
                <div className="grid grid-cols-3 gap-1 bg-stone-100/90 p-0.5 rounded-lg text-[10px] font-display font-bold uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => setMapLayerMode('standard')}
                    className={`py-1 px-1.5 rounded-md text-center transition cursor-pointer ${
                      mapLayerMode === 'standard' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Pins mode"
                  >
                    Pins
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapLayerMode('boundaries')}
                    className={`py-1 px-1.5 rounded-md text-center transition cursor-pointer ${
                      mapLayerMode === 'boundaries' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Boundaries mode"
                  >
                    Boundaries
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapLayerMode('choropleth')}
                    className={`py-1 px-1.5 rounded-md text-center transition cursor-pointer ${
                      mapLayerMode === 'choropleth' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Density Choropleth mode"
                  >
                    Choropleth
                  </button>
                </div>

                {/* Jurisdiction Focus (Mask Non-Rizal) Toggle */}
                <button
                  type="button"
                  onClick={() => setIsMaskActive(!isMaskActive)}
                  className={`w-full py-1.5 px-2 rounded-lg text-[10px] font-display font-bold uppercase tracking-wider flex items-center justify-between transition cursor-pointer border ${
                    isMaskActive
                      ? 'bg-tagapo-50 text-tagapo-950 border-tagapo-300'
                      : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                  title={isMaskActive ? "Click to disable non-Rizal dimming mask" : "Click to gray out non-Rizal regions"}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isMaskActive ? 'bg-tagapo-700 animate-pulse' : 'bg-stone-400'}`} />
                    <span>Focus: Rizal Only</span>
                  </span>
                  <span className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${isMaskActive ? 'bg-tagapo-200/80 text-tagapo-900' : 'bg-stone-100 text-stone-500'}`}>
                    {isMaskActive ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Legend Scale */}
                {isLegendExpanded && (
                  <div className="pt-1 space-y-1.5 text-[10px]">
                    {mapLayerMode === 'choropleth' ? (
                      <div>
                        <div className="flex items-center justify-between text-stone-500 font-mono mb-1">
                          <span>0 reports</span>
                          <span>5+ reports</span>
                        </div>
                        <div className="h-2 rounded-full w-full bg-gradient-to-r from-emerald-100 via-emerald-400 to-emerald-800 border border-stone-200" />
                        <div className="text-stone-400 text-[9px] mt-1 text-center font-display font-medium">
                          Provincial Incident Density
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1 text-stone-700 font-display font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1 text-emerald-800">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          1-2 Minor
                        </span>
                        <span className="flex items-center gap-1 text-amber-800">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          3 Mod
                        </span>
                        <span className="flex items-center gap-1 text-rose-800">
                          <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                          4-5 Urgent
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Edge tab to open sidebar when collapsed */}
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="absolute top-4 right-0 z-20 pointer-events-auto px-3 py-2 bg-white/95 backdrop-blur-md border-y border-l border-stone-300 shadow-md rounded-l-xl text-xs font-display font-bold uppercase tracking-wider text-stone-800 hover:bg-stone-50 flex items-center gap-1.5 cursor-pointer transition hover:pr-4"
                  title="Expand side panel"
                >
                  <ChevronLeft className="w-4 h-4 text-tagapo-800" />
                  <span>{selectedReport ? 'View Dossier' : `Queue (${filteredReports.length})`}</span>
                </button>
              )}
            </div>

            {/* Docked Right Sidebar (Queue Stream or Selected Dossier) */}
            {isSidebarOpen && (
              <aside className="w-full sm:w-[380px] lg:w-[420px] h-full shrink-0 bg-white border-l border-stone-200 shadow-sm flex flex-col z-20 transition-all duration-300 absolute sm:relative inset-y-0 right-0">
                {selectedReport ? (
                  /* ===================================================== */
                  /* A. TARGET INCIDENT DOSSIER & ACTION CONSOLE            */
                  /* ===================================================== */
                  <div className="h-full flex flex-col overflow-hidden">
                    {/* Header with Back to Queue button */}
                    <div className="px-3.5 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-stone-900 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedReport(null)}
                          className="flex items-center gap-1 text-xs font-display font-bold uppercase tracking-wider text-tagapo-800 hover:text-tagapo-950 hover:bg-stone-200/60 px-2 py-1 rounded-md transition cursor-pointer shrink-0"
                          title="Return to incident queue"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Queue</span>
                        </button>
                        <span className="text-stone-300">|</span>
                        <span className="font-mono font-bold text-xs sm:text-sm text-stone-950 truncate">
                          {selectedReport.referenceCode}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase tracking-wider ${
                            selectedReport.status === 'resolved'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : selectedReport.status === 'in_progress'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {selectedReport.status.replace(/_/g, ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsSidebarOpen(false)}
                          title="Collapse side panel"
                          className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded transition cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Dossier Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {/* Duplicate Cluster Notice */}
                      {clusteredReports.find((r) => r.id === selectedReport.id)?.duplicateClusterId && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
                          <div className="font-display font-bold uppercase tracking-wide flex items-center gap-1.5 text-amber-900">
                            <Layers className="w-4 h-4 text-amber-700" />
                            <span>{t.duplicateClusterDetected}</span>
                          </div>
                          <p className="text-[11px] leading-tight text-amber-800">
                            {t.duplicateClusterDesc}
                          </p>
                        </div>
                      )}

                      {/* Photo Display (Secured Image Preview) */}
                      <div className="space-y-1">
                        <label className="font-display text-xs font-bold uppercase tracking-wide text-stone-600 block">
                          Incident Photo (Secured Access)
                        </label>
                        <div className="relative rounded-xl overflow-hidden bg-stone-950 aspect-video flex items-center justify-center border border-stone-300">
                          {photoDataUrl ? (
                            <img
                              src={photoDataUrl}
                              alt="Incident evidence"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-4 text-stone-400 text-xs">
                              <Eye className="w-6 h-6 mx-auto mb-1 text-stone-500" />
                              <span>{selectedReport.rawInput.hasImage ? 'Loading photo...' : 'No photo was submitted'}</span>
                            </div>
                          )}
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/75 backdrop-blur-xs text-[10px] font-mono font-bold text-tagapo-300 rounded border border-white/10">
                            RA 10173 SECURED TELEMETRY
                          </div>
                        </div>
                      </div>

                      {/* Resident Description */}
                      <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wide text-stone-600">
                          <span>Resident Description</span>
                          <span className="text-[10px] text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                            Untrusted Input
                          </span>
                        </div>
                        <p className="text-xs text-stone-900 italic leading-relaxed">
                          "{selectedReport.rawInput.description}"
                        </p>
                        <div className="text-xs text-stone-500 font-mono pt-1">
                          Loc: {selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)} • {[selectedReport.location.barangay, selectedReport.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                        </div>
                      </div>

                      {/* AI Multimodal Triage Assessment */}
                      <div className="p-4 bg-tagapo-50/60 rounded-xl border border-tagapo-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wide text-tagapo-950">
                            <Sparkles className="w-4 h-4 text-tagapo-800" />
                            <span>{t.aiTriageTitle}</span>
                          </div>
                          {selectedReport.aiTriage && (
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-tagapo-200 text-tagapo-950 border border-tagapo-300">
                              {t.aiConfidence}: {(selectedReport.aiTriage.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>

                        {selectedReport.triageStatus === 'failed' ? (
                          <div className="space-y-2">
                            <div className="p-2.5 bg-rose-100/80 rounded-lg text-rose-800 text-xs font-bold flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>{t.needsReviewBadge}</span>
                            </div>
                            {retryTriageButton}
                          </div>
                        ) : selectedReport.aiTriage ? (
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                                {t.aiSummary}
                              </span>
                              <p className="text-stone-900 font-semibold mt-0.5">
                                {selectedReport.aiTriage.summary}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-tagapo-100">
                              <span className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                                {t.aiReasoning}
                              </span>
                              <p className="text-stone-700 text-xs mt-0.5 leading-relaxed">
                                {selectedReport.aiTriage.reasoning}
                              </p>
                            </div>

                            <div className="text-[11px] text-stone-400 font-mono">
                              Engine: {selectedReport.aiTriage.model}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-stone-500 italic">Triage in progress...</p>
                            {retryTriageButton}
                          </div>
                        )}
                      </div>

                      {/* Human-in-the-Loop Override Form */}
                      <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display text-xs font-bold uppercase tracking-wide text-stone-900 flex items-center gap-1.5">
                            <Edit3 className="w-3.5 h-3.5 text-tagapo-800" />
                            <span>{t.humanOverrideTitle}</span>
                          </h3>
                          {selectedReport.final && (
                            <span className="font-display text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-navy-100 text-navy-900 border border-navy-200">
                              Human Verified
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block font-display text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1">
                              {t.overrideCategory}
                            </label>
                            <select
                              value={overrideCategory}
                              onChange={(e) => setOverrideCategory(e.target.value as any)}
                              className="w-full text-xs px-2.5 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800"
                            >
                              {Object.entries(CATEGORIES).map(([key, cat]) => (
                                <option key={key} value={key}>
                                  {lang === 'fil' ? cat.labelFil : cat.labelEn}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block font-display text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1">
                              {t.overrideSeverity}
                            </label>
                            <select
                              value={overrideSeverity}
                              onChange={(e) => setOverrideSeverity(Number(e.target.value) as any)}
                              className="w-full text-xs px-2.5 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800 font-bold"
                            >
                              <option value="1">1 - Minor / Cosmetic</option>
                              <option value="2">2 - Low Concern</option>
                              <option value="3">3 - Moderate</option>
                              <option value="4">4 - High Hazard</option>
                              <option value="5">5 - Critical Emergency</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block font-display text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1">
                            {t.officerNotes}
                          </label>
                          <textarea
                            value={officerNotes}
                            onChange={(e) => setOfficerNotes(e.target.value)}
                            rows={2}
                            placeholder="Enter assessment findings or regulatory directives..."
                            className="w-full text-xs px-3 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveOverride}
                          disabled={isSavingOverride}
                          className="w-full py-2.5 bg-tagapo-900 hover:bg-tagapo-800 active:bg-tagapo-950 text-white font-display font-bold uppercase tracking-wider text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSavingOverride ? 'Saving...' : t.saveOverrideBtn}</span>
                        </button>

                        {overrideSuccess && (
                          <p className="text-xs text-tagapo-800 font-bold text-center">
                            Final assessment saved and applied to live dashboard!
                          </p>
                        )}
                      </div>

                      {/* Status Transition Workflow */}
                      <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                        <label className="font-display text-xs font-bold uppercase tracking-wide text-stone-800 block">
                          Update Incident Status
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['pending', 'in_progress', 'resolved'] as ReportStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setNewStatus(st)}
                              className={`py-2 text-xs font-display font-bold uppercase tracking-wider rounded-lg border transition cursor-pointer ${
                                newStatus === st
                                  ? 'bg-tagapo-900 text-white border-tagapo-950 shadow-xs'
                                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                              }`}
                            >
                              {st.replace(/_/g, ' ')}
                            </button>
                          ))}
                        </div>

                        <input
                          type="text"
                          value={statusChangeNotes}
                          onChange={(e) => setStatusChangeNotes(e.target.value)}
                          placeholder="Notes (e.g. 'Field team dispatched', 'Cleanup finished')..."
                          className="w-full text-xs px-3 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-tagapo-800"
                        />

                        <button
                          type="button"
                          onClick={handleUpdateStatus}
                          disabled={isUpdatingStatus || newStatus === selectedReport.status}
                          className="w-full py-2.5 bg-tagapo-900 hover:bg-tagapo-800 disabled:bg-stone-200 text-white font-display font-bold uppercase tracking-wider text-xs rounded-lg transition shadow-xs cursor-pointer"
                        >
                          {isUpdatingStatus ? 'Updating...' : 'Log Status Transition'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ===================================================== */
                  /* B. INCIDENT QUEUE STREAM (Browse & Filter List)       */
                  /* ===================================================== */
                  <div className="h-full flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-stone-900 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-xs uppercase tracking-wider text-stone-900">
                          Incident Queue
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-tagapo-100 text-tagapo-800 border border-tagapo-200">
                          {filteredReports.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSidebarOpen(false)}
                        title="Collapse side panel"
                        className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded transition cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Secondary Quick Filter bar inside Sidebar */}
                    <div className="p-3 border-b border-stone-200 bg-white/70 space-y-2 shrink-0">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="text-[11px] font-semibold px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none truncate"
                        >
                          <option value="all">All Categories</option>
                          {Object.entries(CATEGORIES).map(([key, cat]) => (
                            <option key={key} value={key}>
                              {lang === 'fil' ? cat.labelFil : cat.labelEn}
                            </option>
                          ))}
                        </select>

                        <select
                          value={severityFilter}
                          onChange={(e) => setSeverityFilter(e.target.value)}
                          className="text-[11px] font-semibold px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none truncate"
                        >
                          <option value="all">All Severities</option>
                          <option value="urgent">Urgent (4-5)</option>
                          <option value="1">1 - Minor</option>
                          <option value="2">2 - Low</option>
                          <option value="3">3 - Moderate</option>
                          <option value="4">4 - High</option>
                          <option value="5">5 - Critical</option>
                        </select>
                      </div>

                      {(municipalityFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all' || searchTerm) && (
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[10px] text-stone-500 font-medium">Filters active</span>
                          <button
                            type="button"
                            onClick={() => {
                              setMunicipalityFilter('all');
                              setStatusFilter('all');
                              setCategoryFilter('all');
                              setSeverityFilter('all');
                              setSearchTerm('');
                              setMapCenter({ lat: 14.5800, lng: 121.2800 });
                              setMapZoom(11);
                            }}
                            className="font-display text-[10px] font-bold uppercase tracking-wider text-rose-700 hover:text-rose-900 cursor-pointer"
                          >
                            Reset Filters
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Scrollable Incident Stream */}
                    <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
                      {filteredReports.length === 0 ? (
                        <div className="p-8 text-center text-xs text-stone-500 space-y-1">
                          <p className="font-semibold text-stone-700">No incident reports found</p>
                          <p className="text-stone-400">Try adjusting your municipality or severity filters.</p>
                        </div>
                      ) : (
                        filteredReports.map((report) => {
                          const sev = report.final?.severity || report.aiTriage?.severity || 3;
                          const cat = report.final?.category || report.aiTriage?.category || 'other';
                          const catMeta = CATEGORIES[cat as IncidentCategory] || CATEGORIES.other;

                          return (
                            <div
                              key={report.id}
                              onClick={() => {
                                setSelectedReport(report);
                                const coords = resolveReportCoordinates(report);
                                setMapCenter(coords);
                                setMapZoom(14);
                              }}
                              className="p-3.5 hover:bg-stone-50/90 cursor-pointer transition flex items-start justify-between gap-2.5"
                            >
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-xs text-stone-900">
                                    {report.referenceCode}
                                  </span>
                                  <span
                                    className={`text-[10px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${catMeta.badgeColor}`}
                                  >
                                    {lang === 'fil' ? catMeta.labelFil : catMeta.labelEn}
                                  </span>
                                  {report.duplicateClusterId && (
                                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-stone-200 text-stone-700 flex items-center gap-0.5">
                                      <Layers className="w-2.5 h-2.5" />
                                      Cluster
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-stone-600 line-clamp-2">
                                  {report.aiTriage?.summary || report.rawInput.description}
                                </p>

                                <div className="flex items-center gap-1.5 text-[11px] text-stone-400 font-mono">
                                  <span className="truncate">
                                    {[report.location.barangay, report.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                                  </span>
                                  <span>•</span>
                                  <span className="shrink-0">{new Date(report.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-display font-black uppercase tracking-wider ${
                                    sev >= 4
                                      ? 'bg-rose-700 text-white animate-pulse'
                                      : sev === 3
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-tagapo-800 text-white'
                                  }`}
                                >
                                  Sev {sev}
                                </span>
                                {report.status === 'resolved' && (
                                  <span className="text-[9px] font-display font-bold uppercase text-tagapo-800">
                                    Closed
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
