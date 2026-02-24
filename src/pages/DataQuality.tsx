import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { AlertTriangle, CheckCircle, ChevronDown, ArrowUpDown, Search, TrendingUp, Droplets, PlayCircle } from 'lucide-react';
import { estimateMatchFuel, parseClimbLevel, getAlliance, getStation, computeRobotFuelFromActions } from '../types/scouting';
import type { PgTBAMatch, ScoutEntry, RobotActions } from '../types/scouting';

// ── Types ──
type FuelMismatchDetail = { kind: 'fuel'; matchNum: number; alliance: 'red' | 'blue'; scoutValue: number; tbaValue: number };
type ClimbMismatchDetail = { kind: 'climb'; matchNum: number; teamNumber: number; scoutLevel: number; tbaLevel: number };
type FlaggedDetail = { kind: 'flagged'; matchNum: number; teamNumber: number };
type SimpleMatchDetail = { kind: 'match'; matchNum: number };
type SimpleTeamDetail = { kind: 'team'; teamNumber: number };
type DetailItem = FuelMismatchDetail | ClimbMismatchDetail | FlaggedDetail | SimpleMatchDetail | SimpleTeamDetail;
type DataAlert = { type: 'error' | 'warning' | 'info'; label: string; count: number; details: DetailItem[] };

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
  passes: number; // FUEL_PASS fields (explicit pass tracking)
  // Action-based attribution (from timestamped button presses)
  hasActionData: boolean;
  actionShots: number;  // balls attributed to scoring via action sequence
  actionPasses: number; // balls attributed to passing via action sequence
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
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);

  useEffect(() => {
    if (!tbaData) fetchTBAData();
  }, [tbaData, fetchTBAData]);

  const [fuelMismatchOnly, setFuelMismatchOnly] = useState(false);
  const [climbMismatchOnly, setClimbMismatchOnly] = useState(false);
  const [fuelSortField, setFuelSortField] = useState<'matchNum' | 'delta'>('matchNum');
  const [fuelSortDir, setFuelSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedFuelRows, setExpandedFuelRows] = useState<Set<string>>(new Set());

  // ── Build action lookup: "matchNum_teamNum" → RobotActions ──
  const actionLookup = useMemo(() => {
    const map = new Map<string, RobotActions>();
    scoutActions.forEach(a => map.set(a.id, a));
    return map;
  }, [scoutActions]);

  // ── Alerts (migrated from Dashboard) ──
  const dataAlerts = useMemo(() => {
    if (scoutEntries.length === 0) return null;

    const secondReview = scoutEntries.filter(e => e.second_review);

    const allQualMatches = tbaData?.matches?.filter(m => m.comp_level === 'qm' && m.alliances.red.score >= 0) ?? [];
    const scoutedMatchNums = new Set(scoutEntries.map(e => e.match_number));
    const missingMatches = allQualMatches.filter(m => !scoutedMatchNums.has(m.match_number));

    const teamEntryCounts = new Map<number, number>();
    scoutEntries.forEach(e => {
      teamEntryCounts.set(e.team_number, (teamEntryCounts.get(e.team_number) || 0) + 1);
    });
    const maxEntries = Math.max(...teamEntryCounts.values(), 0);
    const lowCoverageTeams = [...teamEntryCounts.entries()]
      .filter(([, count]) => count <= 1 && maxEntries > 2)
      .map(([team]) => team);

    const fuelMismatches: FuelMismatchDetail[] = [];
    const climbMismatches: ClimbMismatchDetail[] = [];

    if (pgTbaMatches.length > 0) {
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

      for (const [key, entries] of byMatchAlliance) {
        const [matchNumStr, alliance] = key.split('_');
        const matchNum = parseInt(matchNumStr);
        const tbaMatch = tbaByMatch.get(matchNum);
        if (!tbaMatch) continue;

        // Compute adjusted total: use action data as primary, summary as fallback
        let scoutFuelSum = 0;
        let passesTotal = 0;
        for (const e of entries) {
          const actionKey = `${e.match_number}_${e.team_number}`;
          const robotActions = actionLookup.get(actionKey);
          if (robotActions && (robotActions.auto.length > 0 || robotActions.teleop.length > 0)) {
            const af = computeRobotFuelFromActions(robotActions);
            scoutFuelSum += af.totalMoved;
            passesTotal += af.totalPasses;
          } else {
            scoutFuelSum += estimateMatchFuel(e).total;
            if (e.dedicated_passer) passesTotal += estimateMatchFuel(e).total;
            else passesTotal += (e.auton_FUEL_PASS || 0) + (e.teleop_FUEL_PASS || 0);
          }
        }
        const adjustedSum = scoutFuelSum - passesTotal;
        const tbaHubCount = alliance === 'red'
          ? tbaMatch.red_hubScore?.totalCount ?? 0
          : tbaMatch.blue_hubScore?.totalCount ?? 0;

        // Flag if adjusted total is still way off from TBA scored
        if (tbaHubCount > 0 && Math.abs(adjustedSum - tbaHubCount) > Math.max(tbaHubCount * 0.5, 5)) {
          fuelMismatches.push({ kind: 'fuel', matchNum, alliance: alliance as 'red' | 'blue', scoutValue: adjustedSum, tbaValue: tbaHubCount });
        }

        entries.forEach(e => {
          const station = getStation(e.configured_team);
          const tbaClimbField = `${alliance}_endGameTowerRobot${station}` as keyof PgTBAMatch;
          const tbaClimbStr = tbaMatch[tbaClimbField] as string | undefined;
          if (!tbaClimbStr) return;

          const tbaLevel = tbaClimbStr.includes('3') ? 3 : tbaClimbStr.includes('2') ? 2 : tbaClimbStr.includes('1') ? 1 : 0;
          const scoutLevel = parseClimbLevel(e.climb_level);

          if (Math.abs(tbaLevel - scoutLevel) >= 2) {
            climbMismatches.push({ kind: 'climb', matchNum, teamNumber: e.team_number, scoutLevel, tbaLevel });
          }
        });
      }
    }

    const alerts: DataAlert[] = [];

    if (secondReview.length > 0)
      alerts.push({ type: 'error', label: 'Flagged for Review', count: secondReview.length,
        details: secondReview.map(e => ({ kind: 'flagged' as const, matchNum: e.match_number, teamNumber: e.team_number })) });
    if (missingMatches.length > 0)
      alerts.push({ type: 'error', label: 'Unscounted Matches', count: missingMatches.length,
        details: missingMatches.map(m => ({ kind: 'match' as const, matchNum: m.match_number })) });
    if (fuelMismatches.length > 0)
      alerts.push({ type: 'error', label: 'Fuel Mismatch (adjusted vs scored)', count: fuelMismatches.length, details: fuelMismatches });
    if (climbMismatches.length > 0)
      alerts.push({ type: 'error', label: 'Climb Mismatch (vs TBA)', count: climbMismatches.length, details: climbMismatches });
    if (lowCoverageTeams.length > 0)
      alerts.push({ type: 'info', label: 'Low Scouting Coverage', count: lowCoverageTeams.length,
        details: lowCoverageTeams.map(t => ({ kind: 'team' as const, teamNumber: t })) });

    return alerts.length > 0 ? alerts : null;
  }, [scoutEntries, tbaData, pgTbaMatches, actionLookup]);

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
        // When action data exists, use it for everything; otherwise fall back to summary
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
        };
      });
      const scoutTotal = robots.reduce((sum, r) => sum + r.fuelEstimate, 0);
      const scoutAuto = robots.reduce((sum, r) => sum + r.autoFuel, 0);
      const scoutTeleop = robots.reduce((sum, r) => sum + r.teleopFuel, 0);
      // Shots = scoring attempts (total moved - passes)
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
      // Flag as mismatch if ADJUSTED total (after removing passes) is still way off from TBA scored
      const isMismatch = tbaTotal > 0 && Math.abs(adjustedDelta) > Math.max(tbaTotal * 0.5, 5);

      rows.push({ matchNum, alliance: alliance as 'red' | 'blue', scoutTotal, tbaTotal, delta, scoutAuto, scoutTeleop, tbaAuto, tbaTeleop, totalPasses, adjustedTotal, adjustedDelta, robots, isMismatch });
    }

    return rows;
  }, [scoutEntries, pgTbaMatches, actionLookup]);

  const displayedFuelRows = useMemo(() => {
    let rows = fuelMismatchOnly ? fuelComparison.filter(r => r.isMismatch) : fuelComparison;
    rows = [...rows].sort((a, b) => {
      const mult = fuelSortDir === 'asc' ? 1 : -1;
      if (fuelSortField === 'matchNum') return mult * (a.matchNum - b.matchNum || (a.alliance < b.alliance ? -1 : 1));
      return mult * (Math.abs(a.delta) - Math.abs(b.delta));
    });
    return rows;
  }, [fuelComparison, fuelMismatchOnly, fuelSortField, fuelSortDir]);

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

  // ── Trend Analysis ──
  const fuelTrends = useMemo(() => {
    if (!fuelComparison.length) return null;

    const withTba = fuelComparison.filter(r => r.tbaTotal > 0);
    if (!withTba.length) return null;

    const totalScout = withTba.reduce((s, r) => s + r.scoutTotal, 0);
    const totalTba = withTba.reduce((s, r) => s + r.tbaTotal, 0);
    const totalPasses = withTba.reduce((s, r) => s + r.totalPasses, 0);
    const totalAdjusted = withTba.reduce((s, r) => s + r.adjustedTotal, 0);

    const rawEfficiency = totalScout > 0 ? (totalTba / totalScout * 100) : 0;
    const adjEfficiency = totalAdjusted > 0 ? (totalTba / totalAdjusted * 100) : 0;
    const totalMisses = totalAdjusted - totalTba;

    // Auto vs teleop shifts
    const totalScoutAuto = withTba.reduce((s, r) => s + r.scoutAuto, 0);
    const totalTbaAuto = withTba.reduce((s, r) => s + r.tbaAuto, 0);
    const totalScoutTeleop = withTba.reduce((s, r) => s + r.scoutTeleop, 0);
    const totalTbaTeleop = withTba.reduce((s, r) => s + r.tbaTeleop, 0);

    // How many mismatches are "fixed" by removing passes
    const mismatchCount = withTba.filter(r => r.isMismatch).length;
    const adjMismatchCount = withTba.filter(r => r.tbaTotal > 0 && Math.abs(r.adjustedDelta) > Math.max(r.tbaTotal * 0.5, 5)).length;

    return {
      matchCount: withTba.length,
      totalScout, totalTba, totalPasses, totalAdjusted, totalMisses,
      rawEfficiency, adjEfficiency,
      totalScoutAuto, totalTbaAuto, totalScoutTeleop, totalTbaTeleop,
      mismatchCount, adjMismatchCount,
    };
  }, [fuelComparison]);

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

  // ── Empty State ──
  if (scoutEntries.length === 0) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
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

      {/* Section 2: Alerts */}
      {dataAlerts ? (
        <div className={`${card} !border-danger/30`}>
          <h2 className={cardHeader}>
            <AlertTriangle className="text-danger" size={18} />
            Alerts
            <span className="text-xs text-textMuted font-normal ml-1">
              {dataAlerts.reduce((sum, a) => sum + a.count, 0)} issues
            </span>
          </h2>
          <div className="space-y-1.5">
            {dataAlerts.map((alert, i) => (
              <details key={i} className="group">
                <summary className={`flex items-center justify-between cursor-pointer rounded-lg px-3 py-2 text-sm ${
                  alert.type === 'error' ? 'bg-danger/10 hover:bg-danger/15' :
                  alert.type === 'warning' ? 'bg-warning/10 hover:bg-warning/15' :
                  'bg-blueAlliance/10 hover:bg-blueAlliance/15'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      alert.type === 'error' ? 'bg-danger' : alert.type === 'warning' ? 'bg-warning' : 'bg-blueAlliance'
                    }`} />
                    <span className="font-medium">{alert.label}</span>
                    <ChevronDown size={12} className="transition-transform group-open:rotate-180 text-textMuted" />
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    alert.type === 'error' ? 'bg-danger/20 text-danger' :
                    alert.type === 'warning' ? 'bg-warning/20 text-warning' :
                    'bg-blueAlliance/20 text-blueAlliance'
                  }`}>{alert.count}</span>
                </summary>
                <div className="mt-1 px-3 py-2 text-xs bg-surfaceElevated rounded-lg">
                  {alert.details.map((item, j) => {
                    switch (item.kind) {
                      case 'fuel': {
                        const delta = item.scoutValue - item.tbaValue;
                        const sign = delta > 0 ? '+' : '';
                        return (
                          <div key={j} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-b-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-textPrimary">Q{item.matchNum}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                item.alliance === 'red' ? 'bg-redAlliance/20 text-redAlliance' : 'bg-blueAlliance/20 text-blueAlliance'
                              }`}>{item.alliance}</span>
                            </div>
                            <div className="flex items-center gap-3 text-textSecondary">
                              <span>Attempts: <span className="text-textPrimary font-semibold">{item.scoutValue}</span></span>
                              <span>Scored: <span className="text-textPrimary font-semibold">{item.tbaValue}</span></span>
                              <span className={`font-bold ${Math.abs(delta) > 10 ? 'text-danger' : 'text-warning'}`}>{sign}{delta}</span>
                            </div>
                          </div>
                        );
                      }
                      case 'climb':
                        return (
                          <div key={j} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-b-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-textPrimary">Q{item.matchNum}</span>
                              <span className="text-textSecondary">{item.teamNumber}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-warning/20 text-warning text-[10px] font-bold">Scout L{item.scoutLevel}</span>
                              <span className="text-textMuted">vs</span>
                              <span className="px-1.5 py-0.5 rounded bg-blueAlliance/20 text-blueAlliance text-[10px] font-bold">TBA L{item.tbaLevel}</span>
                            </div>
                          </div>
                        );
                      case 'flagged':
                        return (
                          <div key={j} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-b-0">
                            <span className="font-mono font-semibold text-textPrimary">Q{item.matchNum}</span>
                            <span className="text-textMuted">-</span>
                            <span className="text-danger font-semibold">{item.teamNumber}</span>
                          </div>
                        );
                      case 'match':
                        return (
                          <span key={j} className="inline-block mr-1.5 mb-1 mt-1 px-2 py-1 rounded-full bg-danger/15 text-danger text-[11px] font-semibold">
                            Q{item.matchNum}
                          </span>
                        );
                      case 'team':
                        return (
                          <span key={j} className="inline-block mr-1.5 mb-1 mt-1 px-2 py-1 rounded-full bg-blueAlliance/15 text-blueAlliance text-[11px] font-semibold">
                            {item.teamNumber}
                          </span>
                        );
                    }
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : (
        <div className={card}>
          <div className="flex items-center gap-3 text-success">
            <CheckCircle size={20} />
            <span className="font-semibold">All clear — no data quality issues detected</span>
          </div>
        </div>
      )}

      {/* Section 3: Fuel Comparison Table */}
      <div className={card}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className={`${cardHeader} mb-0`}>
            <Droplets className="text-warning" size={18} />
            Fuel: Moved vs Scored
            <span className="text-xs text-textMuted font-normal ml-1">Scouts track balls moved (not precise scores) — TBA tracks balls scored</span>
          </h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={fuelMismatchOnly}
                onChange={e => setFuelMismatchOnly(e.target.checked)}
                className="rounded border-border accent-danger"
              />
              <span className="text-textSecondary">Mismatches only</span>
              {fuelMismatchOnly && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger">
                  {fuelComparison.filter(r => r.isMismatch).length}
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
          <div className="overflow-x-auto -mx-6 mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-textMuted">
                  <th className="w-6"></th>
                  <th className="text-left py-2 px-3 font-medium">Match</th>
                  <th className="text-center py-2 px-3 font-medium">Alliance</th>
                  <th className="text-center py-2 px-3 font-medium">Moved</th>
                  <th className="text-center py-2 px-3 font-medium">Passes</th>
                  <th className="text-center py-2 px-3 font-medium">Attempts</th>
                  <th className="text-center py-2 px-3 font-medium">Scored</th>
                  <th className="text-center py-2 px-3 font-medium">Misses</th>
                  <th className="text-center py-2 px-3 font-medium">Eff %</th>
                </tr>
              </thead>
              <tbody>
                {displayedFuelRows.map((row, i) => {
                  const rowKey = `${row.matchNum}_${row.alliance}`;
                  const isExpanded = expandedFuelRows.has(rowKey);
                  return (
                    <>
                      <tr
                        key={rowKey}
                        onClick={() => toggleFuelExpand(rowKey)}
                        className={`border-b border-border/50 cursor-pointer ${
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
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            row.alliance === 'red' ? 'bg-redAlliance/20 text-redAlliance' : 'bg-blueAlliance/20 text-blueAlliance'
                          }`}>{row.alliance}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.scoutTotal}</td>
                        <td className="py-2.5 px-3 text-center text-textSecondary">{row.totalPasses > 0 ? row.totalPasses : '-'}</td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.adjustedTotal}</td>
                        <td className="py-2.5 px-3 text-center font-semibold">{row.tbaTotal}</td>
                        <td className={`py-2.5 px-3 text-center font-bold ${
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
                      </tr>
                      {isExpanded && (
                        <tr key={`${rowKey}_detail`} className="bg-surfaceElevated border-b border-border/50">
                          <td colSpan={9} className="px-4 py-3">
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

                              {/* Per-robot raw data */}
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border/50 text-textMuted">
                                    <th className="text-left py-1.5 px-2 font-medium">Team</th>
                                    <th className="text-center py-1.5 px-2 font-medium">Role</th>
                                    <th className="text-center py-1.5 px-2 font-medium">Total Moved</th>
                                    <th className="text-center py-1.5 px-2 font-medium">Shots</th>
                                    <th className="text-center py-1.5 px-2 font-medium">Passes</th>
                                    <th className="text-center py-1.5 px-2 font-medium">Source</th>
                                    <th className="text-center py-1.5 px-2 font-medium">Auto +</th>
                                    <th className="text-center py-1.5 px-2 font-medium">Teleop +</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.robots.map(r => {
                                    const autoBuckets = [r.autoPlus1 && `+1x${r.autoPlus1}`, r.autoPlus2 && `+2x${r.autoPlus2}`, r.autoPlus3 && `+3x${r.autoPlus3}`, r.autoPlus5 && `+5x${r.autoPlus5}`, r.autoPlus10 && `+10x${r.autoPlus10}`].filter(Boolean).join(' ');
                                    const teleBuckets = [r.teleopPlus1 && `+1x${r.teleopPlus1}`, r.teleopPlus2 && `+2x${r.teleopPlus2}`, r.teleopPlus3 && `+3x${r.teleopPlus3}`, r.teleopPlus5 && `+5x${r.teleopPlus5}`, r.teleopPlus10 && `+10x${r.teleopPlus10}`].filter(Boolean).join(' ');
                                    // Show action-based attribution when available
                                    const displayShots = r.hasActionData ? r.actionShots : (r.isDedicatedPasser ? 0 : r.fuelEstimate - r.passes);
                                    const displayPasses = r.hasActionData ? r.actionPasses : (r.isDedicatedPasser ? r.fuelEstimate : r.passes);
                                    return (
                                      <tr key={r.teamNumber} className={`border-b border-border/30 last:border-b-0 ${r.isDedicatedPasser ? 'bg-warning/5' : ''}`}>
                                        <td className="py-1.5 px-2">
                                          <Link to={`/teams/${r.teamNumber}`} className="font-semibold hover:underline">{r.teamNumber}</Link>
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                          {r.isDedicatedPasser ? (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning">PASSER</span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success">SCORER</span>
                                          )}
                                        </td>
                                        <td className="py-1.5 px-2 text-center font-bold">{r.fuelEstimate}</td>
                                        <td className="py-1.5 px-2 text-center font-bold text-success">{displayShots || '-'}</td>
                                        <td className="py-1.5 px-2 text-center font-bold text-warning">{displayPasses || '-'}</td>
                                        <td className="py-1.5 px-2 text-center">
                                          {r.hasActionData ? (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blueAlliance/20 text-blueAlliance">ACTIONS</span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-textMuted/20 text-textMuted">EST</span>
                                          )}
                                        </td>
                                        <td className="py-1.5 px-2 text-center text-textMuted font-mono text-[10px]">{autoBuckets || '-'}</td>
                                        <td className="py-1.5 px-2 text-center text-textMuted font-mono text-[10px]">{teleBuckets || '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
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
            {fuelMismatchOnly ? 'No fuel mismatches found' : 'No fuel comparison data available'}
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
          <div className="overflow-x-auto -mx-6 mt-4">
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
                      <Link to={`/teams/${row.teamNumber}`} className="font-semibold hover:underline">{row.teamNumber}</Link>
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
      {/* Section 5: Trend Analysis */}
      {fuelTrends && (
        <div className={card}>
          <h2 className={cardHeader}>
            <TrendingUp className="text-warning" size={18} />
            Scoring Efficiency Analysis
            <span className="text-xs text-textMuted font-normal ml-1">Balls moved vs scored across {fuelTrends.matchCount} match/alliance combos</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Conversion rates */}
            <div className="bg-surfaceElevated rounded-lg p-4 border border-border/50">
              <p className="text-xs text-textSecondary uppercase tracking-widest mb-2">Scoring Conversion</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-textSecondary">Moved → Scored</span>
                  <span className={`font-bold ${fuelTrends.rawEfficiency >= 60 ? 'text-success' : fuelTrends.rawEfficiency >= 30 ? 'text-warning' : 'text-danger'}`}>
                    {fuelTrends.rawEfficiency.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textSecondary">Attempts → Scored</span>
                  <span className={`font-bold ${fuelTrends.adjEfficiency >= 60 ? 'text-success' : fuelTrends.adjEfficiency >= 30 ? 'text-warning' : 'text-danger'}`}>
                    {fuelTrends.adjEfficiency.toFixed(1)}%
                  </span>
                </div>
                <hr className="border-border/30" />
                <div className="flex justify-between text-xs">
                  <span className="text-textMuted">Total misses (attempts - scored)</span>
                  <span className="font-bold text-warning">{fuelTrends.totalMisses}</span>
                </div>
              </div>
            </div>

            {/* Volume breakdown */}
            <div className="bg-surfaceElevated rounded-lg p-4 border border-border/50">
              <p className="text-xs text-textSecondary uppercase tracking-widest mb-2">Volume Breakdown</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-textSecondary">Balls moved (scout)</span>
                  <span className="font-bold text-textPrimary">{fuelTrends.totalScout}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textSecondary">Passes</span>
                  <span className="font-bold text-textPrimary">{fuelTrends.totalPasses}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textSecondary">Scoring attempts</span>
                  <span className="font-bold text-textPrimary">{fuelTrends.totalAdjusted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textSecondary">Balls scored (TBA)</span>
                  <span className="font-bold text-success">{fuelTrends.totalTba}</span>
                </div>
              </div>
            </div>

            {/* Auto vs Teleop */}
            <div className="bg-surfaceElevated rounded-lg p-4 border border-border/50">
              <p className="text-xs text-textSecondary uppercase tracking-widest mb-2">Auto vs Teleop Split</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-textSecondary">Auto (Scout / TBA)</span>
                  <span className="font-bold">
                    <span className="text-textPrimary">{fuelTrends.totalScoutAuto}</span>
                    <span className="text-textMuted"> / </span>
                    <span className="text-textPrimary">{fuelTrends.totalTbaAuto}</span>
                    <span className={`ml-2 text-xs ${fuelTrends.totalScoutAuto - fuelTrends.totalTbaAuto !== 0 ? 'text-warning' : 'text-success'}`}>
                      ({fuelTrends.totalScoutAuto - fuelTrends.totalTbaAuto > 0 ? '+' : ''}{fuelTrends.totalScoutAuto - fuelTrends.totalTbaAuto})
                    </span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textSecondary">Teleop (Scout / TBA)</span>
                  <span className="font-bold">
                    <span className="text-textPrimary">{fuelTrends.totalScoutTeleop}</span>
                    <span className="text-textMuted"> / </span>
                    <span className="text-textPrimary">{fuelTrends.totalTbaTeleop}</span>
                    <span className={`ml-2 text-xs ${fuelTrends.totalScoutTeleop - fuelTrends.totalTbaTeleop !== 0 ? 'text-warning' : 'text-success'}`}>
                      ({fuelTrends.totalScoutTeleop - fuelTrends.totalTbaTeleop > 0 ? '+' : ''}{fuelTrends.totalScoutTeleop - fuelTrends.totalTbaTeleop})
                    </span>
                  </span>
                </div>
                {fuelTrends.totalTbaAuto > 0 && fuelTrends.totalTbaTeleop > 0 && (
                  <>
                    <hr className="border-border/30" />
                    <div className="flex justify-between text-xs">
                      <span className="text-textMuted">Auto share (Scout vs TBA)</span>
                      <span className="text-textSecondary">
                        {((fuelTrends.totalScoutAuto / (fuelTrends.totalScoutAuto + fuelTrends.totalScoutTeleop)) * 100).toFixed(0)}% vs {((fuelTrends.totalTbaAuto / (fuelTrends.totalTbaAuto + fuelTrends.totalTbaTeleop)) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataQuality;
