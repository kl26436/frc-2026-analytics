import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { Trophy, Target, TrendingUp, Users } from 'lucide-react';

function Dashboard() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const matchEntries = useAnalyticsStore(state => state.matchEntries);
  const pitEntries = useAnalyticsStore(state => state.pitEntries);

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

  return (
    <div className="space-y-6">
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
