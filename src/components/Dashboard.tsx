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
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ArrowLeft,
  Layout,
  Maximize2,
  Crosshair,
  CloudRain,
  Thermometer,
  Wind,
  Droplets,
  ShieldCheck,
  LogOut,
  Map as MapIcon,
  Globe,
  Mountain,
} from 'lucide-react';
import {
  IncidentReport,
  IncidentCategory,
  CATEGORIES,
  SEVERITY_LEVELS,
  ReportStatus,
  RIZAL_MUNICIPALITIES,
  MUNICIPALITY_COORDINATES,
  WeatherContext,
  ProtectedZoneHit,
} from '../types/report';
import { LeafletMap, MapLayerMode, BasemapMode } from './LeafletMap';
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
  setLang?: (lang: Language) => void;
  officialUser: any | null;
  onOpenLogin: () => void;
  viewMode?: 'workbench' | 'full_map';
  onViewModeChange?: (mode: 'workbench' | 'full_map') => void;
  onNavigateTab?: (tab: string) => void;
  onLogout?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  lang,
  setLang,
  officialUser,
  onOpenLogin,
  viewMode: controlledViewMode,
  onViewModeChange,
  onNavigateTab,
  onLogout,
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
    if (mode === 'full_map') {
      setSelectedReport(null);
      setMunicipalityFilter('all');
      setFitProvinceKey((prev) => prev + 1);
    }
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
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState<boolean>(true);

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
  // Active cluster filter from clicking a multi-report map marker
  const [activeClusterFilter, setActiveClusterFilter] = useState<{
    reportIds: string[];
    label: string;
    municipality?: string;
    barangay?: string;
  } | null>(null);

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

  // Floating Left Sheet, Lightbox and Unified Action states
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(true);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isLegalNoteExpanded, setIsLegalNoteExpanded] = useState<boolean>(false);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState<boolean>(false);
  const [isSavingUnified, setIsSavingUnified] = useState<boolean>(false);
  const [unifiedSuccess, setUnifiedSuccess] = useState<boolean>(false);

  // Map viewport & layer state
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5800, lng: 121.2800 });
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('boundaries');
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('street');
  const [isMaskActive, setIsMaskActive] = useState<boolean>(true);
  const [fitProvinceKey, setFitProvinceKey] = useState<number>(0);

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

  // Cluster marker click handler: filters the Incident Queue to the co-located reports
  const handleClusterClick = (group: {
    reports: IncidentReport[];
    municipality?: string;
    barangay?: string;
    lat: number;
    lng: number;
  }) => {
    const label = [group.barangay, group.municipality].filter(Boolean).join(', ') || 'Spatial Cluster';
    setActiveClusterFilter({
      reportIds: group.reports.map((r) => r.id),
      label,
      municipality: group.municipality,
      barangay: group.barangay,
    });
    if (group.municipality) {
      const matchedKey =
        Object.keys(MUNICIPALITY_COORDINATES).find(
          (k) =>
            k === group.municipality ||
            k.toLowerCase().includes(group.municipality!.toLowerCase()) ||
            group.municipality!.toLowerCase().includes(k.toLowerCase())
        ) || group.municipality;
      setMunicipalityFilter(matchedKey);
    }
    setSelectedReport(null);
    setIsSheetOpen(true);
    setMapCenter({ lat: group.lat, lng: group.lng });
    setMapZoom(14);
  };

  // Open-Meteo telemetry widget for active report
  const renderWeatherWidget = (weather?: WeatherContext | null) => {
    if (!weather) return null;
    return (
      <div className="pt-2 mt-2 border-t border-stone-200/80">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-stone-700 flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-stone-500" />
            <span>{t.weatherTelemetryTitle}</span>
          </span>
          <span className="text-[10px] text-stone-400 font-mono">
            {new Date(weather.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 p-2 bg-stone-50 border border-stone-200/80 rounded-lg text-center divide-x divide-stone-200/70">
          <div className="px-1">
            <span className="text-[10px] text-stone-500 font-medium block leading-tight">{t.weatherTemp}</span>
            <span className="font-mono font-semibold text-xs text-stone-900">{weather.temperature}°C</span>
          </div>
          <div className="px-1">
            <span className="text-[10px] text-stone-500 font-medium block leading-tight">{t.weatherWind}</span>
            <span className="font-mono font-semibold text-xs text-stone-900 truncate block">{weather.windSpeed} km/h</span>
          </div>
          <div className="px-1">
            <span className="text-[10px] text-stone-500 font-medium block leading-tight">{t.weatherHumidity}</span>
            <span className="font-mono font-semibold text-xs text-stone-900">{weather.humidity}%</span>
          </div>
          <div className="px-1">
            <span className="text-[10px] text-stone-500 font-medium block leading-tight">{t.weatherPrecipitation}</span>
            <span className="font-mono font-semibold text-xs text-stone-900">{weather.precipitation} mm</span>
          </div>
        </div>
      </div>
    );
  };

  // Protected Ecological Zone alert banner
  const renderProtectedZoneBadge = (zone?: ProtectedZoneHit | null, compact?: boolean) => {
    if (!zone) return null;
    return (
      <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5 my-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldAlert className="w-3.5 h-3.5 text-stone-700 shrink-0" />
            <span className="text-[11px] font-semibold text-stone-900 truncate">
              {t.protectedZoneAlertTitle}
            </span>
          </div>
          <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-200/80 text-stone-700 border border-stone-300/70 uppercase shrink-0">
            {zone.type.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="text-xs font-semibold text-stone-900 leading-snug">
          {zone.name}
        </div>
        {zone.legalNote && (
          compact ? (
            <div>
              <button
                type="button"
                onClick={() => setIsLegalNoteExpanded(!isLegalNoteExpanded)}
                className="text-[10px] text-stone-500 hover:text-stone-900 font-medium flex items-center gap-1 cursor-pointer mt-1"
              >
                <span>{isLegalNoteExpanded ? 'Hide statutory basis' : 'View statutory basis'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isLegalNoteExpanded ? 'rotate-180' : ''}`} />
              </button>
              {isLegalNoteExpanded && (
                <div className="text-[10px] text-stone-600 leading-relaxed pt-1.5 mt-1 border-t border-stone-200/60 font-sans">
                  {zone.legalNote}
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-stone-600 leading-relaxed font-sans pt-1 border-t border-stone-200/60">
              {zone.legalNote}
            </div>
          )
        )}
      </div>
    );
  };

  const handleQuickJump = (munKey: string) => {
    setActiveClusterFilter(null);
    if (munKey === 'all') {
      setMunicipalityFilter('all');
      setSelectedReport(null);
      setFitProvinceKey((prev) => prev + 1);
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
      setUnifiedSuccess(false);
      setIsLightboxOpen(false);
      setIsLegalNoteExpanded(false);
      setIsReasoningExpanded(false);
      if (selectedReport.location) {
        const coords = resolveReportCoordinates(selectedReport);
        setMapCenter(coords);
        setMapZoom(14);
      }
    }
  }, [selectedReport?.id]);

  // Keyboard shortcut: Esc closes lightbox, bottom inspection dock, or returns to Workbench
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLightboxOpen) {
          setIsLightboxOpen(false);
          return;
        }
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
  }, [viewMode, selectedReport, isLightboxOpen]);

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

  // Reports visible on the map (preserves municipal/category/severity context)
  const mapVisibleReports = useMemo(() => {
    return clusteredReports.filter((report) => {
      if (municipalityFilter !== 'all' && report.location?.municipality !== municipalityFilter) return false;
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;
      const activeCat = report.final?.category || report.aiTriage?.category || 'other';
      if (categoryFilter !== 'all' && activeCat !== categoryFilter) return false;
      const activeSev = report.final?.severity || report.aiTriage?.severity || 0;
      if (severityFilter === 'urgent' && activeSev < 4) return false;
      if (severityFilter !== 'all' && severityFilter !== 'urgent' && activeSev !== Number(severityFilter)) return false;
      return true;
    });
  }, [clusteredReports, municipalityFilter, statusFilter, categoryFilter, severityFilter]);

  // Filtered reports for queue stream (narrows by activeClusterFilter and searchTerm)
  const filteredReports = useMemo(() => {
    return mapVisibleReports.filter((report) => {
      // Cluster filter from map marker click
      if (activeClusterFilter && !activeClusterFilter.reportIds.includes(report.id)) {
        return false;
      }

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
  }, [mapVisibleReports, activeClusterFilter, searchTerm]);

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

  // Unified Save & Update Action for the Bottom Command Dock
  const handleSaveUnifiedAction = async () => {
    if (!selectedReport || !officialUser) return;
    setIsSavingUnified(true);
    setUnifiedSuccess(false);
    setActionError(null);

    const notes = officerNotes.trim() || statusChangeNotes.trim();
    const finalData = {
      category: overrideCategory,
      severity: overrideSeverity,
      reviewedBy: officialUser.uid,
      reviewedAt: new Date().toISOString(),
      notes: notes,
    };

    const statusChanged = newStatus !== selectedReport.status;
    let updatedHistory = selectedReport.statusHistory || [];
    const updates: Record<string, any> = { final: finalData };

    if (statusChanged || notes) {
      const newHistoryItem = {
        status: newStatus,
        changedBy: officialUser.displayName || officialUser.email || 'PG-ENRO Officer',
        changedAt: new Date().toISOString(),
        ...(notes ? { notes } : {}),
      };
      updatedHistory = [...updatedHistory, newHistoryItem];
      updates.status = newStatus;
      updates.statusHistory = updatedHistory;
    }

    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), updates);

      const updated = {
        ...selectedReport,
        final: finalData,
        ...(updates.status ? { status: updates.status, statusHistory: updatedHistory } : {}),
      };
      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);
      setUnifiedSuccess(true);
      setTimeout(() => setUnifiedSuccess(false), 3500);
    } catch (err) {
      console.error('Unified update failed:', err);
      setActionError('Could not save the assessment. You may not have permission or are offline.');
    } finally {
      setIsSavingUnified(false);
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
      className="px-3 py-1.5 bg-stone-900 hover:bg-black disabled:bg-stone-200 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
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
        <h2 className="font-bold text-2xl text-stone-900 tracking-tight">
          {t.officialPortalTitle}
        </h2>
        <p className="text-sm text-stone-600 mt-2 max-w-md mx-auto">
          {t.officialPortalDesc}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onOpenLogin}
            className="py-3 px-6 bg-stone-900 hover:bg-black text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
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
            <h1 className="font-bold text-2xl sm:text-3xl text-stone-950 tracking-tight leading-tight">
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-stone-900 text-white shadow-xs"
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Workbench</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('full_map')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full Map</span>
              </button>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white text-xs font-semibold rounded-lg">
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
              <div className="text-xs font-semibold text-stone-500">
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
              <div className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
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
              <div className="text-xs font-semibold text-stone-500">
                {t.statsResolved}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-stone-900">
                  {stats.resolvedCount}
                </span>
                <span className="text-[11px] text-stone-400 font-medium">closed cases</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white/60">
              <div className="text-xs font-semibold text-stone-500">
                {t.statsAvgTime}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-stone-900">
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
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900"
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                      municipalityFilter === 'all'
                        ? 'bg-stone-900 text-white shadow-xs'
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                        municipalityFilter === mun
                          ? 'bg-stone-900 text-white shadow-xs'
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
                  className="absolute top-2.5 right-2.5 z-20 px-2.5 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md bg-white/95 hover:bg-stone-50 active:bg-stone-100 text-stone-800 border border-stone-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-stone-700" />
                  <span className="hidden sm:inline">Full Map</span>
                </button>

                {/* Bottom-left In-Map HUD: Tactical Mutually Exclusive Layer Controller */}
                <div className="absolute bottom-6 left-2.5 z-20 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-stone-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 flex items-center gap-0.5 text-xs font-semibold text-stone-700">
                  <button
                    type="button"
                    onClick={() => setMapLayerMode(mapLayerMode === 'boundaries' ? 'standard' : 'boundaries')}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      mapLayerMode === 'boundaries' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title="Municipal vector boundaries across all 14 LGUs"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Boundaries</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMapLayerMode(mapLayerMode === 'choropleth' ? 'standard' : 'choropleth')}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      mapLayerMode === 'choropleth' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title="Thematic incident density volume"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Choropleth</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMapLayerMode(mapLayerMode === 'protected_zones' ? 'standard' : 'protected_zones')}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      mapLayerMode === 'protected_zones'
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title="Curated ecological reserves, lake easement, & watersheds"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{t.protectedZonesToggle}</span>
                  </button>

                  <div className="h-4 w-px bg-stone-200/80 mx-0.5" />

                  <button
                    type="button"
                    onClick={() => setIsMaskActive(!isMaskActive)}
                    className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                      isMaskActive
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                    }`}
                    title={
                      mapLayerMode === 'protected_zones'
                        ? (isMaskActive ? "Click to disable dimming of surrounding terrain" : "Click to dim surroundings and spotlight protected reserves")
                        : (isMaskActive ? "Click to disable non-Rizal dimming mask" : "Click to gray out non-Rizal regions")
                    }
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>{mapLayerMode === 'protected_zones' ? 'Dim Outside' : 'Focus: Rizal'}</span>
                  </button>
                </div>

                {/* Bottom-right In-Map HUD: Contextual Legend */}
                {mapLayerMode === 'protected_zones' ? (
                  <div className="absolute bottom-6 right-2.5 z-20 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-display font-bold uppercase tracking-wide border border-stone-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08),_0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-black/5 flex items-center gap-2.5 text-stone-700">
                    <span className="flex items-center gap-1 text-emerald-800">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Sanctuary
                    </span>
                    <span className="flex items-center gap-1 text-sky-800">
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      Shore Buffer
                    </span>
                    <span className="flex items-center gap-1 text-green-900">
                      <span className="w-2 h-2 rounded-full bg-green-700" />
                      Watershed
                    </span>
                    <span className="flex items-center gap-1 text-amber-800">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Nat'l Park
                    </span>
                  </div>
                ) : (
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
                )}

                {/* Map Component */}
                <LeafletMap
                  mode="dashboard"
                  center={mapCenter}
                  zoom={mapZoom}
                  fitProvinceKey={fitProvinceKey}
                  reports={mapVisibleReports}
                  selectedReportId={selectedReport?.id}
                  layerMode={mapLayerMode}
                  basemap={basemapMode}
                  activeMunicipality={municipalityFilter !== 'all' ? municipalityFilter : null}
                  onMunicipalityClick={(mun) => handleQuickJump(mun)}
                  onClusterClick={(group) => handleClusterClick(group)}
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
                            isSelected ? 'bg-stone-100 ring-1 ring-stone-900/10' : ''
                          }`}
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-stone-900">
                                {report.referenceCode}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${catMeta.badgeColor}`}
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

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                sev >= 4
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : sev === 3
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-stone-100 text-stone-600 border border-stone-200'
                              }`}
                            >
                              SEV {sev}
                            </span>
                            {report.status === 'resolved' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Closed
                              </span>
                            ) : report.status === 'in_progress' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                In Prog
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Pending
                              </span>
                            )}
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

                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-stone-100 text-stone-700 border border-stone-200 inline-flex items-center gap-1.5 capitalize">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          selectedReport.status === 'resolved'
                            ? 'bg-emerald-500'
                            : selectedReport.status === 'in_progress'
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                      />
                      {selectedReport.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Linked duplicate cluster notice */}
                  {clusteredReports.find((r) => r.id === selectedReport.id)?.duplicateClusterId ? (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1 text-xs text-stone-700">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-stone-900">
                          <Layers className="w-4 h-4 text-stone-700" />
                          <span>{t.duplicateClusterDetected}</span>
                        </div>
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 border border-stone-300/60">
                          Linked Cluster
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-stone-600">
                        {t.duplicateClusterDesc}
                      </p>
                    </div>
                  ) : null}

                  {/* Photo Display (Secured Image Preview) */}
                  <div className="space-y-1">
                    <label className="font-display text-xs font-bold uppercase tracking-wide text-stone-600 block">
                      Incident Photo (Secured Access)
                    </label>
                    <div className="relative rounded-xl overflow-hidden bg-stone-950 aspect-video flex items-center justify-center border border-stone-200">
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
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-stone-900/80 backdrop-blur-xs text-[9px] font-mono text-stone-300 rounded border border-white/10 flex items-center gap-1">
                        <ShieldCheck className="w-2.5 h-2.5 text-stone-400" />
                        <span>RA 10173 SECURED</span>
                      </div>
                    </div>
                  </div>

                  {/* Resident Description */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wide text-stone-600">
                      <span>Resident Description</span>
                      <span className="text-[9px] font-mono text-stone-500 bg-stone-200/70 px-1.5 py-0.2 rounded border border-stone-300/60">
                        Untrusted Input
                      </span>
                    </div>
                    <p className="text-xs text-stone-900 italic leading-relaxed border-l-2 border-stone-300 pl-2.5 py-0.5">
                      "{selectedReport.rawInput.description}"
                    </p>
                    <div className="text-xs text-stone-500 font-mono pt-1">
                      Loc: {selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)} • {[selectedReport.location.barangay, selectedReport.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                    </div>
                  </div>

                  {/* AI Multimodal Triage Assessment */}
                  <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wide text-stone-800">
                        <Sparkles className="w-4 h-4 text-tagapo-800" />
                        <span>{t.aiTriageTitle}</span>
                      </div>
                      {selectedReport.aiTriage && (
                        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                          {t.aiConfidence}: {(selectedReport.aiTriage.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {selectedReport.triageStatus === 'failed' ? (
                      <div className="space-y-2">
                        <div className="p-2.5 bg-rose-50 rounded-lg text-rose-800 text-xs font-bold border border-rose-200 flex items-center gap-2">
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

                        {renderProtectedZoneBadge(selectedReport.aiTriage.protectedZone)}

                        <div className="pt-2 border-t border-stone-200/70">
                          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                            {t.aiReasoning}
                          </span>
                          <p className="text-stone-700 text-xs mt-0.5 leading-relaxed">
                            {selectedReport.aiTriage.reasoning}
                          </p>
                        </div>

                        {renderWeatherWidget(selectedReport.aiTriage.weather)}

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
                      <h3 className="text-xs font-semibold text-stone-900 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-stone-700" />
                        <span>{t.humanOverrideTitle}</span>
                      </h3>
                      {selectedReport.final && (
                        <span className="font-mono text-[10px] font-medium px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                          Human Verified
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-xs font-semibold text-stone-600 mb-1">
                          {t.overrideCategory}
                        </label>
                        <select
                          value={overrideCategory}
                          onChange={(e) => setOverrideCategory(e.target.value as any)}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900"
                        >
                          {Object.entries(CATEGORIES).map(([key, cat]) => (
                            <option key={key} value={key}>
                              {lang === 'fil' ? cat.labelFil : cat.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-600 mb-1">
                          {t.overrideSeverity}
                        </label>
                        <select
                          value={overrideSeverity}
                          onChange={(e) => setOverrideSeverity(Number(e.target.value) as any)}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 font-bold"
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
                      <label className="block text-xs font-semibold text-stone-600 mb-1">
                        {t.officerNotes}
                      </label>
                      <textarea
                        value={officerNotes}
                        onChange={(e) => setOfficerNotes(e.target.value)}
                        rows={2}
                        placeholder="Enter assessment findings or regulatory directives..."
                        className="w-full text-xs px-3 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveOverride}
                      disabled={isSavingOverride}
                      className="w-full py-2.5 bg-stone-900 hover:bg-black active:bg-stone-950 text-white font-semibold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSavingOverride ? 'Saving...' : t.saveOverrideBtn}</span>
                    </button>

                    {overrideSuccess && (
                      <p className="text-xs text-stone-900 font-semibold text-center">
                        Final assessment saved and applied to live dashboard!
                      </p>
                    )}
                  </div>

                  {/* Status Transition Workflow */}
                  <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                    <label className="text-xs font-semibold text-stone-800 block">
                      Update Incident Status
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['pending', 'in_progress', 'resolved'] as ReportStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setNewStatus(st)}
                          className={`py-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                            newStatus === st
                              ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
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
                      className="w-full text-xs px-3 py-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900"
                    />

                    <button
                      type="button"
                      onClick={handleUpdateStatus}
                      disabled={isUpdatingStatus || newStatus === selectedReport.status}
                      className="w-full py-2.5 bg-stone-900 hover:bg-black disabled:bg-stone-200 text-white font-semibold text-xs rounded-lg transition shadow-xs cursor-pointer"
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
      {/* VIEW MODE 2: FULL MAP CANVAS (GOOGLE / APPLE MAPS GIS UI) */}
      {/* ========================================================= */}
      {viewMode === 'full_map' && (
        <div className="relative w-full h-full overflow-hidden bg-stone-100">
          {/* ========================================================= */}
          {/* 1. EDGE-TO-EDGE GEOSPATIAL MAP CANVAS (100% Full Screen)  */}
          {/* ========================================================= */}
          <div className="absolute inset-0 z-0">
            <LeafletMap
              mode="dashboard"
              center={mapCenter}
              zoom={mapZoom}
              fitProvinceKey={fitProvinceKey}
              reports={mapVisibleReports}
              selectedReportId={selectedReport?.id}
              layerMode={mapLayerMode}
              basemap={basemapMode}
              activeMunicipality={municipalityFilter !== 'all' ? municipalityFilter : null}
              onMunicipalityClick={(mun) => handleQuickJump(mun)}
              onClusterClick={(group) => handleClusterClick(group)}
              choroplethCounts={choroplethCounts}
              maskNonRizal={isMaskActive}
              onSelectReport={(r) => {
                setSelectedReport(r);
                setIsSheetOpen(true);
                const coords = resolveReportCoordinates(r);
                setMapCenter(coords);
                setMapZoom(14);
              }}
              className="h-full w-full"
            />
          </div>

          {/* ========================================================= */}
          {/* 2. FLOATING TOP-LEFT NAVIGATION PILL                     */}
          {/* ========================================================= */}
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-40 flex items-center gap-2 bg-white border border-stone-200 shadow-md rounded-xl p-1.5 pointer-events-auto animate-nav-pill transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
            {/* NatureWatch GIS brand mark */}
            <div className="flex items-center gap-1.5 px-2 py-0.5">
              <div className="w-6 h-6 rounded-md bg-tagapo-800 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                NW
              </div>
              <span className="font-bold text-xs tracking-tight text-stone-900 hidden sm:inline">
                LikasMap <span className="text-stone-700 font-mono text-[10px] font-bold">GIS</span>
              </span>
            </div>

            <div className="h-4 w-px bg-stone-200 hidden sm:block" />

            {/* Tab Navigation Pill Group */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-stone-900 text-white shadow-2xs cursor-default flex items-center gap-1.5 transition-all duration-150"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Map</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onNavigateTab) onNavigateTab('workbench');
                  else handleViewModeChange('workbench');
                }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 active:scale-95 transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                title="Switch to split-screen Workbench"
              >
                <Layout className="w-3.5 h-3.5 text-stone-500" />
                <span className="hidden sm:inline">Workbench</span>
              </button>

              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('status')}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 active:scale-95 transition-all duration-150 cursor-pointer hidden md:flex items-center gap-1.5"
                  title="Track Status"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-stone-500" />
                  <span>Track Status</span>
                </button>
              )}
            </div>

            {/* Language Switcher */}
            {setLang && (
              <>
                <div className="h-4 w-px bg-stone-200" />
                <button
                  type="button"
                  onClick={() => setLang(lang === 'fil' ? 'en' : 'fil')}
                  className="px-2 py-1 rounded-md text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 active:scale-90 transition-all duration-150 cursor-pointer"
                  title="Switch language"
                >
                  {lang === 'fil' ? 'EN' : 'FIL'}
                </button>
              </>
            )}

            {/* Officer Logout */}
            {onLogout && (
              <>
                <div className="h-4 w-px bg-stone-200" />
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 rounded-lg transition-all duration-150 cursor-pointer"
                  title="Sign out of Officer Portal"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* ========================================================= */}
          {/* 3. FLOATING LEFT SHEET (Google Maps / Apple Maps Paradigm) */}
          {/* ========================================================= */}
          {!isSheetOpen ? (
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="absolute top-16 left-3 sm:left-4 z-30 pointer-events-auto px-3.5 py-2 bg-white border border-stone-200 shadow-md rounded-xl text-xs font-semibold text-stone-800 hover:bg-stone-50 active:scale-95 transition-all duration-200 animate-nav-pill flex items-center gap-2 cursor-pointer"
              title="Show Queue & Inspector"
            >
              <Layers className="w-4 h-4 text-stone-700" />
              <span>{selectedReport ? selectedReport.referenceCode : `Queue (${filteredReports.length})`}</span>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            </button>
          ) : (
            <div className="absolute top-16 left-3 sm:left-4 z-30 pointer-events-auto w-[calc(100vw-24px)] sm:w-[410px] max-h-[calc(100vh-80px)] bg-white border border-stone-200 shadow-xl rounded-xl overflow-hidden flex flex-col transition-all duration-300 animate-nav-pill">
              {/* ------------------------------------------------------- */}
              {/* SHEET MODE 1: SEARCH, FILTERS & QUEUE STREAM            */}
              {/* ------------------------------------------------------- */}
              {!selectedReport ? (
                <div key="queue-mode" className="flex flex-col h-full overflow-hidden animate-sheet-morph">
                  {/* Search and Header */}
                  <div className="p-3 bg-white border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search ref, barangay..."
                        className="w-full pl-8 pr-7 py-1.5 text-xs bg-stone-50 hover:bg-white focus:bg-white border border-stone-200 focus:border-stone-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 font-sans transition placeholder:text-stone-400"
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
                    <button
                      type="button"
                      onClick={() => setIsSheetOpen(false)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition cursor-pointer"
                      title="Collapse panel"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick telemetry chips & LGU horizontal scroll */}
                  <div className="px-3 py-2 bg-stone-50 border-b border-stone-200/80 space-y-2 shrink-0">
                    {/* Active count badge summary */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-stone-700">
                        Incident Queue ({filteredReports.length})
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-mono font-medium">
                        <span className="text-stone-700"><span className="text-emerald-600 font-bold">●</span> {stats.openCount} Open</span>
                        <span className="text-rose-700"><span className="text-rose-600 font-bold">●</span> {stats.urgentCount} Urgent</span>
                      </div>
                    </div>

                    {/* Horizontal LGU Filter Chips */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                      <button
                        type="button"
                        onClick={() => handleQuickJump('all')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                          municipalityFilter === 'all'
                            ? 'bg-stone-900 text-white shadow-xs'
                            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 bg-white border border-stone-200/80'
                        }`}
                      >
                        All LGUs
                      </button>
                      {RIZAL_MUNICIPALITIES.map((mun) => {
                        const isSelected = municipalityFilter === mun;
                        const shortName = mun.replace('Municipality of ', '').replace('City of ', '');
                        return (
                          <button
                            key={mun}
                            type="button"
                            onClick={() => handleQuickJump(mun)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                              isSelected
                                ? 'bg-stone-900 text-white shadow-xs'
                                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 bg-white border border-stone-200/80'
                            }`}
                          >
                            {shortName}
                          </button>
                        );
                      })}
                    </div>

                    {/* Secondary Filters: Category & Severity */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-[11px] font-semibold px-2 py-1 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 truncate"
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
                        className="text-[11px] font-semibold px-2 py-1 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 truncate"
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

                    {/* Active Cluster Pill Banner */}
                    {activeClusterFilter && (
                      <div className="flex items-center justify-between px-2.5 py-1.5 bg-stone-100 border border-stone-200 rounded-lg text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Layers className="w-3.5 h-3.5 text-stone-700 shrink-0" />
                          <span className="font-semibold text-stone-900 truncate">
                            Cluster: {activeClusterFilter.label}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 text-stone-700 font-medium shrink-0">
                            {filteredReports.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveClusterFilter(null)}
                          className="text-stone-400 hover:text-stone-700 p-0.5 rounded transition cursor-pointer shrink-0 ml-1"
                          title="Clear cluster filter"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {(activeClusterFilter || municipalityFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all' || searchTerm) && (
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-[10px] text-stone-500 font-medium">Filters active</span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveClusterFilter(null);
                            setMunicipalityFilter('all');
                            setStatusFilter('all');
                            setCategoryFilter('all');
                            setSeverityFilter('all');
                            setSearchTerm('');
                            setMapCenter({ lat: 14.5800, lng: 121.2800 });
                            setMapZoom(11);
                          }}
                          className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 cursor-pointer"
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
                            className="p-3 cursor-pointer transition hover:bg-stone-50 flex items-start justify-between gap-2.5 group"
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-xs text-stone-900 group-hover:text-stone-700 transition-colors">
                                  {report.referenceCode}
                                </span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${catMeta.badgeColor}`}>
                                  {lang === 'fil' ? catMeta.labelFil : catMeta.labelEn}
                                </span>
                                {report.duplicateClusterId && (
                                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200/70 flex items-center gap-0.5">
                                    <Layers className="w-2.5 h-2.5" />
                                    Cluster
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                                {report.aiTriage?.summary || report.rawInput.description}
                              </p>

                              <div className="flex items-center gap-1.5 text-[10px] text-stone-400 font-mono pt-0.5">
                                <span className="truncate">
                                  {[report.location.barangay, report.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                                </span>
                                <span>•</span>
                                <span className="shrink-0">{new Date(report.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  sev >= 4
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : sev === 3
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-stone-100 text-stone-600 border border-stone-200'
                                }`}
                              >
                                SEV {sev}
                              </span>
                              {report.status === 'resolved' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Closed
                                </span>
                              ) : report.status === 'in_progress' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  In Prog
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* ------------------------------------------------------- */
                /* SHEET MODE 2: CASE INSPECTOR & DECISION CONSOLE         */
                /* ------------------------------------------------------- */
                <div key={`dossier-mode-${selectedReport.id}`} className="flex flex-col h-full overflow-hidden animate-sheet-morph">
                  {/* Header with Back to Queue button */}
                  <div className="px-3.5 py-2.5 bg-white border-b border-stone-200 flex items-center justify-between shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedReport(null)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-stone-950 hover:bg-stone-100 px-2 py-1 rounded-md transition cursor-pointer"
                      title={activeClusterFilter ? 'Return to Cluster Queue' : 'Return to Incident Queue'}
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-stone-700" />
                      <span>{activeClusterFilter ? 'Cluster Queue' : t.backToQueueBtn || 'Queue'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-stone-900">
                        {selectedReport.referenceCode}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-stone-100 text-stone-700 border border-stone-200 inline-flex items-center gap-1.5 capitalize">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            selectedReport.status === 'resolved'
                              ? 'bg-emerald-500'
                              : selectedReport.status === 'in_progress'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        />
                        {selectedReport.status.replace(/_/g, ' ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsSheetOpen(false)}
                        className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition cursor-pointer"
                        title="Collapse panel"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Dossier Body */}
                  <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                    {/* Citizen Evidence & Photo */}
                    <div className="space-y-2">
                      <div
                        onClick={() => photoDataUrl && setIsLightboxOpen(true)}
                        className={`relative rounded-lg overflow-hidden bg-stone-950 h-36 sm:h-40 flex items-center justify-center border border-stone-200 group ${
                          photoDataUrl ? 'cursor-pointer' : ''
                        }`}
                        title={photoDataUrl ? t.photoExpandHint : undefined}
                      >
                        {photoDataUrl ? (
                          <>
                            <img
                              src={photoDataUrl}
                              alt="Incident evidence"
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="px-2 py-1 rounded bg-black/75 text-white text-[10px] font-display font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                                <ZoomIn className="w-3.5 h-3.5" />
                                <span>Expand</span>
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-2 text-stone-400 text-xs">
                            <Eye className="w-5 h-5 mx-auto mb-1 text-stone-500" />
                            <span className="text-[11px]">{selectedReport.rawInput.hasImage ? 'Loading photo...' : 'No photo submitted'}</span>
                          </div>
                        )}
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-stone-900/80 backdrop-blur-xs text-[9px] font-mono text-stone-300 rounded border border-white/10 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5 text-stone-400" />
                          <span>RA 10173 SECURED</span>
                        </div>
                      </div>

                      {/* Citizen Description Card */}
                      <div className="bg-stone-50 rounded-lg p-3 border border-stone-200/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-display font-bold uppercase tracking-wider text-stone-500">
                          <span>Citizen Report</span>
                          <span className="text-[9px] font-mono text-stone-500 bg-stone-200/70 px-1.5 py-0.2 rounded border border-stone-300/60">
                            Untrusted Input
                          </span>
                        </div>
                        <p className="text-xs text-stone-800 italic leading-relaxed py-0.5">
                          "{selectedReport.rawInput.description}"
                        </p>
                        <div className="text-[10px] text-stone-500 font-mono pt-1 border-t border-stone-200/60 flex items-center justify-between">
                          <span className="truncate">
                            {[selectedReport.location.barangay, selectedReport.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
                          </span>
                          <span className="shrink-0">
                            GPS: {selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Gemini AI Triage Card */}
                    <div className="p-3 bg-white rounded-lg border border-stone-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-900">
                          <Sparkles className="w-3.5 h-3.5 text-stone-700" />
                          <span>Gemini AI Triage</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {selectedReport.aiTriage?.confidence && (
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                              {Math.round(selectedReport.aiTriage.confidence * 100)}% Conf
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleRetryTriage}
                            disabled={isRetryingTriage}
                            title="Re-run AI triage on this report"
                            className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded transition cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRetryingTriage ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-stone-800 leading-relaxed font-sans font-medium">
                        {selectedReport.aiTriage?.summary || 'AI triage assessment not available or pending.'}
                      </p>

                      {/* Collapsible AI Reasoning */}
                      {selectedReport.aiTriage?.reasoning && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
                            className="text-[10px] text-stone-500 hover:text-stone-800 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isReasoningExpanded ? 'Hide AI reasoning' : 'View AI reasoning'}</span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${isReasoningExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          {isReasoningExpanded && (
                            <div className="mt-1.5 p-2 rounded-md bg-stone-50 border border-stone-200 text-[10px] text-stone-600 leading-relaxed font-sans">
                              {selectedReport.aiTriage.reasoning}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Protected Zone Alert (if applicable) */}
                    {renderProtectedZoneBadge(
                      selectedReport.aiTriage?.protectedZone,
                      true
                    )}

                    {/* Weather Telemetry */}
                    {renderWeatherWidget(selectedReport.aiTriage?.weather)}

                    {/* Duplicate Cluster Alert */}
                    {clusteredReports.find((r) => r.id === selectedReport.id)?.duplicateClusterId && (
                      <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs text-stone-700 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                          <span className="font-medium truncate">{t.duplicateClusterDetected}</span>
                        </div>
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 border border-stone-300/60 shrink-0">
                          Cluster Detected
                        </span>
                      </div>
                    )}

                    {/* Officer Decision Console */}
                    <div className="bg-stone-50/70 p-3.5 rounded-lg border border-stone-200 space-y-3">
                      <span className="font-semibold text-xs text-stone-700 block">
                        Officer Decision Console
                      </span>

                      {/* Operational Status Selector */}
                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 block mb-1">
                          Operational Status
                        </label>
                        <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-lg text-xs font-medium">
                          {(['pending', 'in_progress', 'resolved'] as ReportStatus[]).map((status) => {
                            const isActive = newStatus === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => setNewStatus(status)}
                                className={`py-1.5 px-2 rounded-md text-center transition cursor-pointer text-xs font-medium flex items-center justify-center gap-1.5 ${
                                  isActive
                                    ? 'bg-stone-900 text-white shadow-xs font-semibold'
                                    : 'text-stone-600 hover:text-stone-900'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    status === 'resolved'
                                      ? 'bg-emerald-500'
                                      : status === 'in_progress'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                />
                                <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Category & Severity Override Dropdowns */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">
                            Category
                          </label>
                          <select
                            value={overrideCategory}
                            onChange={(e) => setOverrideCategory(e.target.value as any)}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 truncate"
                          >
                            {Object.entries(CATEGORIES).map(([key, cat]) => (
                              <option key={key} value={key}>
                                {lang === 'fil' ? cat.labelFil : cat.labelEn}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">
                            Severity
                          </label>
                          <select
                            value={overrideSeverity}
                            onChange={(e) => setOverrideSeverity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 truncate"
                          >
                            {Object.entries(SEVERITY_LEVELS).map(([lvl, meta]) => (
                              <option key={lvl} value={lvl}>
                                {lvl} - {lang === 'fil' ? meta.labelFil : meta.labelEn}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Action Directives / Notes */}
                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 block mb-0.5">
                          Action Directives / Notes
                        </label>
                        <textarea
                          rows={2}
                          value={officerNotes}
                          onChange={(e) => setOfficerNotes(e.target.value)}
                          placeholder="Action directives, dispatch instructions, or closure remarks..."
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-900 placeholder:text-stone-400 resize-none font-sans"
                        />
                      </div>

                      {/* Unified Save CTA */}
                      <div>
                        <button
                          type="button"
                          onClick={handleSaveUnifiedAction}
                          disabled={isSavingUnified}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                            unifiedSuccess
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-stone-900 hover:bg-black disabled:bg-stone-300 active:scale-[0.99]'
                          }`}
                        >
                          {isSavingUnified ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : unifiedSuccess ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-100" />
                              <span>{t.saveSuccessMsg}</span>
                            </>
                          ) : (
                            <>
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>{t.saveAndApplyBtn}</span>
                            </>
                          )}
                        </button>

                        {/* Audit Log / Reviewer Timestamp */}
                        {selectedReport.final?.reviewedAt && (
                          <div className="text-[10px] text-stone-500 font-mono flex items-center justify-between pt-1">
                            <span>Reviewed: {new Date(selectedReport.final.reviewedAt).toLocaleDateString()}</span>
                            <span className="text-stone-700 font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              Assessment Logged
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 4. GOOGLE / APPLE MAPS FLOATING LAYERS TRIGGER & POPOVER   */}
          {/* ========================================================= */}
          <div className="absolute bottom-8 sm:bottom-9 right-4 z-20 pointer-events-auto flex flex-col items-end gap-2 transition-all duration-200">
            {/* Popover Card */}
            {isLayersPanelOpen && (
              <div className="bg-white border border-stone-200 shadow-2xl rounded-2xl p-4 w-[310px] space-y-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
                {/* Popover Header */}
                <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-stone-800" />
                    <span className="font-semibold text-xs text-stone-900">Map Details</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLayersPanelOpen(false)}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                    title="Close map details"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 1. Basemap Style: 3 Visual Cards with Icons */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-stone-500 block">
                    Basemap Style
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Street Card */}
                    <button
                      type="button"
                      onClick={() => setBasemapMode('street')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition cursor-pointer text-center ${
                        basemapMode === 'street'
                          ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                          : 'bg-stone-50 hover:bg-stone-100/80 text-stone-700 border-stone-200/80'
                      }`}
                      title="Standard road network & LGU cartography"
                    >
                      <MapIcon className={`w-5 h-5 mb-1.5 ${basemapMode === 'street' ? 'text-white' : 'text-stone-600'}`} />
                      <span className="text-xs font-semibold leading-tight">Street</span>
                      <span className={`text-[9px] mt-0.5 leading-none ${basemapMode === 'street' ? 'text-stone-300' : 'text-stone-400'}`}>
                        Roads & LGUs
                      </span>
                    </button>

                    {/* Satellite Card */}
                    <button
                      type="button"
                      onClick={() => setBasemapMode('satellite')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition cursor-pointer text-center ${
                        basemapMode === 'satellite'
                          ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                          : 'bg-stone-50 hover:bg-stone-100/80 text-stone-700 border-stone-200/80'
                      }`}
                      title="High-resolution aerial satellite photography"
                    >
                      <Globe className={`w-5 h-5 mb-1.5 ${basemapMode === 'satellite' ? 'text-white' : 'text-stone-600'}`} />
                      <span className="text-xs font-semibold leading-tight">Satellite</span>
                      <span className={`text-[9px] mt-0.5 leading-none ${basemapMode === 'satellite' ? 'text-stone-300' : 'text-stone-400'}`}>
                        Aerial Photo
                      </span>
                    </button>

                    {/* Terrain Card */}
                    <button
                      type="button"
                      onClick={() => setBasemapMode('terrain')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition cursor-pointer text-center ${
                        basemapMode === 'terrain'
                          ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                          : 'bg-stone-50 hover:bg-stone-100/80 text-stone-700 border-stone-200/80'
                      }`}
                      title="Topographic elevation & mountain contours"
                    >
                      <Mountain className={`w-5 h-5 mb-1.5 ${basemapMode === 'terrain' ? 'text-white' : 'text-stone-600'}`} />
                      <span className="text-xs font-semibold leading-tight">Terrain</span>
                      <span className={`text-[9px] mt-0.5 leading-none ${basemapMode === 'terrain' ? 'text-stone-300' : 'text-stone-400'}`}>
                        Contours
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Analysis Overlays */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-stone-500 block">
                    Analysis Overlays
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-xl text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setMapLayerMode('boundaries')}
                      className={`py-1.5 px-1 rounded-lg text-center transition cursor-pointer text-xs font-medium flex items-center justify-center gap-1 ${
                        mapLayerMode === 'boundaries'
                          ? 'bg-stone-900 text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                      title="14 Municipal administrative borders"
                    >
                      <span>Boundaries</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapLayerMode('choropleth')}
                      className={`py-1.5 px-1 rounded-lg text-center transition cursor-pointer text-xs font-medium flex items-center justify-center gap-1 ${
                        mapLayerMode === 'choropleth'
                          ? 'bg-stone-900 text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                      title="Incident volume density heatmap"
                    >
                      <span>Density</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapLayerMode('protected_zones')}
                      className={`py-1.5 px-1 rounded-lg text-center transition cursor-pointer text-xs font-medium flex items-center justify-center gap-1 ${
                        mapLayerMode === 'protected_zones'
                          ? 'bg-stone-900 text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                      title="Sierra Madre & lakeside ecological reserves"
                    >
                      <span>Protected</span>
                    </button>
                  </div>
                </div>

                {/* 3. Apple-Style Toggle Switch: Jurisdiction Spotlight */}
                <div
                  onClick={() => setIsMaskActive(!isMaskActive)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200/90 bg-stone-50/70 hover:bg-stone-50 transition cursor-pointer"
                  title="Dim surrounding regions to spotlight Rizal jurisdiction"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                      isMaskActive ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-600'
                    }`}>
                      <Crosshair className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-medium text-stone-900 block leading-tight">
                        {mapLayerMode === 'protected_zones' ? 'Dim Outside Reserves' : 'Focus: Rizal Only'}
                      </span>
                      <span className="text-[10px] text-stone-400 block leading-tight">
                        Spotlight jurisdiction boundary
                      </span>
                    </div>
                  </div>

                  {/* Smooth Apple / iOS Sliding Toggle Switch */}
                  <div
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                      isMaskActive ? 'bg-stone-900' : 'bg-stone-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
                        isMaskActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* 4. Refined Contextual Legend */}
                <div className="pt-2 border-t border-stone-100 text-[11px] space-y-1.5">
                  {mapLayerMode === 'choropleth' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-stone-500 font-mono text-[9px]">
                        <span>0</span>
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                        <span>5+ reports</span>
                      </div>
                      <div className="grid grid-cols-5 gap-0.5 h-2 w-full rounded-full overflow-hidden border border-stone-200 bg-stone-100">
                        <div className="h-full bg-emerald-600 opacity-20" title="1 report" />
                        <div className="h-full bg-emerald-600 opacity-40" title="2 reports" />
                        <div className="h-full bg-emerald-600 opacity-60" title="3 reports" />
                        <div className="h-full bg-emerald-600 opacity-80" title="4 reports" />
                        <div className="h-full bg-emerald-800 opacity-100" title="5+ reports" />
                      </div>
                      <div className="text-stone-400 text-[9px] text-center font-medium">
                        Incident Volume Density Scale
                      </div>
                    </div>
                  )}

                  {mapLayerMode === 'protected_zones' && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-stone-700 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-stone-700" />
                        <span>Protected Reserves & Buffers</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="flex items-center gap-1.5 text-stone-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="truncate">Mt. Tagapo</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-700">
                          <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                          <span className="truncate">Laguna Buffer</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-700 shrink-0" />
                          <span className="truncate">Sierra Madre</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-700">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <span className="truncate">Hinulugang Taktak</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {(mapLayerMode === 'boundaries' || mapLayerMode === 'standard') && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-stone-600 text-[11px] font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Minor (1–2)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>Moderate (3)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-600" />
                          <span>Urgent (4–5)</span>
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-400 text-center font-normal">
                        14 LGUs of Rizal • Interactive map pins
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Google / Apple Maps Floating Trigger Pill Button */}
            <button
              type="button"
              onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
              className={`flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 shadow-md hover:shadow-lg rounded-xl transition cursor-pointer select-none ${
                isLayersPanelOpen ? 'ring-2 ring-stone-900 bg-stone-50' : ''
              }`}
              title="Toggle Map Layers & Overlays"
            >
              <Layers className="w-4 h-4 text-stone-700" />
              <span className="text-xs font-semibold text-stone-900">Layers</span>
              <span className="text-[10px] text-stone-500 font-medium capitalize pl-1.5 border-l border-stone-200">
                {basemapMode}
              </span>
              <ChevronUp className={`w-3.5 h-3.5 text-stone-400 transition-transform ${isLayersPanelOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* High-Resolution Photo Lightbox Modal */}
      {isLightboxOpen && photoDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider p-1.5 cursor-pointer rounded hover:bg-white/10 transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
              <span>Close (Esc)</span>
            </button>
            <img
              src={photoDataUrl}
              alt="Incident high-resolution evidence"
              className="max-h-[80vh] w-auto max-w-full rounded-xl shadow-2xl object-contain border border-white/10"
            />
            <div className="mt-3 text-center text-xs text-stone-300 font-mono">
              {selectedReport?.referenceCode} • High-Resolution Telemetry Preview
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
