import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  X,
  AlertTriangle,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from 'lucide-react';
import { IncidentReport } from '../types/report';

interface ClusterCasesNavigatorProps {
  clusterReports: IncidentReport[];
  selectedReport: IncidentReport;
  onSelectReport: (report: IncidentReport) => void;
  className?: string;
}

type FilterTab = 'all' | 'urgent' | 'pending' | 'in_progress' | 'resolved';

export const ClusterCasesNavigator: React.FC<ClusterCasesNavigatorProps> = ({
  clusterReports,
  selectedReport,
  onSelectReport,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const totalCount = clusterReports.length;

  // Pre-sort all reports by severity descending (SEV 5 -> 1), then newest first
  const sortedReports = useMemo(() => {
    return [...clusterReports].sort((a, b) => {
      const sevA = a.final?.severity || a.aiTriage?.severity || 3;
      const sevB = b.final?.severity || b.aiTriage?.severity || 3;
      if (sevB !== sevA) return sevB - sevA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [clusterReports]);

  // Count by urgency and status for filter tabs
  const counts = useMemo(() => {
    let urgent = 0;
    let pending = 0;
    let inProgress = 0;
    let resolved = 0;

    for (const r of clusterReports) {
      const sev = r.final?.severity || r.aiTriage?.severity || 3;
      if (sev >= 4) urgent++;
      const st = r.status || 'pending';
      if (st === 'pending') pending++;
      else if (st === 'in_progress') inProgress++;
      else if (st === 'resolved') resolved++;
    }

    return { urgent, pending, inProgress, resolved };
  }, [clusterReports]);

  // Filtered reports according to activeTab and searchQuery
  const filteredReports = useMemo(() => {
    return sortedReports.filter((r) => {
      // Tab filter
      if (activeTab === 'urgent') {
        const sev = r.final?.severity || r.aiTriage?.severity || 3;
        if (sev < 4) return false;
      } else if (activeTab === 'pending') {
        if ((r.status || 'pending') !== 'pending') return false;
      } else if (activeTab === 'in_progress') {
        if (r.status !== 'in_progress') return false;
      } else if (activeTab === 'resolved') {
        if (r.status !== 'resolved') return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = r.referenceCode.toLowerCase().includes(q);
        const descMatch = (r.rawInput?.description || '').toLowerCase().includes(q);
        const summaryMatch = (r.aiTriage?.summary || '').toLowerCase().includes(q);
        const brgyMatch = (r.location?.barangay || '').toLowerCase().includes(q);
        const munMatch = (r.location?.municipality || '').toLowerCase().includes(q);
        if (!codeMatch && !descMatch && !summaryMatch && !brgyMatch && !munMatch) {
          return false;
        }
      }

      return true;
    });
  }, [sortedReports, activeTab, searchQuery]);

  // If there's 1 or fewer reports, there's no cluster to navigate
  if (totalCount <= 1) {
    return null;
  }

  // Check if currently selected report is hidden by current filter
  const isSelectedReportFilteredOut = !filteredReports.some((r) => r.id === selectedReport.id);

  const clearFiltersAndSelectCurrent = () => {
    setActiveTab('all');
    setSearchQuery('');
  };

  return (
    <div
      className={`bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2.5 transition-all ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="w-3.5 h-3.5 text-stone-700 shrink-0" />
          <span className="text-xs font-semibold text-stone-900 truncate">
            {totalCount} Reports in this Cluster
          </span>
          {totalCount >= 5 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200/80 text-stone-600 font-medium shrink-0">
              {filteredReports.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {totalCount > 4 ? (
            <div className="flex items-center border border-stone-200 rounded-md overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1 transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
                }`}
                title="2-column grid view"
                aria-label="Grid view"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1 transition cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
                }`}
                title="Single-column detailed list"
                aria-label="List view"
              >
                <List className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-stone-500 font-mono">Select Case</span>
          )}
        </div>
      </div>

      {/* Progressive Controls for Clusters with > 4 reports */}
      {totalCount > 4 && (
        <div className="space-y-2 pt-0.5">
          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2 py-0.5 rounded font-medium transition cursor-pointer shrink-0 border ${
                activeTab === 'all'
                  ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                  : 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
              }`}
            >
              All ({totalCount})
            </button>

            {counts.urgent > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('urgent')}
                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer shrink-0 flex items-center gap-1 border ${
                  activeTab === 'urgent'
                    ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                    : 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                Urgent ({counts.urgent})
              </button>
            )}

            {counts.pending > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer shrink-0 border ${
                  activeTab === 'pending'
                    ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                    : 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                Pending ({counts.pending})
              </button>
            )}

            {counts.inProgress > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('in_progress')}
                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer shrink-0 border ${
                  activeTab === 'in_progress'
                    ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                    : 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                In Progress ({counts.inProgress})
              </button>
            )}

            {counts.resolved > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('resolved')}
                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer shrink-0 border ${
                  activeTab === 'resolved'
                    ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                    : 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                Resolved ({counts.resolved})
              </button>
            )}
          </div>

          {/* Search Input when cluster > 4 reports */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${totalCount} cluster cases by code or text...`}
              className="w-full bg-white border border-stone-200 rounded-lg text-xs pl-8 pr-7 py-1 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notice if currently active report is hidden by filter */}
      {isSelectedReportFilteredOut && (
        <div className="flex items-center justify-between text-[11px] bg-stone-100 border border-stone-200 rounded-lg px-2.5 py-1 text-stone-700">
          <span className="truncate">
            Active case <strong className="font-mono">{selectedReport.referenceCode}</strong> is
            hidden by filter.
          </span>
          <button
            type="button"
            onClick={clearFiltersAndSelectCurrent}
            className="text-[10px] font-semibold text-stone-900 underline hover:text-stone-700 shrink-0 ml-2 cursor-pointer"
          >
            Show Active
          </button>
        </div>
      )}

      {/* Cases Container (Scroll-capped at max-h-56 so it never breaks vertical dossier layout) */}
      <div
        className={`max-h-52 sm:max-h-56 overflow-y-auto pr-1 ${
          viewMode === 'grid' ? 'grid grid-cols-2 gap-1.5' : 'space-y-1.5'
        }`}
      >
        {filteredReports.length > 0 ? (
          filteredReports.map((cr) => {
            const isCurrent = cr.id === selectedReport.id;
            const crSev = cr.final?.severity || cr.aiTriage?.severity || 3;
            const crStatus = cr.status || 'pending';
            const statusDotColor =
              crStatus === 'resolved'
                ? 'bg-emerald-500'
                : crStatus === 'in_progress'
                ? 'bg-amber-500'
                : 'bg-rose-500';

            if (viewMode === 'list') {
              return (
                <button
                  key={cr.id}
                  type="button"
                  onClick={() => onSelectReport(cr)}
                  className={`w-full p-2 rounded-lg text-left transition cursor-pointer border flex items-center justify-between gap-2 ${
                    isCurrent
                      ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                      : 'bg-white hover:bg-stone-100 text-stone-800 border-stone-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
                    <span className="font-mono text-xs font-bold shrink-0">{cr.referenceCode}</span>
                    <span className="text-[11px] opacity-75 truncate max-w-[170px] sm:max-w-[210px]">
                      {cr.aiTriage?.summary || cr.rawInput.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        isCurrent ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      SEV {crSev}
                    </span>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={cr.id}
                type="button"
                onClick={() => onSelectReport(cr)}
                className={`p-2 rounded-lg text-left transition cursor-pointer border ${
                  isCurrent
                    ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                    : 'bg-white hover:bg-stone-100 text-stone-800 border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono text-xs font-bold">{cr.referenceCode}</span>
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded font-semibold ${
                      isCurrent ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    SEV {crSev}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] opacity-80 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor}`} />
                  <span className="truncate">{cr.aiTriage?.summary || cr.rawInput.description}</span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="col-span-2 py-4 text-center space-y-1">
            <p className="text-xs text-stone-500">No reports matching filter</p>
            <button
              type="button"
              onClick={clearFiltersAndSelectCurrent}
              className="text-[11px] font-semibold text-stone-900 underline hover:text-stone-700 cursor-pointer"
            >
              Reset filter
            </button>
          </div>
        )}
      </div>

      {/* Summary Footer for clusters with > 4 reports */}
      {totalCount > 4 && (
        <div className="pt-1 border-t border-stone-200/80 flex items-center justify-between text-[10px] text-stone-500">
          <span>
            Showing {filteredReports.length} of {totalCount} cases • Sorted by severity
          </span>
          {(activeTab !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={clearFiltersAndSelectCurrent}
              className="text-stone-700 hover:text-stone-900 font-medium underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};
