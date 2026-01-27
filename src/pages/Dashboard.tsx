import { useEffect, useState, useMemo } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { Trophy, Target, TrendingUp, Users, Calendar, RefreshCw, ChevronDown, ChevronUp, Swords } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import { computeMatchup } from '../utils/predictions';

const OUR_TEAM = 148;
const MATCHES_TO_SHOW = 3; // Show last 3 completed + next 3 upcoming

function Dashboard() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const matchEntries = useAnalyticsStore(state => state.matchEntries);
  const pitEntries = useAnalyticsStore(state => state.pitEntries);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const tbaLoading = useAnalyticsStore(state => state.tbaLoading);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);

  // Fetch TBA data on mount if not already loaded
  useEffect(() => {
    if (!tbaData) {
      fetchTBAData();
    }
  }, [tbaData, fetchTBAData]);

  // Get Team 148's matches
  const team148Matches = tbaData?.matches
    ?.filter(match =>
      match.alliances.red.team_keys.includes(`frc${OUR_TEAM}`) ||
      match.alliances.blue.team_keys.includes(`frc${OUR_TEAM}`)
    )
    .sort((a, b) => {
      const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
      if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
        return levelOrder[a.comp_level] - levelOrder[b.comp_level];
      }
      return a.match_number - b.match_number;
    }) || [];

  const completedMatches = team148Matches.filter(m => m.alliances.red.score >= 0);
  const upcomingMatches = team148Matches.filter(m => m.alliances.red.score < 0);

  // Calculate Team 148's record
  const team148Record = completedMatches.reduce(
    (acc, match) => {
      const isRed = match.alliances.red.team_keys.includes(`frc${OUR_TEAM}`);
      const ourScore = isRed ? match.alliances.red.score : match.alliances.blue.score;
      const theirScore = isRed ? match.alliances.blue.score : match.alliances.red.score;
      if (ourScore > theirScore) acc.wins++;
      else if (ourScore < theirScore) acc.losses++;
      else acc.ties++;
      return acc;
    },
    { wins: 0, losses: 0, ties: 0 }
  );

  // Get Team 148's ranking
  const team148Ranking = tbaData?.rankings?.rankings.find(
    r => r.team_key === `frc${OUR_TEAM}`
  );

  // Get next match for Team 148
  const nextMatch = upcomingMatches[0];

  // Calculate some overview statistics
  const totalMatches = matchEntries.length;
  const totalTeams = teamStatistics.length;
  const avgPointsAllTeams = teamStatistics.length > 0
    ? teamStatistics.reduce((sum, t) => sum + t.avgTotalPoints, 0) / teamStatistics.length
    : 0;

  // Find top teams
  const topScorers = [...teamStatistics]
    .sort((a, b) => b.avgTotalPoints - a.avgTotalPoints)
    .slice(0, 5);

  const topClimbers = [...teamStatistics]
    .sort((a, b) => b.level3ClimbRate - a.level3ClimbRate)
    .slice(0, 5);

  const topAuto = [...teamStatistics]
    .sort((a, b) => b.avgAutoPoints - a.avgAutoPoints)
    .slice(0, 5);

  const [showAllMatches, setShowAllMatches] = useState(false);

  // Match predictions cache
  const matchPredictions = useMemo(() => {
    if (!teamStatistics.length || !team148Matches.length) return new Map();
    const map = new Map<string, ReturnType<typeof computeMatchup>>();
    for (const match of team148Matches) {
      const redNums = match.alliances.red.team_keys.map(teamKeyToNumber);
      const blueNums = match.alliances.blue.team_keys.map(teamKeyToNumber);
      map.set(match.key, computeMatchup(redNums, blueNums, teamStatistics));
    }
    return map;
  }, [team148Matches, teamStatistics]);

  // Format match label
  const getMatchLabel = (match: typeof team148Matches[0]) => {
    const prefixes = { qm: 'Q', ef: 'E', qf: 'QF', sf: 'SF', f: 'F' };
    return `${prefixes[match.comp_level]}${match.match_number}`;
  };

  // Get matches to display (last 3 completed + next 3 upcoming, or all if expanded)
  const recentCompleted = completedMatches.slice(-MATCHES_TO_SHOW);
  const nextUpcoming = upcomingMatches.slice(0, MATCHES_TO_SHOW);
  const displayMatches = showAllMatches
    ? team148Matches
    : [...recentCompleted, ...nextUpcoming];
  const hasMoreMatches = team148Matches.length > displayMatches.length;

  // Match row component
  const MatchRow = ({ match }: { match: typeof team148Matches[0] }) => {
    const isRed = match.alliances.red.team_keys.includes(`frc${OUR_TEAM}`);
    const isCompleted = match.alliances.red.score >= 0;
    const ourScore = isRed ? match.alliances.red.score : match.alliances.blue.score;
    const theirScore = isRed ? match.alliances.blue.score : match.alliances.red.score;
    const won = ourScore > theirScore;
    const lost = ourScore < theirScore;

    const prediction = matchPredictions.get(match.key);
    const ourRP = prediction ? (isRed ? prediction.redRP : prediction.blueRP) : null;
    const ourWinProb = ourRP?.winProbability ?? 0;

    return (
      <tr
        className={`border-b border-border/50 hover:bg-surfaceElevated ${
          !isCompleted ? 'bg-surfaceElevated/50' : ''
        }`}
      >
        <td className="py-2 px-2 font-bold">{getMatchLabel(match)}</td>
        <td className={`py-2 px-2 text-center ${isRed ? 'font-bold' : ''}`}>
          {match.alliances.red.team_keys.map(k => {
            const num = teamKeyToNumber(k);
            return (
              <span
                key={k}
                className={num === OUR_TEAM ? 'text-warning font-bold' : 'text-redAlliance'}
              >
                {num}
              </span>
            );
          }).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ', ', curr], [] as React.ReactNode[])}
        </td>
        <td className="py-2 px-2 text-center font-mono">
          {isCompleted ? (
            <span>
              <span className={match.alliances.red.score > match.alliances.blue.score ? 'text-success font-bold' : ''}>
                {match.alliances.red.score}
              </span>
              {' - '}
              <span className={match.alliances.blue.score > match.alliances.red.score ? 'text-success font-bold' : ''}>
                {match.alliances.blue.score}
              </span>
            </span>
          ) : (
            <span className="text-textMuted">--</span>
          )}
        </td>
        <td className={`py-2 px-2 text-center ${!isRed ? 'font-bold' : ''}`}>
          {match.alliances.blue.team_keys.map(k => {
            const num = teamKeyToNumber(k);
            return (
              <span
                key={k}
                className={num === OUR_TEAM ? 'text-warning font-bold' : 'text-blueAlliance'}
              >
                {num}
              </span>
            );
          }).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ', ', curr], [] as React.ReactNode[])}
        </td>
        <td className="py-2 px-2 text-center">
          {isCompleted ? (
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              won ? 'bg-success/20 text-success' :
              lost ? 'bg-danger/20 text-danger' :
              'bg-textMuted/20 text-textMuted'
            }`}>
              {won ? 'W' : lost ? 'L' : 'T'}
            </span>
          ) : (
            <span className="text-textMuted text-xs">Upcoming</span>
          )}
        </td>
        {/* Prediction columns */}
        <td className="py-2 px-2 text-center font-mono text-xs">
          {prediction ? (
            <span>
              <span className="text-redAlliance">{prediction.red.totalScore.toFixed(0)}</span>
              <span className="text-textMuted">-</span>
              <span className="text-blueAlliance">{prediction.blue.totalScore.toFixed(0)}</span>
            </span>
          ) : <span className="text-textMuted">--</span>}
        </td>
        <td className="py-2 px-2 text-center text-xs">
          {ourRP ? (
            <span className={`font-medium ${ourWinProb >= 0.6 ? 'text-success' : ourWinProb <= 0.4 ? 'text-danger' : 'text-warning'}`}>
              {(ourWinProb * 100).toFixed(0)}%
            </span>
          ) : <span className="text-textMuted">--</span>}
        </td>
        <td className="py-2 px-2 text-center text-xs">
          {ourRP ? (
            <span className="text-warning font-medium">{ourRP.expectedTotalRP.toFixed(1)}</span>
          ) : <span className="text-textMuted">--</span>}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Team 148 Status Card */}
      {tbaData && (
        <div className="bg-gradient-to-r from-warning/20 to-warning/5 p-6 rounded-lg border border-warning/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold text-warning">{OUR_TEAM}</div>
              <div>
                <h2 className="text-xl font-bold">Robowranglers</h2>
                <p className="text-textSecondary">
                  {tbaData.event?.name || 'Event Data Loading...'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 md:gap-6">
              {/* Ranking */}
              <div className="text-center">
                <p className="text-xs text-textSecondary uppercase tracking-wide">Rank</p>
                <p className="text-3xl font-bold">
                  {team148Ranking ? `#${team148Ranking.rank}` : '--'}
                </p>
                {team148Ranking && (
                  <p className="text-xs text-textSecondary">
                    of {tbaData.rankings?.rankings.length}
                  </p>
                )}
              </div>

              {/* Record */}
              <div className="text-center">
                <p className="text-xs text-textSecondary uppercase tracking-wide">Record</p>
                <p className="text-3xl font-bold">
                  <span className="text-success">{team148Record.wins}</span>
                  <span className="text-textMuted">-</span>
                  <span className="text-danger">{team148Record.losses}</span>
                  {team148Record.ties > 0 && (
                    <>
                      <span className="text-textMuted">-</span>
                      <span className="text-textSecondary">{team148Record.ties}</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-textSecondary">
                  {completedMatches.length} played
                </p>
              </div>

              {/* Next Match */}
              <div className="text-center">
                <p className="text-xs text-textSecondary uppercase tracking-wide">Next Match</p>
                {nextMatch ? (
                  <>
                    <p className="text-3xl font-bold">{getMatchLabel(nextMatch)}</p>
                    <p className="text-xs text-textSecondary">
                      vs {nextMatch.alliances.red.team_keys.includes(`frc${OUR_TEAM}`)
                        ? nextMatch.alliances.blue.team_keys.map(k => teamKeyToNumber(k)).join(', ')
                        : nextMatch.alliances.red.team_keys.map(k => teamKeyToNumber(k)).join(', ')
                      }
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-textMuted">--</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team 148 Matches Section */}
      {tbaData && team148Matches.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="text-warning" size={20} />
              Team {OUR_TEAM} Matches
            </h2>
            <button
              onClick={() => fetchTBAData()}
              disabled={tbaLoading}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-surfaceElevated hover:bg-interactive rounded transition-colors"
            >
              <RefreshCw size={14} className={tbaLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2">Match</th>
                  <th className="text-center py-2 px-2 text-redAlliance">Red Alliance</th>
                  <th className="text-center py-2 px-2">Score</th>
                  <th className="text-center py-2 px-2 text-blueAlliance">Blue Alliance</th>
                  <th className="text-center py-2 px-2">Result</th>
                  <th className="text-center py-2 px-2 text-textSecondary">
                    <span className="flex items-center justify-center gap-1"><Swords size={12} />Pred.</span>
                  </th>
                  <th className="text-center py-2 px-2 text-textSecondary">Win%</th>
                  <th className="text-center py-2 px-2 text-textSecondary">xRP</th>
                </tr>
              </thead>
              <tbody>
                {displayMatches.map(match => (
                  <MatchRow key={match.key} match={match} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Expand/Collapse button */}
          {(hasMoreMatches || showAllMatches) && (
            <button
              onClick={() => setShowAllMatches(!showAllMatches)}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 text-sm text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated rounded transition-colors"
            >
              {showAllMatches ? (
                <>
                  <ChevronUp size={16} />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown size={16} />
                  Show All {team148Matches.length} Matches ({completedMatches.length - recentCompleted.length} more completed)
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-textSecondary text-sm">Total Teams</p>
              <p className="text-3xl font-bold mt-1">{totalTeams}</p>
            </div>
            <Users className="text-textMuted" size={32} />
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-textSecondary text-sm">Total Matches</p>
              <p className="text-3xl font-bold mt-1">{totalMatches}</p>
            </div>
            <Target className="text-textMuted" size={32} />
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-textSecondary text-sm">Avg Points/Match</p>
              <p className="text-3xl font-bold mt-1">{avgPointsAllTeams.toFixed(1)}</p>
            </div>
            <TrendingUp className="text-textMuted" size={32} />
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-textSecondary text-sm">Pit Reports</p>
              <p className="text-3xl font-bold mt-1">{pitEntries.length}</p>
            </div>
            <Trophy className="text-textMuted" size={32} />
          </div>
        </div>
      </div>

      {/* Top Teams Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Scorers */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Trophy className="text-warning" size={20} />
            Top Scorers
          </h2>
          <div className="space-y-3">
            {topScorers.map((team, index) => (
              <div key={team.teamNumber} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-textMuted font-mono">#{index + 1}</span>
                  <div>
                    <p className="font-semibold">{team.teamNumber}</p>
                    {team.teamName && (
                      <p className="text-sm text-textSecondary">{team.teamName}</p>
                    )}
                  </div>
                </div>
                <span className="font-bold text-success">
                  {team.avgTotalPoints.toFixed(1)} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Climbers */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="text-blueAlliance" size={20} />
            Top Climbers (L3)
          </h2>
          <div className="space-y-3">
            {topClimbers.map((team, index) => (
              <div key={team.teamNumber} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-textMuted font-mono">#{index + 1}</span>
                  <div>
                    <p className="font-semibold">{team.teamNumber}</p>
                    {team.teamName && (
                      <p className="text-sm text-textSecondary">{team.teamName}</p>
                    )}
                  </div>
                </div>
                <span className="font-bold text-blueAlliance">
                  {team.level3ClimbRate.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Auto */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Target className="text-redAlliance" size={20} />
            Top Auto
          </h2>
          <div className="space-y-3">
            {topAuto.map((team, index) => (
              <div key={team.teamNumber} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-textMuted font-mono">#{index + 1}</span>
                  <div>
                    <p className="font-semibold">{team.teamNumber}</p>
                    {team.teamName && (
                      <p className="text-sm text-textSecondary">{team.teamName}</p>
                    )}
                  </div>
                </div>
                <span className="font-bold text-redAlliance">
                  {team.avgAutoPoints.toFixed(1)} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">Event Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-textSecondary text-sm">Avg Auto Accuracy</p>
            <p className="text-2xl font-bold mt-1">
              {teamStatistics.length > 0
                ? (
                    teamStatistics.reduce((sum, t) => sum + t.autoAccuracy, 0) /
                    teamStatistics.length
                  ).toFixed(1)
                : 0}
              %
            </p>
          </div>
          <div>
            <p className="text-textSecondary text-sm">Avg Teleop Accuracy</p>
            <p className="text-2xl font-bold mt-1">
              {teamStatistics.length > 0
                ? (
                    teamStatistics.reduce((sum, t) => sum + t.teleopAccuracy, 0) /
                    teamStatistics.length
                  ).toFixed(1)
                : 0}
              %
            </p>
          </div>
          <div>
            <p className="text-textSecondary text-sm">Climb Attempt Rate</p>
            <p className="text-2xl font-bold mt-1">
              {teamStatistics.length > 0
                ? (
                    teamStatistics.reduce((sum, t) => sum + t.climbAttemptRate, 0) /
                    teamStatistics.length
                  ).toFixed(1)
                : 0}
              %
            </p>
          </div>
          <div>
            <p className="text-textSecondary text-sm">Avg Cycles/Match</p>
            <p className="text-2xl font-bold mt-1">
              {teamStatistics.length > 0
                ? (
                    teamStatistics.reduce((sum, t) => sum + t.avgCycleCount, 0) /
                    teamStatistics.length
                  ).toFixed(1)
                : 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
