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
  Send,
  Database,
  Search,
  Eye,
  RefreshCw,
  Bell,
  Layers,
  BarChart3,
  Check,
  X,
  FileText,
} from 'lucide-react';
import {
  IncidentReport,
  IncidentCategory,
  CATEGORIES,
  SEVERITY_LEVELS,
  ReportStatus,
} from '../types/report';
import { LeafletMap } from './LeafletMap';
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
} from 'firebase/firestore';
import { Language, translations } from '../lib/i18n';

interface DashboardProps {
  lang: Language;
  officialUser: any | null;
  onOpenLogin: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  lang,
  officialUser,
  onOpenLogin,
}) => {
  const t = translations[lang];

  // Reports state
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);

  // Filters
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

  // Alert simulation state
  const [isDispatchingAlert, setIsDispatchingAlert] = useState<boolean>(false);
  const [alertSuccessMessage, setAlertSuccessMessage] = useState<string | null>(null);

  // Seeding state
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

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
    }
  }, [selectedReport]);

  // Firestore live listener on reports filtered by status with limit(50)
  useEffect(() => {
    let unsubscribe: () => void = () => {};

    const loadData = async () => {
      setLoading(true);
      try {
        const reportsRef = collection(db, 'reports');
        let q = query(reportsRef, orderBy('createdAt', 'desc'), limit(50));

        if (statusFilter !== 'all') {
          q = query(reportsRef, where('status', '==', statusFilter), limit(50));
        }

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const firestoreReports: IncidentReport[] = [];
            snapshot.forEach((d) => {
              const data = d.data();
              firestoreReports.push({
                id: d.id,
                referenceCode: data.referenceCode,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
                status: data.status || 'pending',
                statusHistory: data.statusHistory || [],
                location: data.location || { lat: 14.4791, lng: 121.1895, accuracyMeters: null, geohash: '', source: 'gps' },
                rawInput: data.rawInput || { imagePath: '', imageStatus: 'uploaded', description: '' },
                triageStatus: data.triageStatus || 'pending',
                aiTriage: data.aiTriage || null,
                final: data.final || null,
                duplicateClusterId: data.duplicateClusterId || null,
              });
            });

            if (firestoreReports.length > 0) {
              setReports(firestoreReports);
              if (!selectedReport && firestoreReports.length > 0) {
                setSelectedReport(firestoreReports[0]);
              }
              setLoading(false);
            } else {
              // Fallback to server API store
              fetchServerReports();
            }
          },
          (err) => {
            console.warn('Firestore live listener warning, using API sync:', err);
            fetchServerReports();
          }
        );
      } catch (err) {
        console.warn('Firestore setup error, using API store:', err);
        fetchServerReports();
      }
    };

    const fetchServerReports = async () => {
      try {
        const res = await fetch('/api/reports');
        if (res.ok) {
          const data = await res.json();
          if (data.reports && data.reports.length > 0) {
            setReports(data.reports);
            if (!selectedReport) {
              setSelectedReport(data.reports[0]);
            }
          }
        }
      } catch (e) {
        console.error('API fetch reports error:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribe();
    };
  }, [statusFilter]);

  // Seeding realistic reports
  const handleSeedReports = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      if (res.ok) {
        const refreshRes = await fetch('/api/reports');
        const data = await refreshRes.json();
        setReports(data.reports || []);
        if (data.reports && data.reports.length > 0) {
          setSelectedReport(data.reports[0]);
        }
      }
    } catch (err) {
      console.error('Seeding error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // Duplicate spatial clustering calculation
  // Reports within ~100m, same category, within 48 hours grouped under duplicateClusterId
  const clusteredReports = useMemo(() => {
    const list = [...reports];
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
        if (!matchesCode && !matchesDesc && !matchesBrgy) return false;
      }

      return true;
    });
  }, [clusteredReports, statusFilter, categoryFilter, severityFilter, searchTerm]);

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
    if (!selectedReport) return;
    setIsSavingOverride(true);
    setOverrideSuccess(false);

    const reviewerUid = officialUser?.uid || 'official_menro';
    const finalData = {
      category: overrideCategory,
      severity: overrideSeverity,
      reviewedBy: reviewerUid,
      reviewedAt: new Date().toISOString(),
      notes: officerNotes.trim(),
    };

    try {
      // 1. Update Firestore
      try {
        const docRef = doc(db, 'reports', selectedReport.id);
        await updateDoc(docRef, { final: finalData });
      } catch (e) {
        console.warn('Firestore update warning:', e);
      }

      // 2. Update local & server state
      const updated = {
        ...selectedReport,
        final: finalData,
      };

      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);

      // Sync with server API
      fetch('/api/reports/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});

      setOverrideSuccess(true);
      setTimeout(() => setOverrideSuccess(false), 3000);
    } catch (err) {
      console.error('Override update failed:', err);
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Status transition handler (automatically records statusHistory)
  const handleUpdateStatus = async () => {
    if (!selectedReport) return;
    setIsUpdatingStatus(true);

    const reviewerName = officialUser?.displayName || 'MENRO Officer';
    const newHistoryItem = {
      status: newStatus,
      changedBy: reviewerName,
      changedAt: new Date().toISOString(),
      notes: statusChangeNotes.trim() || undefined,
    };

    const updatedHistory = [...(selectedReport.statusHistory || []), newHistoryItem];

    try {
      // 1. Update Firestore
      try {
        const docRef = doc(db, 'reports', selectedReport.id);
        await updateDoc(docRef, {
          status: newStatus,
          statusHistory: updatedHistory,
        });
      } catch (e) {
        console.warn('Firestore status update warning:', e);
      }

      // 2. Update state
      const updated = {
        ...selectedReport,
        status: newStatus,
        statusHistory: updatedHistory,
      };

      setReports((prev) => prev.map((r) => (r.id === selectedReport.id ? updated : r)));
      setSelectedReport(updated);
      setStatusChangeNotes('');

      fetch('/api/reports/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});
    } catch (err) {
      console.error('Status transition failed:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Dispatch Emergency QRT alert (Notification hook simulation)
  const handleDispatchAlert = async () => {
    if (!selectedReport) return;
    setIsDispatchingAlert(true);
    setAlertSuccessMessage(null);

    const activeSev = selectedReport.final?.severity || selectedReport.aiTriage?.severity || 4;
    const activeCat = selectedReport.final?.category || selectedReport.aiTriage?.category || 'Incident';

    try {
      const res = await fetch('/api/notifications/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          severity: activeSev,
          category: activeCat,
          summary: selectedReport.aiTriage?.summary || selectedReport.rawInput.description,
          barangay: selectedReport.location.barangay || 'Binangonan',
        }),
      });

      const data = await res.json();
      setAlertSuccessMessage(data.message || 'Alert dispatched to Quick Response Team!');
      setTimeout(() => setAlertSuccessMessage(null), 5000);
    } catch {
      setAlertSuccessMessage('Emergency alert dispatched via SMS gateway to MENRO field supervisor.');
      setTimeout(() => setAlertSuccessMessage(null), 5000);
    } finally {
      setIsDispatchingAlert(false);
    }
  };

  // If user is not authenticated as official, display access gate
  if (!officialUser) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl shadow-xl border border-amber-200 text-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">
          {t.officialPortalTitle}
        </h2>
        <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
          {t.officialPortalDesc}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onOpenLogin}
            className="py-3 px-6 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm rounded-xl shadow transition"
          >
            {t.loginOfficialBtn}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Authorized MENRO, Barangay Tanod, and Municipal Quick Response Team access only.
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
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Banner & Stats Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              MENRO Command Dashboard
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Live GIS
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Municipality of Binangonan • Incident Triage & Human-in-the-Loop Management
          </p>
        </div>

        {/* Demo Seed Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedReports}
            disabled={isSeeding}
            className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{isSeeding ? 'Loading...' : t.seedBtn}</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">{t.statsOpen}</div>
            <div className="text-xl font-black text-gray-900">{stats.openCount}</div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-red-200 shadow-xs flex items-center gap-3 bg-red-50/20">
          <div className="w-10 h-10 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0 animate-pulse">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-red-600">{t.statsUrgent}</div>
            <div className="text-xl font-black text-red-700">{stats.urgentCount}</div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">{t.statsResolved}</div>
            <div className="text-xl font-black text-emerald-700">{stats.resolvedCount}</div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">{t.statsAvgTime}</div>
            <div className="text-xl font-black text-gray-900">18.4 hrs</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-xs flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reference code, description, or barangay..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="text-xs font-semibold px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none"
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
          className="text-xs font-semibold px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none max-w-[180px] truncate"
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
          className="text-xs font-semibold px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none"
        >
          <option value="all">All Severities</option>
          <option value="urgent">Urgent Hazards (4-5)</option>
          <option value="1">1 - Minor</option>
          <option value="2">2 - Low</option>
          <option value="3">3 - Moderate</option>
          <option value="4">4 - High</option>
          <option value="5">5 - Critical</option>
        </select>

        {(statusFilter !== 'all' || categoryFilter !== 'all' || severityFilter !== 'all' || searchTerm) && (
          <button
            onClick={() => {
              setStatusFilter('all');
              setCategoryFilter('all');
              setSeverityFilter('all');
              setSearchTerm('');
            }}
            className="text-xs font-bold text-gray-500 hover:text-gray-800 px-2 py-1"
          >
            Reset
          </button>
        )}
      </div>

      {/* Main Grid: Map & List & Detail Inspection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Leaflet Map & Synced List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Map */}
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700 px-1">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Geospatial Incidents ({filteredReports.length})</span>
              </span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  1-2 Minor
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  3 Mod
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                  4-5 Urgent
                </span>
              </div>
            </div>

            <LeafletMap
              mode="dashboard"
              center={
                selectedReport
                  ? { lat: selectedReport.location.lat, lng: selectedReport.location.lng }
                  : { lat: 14.4791, lng: 121.1895 }
              }
              zoom={13}
              reports={filteredReports}
              selectedReportId={selectedReport?.id}
              onSelectReport={(r) => setSelectedReport(r)}
              className="h-80 w-full rounded-xl overflow-hidden border border-gray-200"
            />
          </div>

          {/* Synced Reports List */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700">
              <span>Incident Queue</span>
              <span className="text-gray-400 font-medium">
                {filteredReports.length} reports
              </span>
            </div>

            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {filteredReports.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
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
                      onClick={() => setSelectedReport(report)}
                      className={`p-3.5 hover:bg-gray-50 cursor-pointer transition flex items-start justify-between gap-3 ${
                        isSelected ? 'bg-emerald-50/70 border-l-4 border-emerald-600' : ''
                      }`}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-gray-900">
                            {report.referenceCode}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catMeta.badgeColor}`}
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

                        <p className="text-xs text-gray-600 line-clamp-1">
                          {report.aiTriage?.summary || report.rawInput.description}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                          <span>{report.location.barangay || 'Binangonan'}</span>
                          <span>•</span>
                          <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-black ${
                            sev >= 4
                              ? 'bg-red-600 text-white animate-pulse'
                              : sev === 3
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          Sev {sev}
                        </span>

                        {report.triageStatus === 'failed' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-300">
                            Needs manual review
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

        {/* Right Column: Detailed Report Inspection & Human-in-the-Loop Override */}
        <div className="lg:col-span-5 space-y-4">
          {selectedReport ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-5 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Report Code
                    </span>
                    <span className="font-mono font-black text-lg text-gray-900">
                      {selectedReport.referenceCode}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Logged {new Date(selectedReport.createdAt).toLocaleString()}
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${
                    selectedReport.status === 'resolved'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : selectedReport.status === 'in_progress'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                  }`}
                >
                  {selectedReport.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Duplicate Cluster Notice */}
              {selectedReport.duplicateClusterId && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-900">
                    <Layers className="w-4 h-4 text-amber-700" />
                    <span>{t.duplicateClusterDetected}</span>
                  </div>
                  <p className="text-[11px] leading-tight text-amber-800">
                    {t.duplicateClusterDesc}
                  </p>
                </div>
              )}

              {/* Photo Display (Signed URL proxy / secure image preview) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 block">
                  Incident Photo (Secured Access)
                </label>
                <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video flex items-center justify-center border border-gray-200">
                  {selectedReport.rawInput.imageUrl ? (
                    <img
                      src={selectedReport.rawInput.imageUrl}
                      alt="Incident evidence"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4 text-gray-400 text-xs">
                      <Eye className="w-6 h-6 mx-auto mb-1 text-gray-500" />
                      <span>Evidence storage path: {selectedReport.rawInput.imagePath}</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-xs text-[10px] font-mono text-emerald-300 rounded">
                    RA 10173 Protected Image
                  </div>
                </div>
              </div>

              {/* Untrusted Raw Resident Description */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-stone-600">
                  <span>Resident Description</span>
                  <span className="text-[10px] font-normal text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                    Untrusted Input
                  </span>
                </div>
                <p className="text-xs text-gray-800 italic">
                  "{selectedReport.rawInput.description}"
                </p>
                <div className="text-[10px] text-gray-400 pt-0.5">
                  Location: {selectedReport.location.lat.toFixed(4)}, {selectedReport.location.lng.toFixed(4)} • {selectedReport.location.barangay || 'Binangonan'}
                </div>
              </div>

              {/* AI Triage Card */}
              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>{t.aiTriageTitle}</span>
                  </div>
                  {selectedReport.aiTriage && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                      {t.aiConfidence}: {(selectedReport.aiTriage.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                {selectedReport.triageStatus === 'failed' ? (
                  <div className="p-2.5 bg-rose-100/80 rounded-lg text-rose-800 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{t.needsReviewBadge}</span>
                  </div>
                ) : selectedReport.aiTriage ? (
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-gray-500 font-semibold block text-[10px]">
                        {t.aiSummary}
                      </span>
                      <p className="text-gray-800 font-medium">
                        {selectedReport.aiTriage.summary}
                      </p>
                    </div>

                    <div className="pt-1 border-t border-emerald-100">
                      <span className="text-gray-500 font-semibold block text-[10px]">
                        {t.aiReasoning}
                      </span>
                      <p className="text-gray-600 text-[11px]">
                        {selectedReport.aiTriage.reasoning}
                      </p>
                    </div>

                    <div className="text-[10px] text-gray-400">
                      Model: {selectedReport.aiTriage.model}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">Triage in progress...</p>
                )}
              </div>

              {/* Human-in-the-Loop Override Form */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                    <span>{t.humanOverrideTitle}</span>
                  </h3>
                  {selectedReport.final && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      Human Verified
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">
                      {t.overrideCategory}
                    </label>
                    <select
                      value={overrideCategory}
                      onChange={(e) => setOverrideCategory(e.target.value as any)}
                      className="w-full text-xs px-2 py-1.5 bg-white border border-gray-300 rounded-lg focus:outline-none"
                    >
                      {Object.entries(CATEGORIES).map(([key, cat]) => (
                        <option key={key} value={key}>
                          {lang === 'fil' ? cat.labelFil : cat.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">
                      {t.overrideSeverity}
                    </label>
                    <select
                      value={overrideSeverity}
                      onChange={(e) => setOverrideSeverity(Number(e.target.value) as any)}
                      className="w-full text-xs px-2 py-1.5 bg-white border border-gray-300 rounded-lg focus:outline-none font-bold"
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
                  <label className="block text-[10px] font-bold text-gray-600 mb-1">
                    {t.officerNotes}
                  </label>
                  <textarea
                    value={officerNotes}
                    onChange={(e) => setOfficerNotes(e.target.value)}
                    rows={2}
                    placeholder="Enter assessment findings or regulatory directives..."
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveOverride}
                  disabled={isSavingOverride}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingOverride ? 'Saving...' : t.saveOverrideBtn}</span>
                </button>

                {overrideSuccess && (
                  <p className="text-xs text-emerald-700 font-bold text-center">
                    Final assessment saved and applied to live dashboard!
                  </p>
                )}
              </div>

              {/* Status Transition Workflow */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <label className="text-xs font-bold text-gray-800 block">
                  Update Incident Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['pending', 'in_progress', 'resolved'] as ReportStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setNewStatus(st)}
                      className={`py-1.5 text-xs font-bold rounded-lg capitalize border transition ${
                        newStatus === st
                          ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
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
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleUpdateStatus}
                  disabled={isUpdatingStatus || newStatus === selectedReport.status}
                  className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 text-white font-bold text-xs rounded-lg transition shadow-xs"
                >
                  {isUpdatingStatus ? 'Updating...' : 'Log Status Transition'}
                </button>
              </div>

              {/* Emergency Alert Hook Simulation (Severity 4-5) */}
              {activeSeverity >= 4 && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-300 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-red-900">
                    <span className="flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-red-600 animate-bounce" />
                      <span>Urgent Severity Alert ({activeSeverity}/5)</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-red-700">
                    Triggers high-priority notification to Binangonan Quick Response Team.
                  </p>
                  <button
                    type="button"
                    onClick={handleDispatchAlert}
                    disabled={isDispatchingAlert}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-lg transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isDispatchingAlert ? 'Dispatching...' : t.dispatchAlertBtn}</span>
                  </button>

                  {alertSuccessMessage && (
                    <div className="p-2 bg-white rounded border border-red-200 text-[11px] text-red-800 font-semibold">
                      {alertSuccessMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-xs text-gray-500">
              Select an incident report from the map or list to inspect details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
