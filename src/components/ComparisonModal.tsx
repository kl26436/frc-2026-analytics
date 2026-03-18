import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUp, Sliders, Play, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { TBAMatch } from '../types/tba';
import type { ScoutEntry } from '../types/scouting';
import { estimateMatchPoints, estimateMatchFuel } from '../types/scouting';
import type { MetricCategory, MetricColumn } from '../types/metrics';
import { CATEGORY_LABELS } from '../types/metrics';
import type { RobotMatchFuel } from '../utils/fuelAttribution';
import { useMetricsStore } from '../store/useMetricsStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';

import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';
import { getMetricValue } from '../utils/metricAggregation';
import { formatMetricValue } from '../utils/formatting';

// Fields where lower is better (for coloring)
const LOWER_IS_BETTER_FIELDS = [
  'lostConnectionRate', 'noRobotRate', 'climbNoneRate', 'climbFailedRate',
  'poorAccuracyRate', 'autoDidNothingRate',
];

// Map pre-computed TeamStatistics field → per-entry extractor
const SCOUT_EXTRACTORS: Record<string, (e: ScoutEntry) => number> = {
  avgTotalPoints: (e) => estimateMatchPoints(e).total,
  maxTotalPoints: (e) => estimateMatchPoints(e).total,
  totalTotalPoints: (e) => estimateMatchPoints(e).total,
  avgAutoPoints: (e) => estimateMatchPoints(e).autoPoints,
  avgTeleopPoints: (e) => estimateMatchPoints(e).teleopPoints,
  avgEndgamePoints: (e) => estimateMatchPoints(e).endgamePoints,
  avgTotalFuelEstimate: (e) => estimateMatchFuel(e).total,
  maxTotalFuelEstimate: (e) => estimateMatchFuel(e).total,
  totalTotalFuelEstimate: (e) => estimateMatchFuel(e).total,
  avgAutoFuelEstimate: (e) => estimateMatchFuel(e).auto,
  avgTeleopFuelEstimate: (e) => estimateMatchFuel(e).teleop,
  avgAutoFuelScore: (e) => e.auton_FUEL_SCORE,
  avgTeleopFuelScore: (e) => e.teleop_FUEL_SCORE,
  avgTotalPass: (e) => (e.auton_FUEL_PASS || 0) + (e.teleop_FUEL_PASS || 0),
};

// Map TeamFuelStats field → per-match RobotMatchFuel field
const FUEL_EXTRACTORS: Record<string, (r: RobotMatchFuel) => number> = {
  avgMoved: (r) => r.totalMoved,
  avgPasses: (r) => r.passes,
  avgShots: (r) => r.shots,
  avgShotsScored: (r) => r.shotsScored,
  avgAutoScored: (r) => r.autoScored,
  avgTeleopScored: (r) => r.teleopScored,
  scoringAccuracy: (r) => r.scoringAccuracy,
};

export interface TeamLike {
  teamNumber: number;
  teamName?: string;
  matchesPlayed: number;
}

interface ComparisonModalProps {
  teams: TeamLike[];  // 2-4 teams
  onPickTeam?: (teamNumber: number) => void;
  onClose: () => void;
}

function ComparisonModal({ teams, onPickTeam, onClose }: ComparisonModalProps) {
  const getEnabledColumns = useMetricsStore(state => state.getEnabledColumns);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const scoutEntries = useAnalyticsStore(state => state.scoutEntries);
  const tbaApiKey = useAnalyticsStore(state => state.tbaApiKey);
  const teamFuelStats = useAnalyticsStore(state => state.teamFuelStats);
  const matchFuelAttribution = useAnalyticsStore(state => state.matchFuelAttribution);
  const teamTrends = useAnalyticsStore(state => state.teamTrends);

  const [teamVideos, setTeamVideos] = useState<Record<number, TBAMatch[]>>({});
  const [expandedVideoTeam, setExpandedVideoTeam] = useState<number | null>(null);

  const teamCount = teams.length;
  const isTwoTeam = teamCount === 2;

  // ESC to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Fetch videos for all teams
  const teamNumbers = teams.map(t => t.teamNumber);
  useEffect(() => {
    if (!eventCode || !tbaApiKey) return;

    async function fetchVideos() {
      const videos: Record<number, TBAMatch[]> = {};
      for (const team of teams) {
        try {
          const teamKey = teamNumberToKey(team.teamNumber);
          const matches = await getTeamEventMatches(teamKey, eventCode, tbaApiKey);
          const withVideos = matches.filter(m => m.videos && m.videos.length > 0);
          if (withVideos.length > 0) {
            videos[team.teamNumber] = withVideos;
          }
        } catch {
          // silently skip
        }
      }
      setTeamVideos(videos);
    }
    fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamNumbers.join(','), eventCode, tbaApiKey]);

  // Last 3 scout entries per team (most recent first) — only for 2-team mode
  const last3Entries = useMemo(() => {
    if (!isTwoTeam) return {};
    const result: Record<number, ScoutEntry[]> = {};
    for (const team of teams) {
      result[team.teamNumber] = scoutEntries
        .filter(e => e.team_number === team.teamNumber)
        .sort((a, b) => b.match_number - a.match_number)
        .slice(0, 3);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoutEntries, teamNumbers.join(','), isTwoTeam]);

  // Last 3 fuel attribution rows per team — only for 2-team mode
  const last3FuelRows = useMemo(() => {
    if (!isTwoTeam) return {};
    const result: Record<number, RobotMatchFuel[]> = {};
    for (const team of teams) {
      result[team.teamNumber] = matchFuelAttribution
        .filter(r => r.teamNumber === team.teamNumber)
        .sort((a, b) => b.matchNumber - a.matchNumber)
        .slice(0, 3);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchFuelAttribution, teamNumbers.join(','), isTwoTeam]);

  // Match labels for column headers (e.g. "Q15", "Q11", "Q6")
  const matchLabels = useMemo(() => {
    if (!isTwoTeam) return {};
    const result: Record<number, string[]> = {};
    for (const team of teams) {
      const entries = last3Entries[team.teamNumber] || [];
      result[team.teamNumber] = entries.map(e => `Q${e.match_number}`);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last3Entries, teamNumbers.join(','), isTwoTeam]);

  // Get per-match values for a metric + team (2-team mode only)
  function getMatchValues(column: MetricColumn, teamNumber: number): number[] | null {
    if (!isTwoTeam) return null;
    if (column.format === 'percentage' || column.format === 'count') return null;

    if (column.fuelField) {
      const extractor = FUEL_EXTRACTORS[column.fuelField];
      const rows = last3FuelRows[teamNumber] || [];
      if (!extractor || rows.length === 0) return null;
      return rows.map(extractor);
    }

    const extractor = SCOUT_EXTRACTORS[column.field];
    const entries = last3Entries[teamNumber] || [];
    if (!extractor || entries.length === 0) return null;
    return entries.map(extractor);
  }

  // Group enabled metrics by category
  const enabledColumns = getEnabledColumns();
  const metricsByCategory = useMemo(() => {
    const grouped: Partial<Record<MetricCategory, MetricColumn[]>> = {};
    enabledColumns.forEach(col => {
      if (!grouped[col.category]) grouped[col.category] = [];
      grouped[col.category]!.push(col);
    });
    return grouped;
  }, [enabledColumns]);

  // Check if ANY metric has per-match data (2-team mode only)
  const hasMatchData = isTwoTeam && teams.some(t => (last3Entries[t.teamNumber]?.length ?? 0) > 0);

  // ── N-team averages-only stat row (3-4 teams) ──
  const MultiTeamStatRow = ({ column }: { column: MetricColumn }) => {
    const higherIsBetter = !LOWER_IS_BETTER_FIELDS.includes(column.field);
    const values = teams.map(t => getMetricValue(column, t as any, scoutEntries, teamFuelStats));
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);

    const getColor = (value: number) => {
      if (maxVal === minVal) return 'text-textPrimary';
      const isBest = higherIsBetter ? value === maxVal : value === minVal;
      const isWorst = higherIsBetter ? value === minVal : value === maxVal;
      if (isBest) return 'text-success font-bold';
      if (isWorst) return 'text-danger';
      return 'text-textPrimary';
    };

    return (
      <div className="flex items-center py-1.5 border-b border-border text-xs">
        <div className="flex-1 text-textSecondary truncate pr-1 min-w-[120px]" title={column.description}>{column.label}</div>
        {teams.map((team, idx) => (
          <div
            key={team.teamNumber}
            className={`w-[70px] text-center flex-shrink-0 ${getColor(values[idx])} ${idx > 0 ? 'border-l border-border' : ''}`}
          >
            {formatMetricValue(values[idx], column.format, column.decimals, team.matchesPlayed)}
          </div>
        ))}
      </div>
    );
  };

  // ── 2-team stat row with per-match detail ──
  const TwoTeamStatRow = ({ column }: { column: MetricColumn }) => {
    const higherIsBetter = !LOWER_IS_BETTER_FIELDS.includes(column.field);
    const [t1, t2] = teams;

    const getValue = (team: TeamLike): number =>
      getMetricValue(column, team as any, scoutEntries, teamFuelStats);

    const value1 = getValue(t1);
    const value2 = getValue(t2);
    const maxVal = Math.max(value1, value2);
    const minVal = Math.min(value1, value2);

    const getAvgColor = (value: number) => {
      if (maxVal === minVal) return 'text-textPrimary';
      const isBest = higherIsBetter ? value === maxVal : value === minVal;
      const isWorst = higherIsBetter ? value === minVal : value === maxVal;
      if (isBest) return 'text-success font-bold';
      if (isWorst) return 'text-danger';
      return 'text-textPrimary';
    };

    const matchVals1 = hasMatchData ? getMatchValues(column, t1.teamNumber) : null;
    const matchVals2 = hasMatchData ? getMatchValues(column, t2.teamNumber) : null;
    const showMatchCols = matchVals1 !== null || matchVals2 !== null;
    const isFuelAccuracy = column.fuelField === 'scoringAccuracy';

    const formatMatch = (v: number) => {
      if (isFuelAccuracy) return `${(v * 100).toFixed(0)}%`;
      return v.toFixed(column.decimals);
    };

    return (
      <div className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_60px_50px_50px_50px_60px_50px_50px_50px] gap-0 py-1.5 border-b border-border text-xs">
        <div className="text-textSecondary truncate pr-1" title={column.description}>{column.label}</div>

        {/* Team 1 avg */}
        <div className={`text-center ${getAvgColor(value1)}`}>
          {formatMetricValue(value1, column.format, column.decimals, t1.matchesPlayed)}
        </div>

        {/* Team 1 match values (hidden on mobile) */}
        {showMatchCols ? (
          <>
            {[0, 1, 2].map(i => (
              <div key={`t1-m${i}`} className="text-center text-textPrimary hidden sm:block">
                {matchVals1 && matchVals1[i] !== undefined ? formatMatch(matchVals1[i]) : '-'}
              </div>
            ))}
          </>
        ) : (
          <>{[0, 1, 2].map(i => <div key={`t1-m${i}`} className="hidden sm:block" />)}</>
        )}

        {/* Team 2 avg — with left border as divider */}
        <div className={`text-center border-l-2 border-border ${getAvgColor(value2)}`}>
          {formatMetricValue(value2, column.format, column.decimals, t2.matchesPlayed)}
        </div>

        {/* Team 2 match values (hidden on mobile) */}
        {showMatchCols ? (
          <>
            {[0, 1, 2].map(i => (
              <div key={`t2-m${i}`} className="text-center text-textPrimary hidden sm:block">
                {matchVals2 && matchVals2[i] !== undefined ? formatMatch(matchVals2[i]) : '-'}
              </div>
            ))}
          </>
        ) : (
          <>{[0, 1, 2].map(i => <div key={`t2-m${i}`} className="hidden sm:block" />)}</>
        )}
      </div>
    );
  };

  const MetricStatRow = isTwoTeam ? TwoTeamStatRow : MultiTeamStatRow;

  const sortedVideos = (matches: TBAMatch[]) =>
    [...matches].sort((a, b) => {
      const levelOrder: Record<string, number> = { f: 5, sf: 4, qf: 3, ef: 2, qm: 1 };
      if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
        return levelOrder[b.comp_level] - levelOrder[a.comp_level];
      }
      return b.match_number - a.match_number;
    });

  const hasAnyVideos = teams.some(t => (teamVideos[t.teamNumber]?.length ?? 0) > 0);

  // Modal width scales with team count
  const maxWidth = teamCount <= 2 ? 'max-w-[900px]' : teamCount === 3 ? 'max-w-[700px]' : 'max-w-[800px]';

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-surface rounded-lg w-full ${maxWidth} max-h-[90vh] relative flex flex-col`}
        onClick={e => e.stopPropagation()}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-surfaceElevated px-4 py-2 border-b border-border flex justify-between items-center rounded-t-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">Comparison</h2>
            <Link
              to="/metrics"
              className="flex items-center gap-1 px-2 py-1 text-xs bg-surface border border-border rounded hover:bg-interactive transition-colors text-textSecondary"
              title="Customize metrics"
            >
              <Sliders size={12} />
              Customize
            </Link>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-interactive rounded transition-colors"
            title="Close (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Team Headers */}
        <div className="flex-shrink-0 bg-surface border-b border-border">
          {isTwoTeam ? (
            <>
              {/* 2-team layout with match column headers */}
              <div className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_60px_50px_50px_50px_60px_50px_50px_50px] gap-0 px-4 pt-2 pb-1">
                <div className="text-sm font-semibold text-textSecondary">Metric</div>
                {teams.map((team, idx) => {
                  const videos = teamVideos[team.teamNumber] || [];
                  return (
                    <div key={team.teamNumber} className={`text-center col-span-1 sm:col-span-4 ${idx > 0 ? 'border-l-2 border-border' : ''}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-base font-bold">{team.teamNumber}</span>
                        {videos.length > 0 && (
                          <button
                            onClick={() => setExpandedVideoTeam(expandedVideoTeam === team.teamNumber ? null : team.teamNumber)}
                            className="flex items-center gap-0.5 text-[10px] text-danger hover:underline"
                          >
                            <Play size={8} fill="currentColor" />
                            {videos.length}
                          </button>
                        )}
                      </div>
                      {team.teamName && <div className="text-[10px] text-textSecondary truncate">{team.teamName}</div>}
                    </div>
                  );
                })}
              </div>

              {/* Column labels row (Avg + match numbers) */}
              {hasMatchData && (
                <div className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_60px_50px_50px_50px_60px_50px_50px_50px] gap-0 px-4 pb-1 text-[10px] text-textMuted">
                  <div></div>
                  {teams.map((team, idx) => {
                    const labels = matchLabels[team.teamNumber] || [];
                    return (
                      <React.Fragment key={team.teamNumber}>
                        <div className={`text-center font-semibold text-textSecondary ${idx > 0 ? 'border-l-2 border-border' : ''}`}>Avg</div>
                        {labels.map((l, i) => (
                          <div key={`h${idx}-${i}`} className="text-center hidden sm:block">{l}</div>
                        ))}
                        {Array.from({ length: 3 - labels.length }).map((_, i) => (
                          <div key={`h${idx}p-${i}`} className="hidden sm:block" />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* 3-4 team layout: simple header row */
            <div className="flex items-end px-4 pt-2 pb-1">
              <div className="flex-1 text-sm font-semibold text-textSecondary min-w-[120px]">Metric</div>
              {teams.map((team, idx) => {
                const videos = teamVideos[team.teamNumber] || [];
                return (
                  <div key={team.teamNumber} className={`w-[70px] text-center flex-shrink-0 ${idx > 0 ? 'border-l border-border' : ''}`}>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-sm font-bold">{team.teamNumber}</span>
                      {videos.length > 0 && (
                        <button
                          onClick={() => setExpandedVideoTeam(expandedVideoTeam === team.teamNumber ? null : team.teamNumber)}
                          className="flex items-center gap-0.5 text-[9px] text-danger hover:underline"
                        >
                          <Play size={7} fill="currentColor" />
                          {videos.length}
                        </button>
                      )}
                    </div>
                    {team.teamName && <div className="text-[9px] text-textSecondary truncate">{team.teamName}</div>}
                    <div className="text-[9px] text-textMuted">{team.matchesPlayed}m</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Video Expansion */}
        {expandedVideoTeam && teamVideos[expandedVideoTeam] && (
          <div className="flex-shrink-0 border-b border-border bg-surfaceElevated p-3 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Team {expandedVideoTeam} Videos</span>
              <button
                onClick={() => setExpandedVideoTeam(null)}
                className="p-1 hover:bg-interactive rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1.5">
              {sortedVideos(teamVideos[expandedVideoTeam]).map(match => {
                const videoUrl = getMatchVideoUrl(match);
                if (!videoUrl) return null;
                const matchLabel = match.comp_level === 'qm'
                  ? `Qual ${match.match_number}`
                  : `${match.comp_level.toUpperCase()} ${match.set_number}-${match.match_number}`;
                return (
                  <a
                    key={match.key}
                    href={videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-interactive rounded text-sm transition-colors border border-border"
                  >
                    <Play size={12} className="text-danger flex-shrink-0" fill="currentColor" />
                    <span className="font-medium">{matchLabel}</span>
                    <span className="text-xs text-textMuted">
                      {match.alliances.red.score} - {match.alliances.blue.score}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Metrics */}
        <div
          className="flex-1 overflow-y-auto px-4 py-2 min-h-0"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {(Object.keys(metricsByCategory) as MetricCategory[]).map(category => {
            const columns = metricsByCategory[category];
            if (!columns || columns.length === 0) return null;
            return (
              <div key={category}>
                <div className="bg-surfaceElevated px-3 py-1.5 font-bold text-xs mt-3 first:mt-0">
                  {CATEGORY_LABELS[category]}
                </div>
                {columns.map(col => (
                  <MetricStatRow key={col.id} column={col} />
                ))}
              </div>
            );
          })}

          {enabledColumns.length === 0 && (
            <div className="text-center py-8 text-textSecondary">
              No metrics enabled.{' '}
              <Link to="/metrics" className="text-success hover:underline">
                Click here
              </Link>{' '}
              to customize which metrics to display.
            </div>
          )}

          {/* Recent Form / Trend Section */}
          {(() => {
            const trends = teams.map(t => teamTrends.find(tr => tr.teamNumber === t.teamNumber));
            if (trends.every(t => !t || t.matchResults.length < 2)) return null;
            return (
              <div>
                <div className="bg-surfaceElevated px-3 py-1.5 font-bold text-xs mt-3">
                  Recent Form
                </div>
                {/* Overall vs Last 3 — Total Points */}
                <div className={`grid ${isTwoTeam ? 'grid-cols-[1fr_1fr_1fr]' : `grid-cols-[1fr_repeat(${teamCount},1fr)]`} text-xs border-b border-border`}>
                  <div className="px-3 py-2 text-textSecondary">Total Pts</div>
                  {trends.map((trend, i) => (
                    <div key={teams[i].teamNumber} className="px-2 py-2 text-center">
                      {trend ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-textSecondary">{trend.overallAvg.total.toFixed(0)}</span>
                          <span className="text-textMuted">→</span>
                          <span className="font-semibold">{trend.last3Avg.total.toFixed(0)}</span>
                          {trend.trend === 'improving' && <TrendingUp size={12} className="text-success" />}
                          {trend.trend === 'declining' && <TrendingDown size={12} className="text-danger" />}
                          {trend.trend === 'stable' && <Minus size={12} className="text-textMuted" />}
                          <span className={`text-[10px] font-semibold ${
                            trend.delta > 0 ? 'text-success' : trend.delta < 0 ? 'text-danger' : 'text-textMuted'
                          }`}>
                            {trend.delta > 0 ? '+' : ''}{trend.delta.toFixed(0)}%
                          </span>
                        </div>
                      ) : <span className="text-textMuted">—</span>}
                    </div>
                  ))}
                </div>
                {/* Overall vs Last 3 — Auto Points */}
                <div className={`grid ${isTwoTeam ? 'grid-cols-[1fr_1fr_1fr]' : `grid-cols-[1fr_repeat(${teamCount},1fr)]`} text-xs border-b border-border`}>
                  <div className="px-3 py-2 text-textSecondary">Auto Pts</div>
                  {trends.map((trend, i) => (
                    <div key={teams[i].teamNumber} className="px-2 py-2 text-center">
                      {trend ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-textSecondary">{trend.overallAvg.auto.toFixed(0)}</span>
                          <span className="text-textMuted">→</span>
                          <span className="font-semibold">{trend.last3Avg.auto.toFixed(0)}</span>
                        </div>
                      ) : <span className="text-textMuted">—</span>}
                    </div>
                  ))}
                </div>
                {/* Overall vs Last 3 — Endgame Points */}
                <div className={`grid ${isTwoTeam ? 'grid-cols-[1fr_1fr_1fr]' : `grid-cols-[1fr_repeat(${teamCount},1fr)]`} text-xs border-b border-border`}>
                  <div className="px-3 py-2 text-textSecondary">Endgame Pts</div>
                  {trends.map((trend, i) => (
                    <div key={teams[i].teamNumber} className="px-2 py-2 text-center">
                      {trend ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-textSecondary">{trend.overallAvg.endgame.toFixed(1)}</span>
                          <span className="text-textMuted">→</span>
                          <span className="font-semibold">{trend.last3Avg.endgame.toFixed(1)}</span>
                        </div>
                      ) : <span className="text-textMuted">—</span>}
                    </div>
                  ))}
                </div>
                {/* Last 3 match-by-match results */}
                {isTwoTeam && (
                  <div className={`grid grid-cols-[1fr_1fr_1fr] text-xs border-b border-border`}>
                    <div className="px-3 py-2 text-textSecondary">Last 3</div>
                    {trends.map((trend, i) => (
                      <div key={teams[i].teamNumber} className="px-2 py-2 text-center">
                        {trend && trend.matchResults.length > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            {trend.matchResults.slice(-3).map((m, mi) => (
                              <span key={mi} className="px-1.5 py-0.5 bg-surface rounded text-[10px] font-mono border border-border">
                                {m.matchLabel}: {m.total.toFixed(0)}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-textMuted">—</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Legend */}
        <div className="flex-shrink-0 flex items-center gap-6 text-xs text-textSecondary justify-center py-2 border-t border-border">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-success rounded" />
            <span>Better</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-danger rounded" />
            <span>Worse</span>
          </div>
          {hasAnyVideos && (
            <div className="flex items-center gap-1.5">
              <Play size={10} className="text-danger" fill="currentColor" />
              <span>Videos available</span>
            </div>
          )}
        </div>

        {/* Pick List ranking footer (only for 2-team mode) */}
        {onPickTeam && isTwoTeam && (
          <div className="flex-shrink-0 bg-surfaceElevated px-4 py-2 border-t border-border rounded-b-lg">
            <div className="flex items-center gap-2 justify-center">
              <span className="text-xs text-textSecondary whitespace-nowrap">Rank higher:</span>
              {teams.map(team => (
                <button
                  key={team.teamNumber}
                  onClick={() => onPickTeam(team.teamNumber)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors text-sm"
                >
                  <ArrowUp size={16} />
                  {team.teamNumber}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ComparisonModal;
