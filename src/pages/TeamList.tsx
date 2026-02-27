import { useState, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useMetricsStore } from '../store/useMetricsStore';
import { ArrowUp, ArrowDown, Search, Sliders, LayoutGrid, Table2, X, Users } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import { getMetricValue } from '../utils/metricAggregation';
import { formatMetricValue } from '../utils/formatting';
import ComparisonModal from '../components/ComparisonModal';

type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';
type SortCriteria = { field: string; direction: SortDirection };

function TeamList() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const scoutEntries = useAnalyticsStore(state => state.scoutEntries);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const teamFuelStats = useAnalyticsStore(state => state.teamFuelStats);
  const columns = useMetricsStore(state => state.config.columns);

  const teamRankMap = useMemo(() => {
    const map = new Map<number, number>();
    if (tbaData?.rankings?.rankings) {
      tbaData.rankings.rankings.forEach(r => {
        map.set(teamKeyToNumber(r.team_key), r.rank);
      });
    }
    return map;
  }, [tbaData]);

  const enabledColumns = useMemo(() => columns.filter(col => col.enabled), [columns]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortCriteria, setSortCriteria] = useState<SortCriteria[]>([
    { field: 'avgTotalPoints', direction: 'desc' }
  ]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Click-to-compare state (up to 4 on desktop, 3 on mobile)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const maxCompare = isMobile ? 3 : 4;
  const [compareTeams, setCompareTeams] = useState<number[]>([]);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  const navigate = useNavigate();

  // Long-press support for mobile compare selection
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleTouchStart = useCallback((teamNumber: number) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // Auto-enter compare mode on long-press
      if (!compareMode) setCompareMode(true);
      toggleCompare(teamNumber);
    }, 500);
  }, [compareMode]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long-press if finger moves (scrolling)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Pre-compute all metric values once — avoids repeated getMetricValue() calls
  // during sort (O(n log n) comparisons) and render (O(n × columns)).
  const metricCache = useMemo(() => {
    const cache = new Map<number, Map<string, number>>();
    for (const team of teamStatistics) {
      const teamMap = new Map<string, number>();
      for (const col of enabledColumns) {
        teamMap.set(col.field, getMetricValue(col, team, scoutEntries, teamFuelStats));
      }
      cache.set(team.teamNumber, teamMap);
    }
    return cache;
  }, [teamStatistics, enabledColumns, scoutEntries, teamFuelStats]);

  const toggleCompare = (teamNumber: number) => {
    setCompareTeams(prev => {
      if (prev.includes(teamNumber)) {
        return prev.filter(t => t !== teamNumber);
      }
      if (prev.length >= maxCompare) return prev;
      return [...prev, teamNumber];
    });
  };

  const handleRowClick = (e: React.MouseEvent, teamNumber: number) => {
    // If long-press just fired, don't also navigate
    if (longPressTriggered.current) {
      e.preventDefault();
      longPressTriggered.current = false;
      return;
    }
    if (compareMode || compareTeams.length > 0 || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleCompare(teamNumber);
    } else {
      navigate(`/teams/${teamNumber}`);
    }
  };

  // Sort and filter teams
  const filteredAndSortedTeams = useMemo(() => {
    let teams = [...teamStatistics];

    if (searchQuery) {
      teams = teams.filter(
        team =>
          team.teamNumber.toString().includes(searchQuery) ||
          team.teamName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    teams.sort((a, b) => {
      for (const criteria of sortCriteria) {
        let aValue: number;
        let bValue: number;

        if (criteria.field === 'eventRank') {
          aValue = teamRankMap.get(a.teamNumber) ?? 999;
          bValue = teamRankMap.get(b.teamNumber) ?? 999;
        } else {
          // Use pre-computed cache first, fall back to direct property access
          aValue = metricCache.get(a.teamNumber)?.get(criteria.field)
            ?? (a as unknown as Record<string, number>)[criteria.field];
          bValue = metricCache.get(b.teamNumber)?.get(criteria.field)
            ?? (b as unknown as Record<string, number>)[criteria.field];
        }

        if (aValue === undefined) aValue = 0;
        if (bValue === undefined) bValue = 0;

        if (aValue !== bValue) {
          if (criteria.direction === 'asc') {
            return aValue > bValue ? 1 : -1;
          } else {
            return aValue < bValue ? 1 : -1;
          }
        }
      }
      return 0;
    });

    return teams;
  }, [teamStatistics, searchQuery, sortCriteria, teamRankMap, metricCache]);

  const handleSort = (field: string, shiftKey: boolean) => {
    setSortCriteria(prev => {
      const existingIndex = prev.findIndex(c => c.field === field);

      if (existingIndex !== -1) {
        const newCriteria = [...prev];
        newCriteria[existingIndex] = {
          ...newCriteria[existingIndex],
          direction: newCriteria[existingIndex].direction === 'asc' ? 'desc' : 'asc'
        };
        return newCriteria;
      }

      if (shiftKey && prev.length < 3) {
        return [...prev, { field, direction: 'desc' }];
      }

      return [{ field, direction: 'desc' }];
    });
  };

  const removeSortCriteria = (field: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSortCriteria(prev => {
      const filtered = prev.filter(c => c.field !== field);
      return filtered.length > 0 ? filtered : [{ field: 'avgTotalPoints', direction: 'desc' }];
    });
  };

  const SortButton = ({ field, label }: { field: string; label: string }) => {
    const criteriaIndex = sortCriteria.findIndex(c => c.field === field);
    const isActive = criteriaIndex !== -1;
    const criteria = isActive ? sortCriteria[criteriaIndex] : null;
    const sortNumber = criteriaIndex + 1;

    return (
      <button
        onClick={(e) => handleSort(field, e.shiftKey)}
        className="flex items-center gap-1 hover:text-textPrimary transition-colors group"
        title={isActive ? "Click to toggle direction, Shift+click to add secondary sort" : "Click to sort, Shift+click to add as secondary sort"}
      >
        {label}
        {isActive && (
          <span className="flex items-center gap-0.5">
            {sortCriteria.length > 1 && (
              <span className="text-xs text-warning font-bold">{sortNumber}</span>
            )}
            {criteria?.direction === 'desc' ? (
              <ArrowDown size={14} className="text-warning" />
            ) : (
              <ArrowUp size={14} className="text-warning" />
            )}
            {sortCriteria.length > 1 && (
              <button
                onClick={(e) => removeSortCriteria(field, e)}
                className="ml-0.5 p-0.5 opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity"
                title="Remove this sort"
              >
                <X size={14} />
              </button>
            )}
          </span>
        )}
      </button>
    );
  };


  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Team List</h1>
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          {/* Compare Mode Toggle */}
          <button
            onClick={() => {
              setCompareMode(prev => !prev);
              if (compareMode) setCompareTeams([]);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm border ${
              compareMode
                ? 'bg-blueAlliance text-white border-blueAlliance'
                : 'bg-surface text-textSecondary border-border hover:bg-interactive'
            }`}
            title={compareMode ? 'Exit compare mode' : 'Enter compare mode — tap teams to select (or long-press any team)'}
          >
            <Users size={16} />
            <span className="hidden sm:inline">{compareMode ? 'Comparing...' : 'Compare'}</span>
          </button>

          {compareTeams.length > 0 && (
            <span className="text-blueAlliance text-sm font-medium">
              {compareTeams.length}/{maxCompare}
            </span>
          )}

          {/* View Toggle */}
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded transition-colors text-sm ${
                viewMode === 'cards' ? 'bg-interactive text-textPrimary' : 'text-textSecondary hover:bg-surfaceElevated'
              }`}
              title="Card view"
            >
              <LayoutGrid size={16} />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded transition-colors text-sm ${
                viewMode === 'table' ? 'bg-interactive text-textPrimary' : 'text-textSecondary hover:bg-surfaceElevated'
              }`}
              title="Table view"
            >
              <Table2 size={16} />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <Link
            to="/metrics"
            className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors text-sm border border-border"
          >
            <Sliders size={16} />
            <span className="hidden sm:inline">Customize Columns</span>
            <span className="sm:hidden">Columns</span>
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-textMuted" size={20} />
        <input
          type="text"
          placeholder="Search by team number or name..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Compare Hint */}
      {compareTeams.length === 0 && !compareMode && (
        <p className="text-textMuted text-xs">
          <span className="hidden md:inline">Ctrl+click teams to compare</span>
          <span className="md:hidden">Long-press a team to compare</span>
        </p>
      )}

      {/* Active Sort Indicators */}
      {sortCriteria.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-textSecondary">Sorting by:</span>
          {sortCriteria.map((criteria, index) => (
            <span
              key={criteria.field}
              className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded"
            >
              <span className="text-warning font-bold">{index + 1}.</span>
              <span>{criteria.field === 'eventRank' ? 'Rank' :
                     criteria.field === 'teamNumber' ? 'Team' :
                     criteria.field === 'matchesPlayed' ? 'Matches' :
                     enabledColumns.find(c => c.field === criteria.field)?.label || criteria.field}</span>
              {criteria.direction === 'desc' ? (
                <ArrowDown size={12} className="text-textSecondary" />
              ) : (
                <ArrowUp size={12} className="text-textSecondary" />
              )}
              <button
                onClick={(e) => removeSortCriteria(criteria.field, e)}
                className="ml-1 p-0.5 hover:text-danger transition-colors"
                title="Remove this sort"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {sortCriteria.length < 3 && (
            <span className="text-textMuted text-xs">(Shift+click column to add)</span>
          )}
        </div>
      )}

      {/* Team Display - Table or Cards */}
      {viewMode === 'table' ? (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-surfaceElevated border-b border-border sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-textSecondary text-sm font-semibold">
                  <SortButton field="teamNumber" label="Team" />
                </th>
                <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">
                  <SortButton field="eventRank" label="Rank" />
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  <SortButton field="matchesPlayed" label="Matches" />
                </th>
                {enabledColumns.map(column => (
                  <th key={column.id} className="px-4 py-3 text-right text-textSecondary text-sm font-semibold">
                    <SortButton field={column.field} label={column.label} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSortedTeams.map((team, index) => {
                const isSelected = compareTeams.includes(team.teamNumber);
                return (
                  <tr
                    key={team.teamNumber}
                    onClick={(e) => handleRowClick(e, team.teamNumber)}
                    onTouchStart={() => handleTouchStart(team.teamNumber)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blueAlliance/10 border-l-2 border-l-blueAlliance'
                        : `${index % 2 === 0 ? 'bg-surfaceAlt' : ''} hover:bg-interactive`
                    }`}
                  >
                    <td className="px-4 py-4">
                      <Link
                        to={`/teams/${team.teamNumber}`}
                        className="block hover:text-blueAlliance transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (longPressTriggered.current) {
                            e.preventDefault();
                            longPressTriggered.current = false;
                          }
                        }}
                      >
                        <p className="font-bold">{team.teamNumber}</p>
                        {team.teamName && (
                          <p className="text-sm text-textSecondary">{team.teamName}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-4 text-center">
                      {teamRankMap.get(team.teamNumber) ? (
                        <span className="font-bold text-warning">#{teamRankMap.get(team.teamNumber)}</span>
                      ) : (
                        <span className="text-textMuted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center text-textSecondary">
                      {team.matchesPlayed}
                    </td>
                    {enabledColumns.map(column => {
                      const value = metricCache.get(team.teamNumber)?.get(column.field) ?? 0;
                      return (
                        <td key={column.id} className="px-4 py-4 text-right">
                          {formatMetricValue(value, column.format, column.decimals, team.matchesPlayed)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedTeams.map((team) => {
            const isSelected = compareTeams.includes(team.teamNumber);
            return (
              <div
                key={team.teamNumber}
                onClick={(e) => handleRowClick(e, team.teamNumber)}
                onTouchStart={() => handleTouchStart(team.teamNumber)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                className={`bg-surface rounded-lg border p-4 space-y-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blueAlliance ring-2 ring-blueAlliance bg-blueAlliance/10'
                    : 'border-border hover:bg-interactive'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between">
                  <Link
                    to={`/teams/${team.teamNumber}`}
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (longPressTriggered.current) {
                        e.preventDefault();
                        longPressTriggered.current = false;
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold hover:text-blueAlliance transition-colors">
                        {team.teamNumber}
                      </h3>
                      {teamRankMap.get(team.teamNumber) && (
                        <span className="text-sm font-bold text-warning">#{teamRankMap.get(team.teamNumber)}</span>
                      )}
                    </div>
                    {team.teamName && (
                      <p className="text-sm text-textSecondary line-clamp-1">{team.teamName}</p>
                    )}
                  </Link>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-blueAlliance/20 text-blueAlliance">
                      Compare
                    </span>
                  )}
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-surfaceElevated rounded p-2">
                    <p className="text-textSecondary text-xs">Matches</p>
                    <p className="font-semibold">{team.matchesPlayed}</p>
                  </div>
                  {enabledColumns.slice(0, 3).map(column => {
                    const value = metricCache.get(team.teamNumber)?.get(column.field) ?? 0;
                    return (
                      <div key={column.id} className="bg-surfaceElevated rounded p-2">
                        <p className="text-textSecondary text-xs truncate">{column.label}</p>
                        <p className="font-semibold">
                          {formatMetricValue(value, column.format, column.decimals, team.matchesPlayed)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Results count */}
      <div className="text-center text-textSecondary pb-16">
        Showing {filteredAndSortedTeams.length} of {teamStatistics.length} teams
      </div>

      {/* Floating Compare Action Bar */}
      {compareTeams.length >= 1 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-surface border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium text-textSecondary">
            {compareTeams.length} team{compareTeams.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            {compareTeams.map(t => (
              <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-blueAlliance/20 text-blueAlliance text-xs rounded font-bold">
                {t}
                <button
                  onClick={() => toggleCompare(t)}
                  className="hover:text-danger transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          {compareTeams.length >= 2 && (
              <button
                onClick={() => setShowComparisonModal(true)}
                className="px-3 py-1.5 bg-success text-background font-semibold rounded text-sm hover:bg-success/90 transition-colors"
              >
                Compare
              </button>
          )}
          <button
            onClick={() => { setCompareTeams([]); setCompareMode(false); }}
            className="p-1.5 text-textMuted hover:text-danger rounded transition-colors"
            title="Clear all"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Comparison Modal */}
      {showComparisonModal && compareTeams.length >= 2 && (
        <ComparisonModal
          teams={teamStatistics.filter(t => compareTeams.includes(t.teamNumber))}
          onClose={() => {
            setShowComparisonModal(false);
            setCompareTeams([]);
            setCompareMode(false);
          }}
        />
      )}
    </div>
  );
}

export default TeamList;
