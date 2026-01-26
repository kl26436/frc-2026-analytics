import { useState, useEffect } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { X, AlertCircle, Play } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';
import type { TBAMatch } from '../types/tba';
import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';

function TeamComparison() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const selectedTeams = useAnalyticsStore(state => state.selectedTeams);
  const toggleTeamSelection = useAnalyticsStore(state => state.toggleTeamSelection);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const tbaApiKey = usePickListStore(state => state.tbaApiKey);

  const [selectedVideoTeam, setSelectedVideoTeam] = useState<number | null>(null);
  const [teamVideos, setTeamVideos] = useState<Record<number, TBAMatch[]>>({});

  const selectedTeamStats = teamStatistics.filter(t => selectedTeams.includes(t.teamNumber));

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
        <a
          href="/teams"
          className="px-6 py-3 bg-white text-background font-semibold rounded-lg hover:bg-textSecondary transition-colors"
        >
          Go to Teams
        </a>
      </div>
    );
  }

  const StatRow = ({ label, getValue, format = 'number', higherIsBetter = true }: {
    label: string;
    getValue: (team: TeamStatistics) => number;
    format?: 'number' | 'percentage' | 'time';
    higherIsBetter?: boolean;
  }) => {
    const values = selectedTeamStats.map(getValue);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);

    const formatValue = (value: number) => {
      switch (format) {
        case 'percentage':
          return `${value.toFixed(1)}%`;
        case 'time':
          return `${value.toFixed(1)}s`;
        default:
          return value.toFixed(1);
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
        <td className="px-4 py-3 font-medium text-textSecondary">{label}</td>
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
        <h1 className="text-2xl md:text-3xl font-bold">Team Comparison</h1>
        <p className="text-textSecondary text-sm md:text-base">
          Comparing {selectedTeamStats.length} team{selectedTeamStats.length !== 1 ? 's' : ''}
        </p>
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

      {/* Comparison Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <colgroup>
              <col style={{ width: '200px' }} />
              {selectedTeamStats.map(team => (
                <col key={team.teamNumber} />
              ))}
            </colgroup>

            {/* Overall Performance */}
            <thead className="bg-surfaceElevated">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold">Overall Performance</th>
                {selectedTeamStats.map(team => (
                  <th key={team.teamNumber} className="px-4 py-3"></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <StatRow label="Avg Total Points" getValue={t => t.avgTotalPoints} />
              <StatRow label="Avg Auto Points" getValue={t => t.avgAutoPoints} />
              <StatRow label="Avg Teleop Points" getValue={t => t.avgTeleopPoints} />
              <StatRow label="Avg Endgame Points" getValue={t => t.avgEndgamePoints} />
            </tbody>

            {/* Auto Performance */}
            <thead className="bg-surfaceElevated">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold">Auto Performance</th>
                {selectedTeamStats.map(team => (
                  <th key={team.teamNumber} className="px-4 py-3"></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <StatRow label="Avg FUEL Scored" getValue={t => t.avgAutoFuelScored} />
              <StatRow label="Auto Accuracy" getValue={t => t.autoAccuracy} format="percentage" />
              <StatRow label="Mobility Rate" getValue={t => t.autoMobilityRate} format="percentage" />
              <StatRow label="Auto Climb Rate" getValue={t => t.autoClimbRate} format="percentage" />
            </tbody>

            {/* Teleop Performance */}
            <thead className="bg-surfaceElevated">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold">Teleop Performance</th>
                {selectedTeamStats.map(team => (
                  <th key={team.teamNumber} className="px-4 py-3"></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <StatRow label="Avg FUEL Scored" getValue={t => t.avgTeleopFuelScored} />
              <StatRow label="Teleop Accuracy" getValue={t => t.teleopAccuracy} format="percentage" />
              <StatRow label="Avg Cycle Count" getValue={t => t.avgCycleCount} />
              <StatRow label="Active HUB Scores" getValue={t => t.avgActiveHubScores} />
              <StatRow label="Inactive HUB Scores" getValue={t => t.avgInactiveHubScores} />
            </tbody>

            {/* Endgame Performance */}
            <thead className="bg-surfaceElevated">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold">Endgame Performance</th>
                {selectedTeamStats.map(team => (
                  <th key={team.teamNumber} className="px-4 py-3"></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <StatRow label="Climb Attempt Rate" getValue={t => t.climbAttemptRate} format="percentage" />
              <StatRow label="Level 1 Rate" getValue={t => t.level1ClimbRate} format="percentage" />
              <StatRow label="Level 2 Rate" getValue={t => t.level2ClimbRate} format="percentage" />
              <StatRow label="Level 3 Rate" getValue={t => t.level3ClimbRate} format="percentage" />
              <StatRow label="Avg Climb Time" getValue={t => t.avgClimbTime} format="time" higherIsBetter={false} />
              <StatRow label="Endgame FUEL" getValue={t => t.avgEndgameFuelScored} />
            </tbody>

            {/* Defense */}
            <thead className="bg-surfaceElevated">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold">Defense</th>
                {selectedTeamStats.map(team => (
                  <th key={team.teamNumber} className="px-4 py-3"></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <StatRow label="Defense Played" getValue={t => t.defensePlayedRate} format="percentage" />
              <StatRow label="Defense Effect." getValue={t => t.avgDefenseEffectiveness} />
              <StatRow label="Was Defended" getValue={t => t.wasDefendedRate} format="percentage" higherIsBetter={false} />
              <StatRow label="Defense Evasion" getValue={t => t.avgDefenseEvasion} />
            </tbody>

            {/* Driver Skills */}
            <thead className="bg-surfaceElevated">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold">Driver Skills (1-5)</th>
                {selectedTeamStats.map(team => (
                  <th key={team.teamNumber} className="px-4 py-3"></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <StatRow label="Driver Skill" getValue={t => t.avgDriverSkill} />
              <StatRow label="Intake Speed" getValue={t => t.avgIntakeSpeed} />
              <StatRow label="Shooting Accuracy" getValue={t => t.avgShootingAccuracy} />
              <StatRow label="Shooting Speed" getValue={t => t.avgShootingSpeed} />
            </tbody>

            {/* Reliability */}
            <thead className="bg-surfaceElevated">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold">Reliability</th>
                {selectedTeamStats.map(team => (
                  <th key={team.teamNumber} className="px-4 py-3"></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <StatRow label="No Show Rate" getValue={t => t.noShowRate} format="percentage" higherIsBetter={false} />
              <StatRow label="Robot Died Rate" getValue={t => t.diedRate} format="percentage" higherIsBetter={false} />
              <StatRow label="Tipped Rate" getValue={t => t.tippedRate} format="percentage" higherIsBetter={false} />
              <StatRow label="Mech. Issues" getValue={t => t.mechanicalIssuesRate} format="percentage" higherIsBetter={false} />
              <StatRow label="Yellow Cards" getValue={t => t.yellowCardRate} format="percentage" higherIsBetter={false} />
              <StatRow label="Red Cards" getValue={t => t.redCardRate} format="percentage" higherIsBetter={false} />
            </tbody>
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
