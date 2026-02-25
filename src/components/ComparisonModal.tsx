import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUp, Sliders, Play } from 'lucide-react';
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
  'bulldozedFuelRate', 'poorAccuracyRate', 'autoDidNothingRate',
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

interface TeamLike {
  teamNumber: number;
  teamName?: string;
  matchesPlayed: number;
}

interface ComparisonModalProps {
  team1: TeamLike;
  team2: TeamLike;
  onPickTeam?: (teamNumber: number) => void;
  onClose: () => void;
}

function ComparisonModal({ team1, team2, onPickTeam, onClose }: ComparisonModalProps) {
  const getEnabledColumns = useMetricsStore(state => state.getEnabledColumns);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const scoutEntries = useAnalyticsStore(state => state.scoutEntries);
  const tbaApiKey = useAnalyticsStore(state => state.tbaApiKey);
  const teamFuelStats = useAnalyticsStore(state => state.teamFuelStats);
  const matchFuelAttribution = useAnalyticsStore(state => state.matchFuelAttribution);

  const [teamVideos, setTeamVideos] = useState<Record<number, TBAMatch[]>>({});
  const [expandedVideoTeam, setExpandedVideoTeam] = useState<number | null>(null);

  // ESC to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Fetch videos for both teams
  useEffect(() => {
    if (!eventCode || !tbaApiKey) return;

    async function fetchVideos() {
      const videos: Record<number, TBAMatch[]> = {};
      for (const team of [team1, team2]) {
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
  }, [team1, team2, eventCode, tbaApiKey]);

  // Last 3 scout entries per team (most recent first)
  const last3Entries = useMemo(() => {
    const result: Record<number, ScoutEntry[]> = {};
    for (const team of [team1, team2]) {
      result[team.teamNumber] = scoutEntries
        .filter(e => e.team_number === team.teamNumber)
        .sort((a, b) => b.match_number - a.match_number)
        .slice(0, 3);
    }
    return result;
  }, [scoutEntries, team1.teamNumber, team2.teamNumber]);

  // Last 3 fuel attribution rows per team (most recent first)
  const last3FuelRows = useMemo(() => {
    const result: Record<number, RobotMatchFuel[]> = {};
    for (const team of [team1, team2]) {
      result[team.teamNumber] = matchFuelAttribution
        .filter(r => r.teamNumber === team.teamNumber)
        .sort((a, b) => b.matchNumber - a.matchNumber)
        .slice(0, 3);
    }
    return result;
  }, [matchFuelAttribution, team1.teamNumber, team2.teamNumber]);

  // Match labels for column headers (e.g. "Q15", "Q11", "Q6")
  const matchLabels = useMemo(() => {
    const result: Record<number, string[]> = {};
    for (const team of [team1, team2]) {
      const entries = last3Entries[team.teamNumber] || [];
      result[team.teamNumber] = entries.map(e => `Q${e.match_number}`);
    }
    return result;
  }, [last3Entries, team1.teamNumber, team2.teamNumber]);

  // Get per-match values for a metric + team
  function getMatchValues(column: MetricColumn, teamNumber: number): number[] | null {
    // Rate/percentage/count metrics don't have meaningful per-match values
    if (column.format === 'percentage' || column.format === 'count') return null;

    // Fuel attribution metric
    if (column.fuelField) {
      const extractor = FUEL_EXTRACTORS[column.fuelField];
      const rows = last3FuelRows[teamNumber] || [];
      if (!extractor || rows.length === 0) return null;
      return rows.map(extractor);
    }

    // Scout-based metric
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

  // Check if ANY metric has per-match data (to decide whether to show match columns)
  const hasMatchData = (last3Entries[team1.teamNumber]?.length ?? 0) > 0 ||
    (last3Entries[team2.teamNumber]?.length ?? 0) > 0;

  // Stat row for a single metric — now with per-match actuals
  const MetricStatRow = ({ column }: { column: MetricColumn }) => {
    const higherIsBetter = !LOWER_IS_BETTER_FIELDS.includes(column.field);

    const getValue = (team: TeamLike): number =>
      getMetricValue(column, team as any, scoutEntries, teamFuelStats);

    const value1 = getValue(team1);
    const value2 = getValue(team2);
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

    const matchVals1 = hasMatchData ? getMatchValues(column, team1.teamNumber) : null;
    const matchVals2 = hasMatchData ? getMatchValues(column, team2.teamNumber) : null;
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
          {formatMetricValue(value1, column.format, column.decimals, team1.matchesPlayed)}
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
          {formatMetricValue(value2, column.format, column.decimals, team2.matchesPlayed)}
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

  const videos1 = teamVideos[team1.teamNumber] || [];
  const videos2 = teamVideos[team2.teamNumber] || [];

  const sortedVideos = (matches: TBAMatch[]) =>
    [...matches].sort((a, b) => {
      const levelOrder: Record<string, number> = { f: 5, sf: 4, qf: 3, ef: 2, qm: 1 };
      if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
        return levelOrder[b.comp_level] - levelOrder[a.comp_level];
      }
      return b.match_number - a.match_number;
    });

  const labels1 = matchLabels[team1.teamNumber] || [];
  const labels2 = matchLabels[team2.teamNumber] || [];

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-[900px] max-h-[90vh] relative flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-surfaceElevated p-4 border-b border-border flex justify-between items-center rounded-t-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Team Comparison</h2>
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
            className="p-2 hover:bg-interactive rounded transition-colors"
            title="Close (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Team Headers + Match Labels */}
        <div className="flex-shrink-0 bg-surface border-b border-border">
          {/* Team numbers row */}
          <div className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_60px_50px_50px_50px_60px_50px_50px_50px] gap-0 px-4 pt-3 pb-1">
            <div className="text-sm font-semibold text-textSecondary">Metric</div>
            <div className="text-center col-span-1 sm:col-span-4">
              <div className="text-lg font-bold">{team1.teamNumber}</div>
              {team1.teamName && <div className="text-[10px] text-textSecondary truncate">{team1.teamName}</div>}
              {videos1.length > 0 && (
                <button
                  onClick={() => setExpandedVideoTeam(expandedVideoTeam === team1.teamNumber ? null : team1.teamNumber)}
                  className="flex items-center justify-center gap-1 text-[10px] text-danger hover:underline mx-auto"
                >
                  <Play size={8} fill="currentColor" />
                  {videos1.length} video{videos1.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
            <div className="text-center border-l-2 border-border col-span-1 sm:col-span-4">
              <div className="text-lg font-bold">{team2.teamNumber}</div>
              {team2.teamName && <div className="text-[10px] text-textSecondary truncate">{team2.teamName}</div>}
              {videos2.length > 0 && (
                <button
                  onClick={() => setExpandedVideoTeam(expandedVideoTeam === team2.teamNumber ? null : team2.teamNumber)}
                  className="flex items-center justify-center gap-1 text-[10px] text-danger hover:underline mx-auto"
                >
                  <Play size={8} fill="currentColor" />
                  {videos2.length} video{videos2.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>

          {/* Column labels row (Avg + match numbers) */}
          {hasMatchData && (
            <div className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_60px_50px_50px_50px_60px_50px_50px_50px] gap-0 px-4 pb-2 text-[10px] text-textMuted">
              <div></div>
              <div className="text-center font-semibold text-textSecondary">Avg</div>
              {labels1.map((l, i) => (
                <div key={`h1-${i}`} className="text-center hidden sm:block">{l}</div>
              ))}
              {Array.from({ length: 3 - labels1.length }).map((_, i) => (
                <div key={`h1p-${i}`} className="hidden sm:block" />
              ))}
              <div className="text-center font-semibold text-textSecondary border-l-2 border-border">Avg</div>
              {labels2.map((l, i) => (
                <div key={`h2-${i}`} className="text-center hidden sm:block">{l}</div>
              ))}
              {Array.from({ length: 3 - labels2.length }).map((_, i) => (
                <div key={`h2p-${i}`} className="hidden sm:block" />
              ))}
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
          {(videos1.length > 0 || videos2.length > 0) && (
            <div className="flex items-center gap-1.5">
              <Play size={10} className="text-danger" fill="currentColor" />
              <span>Videos available</span>
            </div>
          )}
        </div>

        {/* Pick List ranking footer */}
        {onPickTeam && (
          <div className="flex-shrink-0 bg-surfaceElevated p-4 border-t border-border rounded-b-lg">
            <p className="text-center text-sm text-textSecondary mb-3">Which team should rank higher?</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => onPickTeam(team1.teamNumber)}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors min-h-[48px] text-sm sm:text-base"
              >
                <ArrowUp size={18} />
                {team1.teamNumber}
              </button>
              <button
                onClick={() => onPickTeam(team2.teamNumber)}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors min-h-[48px] text-sm sm:text-base"
              >
                <ArrowUp size={18} />
                {team2.teamNumber}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ComparisonModal;
