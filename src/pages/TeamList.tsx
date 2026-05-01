import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useMetricsStore } from '../store/useMetricsStore';
import { useWatchlistStore } from '../store/useWatchlistStore';
import { ArrowUp, ArrowDown, Search, Sliders, LayoutGrid, Table2, X, Users, Star, Palette } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import { getMetricValue } from '../utils/metricAggregation';
import { formatMetricValue } from '../utils/formatting';
import ComparisonModal from '../components/ComparisonModal';
import DataSourceToggle from '../components/DataSourceToggle';
import Sparkline from '../components/Sparkline';
import type { MetricColumn } from '../types/metrics';

type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';
type SortCriteria = { field: string; direction: SortDirection };
type FilterChip =
  | 'all' | 'top-scorers' | 'climbers' | 'defenders'
  | 'hot-streaks' | 'inconsistent' | 'reliable' | 'pinned';

// Field-name overrides for the heat-map "lower is better" check. Categories
// `reliability` and `quality` are flipped automatically; these are the
// stragglers in other categories (e.g. climbFailedRate lives in `endgame`).
const LOWER_IS_BETTER_FIELDS = new Set<string>([
  'climbFailedRate', 'climbFailedCount',
  'climbNoneRate',
  'autoDidNothingRate', 'autoDidNothingCount',
  'bulldozedFuelRate',
]);

function isLowerBetter(col: MetricColumn): boolean {
  if (col.category === 'reliability' || col.category === 'quality') return true;
  return LOWER_IS_BETTER_FIELDS.has(col.field);
}

/** 0-1 percentile rank with linear interpolation over equal values. */
function percentileRank(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 0.5;
  // Binary search for first index >= value
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  // Count equal values
  let equal = 0;
  for (let i = lo; i < sorted.length && sorted[i] === value; i++) equal++;
  return (lo + 0.5 * equal) / sorted.length;
}

function percentileTint(p: number, lowerIsBetter: boolean): string {
  // p is 0-1 from raw value. Flip if lower is better so green = good in either case.
  const eff = lowerIsBetter ? 1 - p : p;
  if (eff < 0.2) return 'hsl(var(--danger) / 0.22)';
  if (eff < 0.4) return 'hsl(var(--warning) / 0.18)';
  if (eff < 0.6) return 'transparent';
  if (eff < 0.8) return 'hsl(var(--success) / 0.18)';
  return 'hsl(var(--success) / 0.32)';
}

const HEATMAP_PREF_KEY = 'frc-teamlist-heatmap';
const FILTER_CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'top-scorers', label: 'Top scorers' },
  { id: 'climbers', label: 'Climbers' },
  { id: 'defenders', label: 'Defenders' },
  { id: 'hot-streaks', label: 'Hot streaks' },
  { id: 'inconsistent', label: 'Inconsistent' },
  { id: 'reliable', label: 'Reliable' },
  { id: 'pinned', label: 'Pinned' },
];

function TeamList() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const scoutEntries = useAnalyticsStore(state => state.scoutEntries);
  const preScoutEntries = useAnalyticsStore(state => state.preScoutEntries);
  const usePreScout = useAnalyticsStore(state => state.usePreScout);
  const predictionMode = useAnalyticsStore(state => state.predictionMode);
  const smartFallbackThreshold = useAnalyticsStore(state => state.smartFallbackThreshold);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const teamFuelStats = useAnalyticsStore(state => state.teamFuelStats);
  const teamTrends = useAnalyticsStore(state => state.teamTrends);

  const pinnedTeams = useWatchlistStore(state => state.pinnedTeams);
  const togglePin = useWatchlistStore(state => state.togglePin);
  const isPinned = useWatchlistStore(state => state.isPinned);

  // Entries to feed metric aggregators — must respect the same mode as calculateRealStats
  // so the columns shown on this page match the toggle in the header.
  const entriesForMetrics = useMemo(() => {
    const rosterTeams = new Set((tbaData?.teams ?? []).map(t => t.team_number));
    const preInRoster = rosterTeams.size > 0
      ? preScoutEntries.filter(e => rosterTeams.has(e.team_number))
      : preScoutEntries;

    if (!usePreScout || predictionMode === 'live-only') return scoutEntries;
    if (predictionMode === 'pre-scout-only') return preInRoster;
    if (predictionMode === 'blended') return [...scoutEntries, ...preInRoster];
    // smart-fallback: live-first, fall back to pre-scout for thin-data teams
    const liveCount = new Map<number, number>();
    for (const e of scoutEntries) liveCount.set(e.team_number, (liveCount.get(e.team_number) ?? 0) + 1);
    const teamsWithEnoughLive = new Set<number>();
    for (const [team, count] of liveCount) {
      if (count >= smartFallbackThreshold) teamsWithEnoughLive.add(team);
    }
    return [...scoutEntries, ...preInRoster.filter(e => !teamsWithEnoughLive.has(e.team_number))];
  }, [scoutEntries, preScoutEntries, usePreScout, predictionMode, smartFallbackThreshold, tbaData]);
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
  const [viewMode, setViewMode] = useState<ViewMode>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table');
  const [activeChip, setActiveChip] = useState<FilterChip>('all');
  const [keyboardSelectedIndex, setKeyboardSelectedIndex] = useState<number | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [colorByPercentile, setColorByPercentile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(HEATMAP_PREF_KEY);
    return stored === null ? true : stored === '1';
  });
  useEffect(() => {
    try { localStorage.setItem(HEATMAP_PREF_KEY, colorByPercentile ? '1' : '0'); } catch {
      // localStorage unavailable
    }
  }, [colorByPercentile]);

  const trendByTeam = useMemo(() => {
    const map = new Map<number, typeof teamTrends[number]>();
    for (const t of teamTrends) map.set(t.teamNumber, t);
    return map;
  }, [teamTrends]);

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
  // In pre-scout-only mode, suppress teamFuelStats so getMetricValue falls back
  // to raw-entry aggregation over entriesForMetrics (which IS pre-scout in
  // that mode). Otherwise FMS-attributed values would leak into pre-scout
  // displays and the toggle would appear broken.
  const fuelStatsForMetrics = (usePreScout && predictionMode === 'pre-scout-only')
    ? undefined
    : teamFuelStats;
  const metricCache = useMemo(() => {
    const cache = new Map<number, Map<string, number>>();
    for (const team of teamStatistics) {
      const teamMap = new Map<string, number>();
      for (const col of enabledColumns) {
        teamMap.set(col.field, getMetricValue(col, team, entriesForMetrics, fuelStatsForMetrics));
      }
      cache.set(team.teamNumber, teamMap);
    }
    return cache;
  }, [teamStatistics, enabledColumns, entriesForMetrics, fuelStatsForMetrics]);

  // Percentile cache — for each enabled column, store sorted field values once
  // so per-row tinting is O(log n) instead of O(n).
  const sortedFieldValues = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const col of enabledColumns) {
      const values: number[] = [];
      for (const team of teamStatistics) {
        const v = metricCache.get(team.teamNumber)?.get(col.field);
        if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
      }
      values.sort((a, b) => a - b);
      map.set(col.field, values);
    }
    return map;
  }, [teamStatistics, enabledColumns, metricCache]);

  // Per-team match-points sequence for the sparkline column
  const sparklineByTeam = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const trend of teamTrends) {
      map.set(
        trend.teamNumber,
        trend.matchResults.map(m => m.total),
      );
    }
    return map;
  }, [teamTrends]);

  // Coefficient of variation (σ/μ) per team — needed for "Inconsistent" chip
  const cvByTeam = useMemo(() => {
    const map = new Map<number, number>();
    for (const trend of teamTrends) {
      const totals = trend.matchResults.map(m => m.total);
      const n = totals.length;
      if (n < 3) { map.set(trend.teamNumber, 0); continue; }
      const mean = totals.reduce((s, v) => s + v, 0) / n;
      if (mean <= 0) { map.set(trend.teamNumber, 0); continue; }
      const variance = totals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      map.set(trend.teamNumber, Math.sqrt(variance) / mean);
    }
    return map;
  }, [teamTrends]);

  // Filter chip → predicate + override-sort. Returning null sort means "use the
  // user-selected sortCriteria"; otherwise the chip enforces its preferred order.
  const chipBehavior = useMemo<{
    predicate: (n: number) => boolean;
    overrideSort: SortCriteria[] | null;
  }>(() => {
    const all = (_: number) => true;
    if (activeChip === 'all') {
      return { predicate: all, overrideSort: null };
    }
    if (activeChip === 'top-scorers') {
      return {
        predicate: all,
        overrideSort: [{ field: 'avgTotalPoints', direction: 'desc' }],
      };
    }
    if (activeChip === 'climbers') {
      return {
        predicate: (n) => {
          const s = teamStatistics.find(t => t.teamNumber === n);
          if (!s) return false;
          return s.level1ClimbRate + s.level2ClimbRate + s.level3ClimbRate > 70;
        },
        overrideSort: [{ field: 'avgEndgamePoints', direction: 'desc' }],
      };
    }
    if (activeChip === 'defenders') {
      return {
        predicate: (n) => {
          const s = teamStatistics.find(t => t.teamNumber === n);
          if (!s) return false;
          // dedicatedPasserRate is the closest TeamStatistics proxy; pre-scout
          // played_defense isn't summarized into stats.
          return s.dedicatedPasserRate > 30;
        },
        overrideSort: null,
      };
    }
    if (activeChip === 'hot-streaks') {
      return {
        predicate: (n) => {
          const t = trendByTeam.get(n);
          if (!t) return false;
          return t.delta > 5 && t.matchResults.length >= 6;
        },
        overrideSort: null, // sort below by trend delta
      };
    }
    if (activeChip === 'inconsistent') {
      return {
        predicate: (n) => (cvByTeam.get(n) ?? 0) > 0.4,
        overrideSort: null,
      };
    }
    if (activeChip === 'reliable') {
      return {
        predicate: (n) => {
          const s = teamStatistics.find(t => t.teamNumber === n);
          if (!s || s.matchesPlayed < 3) return false;
          return s.lostConnectionRate < 5 && s.noRobotRate < 5;
        },
        overrideSort: [{ field: 'avgTotalPoints', direction: 'desc' }],
      };
    }
    if (activeChip === 'pinned') {
      const set = new Set(pinnedTeams);
      return { predicate: (n) => set.has(n), overrideSort: null };
    }
    return { predicate: all, overrideSort: null };
  }, [activeChip, teamStatistics, trendByTeam, cvByTeam, pinnedTeams]);

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

  // Sort and filter teams. Pinned teams float to the top regardless of sort
  // (preserving pin order), unless the active chip is 'pinned' (which only
  // shows pinned teams anyway, in normal sort order).
  const filteredAndSortedTeams = useMemo(() => {
    let teams = [...teamStatistics];

    if (searchQuery) {
      teams = teams.filter(
        team =>
          team.teamNumber.toString().includes(searchQuery) ||
          team.teamName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    teams = teams.filter(t => chipBehavior.predicate(t.teamNumber));

    const effectiveSort = chipBehavior.overrideSort ?? sortCriteria;
    const useTrendSort = activeChip === 'hot-streaks';

    teams.sort((a, b) => {
      if (useTrendSort) {
        const da = trendByTeam.get(a.teamNumber)?.delta ?? 0;
        const db = trendByTeam.get(b.teamNumber)?.delta ?? 0;
        if (da !== db) return db - da;
      }
      for (const criteria of effectiveSort) {
        let aValue: number;
        let bValue: number;

        if (criteria.field === 'eventRank') {
          aValue = teamRankMap.get(a.teamNumber) ?? 999;
          bValue = teamRankMap.get(b.teamNumber) ?? 999;
        } else {
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

    if (activeChip === 'pinned' || pinnedTeams.length === 0) return teams;

    // Float pinned teams to top in pin order
    const pinnedSet = new Set(pinnedTeams);
    const pinned: typeof teams = [];
    const unpinned: typeof teams = [];
    for (const t of teams) {
      if (pinnedSet.has(t.teamNumber)) pinned.push(t);
      else unpinned.push(t);
    }
    pinned.sort((a, b) => pinnedTeams.indexOf(a.teamNumber) - pinnedTeams.indexOf(b.teamNumber));
    return [...pinned, ...unpinned];
  }, [
    teamStatistics, searchQuery, sortCriteria, teamRankMap, metricCache,
    chipBehavior, activeChip, trendByTeam, pinnedTeams,
  ]);

  const lastPinnedIndex = useMemo(() => {
    if (activeChip === 'pinned' || pinnedTeams.length === 0) return -1;
    const set = new Set(pinnedTeams);
    let last = -1;
    for (let i = 0; i < filteredAndSortedTeams.length; i++) {
      if (set.has(filteredAndSortedTeams[i].teamNumber)) last = i;
    }
    return last;
  }, [filteredAndSortedTeams, pinnedTeams, activeChip]);

  // ── Keyboard navigation (j/k/Enter/p/Esc/?) ──
  // Mounted globally while TeamList is the active page. Skips when the user
  // is typing in any input/textarea, or when modifier keys are held.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable;
      if (inEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setKeyboardSelectedIndex(prev => {
          if (filteredAndSortedTeams.length === 0) return null;
          if (prev === null) return 0;
          return Math.min(prev + 1, filteredAndSortedTeams.length - 1);
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setKeyboardSelectedIndex(prev => {
          if (filteredAndSortedTeams.length === 0) return null;
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
      } else if (e.key === 'Enter') {
        if (keyboardSelectedIndex == null) return;
        const team = filteredAndSortedTeams[keyboardSelectedIndex];
        if (team) {
          e.preventDefault();
          navigate(`/teams/${team.teamNumber}`);
        }
      } else if (e.key === 'p') {
        if (keyboardSelectedIndex == null) return;
        const team = filteredAndSortedTeams[keyboardSelectedIndex];
        if (team) {
          e.preventDefault();
          togglePin(team.teamNumber);
        }
      } else if (e.key === 'Escape') {
        if (showShortcutHelp) setShowShortcutHelp(false);
        else if (keyboardSelectedIndex != null) setKeyboardSelectedIndex(null);
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcutHelp(s => !s);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filteredAndSortedTeams, keyboardSelectedIndex, navigate, togglePin, showShortcutHelp]);

  // Clamp selection if results shrink
  useEffect(() => {
    if (keyboardSelectedIndex == null) return;
    if (keyboardSelectedIndex >= filteredAndSortedTeams.length) {
      setKeyboardSelectedIndex(filteredAndSortedTeams.length === 0 ? null : filteredAndSortedTeams.length - 1);
    }
  }, [filteredAndSortedTeams.length, keyboardSelectedIndex]);

  const handleSort = (field: string, shiftKey: boolean) => {
    if (chipBehavior.overrideSort) setActiveChip('all');
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
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold">Team List</h1>
          <DataSourceToggle />
        </div>
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

          <button
            onClick={() => setColorByPercentile(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm border ${
              colorByPercentile
                ? 'bg-success/15 text-success border-success/40'
                : 'bg-surface text-textSecondary border-border hover:bg-interactive'
            }`}
            title={colorByPercentile ? 'Hide percentile heat-map' : 'Color cells by percentile rank'}
          >
            <Palette size={16} />
            <span className="hidden sm:inline">Heat-map</span>
          </button>

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

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTER_CHIPS.map(chip => {
          const isActive = activeChip === chip.id;
          const disabled = chip.id === 'pinned' && pinnedTeams.length === 0;
          return (
            <button
              key={chip.id}
              onClick={() => setActiveChip(chip.id)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                isActive
                  ? 'bg-blueAlliance text-white border-blueAlliance'
                  : 'bg-surface text-textSecondary border-border hover:bg-interactive'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={chip.id === 'pinned' && disabled ? 'Pin teams from the table to track them here' : undefined}
            >
              {chip.label}
              {chip.id === 'pinned' && pinnedTeams.length > 0 && (
                <span className="ml-1 opacity-80">({pinnedTeams.length})</span>
              )}
            </button>
          );
        })}
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
                <th className="w-10 px-2 py-3"></th>
                <th className="px-4 py-3 text-left text-textSecondary text-sm font-semibold">
                  <SortButton field="teamNumber" label="Team" />
                </th>
                <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Trend</th>
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
                const teamPinned = isPinned(team.teamNumber);
                const showPinDivider = index === lastPinnedIndex;
                const sparkData = sparklineByTeam.get(team.teamNumber) ?? [];
                const isKeyboardFocused = keyboardSelectedIndex === index;
                return (
                  <tr
                    key={team.teamNumber}
                    onClick={(e) => handleRowClick(e, team.teamNumber)}
                    onTouchStart={() => handleTouchStart(team.teamNumber)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    ref={isKeyboardFocused ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blueAlliance/10 border-l-2 border-l-blueAlliance'
                        : `${index % 2 === 0 ? 'bg-surfaceAlt' : ''} hover:bg-interactive`
                    } ${showPinDivider ? 'border-b-2 border-b-warning/40' : ''} ${
                      isKeyboardFocused ? 'outline outline-2 -outline-offset-2 outline-blueAlliance' : ''
                    }`}
                  >
                    <td className="px-2 py-4 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePin(team.teamNumber); }}
                        className={`p-1 rounded transition-colors ${
                          teamPinned ? 'text-warning' : 'text-textMuted hover:text-warning'
                        }`}
                        title={teamPinned ? 'Unpin team' : 'Pin team to top'}
                        aria-label={teamPinned ? `Unpin team ${team.teamNumber}` : `Pin team ${team.teamNumber}`}
                      >
                        <Star
                          size={16}
                          fill={teamPinned ? 'currentColor' : 'none'}
                        />
                      </button>
                    </td>
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
                      {sparkData.length > 0 ? (
                        <Sparkline data={sparkData} width={70} height={20} />
                      ) : (
                        <span className="text-textMuted text-xs">—</span>
                      )}
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
                      let bg: string | undefined;
                      if (colorByPercentile) {
                        const sorted = sortedFieldValues.get(column.field) ?? [];
                        if (sorted.length > 0 && Number.isFinite(value)) {
                          const p = percentileRank(value, sorted);
                          const tint = percentileTint(p, isLowerBetter(column));
                          if (tint !== 'transparent') bg = tint;
                        }
                      }
                      return (
                        <td
                          key={column.id}
                          className="px-4 py-4 text-right"
                          style={bg ? { backgroundColor: bg } : undefined}
                        >
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
            const teamPinned = isPinned(team.teamNumber);
            const sparkData = sparklineByTeam.get(team.teamNumber) ?? [];
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
                    : teamPinned
                      ? 'border-warning/50 hover:bg-interactive'
                      : 'border-border hover:bg-interactive'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/teams/${team.teamNumber}`}
                    className="flex-1 min-w-0"
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
                      {sparkData.length > 0 && (
                        <Sparkline data={sparkData} width={60} height={18} />
                      )}
                    </div>
                    {team.teamName && (
                      <p className="text-sm text-textSecondary line-clamp-1">{team.teamName}</p>
                    )}
                  </Link>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-blueAlliance/20 text-blueAlliance">
                        Compare
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(team.teamNumber); }}
                      className={`p-1 rounded transition-colors ${
                        teamPinned ? 'text-warning' : 'text-textMuted hover:text-warning'
                      }`}
                      title={teamPinned ? 'Unpin team' : 'Pin team to top'}
                      aria-label={teamPinned ? `Unpin team ${team.teamNumber}` : `Pin team ${team.teamNumber}`}
                    >
                      <Star size={16} fill={teamPinned ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-surfaceElevated rounded p-2">
                    <p className="text-textSecondary text-xs">Matches</p>
                    <p className="font-semibold">{team.matchesPlayed}</p>
                  </div>
                  {enabledColumns.slice(0, 3).map(column => {
                    const value = metricCache.get(team.teamNumber)?.get(column.field) ?? 0;
                    let bg: string | undefined;
                    if (colorByPercentile) {
                      const sorted = sortedFieldValues.get(column.field) ?? [];
                      if (sorted.length > 0 && Number.isFinite(value)) {
                        const p = percentileRank(value, sorted);
                        const tint = percentileTint(p, isLowerBetter(column));
                        if (tint !== 'transparent') bg = tint;
                      }
                    }
                    return (
                      <div
                        key={column.id}
                        className="bg-surfaceElevated rounded p-2"
                        style={bg ? { backgroundColor: bg } : undefined}
                      >
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

      {/* Keyboard shortcuts cheatsheet (toggle with ?) */}
      <button
        onClick={() => setShowShortcutHelp(s => !s)}
        className="fixed bottom-4 right-4 z-30 w-9 h-9 rounded-full bg-surface border border-border text-textSecondary hover:text-textPrimary shadow-lg flex items-center justify-center font-bold"
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
      >
        ?
      </button>
      {showShortcutHelp && (
        <div
          className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
          onClick={() => setShowShortcutHelp(false)}
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <div
            className="bg-surface border border-border rounded-xl p-5 max-w-sm w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-3">Keyboard shortcuts</h3>
            <ul className="space-y-2 text-sm">
              {[
                { keys: ['j', '↓'], label: 'Move selection down' },
                { keys: ['k', '↑'], label: 'Move selection up' },
                { keys: ['Enter'], label: 'Open selected team' },
                { keys: ['p'], label: 'Pin / unpin selected team' },
                { keys: ['Esc'], label: 'Clear selection' },
                { keys: ['?'], label: 'Toggle this help' },
                { keys: ['⌘K', 'Ctrl+K'], label: 'Open command palette' },
              ].map(row => (
                <li key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-textSecondary">{row.label}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map(k => (
                      <kbd
                        key={k}
                        className="text-xs bg-surfaceElevated px-1.5 py-0.5 rounded border border-border font-mono"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowShortcutHelp(false)}
              className="mt-4 w-full py-2 text-sm bg-interactive hover:bg-surfaceElevated rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamList;
