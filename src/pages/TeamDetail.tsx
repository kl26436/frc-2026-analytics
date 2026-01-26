import { useParams, Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MatchScoutingEntry } from '../types/scouting';
import MatchVideos from '../components/MatchVideos';

function TeamDetail() {
  const { teamNumber } = useParams<{ teamNumber: string }>();
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const matchEntries = useAnalyticsStore(state => state.matchEntries);
  const pitEntries = useAnalyticsStore(state => state.pitEntries);

  const teamNum = parseInt(teamNumber || '0');
  const teamStats = teamStatistics.find(t => t.teamNumber === teamNum);
  const teamMatches = matchEntries
    .filter(m => m.teamNumber === teamNum)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  const pitData = pitEntries.find(p => p.teamNumber === teamNum);

  if (!teamStats) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Team Not Found</h2>
        <Link to="/teams" className="text-blueAlliance hover:underline">
          Back to Teams
        </Link>
      </div>
    );
  }

  // Calculate points for each match
  const calculateMatchPoints = (match: MatchScoutingEntry) => {
    const autoFuelPoints = match.autoFuelScored * 1;
    const autoClimbPoints = match.autoClimbSuccess ? 15 : 0;
    const autoPoints = autoFuelPoints + autoClimbPoints;

    const teleopPoints = match.teleopScoresDuringActive * 1;

    const climbPoints: Record<string, number> = {
      none: 0,
      level1: 10,
      level2: 20,
      level3: 30,
    };
    const endgameClimbPoints = climbPoints[match.climbLevel] || 0;
    const endgameFuelPoints = match.endgameFuelScored * 1;
    const endgamePoints = endgameClimbPoints + endgameFuelPoints;

    return {
      auto: autoPoints,
      teleop: teleopPoints,
      endgame: endgamePoints,
      total: autoPoints + teleopPoints + endgamePoints,
    };
  };

  const matchPointsData = teamMatches.map(m => ({
    match: m,
    points: calculateMatchPoints(m),
  }));

  // Calculate trend
  const getTrend = () => {
    if (matchPointsData.length < 3) return 'stable';
    const recent = matchPointsData.slice(-3).map(m => m.points.total);
    const earlier = matchPointsData.slice(0, 3).map(m => m.points.total);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    if (recentAvg > earlierAvg * 1.1) return 'up';
    if (recentAvg < earlierAvg * 0.9) return 'down';
    return 'stable';
  };

  const trend = getTrend();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/teams"
          className="p-2 bg-surface hover:bg-interactive rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold">{teamStats.teamNumber}</h1>
            {trend === 'up' && <TrendingUp className="text-success" size={32} />}
            {trend === 'down' && <TrendingDown className="text-danger" size={32} />}
            {trend === 'stable' && <Minus className="text-textMuted" size={32} />}
          </div>
          {teamStats.teamName && (
            <p className="text-xl text-textSecondary mt-1">{teamStats.teamName}</p>
          )}
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">Avg Total Points</p>
          <p className="text-3xl font-bold mt-1">{teamStats.avgTotalPoints.toFixed(1)}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">Matches Played</p>
          <p className="text-3xl font-bold mt-1">{teamStats.matchesPlayed}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">Auto Accuracy</p>
          <p className="text-3xl font-bold mt-1">{teamStats.autoAccuracy.toFixed(0)}%</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">L3 Climb Rate</p>
          <p className="text-3xl font-bold mt-1">{teamStats.level3ClimbRate.toFixed(0)}%</p>
        </div>
      </div>

      {/* Pit Scouting Data */}
      {pitData && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4">Pit Scouting Info</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-textSecondary text-sm">Drivetrain</p>
              <p className="font-semibold mt-1 capitalize">{pitData.drivetrainType}</p>
            </div>
            <div>
              <p className="text-textSecondary text-sm">Shooter Type</p>
              <p className="font-semibold mt-1">{pitData.shooterType}</p>
            </div>
            <div>
              <p className="text-textSecondary text-sm">Max Capacity</p>
              <p className="font-semibold mt-1">{pitData.maxFuelCapacity} FUEL</p>
            </div>
            <div>
              <p className="text-textSecondary text-sm">Climb Capability</p>
              <p className="font-semibold mt-1 capitalize">{pitData.climbCapability}</p>
            </div>
            <div>
              <p className="text-textSecondary text-sm">Max Range</p>
              <p className="font-semibold mt-1">{pitData.maxShootingRange} ft</p>
            </div>
            <div>
              <p className="text-textSecondary text-sm">Preferred Role</p>
              <p className="font-semibold mt-1 capitalize">{pitData.preferredRole}</p>
            </div>
            <div>
              <p className="text-textSecondary text-sm">Weight</p>
              <p className="font-semibold mt-1">{pitData.robotWeight} lbs</p>
            </div>
            <div>
              <p className="text-textSecondary text-sm">Driver Experience</p>
              <p className="font-semibold mt-1">{pitData.driverExperience}</p>
            </div>
          </div>
          {pitData.comments && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-textSecondary text-sm">Comments</p>
              <p className="mt-1">{pitData.comments}</p>
            </div>
          )}
        </div>
      )}

      {/* Match Videos from TBA */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <MatchVideos teamNumber={teamNum} />
      </div>

      {/* Match History */}
      <div className="bg-surface rounded-lg border border-border">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold">Match History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surfaceElevated border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-textSecondary text-sm font-semibold">
                  Match
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  Alliance
                </th>
                <th className="px-4 py-3 text-right text-textSecondary text-sm font-semibold">
                  Total Pts
                </th>
                <th className="px-4 py-3 text-right text-textSecondary text-sm font-semibold">
                  Auto
                </th>
                <th className="px-4 py-3 text-right text-textSecondary text-sm font-semibold">
                  Teleop
                </th>
                <th className="px-4 py-3 text-right text-textSecondary text-sm font-semibold">
                  Endgame
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  Auto Fuel
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  Teleop Fuel
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  Climb
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  Cycles
                </th>
                <th className="px-4 py-3 text-left text-textSecondary text-sm font-semibold">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {matchPointsData.map(({ match, points }) => (
                <tr key={match.id} className="hover:bg-interactive transition-colors">
                  <td className="px-4 py-4">
                    <span className="font-semibold">
                      {match.matchType === 'qualification' ? 'Q' : match.matchType === 'playoff' ? 'P' : 'Pr'}
                      {match.matchNumber}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        match.alliance === 'red'
                          ? 'bg-redAlliance/20 text-redAlliance'
                          : 'bg-blueAlliance/20 text-blueAlliance'
                      }`}
                    >
                      {match.alliance.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-bold">{points.total}</td>
                  <td className="px-4 py-4 text-right text-textSecondary">{points.auto}</td>
                  <td className="px-4 py-4 text-right text-textSecondary">{points.teleop}</td>
                  <td className="px-4 py-4 text-right text-textSecondary">{points.endgame}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-success">{match.autoFuelScored}</span>
                    <span className="text-textMuted">/</span>
                    <span className="text-danger">{match.autoFuelMissed}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-success">{match.teleopTotalScored}</span>
                    <span className="text-textMuted">/</span>
                    <span className="text-danger">{match.teleopTotalMissed}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {match.climbLevel === 'none' ? (
                      <span className="text-textMuted">-</span>
                    ) : (
                      <span className="font-semibold capitalize">
                        {match.climbLevel.replace('level', 'L')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">{match.cycleCount}</td>
                  <td className="px-4 py-4 text-sm text-textSecondary max-w-xs truncate">
                    {match.robotDied && <span className="text-danger mr-2">DIED</span>}
                    {match.robotTipped && <span className="text-warning mr-2">TIPPED</span>}
                    {match.cardReceived !== 'none' && (
                      <span className={match.cardReceived === 'yellow' ? 'text-warning mr-2' : 'text-danger mr-2'}>
                        {match.cardReceived.toUpperCase()} CARD
                      </span>
                    )}
                    {match.commentsOverall}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Performance Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Auto Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Auto Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg FUEL Scored</span>
              <span className="font-semibold">{teamStats.avgAutoFuelScored.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Accuracy</span>
              <span className="font-semibold">{teamStats.autoAccuracy.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Mobility Rate</span>
              <span className="font-semibold">{teamStats.autoMobilityRate.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Auto Climb Rate</span>
              <span className="font-semibold">{teamStats.autoClimbRate.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Teleop Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Teleop Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg FUEL Scored</span>
              <span className="font-semibold">{teamStats.avgTeleopFuelScored.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Accuracy</span>
              <span className="font-semibold">{teamStats.teleopAccuracy.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Cycles</span>
              <span className="font-semibold">{teamStats.avgCycleCount.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Active HUB Scoring</span>
              <span className="font-semibold">{teamStats.avgActiveHubScores.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Endgame Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Endgame Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Climb Attempt Rate</span>
              <span className="font-semibold">{teamStats.climbAttemptRate.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Level 1 Rate</span>
              <span className="font-semibold">{teamStats.level1ClimbRate.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Level 2 Rate</span>
              <span className="font-semibold">{teamStats.level2ClimbRate.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Level 3 Rate</span>
              <span className="font-semibold text-success">{teamStats.level3ClimbRate.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Climb Time</span>
              <span className="font-semibold">{teamStats.avgClimbTime.toFixed(1)}s</span>
            </div>
          </div>
        </div>

        {/* Reliability */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Reliability</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Robot Died</span>
              <span className={teamStats.diedRate > 10 ? 'text-danger font-semibold' : 'font-semibold'}>
                {teamStats.diedRate.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Robot Tipped</span>
              <span className={teamStats.tippedRate > 10 ? 'text-warning font-semibold' : 'font-semibold'}>
                {teamStats.tippedRate.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Mechanical Issues</span>
              <span className={teamStats.mechanicalIssuesRate > 15 ? 'text-danger font-semibold' : 'font-semibold'}>
                {teamStats.mechanicalIssuesRate.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Driver Skill (1-5)</span>
              <span className="font-semibold">{teamStats.avgDriverSkill.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamDetail;
