import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { useMetricsStore } from '../store/useMetricsStore';
import { X, AlertCircle, Play, ArrowLeft, Sliders } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';
import type { TBAMatch } from '../types/tba';
import type { MetricColumn, MetricCategory } from '../types/metrics';
import { CATEGORY_LABELS } from '../types/metrics';
import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';

// Fields where lower is better (for coloring)
const LOWER_IS_BETTER_FIELDS = [
  'noShowRate', 'diedRate', 'tippedRate', 'mechanicalIssuesRate',
  'yellowCardRate', 'redCardRate', 'avgClimbTime', 'minClimbTime',
  'avgAutoFuelMissed', 'avgTeleopFuelMissed', 'wasDefendedRate'
];

function TeamComparison() {
  const navigate = useNavigate();
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const selectedTeams = useAnalyticsStore(state => state.selectedTeams);
  const toggleTeamSelection = useAnalyticsStore(state => state.toggleTeamSelection);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const tbaApiKey = usePickListStore(state => state.tbaApiKey);
  const getEnabledColumns = useMetricsStore(state => state.getEnabledColumns);

  const [selectedVideoTeam, setSelectedVideoTeam] = useState<number | null>(null);
  const [teamVideos, setTeamVideos] = useState<Record<number, TBAMatch[]>>({});

  const selectedTeamStats = teamStatistics.filter(t => selectedTeams.includes(t.teamNumber));

  // Get enabled metrics grouped by category
  const enabledColumns = getEnabledColumns();
  const metricsByCategory = useMemo(() => {
    const grouped: Record<MetricCategory, MetricColumn[]> = {
      overall: [],
      auto: [],
      teleop: [],
      endgame: [],
      defense: [],
      performance: [],
      reliability: [],
    };

    enabledColumns.forEach(col => {
      grouped[col.category].push(col);
    });

    return grouped;
  }, [enabledColumns]);

  // Navigate back to Teams page when all teams are deselected
  useEffect(() => {
    if (selectedTeamStats.length === 0) {
      navigate('/teams');
    }
  }, [selectedTeamStats.length, navigate]);

  // Fetch TBA matches for selected teams
  useEffect(() => {
    async function fetchAllTeamMatches() {
      const videos: Record<number, TBAMatch[]> = {};
      for (const team of selectedTeamStats) {
        try {
          const teamKey = teamNumberToKey(team.teamNumber);
          const matches = await getTeamEventMatches(teamKey, eventCode, tbaApiKey);
          const matchesWithVideos = matches.filter(m => m.videos && m.videos.length > 0);
          if (matchesWithVideos.length > 0) {
            videos[team.teamNumber] = matchesWithVideos;
          }
        } catch (error) {
          console.error(`Failed to load videos for team ${team.teamNumber}:`, error);
        }
      }
      setTeamVideos(videos);
    }
    if (selectedTeamStats.length > 0) {
      fetchAllTeamMatches();
    }
  }, [selectedTeamStats, eventCode, tbaApiKey]);

  if (selectedTeamStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle size={64} className="text-textMuted mb-4" />
        <h2 className="text-2xl font-bold mb-2">No Teams Selected</h2>
        <p className="text-textSecondary mb-6">
          Go to the Teams page and select teams to compare
        </p>
        <button
          onClick={() => navigate('/teams')}
          className="px-6 py-3 bg-white text-background font-semibold rounded-lg hover:bg-textSecondary transition-colors"
        >
          Go to Teams
        </button>
      </div>
    );
  }

  // Dynamic stat row based on metric column config
  const MetricStatRow = ({ column }: { column: MetricColumn }) => {
    const higherIsBetter = !LOWER_IS_BETTER_FIELDS.includes(column.field);

    const getValue = (team: TeamStatistics): number => {
      return (team as unknown as Record<string, number>)[column.field] || 0;
    };

    const values = selectedTeamStats.map(getValue);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);

    const formatValue = (value: number) => {
      switch (column.format) {
        case 'percentage':
          return `${value.toFixed(column.decimals)}%`;
        case 'time':
          return `${value.toFixed(column.decimals)}s`;
        default:
          return value.toFixed(column.decimals);
      }
    };

    const getColorClass = (value: number) => {
      if (maxValue === minValue) return 'text-textPrimary';

      const isBest = higherIsBetter
        ? value === maxValue
        : value === minValue;
      const isWorst = higherIsBetter
        ? value === minValue
        : value === maxValue;

      if (isBest) return 'text-success font-bold';
      if (isWorst) return 'text-danger';
      return 'text-textPrimary';
    };

    return (
      <tr className="border-b border-border hover:bg-interactive">
        <td className="px-4 py-3 font-medium text-textSecondary" title={column.description}>
          {column.label}
        </td>
        {selectedTeamStats.map(team => {
          const value = getValue(team);
          return (
            <td
              key={team.teamNumber}
              className={`px-4 py-3 text-center ${getColorClass(value)}`}
            >
              {formatValue(value)}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/teams')}
            className="p-2 text-textSecondary hover:text-textPrimary hover:bg-interactive rounded-lg transition-colors"
            title="Back to Teams"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold">Team Comparison</h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-textSecondary text-sm md:text-base">
            Comparing {selectedTeamStats.length} team{selectedTeamStats.length !== 1 ? 's' : ''} • {enabledColumns.length} metrics
          </p>
          <Link
            to="/settings/metrics"
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg hover:bg-interactive transition-colors"
          >
            <Sliders size={16} />
            Customize
          </Link>
        </div>
      </div>

      {/* Team Headers */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `200px repeat(${selectedTeamStats.length}, 1fr)` }}>
        <div></div>
        {selectedTeamStats.map(team => {
          const videos = teamVideos[team.teamNumber] || [];
          return (
            <div
              key={team.teamNumber}
              className="bg-surface rounded-lg border border-border p-4 relative"
            >
              <button
                onClick={() => toggleTeamSelection(team.teamNumber)}
                className="absolute top-2 right-2 text-textMuted hover:text-danger transition-colors"
              >
                <X size={20} />
              </button>
              <p className="text-2xl font-bold">{team.teamNumber}</p>
              {team.teamName && (
                <p className="text-sm text-textSecondary mt-1">{team.teamName}</p>
              )}
              <p className="text-xs text-textMuted mt-2">
                {team.matchesPlayed} matches
              </p>
              {videos.length > 0 && (
                <button
                  onClick={() => setSelectedVideoTeam(team.teamNumber)}
                  className="mt-3 flex items-center gap-1 text-xs text-danger hover:underline"
                >
                  <Play size={12} fill="currentColor" />
                  {videos.length} video{videos.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparison Table - Using Customizable Metrics */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <colgroup>
              <col style={{ width: '200px' }} />
              {selectedTeamStats.map(team => (
                <col key={team.teamNumber} />
              ))}
            </colgroup>

            {/* Dynamically render each category that has enabled metrics */}
            {(Object.keys(metricsByCategory) as MetricCategory[]).map(category => {
              const columns = metricsByCategory[category];
              if (columns.length === 0) return null;

              return (
                <React.Fragment key={category}>
                  <thead className="bg-surfaceElevated">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        {CATEGORY_LABELS[category]}
                      </th>
                      {selectedTeamStats.map(team => (
                        <th key={team.teamNumber} className="px-4 py-3"></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map(column => (
                      <MetricStatRow key={column.id} column={column} />
                    ))}
                  </tbody>
                </React.Fragment>
              );
            })}

            {/* Show message if no metrics enabled */}
            {enabledColumns.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={selectedTeamStats.length + 1} className="px-4 py-8 text-center text-textSecondary">
                    No metrics enabled. <Link to="/settings/metrics" className="text-success hover:underline">Click here</Link> to customize which metrics to display.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-textSecondary justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-success rounded"></div>
          <span>Best Performance</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-danger rounded"></div>
          <span>Worst Performance</span>
        </div>
      </div>

      {/* Video Modal */}
      {selectedVideoTeam && teamVideos[selectedVideoTeam] && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedVideoTeam(null)}
        >
          <div
            className="bg-surface rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">Team {selectedVideoTeam} - Match Videos</h3>
              <button
                onClick={() => setSelectedVideoTeam(null)}
                className="p-1 hover:bg-interactive rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {teamVideos[selectedVideoTeam]
                .sort((a, b) => {
                  const levelOrder = { f: 5, sf: 4, qf: 3, ef: 2, qm: 1 };
                  if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
                    return levelOrder[b.comp_level] - levelOrder[a.comp_level];
                  }
                  return b.match_number - a.match_number;
                })
                .map((match) => {
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
                      className="flex items-center gap-3 p-3 bg-surfaceElevated hover:bg-interactive rounded-lg transition-colors border border-border"
                    >
                      <Play size={20} className="text-danger" fill="currentColor" />
                      <div className="flex-1">
                        <p className="font-semibold">{matchLabel}</p>
                        <p className="text-xs text-textSecondary">
                          {match.alliances.red.score} - {match.alliances.blue.score}
                        </p>
                      </div>
                      <span className="text-xs text-textMuted">Watch on YouTube</span>
                    </a>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamComparison;
