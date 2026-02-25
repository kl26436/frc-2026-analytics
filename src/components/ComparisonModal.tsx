import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUp, Sliders, Play } from 'lucide-react';
import type { TBAMatch } from '../types/tba';
import type { MetricCategory, MetricColumn } from '../types/metrics';
import { CATEGORY_LABELS } from '../types/metrics';
import { useMetricsStore } from '../store/useMetricsStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';

import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';
import { getMetricValue } from '../utils/metricAggregation';

// Fields where lower is better (for coloring)
const LOWER_IS_BETTER_FIELDS = [
  'lostConnectionRate', 'noRobotRate', 'climbNoneRate', 'climbFailedRate',
  'bulldozedFuelRate', 'poorAccuracyRate', 'autoDidNothingRate',
];

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
  const teamTrends = useAnalyticsStore(state => state.teamTrends);

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

  // Stat row for a single metric
  const MetricStatRow = ({ column }: { column: MetricColumn }) => {
    const higherIsBetter = !LOWER_IS_BETTER_FIELDS.includes(column.field);

    const getValue = (team: TeamLike): number =>
      getMetricValue(column, team as any, scoutEntries, teamFuelStats);

    const value1 = getValue(team1);
    const value2 = getValue(team2);
    const maxVal = Math.max(value1, value2);
    const minVal = Math.min(value1, value2);

    const formatValue = (value: number, matchesPlayed?: number) => {
      if (column.format === 'count') {
        return `${Math.round(value)}/${matchesPlayed ?? '?'}`;
      }
      switch (column.format) {
        case 'percentage': return `${value.toFixed(column.decimals)}%`;
        case 'time': return `${value.toFixed(column.decimals)}s`;
        default: return value.toFixed(column.decimals);
      }
    };

    const getColorClass = (value: number) => {
      if (maxVal === minVal) return 'text-textPrimary';
      const isBest = higherIsBetter ? value === maxVal : value === minVal;
      const isWorst = higherIsBetter ? value === minVal : value === maxVal;
      if (isBest) return 'text-success font-bold';
      if (isWorst) return 'text-danger';
      return 'text-textPrimary';
    };

    return (
      <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_100px_100px] gap-2 py-2 border-b border-border">
        <div className="text-sm text-textSecondary" title={column.description}>{column.label}</div>
        <div className={`text-sm text-center ${getColorClass(value1)}`}>{formatValue(value1, team1.matchesPlayed)}</div>
        <div className={`text-sm text-center ${getColorClass(value2)}`}>{formatValue(value2, team2.matchesPlayed)}</div>
      </div>
    );
  };

  // Recent Form helper — one row in the per-match comparison grid
  const RecentFormRow = ({ label, avg1, matches1, avg2, matches2, higherIsBetter, format, avgFormat }: {
    label: string;
    avg1: number;
    matches1: number[];
    avg2: number;
    matches2: number[];
    higherIsBetter: boolean;
    format: 'number' | 'climb';
    avgFormat?: 'percentage';
  }) => {
    const getAvgColor = (v1: number, v2: number) => {
      if (Math.abs(v1 - v2) < 0.01) return ['text-textPrimary', 'text-textPrimary'];
      const better = higherIsBetter ? v1 > v2 : v1 < v2;
      return better
        ? ['text-success font-bold', 'text-danger']
        : ['text-danger', 'text-success font-bold'];
    };
    const [color1, color2] = getAvgColor(avg1, avg2);
    const formatVal = (v: number) => format === 'climb' ? (v === 1 ? '\u2713' : '\u2717') : v.toFixed(0);
    const formatAvg = (v: number) => avgFormat === 'percentage' ? `${v.toFixed(0)}%` : v.toFixed(1);

    return (
      <div className="grid grid-cols-[60px_repeat(8,1fr)] gap-1 text-xs py-1.5 border-b border-border">
        <div className="text-textSecondary font-medium">{label}</div>
        <div className={`text-center ${color1}`}>{formatAvg(avg1)}</div>
        {matches1.map((v, i) => (
          <div key={`m1-${i}`} className="text-center text-textPrimary">{formatVal(v)}</div>
        ))}
        {Array.from({ length: 3 - matches1.length }).map((_, i) => (
          <div key={`m1p-${i}`} className="text-center text-textMuted">-</div>
        ))}
        <div className={`text-center ${color2}`}>{formatAvg(avg2)}</div>
        {matches2.map((v, i) => (
          <div key={`m2-${i}`} className="text-center text-textPrimary">{formatVal(v)}</div>
        ))}
        {Array.from({ length: 3 - matches2.length }).map((_, i) => (
          <div key={`m2p-${i}`} className="text-center text-textMuted">-</div>
        ))}
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

        {/* Team Headers */}
        <div className="flex-shrink-0 grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_100px_100px] gap-2 p-4 border-b border-border bg-surface">
          <div className="text-sm font-semibold text-textSecondary">Metric</div>
          {[team1, team2].map(team => {
            const vids = teamVideos[team.teamNumber] || [];
            return (
              <div key={team.teamNumber} className="text-center">
                <div className="text-lg font-bold">{team.teamNumber}</div>
                {team.teamName && (
                  <div className="text-xs text-textSecondary truncate">{team.teamName}</div>
                )}
                {vids.length > 0 && (
                  <button
                    onClick={() => setExpandedVideoTeam(
                      expandedVideoTeam === team.teamNumber ? null : team.teamNumber
                    )}
                    className="mt-1 flex items-center justify-center gap-1 text-xs text-danger hover:underline mx-auto"
                  >
                    <Play size={10} fill="currentColor" />
                    {vids.length} video{vids.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            );
          })}
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
          className="flex-1 overflow-y-auto p-4 min-h-0"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Recent Form Section */}
          {(() => {
            const trend1 = teamTrends.find(t => t.teamNumber === team1.teamNumber);
            const trend2 = teamTrends.find(t => t.teamNumber === team2.teamNumber);
            if (!trend1 || !trend2 || trend1.matchResults.length === 0 || trend2.matchResults.length === 0) return null;

            const last3_1 = trend1.matchResults.slice(-3).reverse();
            const last3_2 = trend2.matchResults.slice(-3).reverse();

            return (
              <div className="mb-4">
                <div className="bg-surfaceElevated px-3 py-2 font-bold text-sm">
                  Recent Form
                </div>

                {/* Team number header row */}
                <div className="grid grid-cols-[60px_repeat(8,1fr)] gap-1 text-xs py-2 border-b border-border">
                  <div></div>
                  <div className="col-span-4 text-center font-bold text-textPrimary">{team1.teamNumber}</div>
                  <div className="col-span-4 text-center font-bold text-textPrimary">{team2.teamNumber}</div>
                </div>

                {/* Column labels: Avg + match numbers */}
                <div className="grid grid-cols-[60px_repeat(8,1fr)] gap-1 text-xs text-textMuted py-1 border-b border-border">
                  <div></div>
                  <div className="text-center font-semibold text-textSecondary">Avg</div>
                  {last3_1.map(m => (
                    <div key={`h1-${m.matchNumber}`} className="text-center">{m.matchLabel}</div>
                  ))}
                  {Array.from({ length: 3 - last3_1.length }).map((_, i) => (
                    <div key={`h1p-${i}`}></div>
                  ))}
                  <div className="text-center font-semibold text-textSecondary">Avg</div>
                  {last3_2.map(m => (
                    <div key={`h2-${m.matchNumber}`} className="text-center">{m.matchLabel}</div>
                  ))}
                  {Array.from({ length: 3 - last3_2.length }).map((_, i) => (
                    <div key={`h2p-${i}`}></div>
                  ))}
                </div>

                {/* Data rows */}
                <RecentFormRow
                  label="Pts"
                  avg1={trend1.overallAvg.total}
                  matches1={last3_1.map(m => m.total)}
                  avg2={trend2.overallAvg.total}
                  matches2={last3_2.map(m => m.total)}
                  higherIsBetter={true}
                  format="number"
                />
                <RecentFormRow
                  label="L3 Climb"
                  avg1={trend1.overallAvg.l3ClimbRate}
                  matches1={last3_1.map(m => m.climbLevel === 3 ? 1 : 0)}
                  avg2={trend2.overallAvg.l3ClimbRate}
                  matches2={last3_2.map(m => m.climbLevel === 3 ? 1 : 0)}
                  higherIsBetter={true}
                  format="climb"
                  avgFormat="percentage"
                />
                <RecentFormRow
                  label="Auto"
                  avg1={trend1.overallAvg.auto}
                  matches1={last3_1.map(m => m.autoPoints)}
                  avg2={trend2.overallAvg.auto}
                  matches2={last3_2.map(m => m.autoPoints)}
                  higherIsBetter={true}
                  format="number"
                />
              </div>
            );
          })()}

          {(Object.keys(metricsByCategory) as MetricCategory[]).map(category => {
            const columns = metricsByCategory[category];
            if (!columns || columns.length === 0) return null;
            return (
              <div key={category}>
                <div className="bg-surfaceElevated px-3 py-2 font-bold text-sm mt-4 first:mt-0">
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
