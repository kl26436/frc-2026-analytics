import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUp, Sliders, Play } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';
import type { TBAMatch } from '../types/tba';
import type { MetricCategory, MetricColumn } from '../types/metrics';
import { CATEGORY_LABELS } from '../types/metrics';
import { useMetricsStore } from '../store/useMetricsStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';

// Fields where lower is better (for coloring)
const LOWER_IS_BETTER_FIELDS = [
  'noShowRate', 'diedRate', 'tippedRate', 'mechanicalIssuesRate',
  'yellowCardRate', 'redCardRate', 'avgClimbTime', 'minClimbTime',
  'avgAutoFuelMissed', 'avgTeleopFuelMissed', 'wasDefendedRate'
];

interface ComparisonModalProps {
  team1: TeamStatistics;
  team2: TeamStatistics;
  onPickTeam?: (teamNumber: number) => void;
  onClose: () => void;
}

function ComparisonModal({ team1, team2, onPickTeam, onClose }: ComparisonModalProps) {
  const getEnabledColumns = useMetricsStore(state => state.getEnabledColumns);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const tbaApiKey = usePickListStore(state => state.tbaApiKey);

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
    const grouped: Record<MetricCategory, MetricColumn[]> = {
      overall: [], auto: [], teleop: [], endgame: [],
      defense: [], performance: [], reliability: [],
    };
    enabledColumns.forEach(col => grouped[col.category].push(col));
    return grouped;
  }, [enabledColumns]);

  // Stat row for a single metric
  const MetricStatRow = ({ column }: { column: MetricColumn }) => {
    const higherIsBetter = !LOWER_IS_BETTER_FIELDS.includes(column.field);

    const getValue = (team: TeamStatistics): number =>
      (team as unknown as Record<string, number>)[column.field] || 0;

    const value1 = getValue(team1);
    const value2 = getValue(team2);
    const maxVal = Math.max(value1, value2);
    const minVal = Math.min(value1, value2);

    const formatValue = (value: number) => {
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
        <div className={`text-sm text-center ${getColorClass(value1)}`}>{formatValue(value1)}</div>
        <div className={`text-sm text-center ${getColorClass(value2)}`}>{formatValue(value2)}</div>
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
          {(Object.keys(metricsByCategory) as MetricCategory[]).map(category => {
            const columns = metricsByCategory[category];
            if (columns.length === 0) return null;
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
