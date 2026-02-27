import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { AlertTriangle, CheckCircle, ChevronDown, ArrowUpDown, Search, TrendingUp, Droplets, PlayCircle } from 'lucide-react';
// CheckCircle used in climb table
import { estimateMatchFuel, parseClimbLevel, getAlliance, getStation, computeRobotFuelFromActions } from '../types/scouting';
import type { PgTBAMatch, ScoutEntry, RobotActions } from '../types/scouting';

// ── Types ──
type RobotFuelDetail = {
  teamNumber: number;
  isDedicatedPasser: boolean;
  // Raw scout fields
  autoScore: number;
  autoPass: number;
  autoPlus1: number; autoPlus2: number; autoPlus3: number; autoPlus5: number; autoPlus10: number;
  teleopScore: number;
  teleopPass: number;
  teleopPlus1: number; teleopPlus2: number; teleopPlus3: number; teleopPlus5: number; teleopPlus10: number;
  // Calculated
  autoFuel: number;
  teleopFuel: number;
  fuelEstimate: number;
  passes: number;
  // Action-based attribution
  hasActionData: boolean;
  actionShots: number;
  actionPasses: number;
  // Quality context
  notes: string;
  isSecondReview: boolean;
};

type FuelComparisonRow = {
  matchNum: number;
  alliance: 'red' | 'blue';
  scoutTotal: number;
  tbaTotal: number;
  delta: number;
  scoutAuto: number;
  scoutTeleop: number;
  tbaAuto: number;
  tbaTeleop: number;
  totalPasses: number;
  adjustedTotal: number;
  adjustedDelta: number;
  robots: RobotFuelDetail[];
  isMismatch: boolean;
};

type ClimbComparisonRow = {
  matchNum: number;
  teamNumber: number;
  scoutLevel: number;
  tbaLevel: number;
  isMatch: boolean;
};

const card = 'bg-surface rounded-xl border border-border p-6 shadow-card';
const cardHeader = 'text-base font-bold flex items-center gap-2 mb-4';

function DataQuality() {
  const scoutEntries = useAnalyticsStore(state => state.scoutEntries);
  const pgTbaMatches = useAnalyticsStore(state => state.pgTbaMatches);
  const scoutActions = useAnalyticsStore(state => state.scoutActions);
  const matchFuelAttribution = useAnalyticsStore(state => state.matchFuelAttribution);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);

  useEffect(() => {
    if (!tbaData) fetchTBAData();
  }, [tbaData, fetchTBAData]);

  const [fuelRescoutOnly, setFuelRescoutOnly] = useState(true);
  const [climbMismatchOnly, setClimbMismatchOnly] = useState(true);
  const [fuelSortField, setFuelSortField] = useState<'matchNum' | 'delta'>('matchNum');
  const [fuelSortDir, setFuelSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedFuelRows, setExpandedFuelRows] = useState<Set<string>>(new Set());

  // ── Build action lookup: "matchNum_teamNum" → RobotActions ──
  const actionLookup = useMemo(() => {
    const map = new Map<string, RobotActions>();
    scoutActions.forEach(a => map.set(a.id, a));
    return map;
  }, [scoutActions]);

  // ── Fuel Comparison Table ──
  const fuelComparison = useMemo(() => {
    if (!pgTbaMatches.length || !scoutEntries.length) return [];

    const tbaByMatch = new Map<number, PgTBAMatch>();
    pgTbaMatches.forEach(m => {
      if (m.comp_level === 'qm') tbaByMatch.set(m.match_number, m);
    });

    const byMatchAlliance = new Map<string, ScoutEntry[]>();
    scoutEntries.forEach(e => {
      const alliance = getAlliance(e.configured_team);
      const key = `${e.match_number}_${alliance}`;
      if (!byMatchAlliance.has(key)) byMatchAlliance.set(key, []);
      byMatchAlliance.get(key)!.push(e);
    });

    const rows: FuelComparisonRow[] = [];

    for (const [key, entries] of byMatchAlliance) {
      const [matchNumStr, alliance] = key.split('_');
      const matchNum = parseInt(matchNumStr);
      const tbaMatch = tbaByMatch.get(matchNum);
      if (!tbaMatch) continue;

      const robots: RobotFuelDetail[] = entries.map(e => {
        const summaryFuel = estimateMatchFuel(e);
        const actionKey = `${e.match_number}_${e.team_number}`;
        const robotActions = actionLookup.get(actionKey);
        let hasActionData = false;
        let actionShots = 0;
        let actionPasses = 0;
        let autoFuel = summaryFuel.auto;
        let teleopFuel = summaryFuel.teleop;
        let fuelEstimate = summaryFuel.total;

        if (robotActions && (robotActions.auto.length > 0 || robotActions.teleop.length > 0)) {
          hasActionData = true;
          const actionFuel = computeRobotFuelFromActions(robotActions);
          actionShots = actionFuel.totalShots;
          actionPasses = actionFuel.totalPasses;
          autoFuel = actionFuel.autoTotal;
          teleopFuel = actionFuel.teleopTotal;
          fuelEstimate = actionFuel.totalMoved;
        }

        return {
          teamNumber: e.team_number,
          isDedicatedPasser: !!e.dedicated_passer,
          autoScore: e.auton_FUEL_SCORE || 0,
          autoPass: e.auton_FUEL_PASS || 0,
          autoPlus1: e.auton_SCORE_PLUS_1 || 0, autoPlus2: e.auton_SCORE_PLUS_2 || 0,
          autoPlus3: e.auton_SCORE_PLUS_3 || 0, autoPlus5: e.auton_SCORE_PLUS_5 || 0, autoPlus10: e.auton_SCORE_PLUS_10 || 0,
          teleopScore: e.teleop_FUEL_SCORE || 0,
          teleopPass: e.teleop_FUEL_PASS || 0,
          teleopPlus1: e.teleop_SCORE_PLUS_1 || 0, teleopPlus2: e.teleop_SCORE_PLUS_2 || 0,
          teleopPlus3: e.teleop_SCORE_PLUS_3 || 0, teleopPlus5: e.teleop_SCORE_PLUS_5 || 0, teleopPlus10: e.teleop_SCORE_PLUS_10 || 0,
          autoFuel,
          teleopFuel,
          fuelEstimate,
          passes: (e.auton_FUEL_PASS || 0) + (e.teleop_FUEL_PASS || 0),
          hasActionData,
          actionShots,
          actionPasses,
          notes: e.notes || '',
          isSecondReview: !!e.second_review,
        };
      });
      const scoutTotal = robots.reduce((sum, r) => sum + r.fuelEstimate, 0);
      const scoutAuto = robots.reduce((sum, r) => sum + r.autoFuel, 0);
      const scoutTeleop = robots.reduce((sum, r) => sum + r.teleopFuel, 0);
      const totalPasses = robots.reduce((sum, r) => {
        if (r.hasActionData) return sum + r.actionPasses;
        if (r.isDedicatedPasser) return sum + r.fuelEstimate;
        return sum + r.passes;
      }, 0);
      const adjustedTotal = scoutTotal - totalPasses;
      const hubScore = alliance === 'red' ? tbaMatch.red_hubScore : tbaMatch.blue_hubScore;
      const tbaTotal = hubScore?.totalCount ?? 0;
      const tbaAuto = hubScore?.autoCount ?? 0;
      const tbaTeleop = hubScore?.teleopCount ?? 0;
      const delta = scoutTotal - tbaTotal;
      const adjustedDelta = adjustedTotal - tbaTotal;
      const isMismatch = tbaTotal > 0 && Math.abs(adjustedDelta) > Math.max(tbaTotal * 0.5, 5);

      rows.push({ matchNum, alliance: alliance as 'red' | 'blue', scoutTotal, tbaTotal, delta, scoutAuto, scoutTeleop, tbaAuto, tbaTeleop, totalPasses, adjustedTotal, adjustedDelta, robots, isMismatch });
    }

    return rows;
  }, [scoutEntries, pgTbaMatches, actionLookup]);

  // Check if a row needs rescouting: mismatch, flagged by scouter, or no-show robot
  const fuelRowNeedsRescout = (row: FuelComparisonRow) => {
    return row.isMismatch || row.robots.some(r => r.isSecondReview) ||
      matchFuelAttribution.some(a => a.matchNumber === row.matchNum && a.alliance === row.alliance && a.isNoShow);
  };

  const displayedFuelRows = useMemo(() => {
    let rows = fuelRescoutOnly ? fuelComparison.filter(fuelRowNeedsRescout) : fuelComparison;
    rows = [...rows].sort((a, b) => {
      const mult = fuelSortDir === 'asc' ? 1 : -1;
      if (fuelSortField === 'matchNum') return mult * (a.matchNum - b.matchNum || (a.alliance < b.alliance ? -1 : 1));
      return mult * (Math.abs(a.delta) - Math.abs(b.delta));
    });
    return rows;
  }, [fuelComparison, fuelRescoutOnly, fuelSortField, fuelSortDir, matchFuelAttribution]);

  const scoringEfficiency = useMemo(() => {
    if (!fuelComparison.length) return null;
    const totalAttempts = fuelComparison.reduce((s, r) => s + r.adjustedTotal, 0);
    const totalScored = fuelComparison.reduce((s, r) => s + r.tbaTotal, 0);
    if (totalAttempts <= 0) return null;
    return Math.round((totalScored / totalAttempts) * 100);
  }, [fuelComparison]);

  // ── Climb Comparison Table ──
  const climbComparison = useMemo(() => {
    if (!pgTbaMatches.length || !scoutEntries.length) return [];

    const tbaByMatch = new Map<number, PgTBAMatch>();
    pgTbaMatches.forEach(m => {
      if (m.comp_level === 'qm') tbaByMatch.set(m.match_number, m);
    });

    const rows: ClimbComparisonRow[] = [];

    scoutEntries.forEach(e => {
      const alliance = getAlliance(e.configured_team);
      const station = getStation(e.configured_team);
      const tbaMatch = tbaByMatch.get(e.match_number);
      if (!tbaMatch) return;

      const tbaClimbField = `${alliance}_endGameTowerRobot${station}` as keyof PgTBAMatch;
      const tbaClimbStr = tbaMatch[tbaClimbField] as string | undefined;
      if (!tbaClimbStr) return;

      const tbaLevel = tbaClimbStr.includes('3') ? 3 : tbaClimbStr.includes('2') ? 2 : tbaClimbStr.includes('1') ? 1 : 0;
      const scoutLevel = parseClimbLevel(e.climb_level);

      rows.push({ matchNum: e.match_number, teamNumber: e.team_number, scoutLevel, tbaLevel, isMatch: scoutLevel === tbaLevel });
    });

    return rows.sort((a, b) => a.matchNum - b.matchNum);
  }, [scoutEntries, pgTbaMatches]);

  const displayedClimbRows = useMemo(() => {
    return climbMismatchOnly ? climbComparison.filter(r => !r.isMatch) : climbComparison;
  }, [climbComparison, climbMismatchOnly]);

  const climbAccuracy = useMemo(() => {
    if (!climbComparison.length) return null;
    const matching = climbComparison.filter(r => r.isMatch).length;
    return Math.round((matching / climbComparison.length) * 100);
  }, [climbComparison]);

  // ── Summary Stats ──
  const summaryStats = useMemo(() => {
    const scoutedMatchNums = new Set(scoutEntries.map(e => e.match_number));
    const allPlayedQuals = tbaData?.matches?.filter(m => m.comp_level === 'qm' && m.alliances.red.score >= 0) ?? [];
    const flaggedCount = scoutEntries.filter(e => e.second_review).length;
    return { matchesScouted: scoutedMatchNums.size, matchesPlayed: allPlayedQuals.length, flaggedCount };
  }, [scoutEntries, tbaData]);

  const toggleFuelSort = () => {
    if (fuelSortField === 'matchNum') {
      setFuelSortField('delta');
      setFuelSortDir('desc');
    } else {
      setFuelSortField('matchNum');
      setFuelSortDir('asc');
    }
  };

  const toggleFuelExpand = (key: string) => {
    setExpandedFuelRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Helper: format bucket string ──
  const formatBuckets = (p1: number, p2: number, p3: number, p5: number, p10: number) => {
    const parts = [];
    if (p1) parts.push(`+1×${p1}`);
    if (p2) parts.push(`+2×${p2}`);
    if (p3) parts.push(`+3×${p3}`);
    if (p5) parts.push(`+5×${p5}`);
    if (p10) parts.push(`+10×${p10}`);
    return parts.length > 0 ? parts.join(' ') : '—';
  };

  // ── Empty State ──
  if (scoutEntries.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <AlertTriangle className="text-warning" size={24} />
            Data Quality
          </h1>
          <p className="text-sm text-textSecondary mt-1">Cross-reference scouted data against TBA official results</p>
        </div>
        <div className={card}>
          <div className="text-center py-12">
            <Search size={40} className="mx-auto text-textMuted mb-4" />
            <p className="text-lg font-semibold text-textPrimary">No Scout Data</p>
            <p className="text-sm text-textSecondary mt-1">Scout entries will appear here once synced.</p>
          </div>
        </div>
      </div>
    );
  }

  const accColor = (pct: number | null) =>
    pct === null ? 'text-textMuted' : pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <AlertTriangle className="text-warning" size={24} />
          Data Quality
        </h1>
        <p className="text-sm text-textSecondary mt-1">Cross-reference scouted data against TBA official results to find and fix errors</p>
      </div>

      {/* Section 1: Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={card}>
          <p className="text-xs text-textSecondary uppercase tracking-widest">Scouted / Played</p>
          <p className={`text-3xl font-black mt-1 ${
            summaryStats.matchesScouted >= summaryStats.matchesPlayed && summaryStats.matchesPlayed > 0 ? 'text-success' :
            summaryStats.matchesPlayed - summaryStats.matchesScouted <= 2 ? 'text-warning' : 'text-danger'
          }`}>
            {summaryStats.matchesScouted} / {summaryStats.matchesPlayed}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-textSecondary uppercase tracking-widest">Scoring Efficiency</p>
          <p className={`text-3xl font-black mt-1 ${accColor(scoringEfficiency)}`}>
            {scoringEfficiency !== null ? `${scoringEfficiency}%` : '--'}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-textSecondary uppercase tracking-widest">Climb Accuracy</p>
          <p className={`text-3xl font-black mt-1 ${accColor(climbAccuracy)}`}>
            {climbAccuracy !== null ? `${climbAccuracy}%` : '--'}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-textSecondary uppercase tracking-widest">Flagged for Review</p>
          <p className={`text-3xl font-black mt-1 ${summaryStats.flaggedCount > 0 ? 'text-danger' : 'text-textMuted'}`}>
            {summaryStats.flaggedCount}
          </p>
        </div>
      </div>

      {/* Section 2: Fuel Comparison Table */}
      <div className={card}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className={`${cardHeader} mb-0`}>
            <Droplets className="text-warning" size={18} />
            Fuel: Moved vs Scored
            <span className="text-xs text-textMuted font-normal ml-1">Scouts track balls moved — TBA tracks balls scored</span>
          </h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={fuelRescoutOnly}
                onChange={e => setFuelRescoutOnly(e.target.checked)}
                className="rounded border-border accent-danger"
              />
              <span className="text-textSecondary">Potential rescouts only</span>
              {fuelRescoutOnly && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger">
                  {fuelComparison.filter(fuelRowNeedsRescout).length}
                </span>
              )}
            </label>
            <button onClick={toggleFuelSort} className="flex items-center gap-1 text-xs text-textSecondary hover:text-textPrimary transition-colors">
              <ArrowUpDown size={14} />
              {fuelSortField === 'matchNum' ? 'Match #' : '|Delta|'}
            </button>
          </div>
        </div>

        {displayedFuelRows.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:-mx-6 mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-textMuted">
                  <th className="w-6"></th>
                  <th className="text-left py-2 px-3 font-medium">Match</th>
                  <th className="text-center py-2 px-3 font-medium">Alliance</th>
                  <th className="text-center py-2 px-3 font-medium">Moved</th>
                  <th className="hidden md:table-cell text-center py-2 px-3 font-medium">Passes</th>
                  <th className="hidden md:table-cell text-center py-2 px-3 font-medium">Attempts</th>
                  <th className="text-center py-2 px-3 font-medium">Scored</th>
                  <th className="hidden md:table-cell text-center py-2 px-3 font-medium">Misses</th>
                  <th className="text-center py-2 px-3 font-medium">Eff %</th>
                  <th className="text-center py-2 px-3 font-medium">FMS/Scout</th>
                </tr>
              </thead>
              <tbody>
                {displayedFuelRows.map((row, i) => {
                  const rowKey = `${row.matchNum}_${row.alliance}`;
                  const isExpanded = expandedFuelRows.has(rowKey);
                  const needsRescout = row.isMismatch || row.robots.some(r => r.isSecondReview) ||
                    matchFuelAttribution.some(a => a.matchNumber === row.matchNum && a.alliance === row.alliance && a.isNoShow);
                  return (
                    <>
                      <tr
                        key={rowKey}
                        onClick={() => toggleFuelExpand(rowKey)}
                        className={`border-b border-border/50 cursor-pointer ${
                          needsRescout ? 'border-l-4 border-l-danger' : ''
                        } ${
                          row.isMismatch
                            ? 'bg-danger/5 hover:bg-danger/10'
                            : i % 2 === 0 ? 'bg-surfaceAlt hover:bg-surfaceElevated' : 'hover:bg-surfaceElevated'
                        }`}
                      >
                        <td className="py-2.5 pl-4 pr-1">
                          <ChevronDown size={12} className={`transition-transform text-textMuted ${isExpanded ? 'rotate-180' : ''}`} />
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          <span className="flex items-center gap-1.5">
                            Q{row.matchNum}
                            <Link
                              to={`/replay/${row.matchNum}`}
                              onClick={e => e.stopPropagation()}
                              className="text-textMuted hover:text-success transition-colors"
                              title="Match Replay"
                            >
                              <PlayCircle size={14} />
                            </Link>
                            {needsRescout && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-danger/20 text-danger">RESCOUT?</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            row.alliance === 'red' ? 'bg-redAlliance/20 text-redAlliance' : 'bg-blueAlliance/20 text-blueAlliance'
                          }`}>{row.alliance}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.scoutTotal}</td>
                        <td className="hidden md:table-cell py-2.5 px-3 text-center text-textSecondary">{row.totalPasses > 0 ? row.totalPasses : '-'}</td>
                        <td className="hidden md:table-cell py-2.5 px-3 text-center font-semibold">{row.adjustedTotal}</td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.tbaTotal}</td>
                        <td className={`hidden md:table-cell py-2.5 px-3 text-center font-bold ${
                          row.adjustedDelta > 0 ? 'text-warning' : 'text-textMuted'
                        }`}>
                          {row.adjustedDelta > 0 ? row.adjustedDelta : '-'}
                        </td>
                        <td className={`py-2.5 px-3 text-center font-bold ${
                          row.adjustedTotal > 0 ? (
                            (row.tbaTotal / row.adjustedTotal) >= 0.7 ? 'text-success' :
                            (row.tbaTotal / row.adjustedTotal) >= 0.4 ? 'text-warning' : 'text-danger'
                          ) : 'text-textMuted'
                        }`}>
                          {row.adjustedTotal > 0 ? `${Math.round((row.tbaTotal / row.adjustedTotal) * 100)}%` : '-'}
                        </td>
                        <td className={`py-2.5 px-3 text-center font-bold ${
                          row.adjustedTotal > 0 ? (
                            (() => {
                              const ratio = row.tbaTotal / row.adjustedTotal;
                              if (ratio >= 0.8 && ratio <= 1.2) return 'text-success';
                              if (ratio >= 0.5 && ratio <= 1.5) return 'text-warning';
                              return 'text-danger';
                            })()
                          ) : 'text-textMuted'
                        }`}>
                          {row.adjustedTotal > 0 ? `${(row.tbaTotal / row.adjustedTotal).toFixed(2)}×` : '-'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${rowKey}_detail`} className="bg-surfaceElevated border-b border-border/50">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="space-y-3">
                              {/* Auto vs Teleop comparison */}
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div className="bg-surface rounded-lg p-3 border border-border/50">
                                  <p className="font-bold text-textSecondary mb-1.5">Auto Period</p>
                                  <div className="flex justify-between">
                                    <span>Moved: <span className="font-bold text-textPrimary">{row.scoutAuto}</span></span>
                                    <span>Scored: <span className="font-bold text-textPrimary">{row.tbaAuto}</span></span>
                                    <span className={`font-bold ${row.scoutAuto - row.tbaAuto !== 0 ? 'text-warning' : 'text-success'}`}>
                                      {row.scoutAuto - row.tbaAuto > 0 ? '+' : ''}{row.scoutAuto - row.tbaAuto}
                                    </span>
                                  </div>
                                </div>
                                <div className="bg-surface rounded-lg p-3 border border-border/50">
                                  <p className="font-bold text-textSecondary mb-1.5">Teleop Period</p>
                                  <div className="flex justify-between">
                                    <span>Moved: <span className="font-bold text-textPrimary">{row.scoutTeleop}</span></span>
                                    <span>Scored: <span className="font-bold text-textPrimary">{row.tbaTeleop}</span></span>
                                    <span className={`font-bold ${row.scoutTeleop - row.tbaTeleop !== 0 ? 'text-warning' : 'text-success'}`}>
                                      {row.scoutTeleop - row.tbaTeleop > 0 ? '+' : ''}{row.scoutTeleop - row.tbaTeleop}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Per-robot detail cards */}
                              <div className="space-y-2">
                                {row.robots.map(r => {
                                  const attrRow = matchFuelAttribution.find(a => a.matchNumber === row.matchNum && a.teamNumber === r.teamNumber);
                                  const displayShots = r.hasActionData ? r.actionShots : (r.isDedicatedPasser ? 0 : r.fuelEstimate - r.passes);
                                  const displayPasses = r.hasActionData ? r.actionPasses : (r.isDedicatedPasser ? r.fuelEstimate : r.passes);

                                  return (
                                    <div
                                      key={r.teamNumber}
                                      className={`rounded-lg border p-3 text-xs ${
                                        attrRow?.isNoShow ? 'bg-danger/10 border-danger/30' :
                                        attrRow?.isBulldozedOnly ? 'bg-danger/5 border-danger/20' :
                                        attrRow?.isLostConnection ? 'bg-warning/5 border-warning/20' :
                                        r.isDedicatedPasser ? 'bg-warning/5 border-warning/20' :
                                        'bg-surface border-border/50'
                                      }`}
                                    >
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        {/* Col 1: Robot identity + flags */}
                                        <div className="space-y-1.5">
                                          <div className="flex items-center gap-2">
                                            <span className="text-lg font-black text-textPrimary">{r.teamNumber}</span>
                                            {r.isSecondReview && (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-danger/20 text-danger">FLAGGED</span>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            {attrRow?.isNoShow ? (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-danger/20 text-danger">NO-SHOW</span>
                                            ) : attrRow?.isBulldozedOnly ? (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-danger/20 text-danger">BULLDOZE</span>
                                            ) : r.isDedicatedPasser ? (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning">PASSER</span>
                                            ) : (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success">SCORER</span>
                                            )}
                                            {attrRow?.isLostConnection && (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning">DIED</span>
                                            )}
                                            {attrRow?.isZeroWeight && (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-textMuted/20 text-textMuted">0-WT</span>
                                            )}
                                          </div>
                                          {r.hasActionData ? (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blueAlliance/20 text-blueAlliance inline-block">ACTIONS</span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-textMuted/20 text-textMuted inline-block">EST</span>
                                          )}
                                          {r.notes && (
                                            <p className="text-[10px] text-warning italic mt-1">"{r.notes}"</p>
                                          )}
                                        </div>

                                        {/* Col 2: Raw scout input */}
                                        <div className="space-y-1">
                                          <p className="font-bold text-textMuted uppercase tracking-widest text-[10px]">Raw Scout Input</p>
                                          <div>
                                            <p className="text-textSecondary font-semibold">Auto</p>
                                            <p>SCORE: <span className="font-bold text-textPrimary">{r.autoScore}</span> PASS: <span className="font-bold text-textPrimary">{r.autoPass}</span></p>
                                            <p className="font-mono text-[10px] text-textMuted">{formatBuckets(r.autoPlus1, r.autoPlus2, r.autoPlus3, r.autoPlus5, r.autoPlus10)}</p>
                                          </div>
                                          <div>
                                            <p className="text-textSecondary font-semibold">Teleop</p>
                                            <p>SCORE: <span className="font-bold text-textPrimary">{r.teleopScore}</span> PASS: <span className="font-bold text-textPrimary">{r.teleopPass}</span></p>
                                            <p className="font-mono text-[10px] text-textMuted">{formatBuckets(r.teleopPlus1, r.teleopPlus2, r.teleopPlus3, r.teleopPlus5, r.teleopPlus10)}</p>
                                          </div>
                                        </div>

                                        {/* Col 3: Computed estimates */}
                                        <div className="space-y-1">
                                          <p className="font-bold text-textMuted uppercase tracking-widest text-[10px]">Computed</p>
                                          <div className="space-y-0.5">
                                            <p>Total Moved: <span className="font-bold text-textPrimary">{r.fuelEstimate}</span></p>
                                            <p>Shots: <span className="font-bold text-success">{displayShots || '—'}</span></p>
                                            <p>Passes: <span className="font-bold text-warning">{displayPasses || '—'}</span></p>
                                            <p className="text-textMuted">Auto: {r.autoFuel} · Teleop: {r.teleopFuel}</p>
                                          </div>
                                          {r.hasActionData && (
                                            <div className="mt-1 pt-1 border-t border-border/30 text-textMuted">
                                              <p className="text-[10px]">Action shots: {r.actionShots} · passes: {r.actionPasses}</p>
                                            </div>
                                          )}
                                        </div>

                                        {/* Col 4: Attribution results */}
                                        <div className="space-y-1">
                                          <p className="font-bold text-textMuted uppercase tracking-widest text-[10px]">Attribution</p>
                                          {attrRow ? (
                                            <div className="space-y-0.5">
                                              <p>Scored: <span className="font-bold text-success">{attrRow.shotsScored.toFixed(1)}</span></p>
                                              <p>Auto: <span className="font-bold text-textPrimary">{attrRow.autoScored.toFixed(1)}</span> · Teleop: <span className="font-bold text-textPrimary">{attrRow.teleopScored.toFixed(1)}</span></p>
                                              <p>Accuracy: <span className={`font-bold ${
                                                attrRow.scoringAccuracy >= 0.6 ? 'text-success' :
                                                attrRow.scoringAccuracy >= 0.3 ? 'text-warning' : 'text-danger'
                                              }`}>{Math.round(attrRow.scoringAccuracy * 100)}%</span></p>
                                              <div className="mt-1 pt-1 border-t border-border/30 text-textMuted text-[10px]">
                                                <p>FMS Alliance: {attrRow.fmsAllianceTotal} · Scout Shots: {attrRow.allianceScoutShots}</p>
                                                <p>Unattributed: {attrRow.allianceUnattributed.toFixed(1)}</p>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className="text-textMuted">No attribution data</p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-textMuted py-8 text-sm mt-4">
            {fuelRescoutOnly ? 'No potential rescouts found' : 'No fuel comparison data available'}
          </p>
        )}
      </div>

      {/* Section 4: Climb Comparison Table */}
      <div className={card}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className={`${cardHeader} mb-0`}>
            <TrendingUp className="text-blueAlliance" size={18} />
            Climb Comparison
            <span className="text-xs text-textMuted font-normal ml-1">Scout climb level vs TBA endgame data</span>
          </h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={climbMismatchOnly}
              onChange={e => setClimbMismatchOnly(e.target.checked)}
              className="rounded border-border accent-danger"
            />
            <span className="text-textSecondary">Mismatches only</span>
            {climbMismatchOnly && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger">
                {climbComparison.filter(r => !r.isMatch).length}
              </span>
            )}
          </label>
        </div>

        {displayedClimbRows.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:-mx-6 mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-textMuted">
                  <th className="text-left py-2 px-4 font-medium">Match</th>
                  <th className="text-left py-2 px-3 font-medium">Team</th>
                  <th className="text-center py-2 px-3 font-medium">Scout Level</th>
                  <th className="text-center py-2 px-3 font-medium">TBA Level</th>
                  <th className="text-center py-2 px-3 font-medium">Match?</th>
                </tr>
              </thead>
              <tbody>
                {displayedClimbRows.map((row, i) => (
                  <tr
                    key={`${row.matchNum}_${row.teamNumber}`}
                    className={`border-b border-border/50 ${
                      !row.isMatch
                        ? 'bg-danger/5 hover:bg-danger/10'
                        : i % 2 === 0 ? 'bg-surfaceAlt hover:bg-surfaceElevated' : 'hover:bg-surfaceElevated'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold">Q{row.matchNum}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold">{row.teamNumber}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-warning/20 text-warning text-xs font-bold">L{row.scoutLevel}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-blueAlliance/20 text-blueAlliance text-xs font-bold">L{row.tbaLevel}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.isMatch ? (
                        <CheckCircle size={16} className="inline text-success" />
                      ) : (
                        <AlertTriangle size={16} className="inline text-danger" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-textMuted py-8 text-sm mt-4">
            {climbMismatchOnly ? 'No climb mismatches found' : 'No climb comparison data available'}
          </p>
        )}
      </div>
    </div>
  );
}

export default DataQuality;
