import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Play, X } from 'lucide-react';
import { estimateMatchFuel, estimateMatchPoints, parseClimbLevel } from '../types/scoutingReal';
import type { RealScoutEntry } from '../types/scoutingReal';
import type { TBAMatch } from '../types/tba';
import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';
import MatchDetailModal from '../components/MatchDetailModal';

function TeamDetail() {
  const { teamNumber } = useParams<{ teamNumber: string }>();
  const navigate = useNavigate();

  const teamStatistics = useAnalyticsStore(s => s.realTeamStatistics);
  const realScoutEntries = useAnalyticsStore(s => s.realScoutEntries);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const tbaApiKey = usePickListStore(s => s.tbaApiKey);

  const [tbaMatches, setTbaMatches] = useState<TBAMatch[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{ matchNumber: number; videoUrl: string } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<RealScoutEntry | null>(null);

  const teamNum = parseInt(teamNumber || '0');
  const teamStats = teamStatistics.find(t => t.teamNumber === teamNum);

  // Get real scout entries for this team
  const teamEntries = useMemo(() =>
    realScoutEntries
      .filter(e => e.team_number === teamNum)
      .sort((a, b) => a.match_number - b.match_number),
    [realScoutEntries, teamNum]
  );

  // Calculate per-match data from real entries
  const matchData = useMemo(() =>
    teamEntries.map(entry => ({
      entry,
      fuel: estimateMatchFuel(entry),
      points: estimateMatchPoints(entry),
      climbLevel: parseClimbLevel(entry.climb_level),
    })),
    [teamEntries]
  );

  // Fetch TBA match data for videos
  useEffect(() => {
    async function fetchMatches() {
      try {
        const teamKey = teamNumberToKey(teamNum);
        const matches = await getTeamEventMatches(teamKey, eventCode, tbaApiKey);
        setTbaMatches(matches);
      } catch (error) {
        console.error('Failed to load TBA matches:', error);
      }
    }
    fetchMatches();
  }, [teamNum, eventCode, tbaApiKey]);

  if (!teamStats) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Team Not Found</h2>
        <button
          onClick={() => navigate(-1)}
          className="text-blueAlliance hover:underline"
        >
          Go Back
        </button>
      </div>
    );
  }

  // Calculate trend from match points
  const getTrend = () => {
    if (matchData.length < 3) return 'stable';
    const recent = matchData.slice(-3).map(m => m.points.total);
    const earlier = matchData.slice(0, 3).map(m => m.points.total);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    if (recentAvg > earlierAvg * 1.1) return 'up';
    if (recentAvg < earlierAvg * 0.9) return 'down';
    return 'stable';
  };
  const trend = getTrend();

  // Climb level label
  const climbLabel = (level: number) => {
    return ['None', 'L1', 'L2', 'L3'][level] ?? 'None';
  };

  // Safe access to real stat fields (works regardless of which stats type is loaded)
  const rs = teamStats as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-surface hover:bg-interactive rounded-lg transition-colors"
          title="Go back"
        >
          <ArrowLeft size={20} />
        </button>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">Avg Total Points</p>
          <p className="text-3xl font-bold mt-1">{teamStats.avgTotalPoints.toFixed(1)}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">Matches Played</p>
          <p className="text-3xl font-bold mt-1">{teamStats.matchesPlayed}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">Avg Total Fuel</p>
          <p className="text-3xl font-bold mt-1">{(rs.avgTotalFuelEstimate ?? 0).toFixed(1)}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border">
          <p className="text-textSecondary text-sm">L3 Climb Rate</p>
          <p className="text-3xl font-bold mt-1">{teamStats.level3ClimbRate.toFixed(0)}%</p>
        </div>
      </div>

      {/* Match History (Real Data) */}
      {matchData.length > 0 && (
        <div className="bg-surface rounded-lg border border-border">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-bold">Match History ({matchData.length} entries)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surfaceElevated border-b border-border">
                <tr>
                  <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Match</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Video</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Alliance</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Total Pts</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Auto Fuel</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Teleop Fuel</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Total Fuel</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Climb</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Flags</th>
                  <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matchData.map(({ entry, fuel, points, climbLevel }) => {
                  const alliance = entry.configured_team.startsWith('red') ? 'red' : 'blue';
                  const tbaMatch = tbaMatches.find(
                    m => m.comp_level === 'qm' && m.match_number === entry.match_number
                  );
                  const videoUrl = tbaMatch ? getMatchVideoUrl(tbaMatch) : null;

                  return (
                    <tr key={entry.id} className="hover:bg-interactive transition-colors">
                      <td className="px-3 py-3 font-semibold">
                        <button
                          onClick={() => setSelectedMatch(entry)}
                          className="text-blueAlliance hover:underline cursor-pointer"
                          title="View full scouting report"
                        >
                          Q{entry.match_number}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {videoUrl ? (
                          <button
                            onClick={() => setSelectedVideo({ matchNumber: entry.match_number, videoUrl })}
                            className="p-1 text-danger hover:bg-danger/10 rounded transition-colors"
                            title="Watch match video"
                          >
                            <Play size={16} fill="currentColor" />
                          </button>
                        ) : (
                          <span className="text-textMuted text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          alliance === 'red' ? 'bg-redAlliance/20 text-redAlliance' : 'bg-blueAlliance/20 text-blueAlliance'
                        }`}>
                          {alliance.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-bold">{points.total}</td>
                      <td className="px-3 py-3 text-right text-textSecondary">{fuel.auto}</td>
                      <td className="px-3 py-3 text-right text-textSecondary">{fuel.teleop}</td>
                      <td className="px-3 py-3 text-right font-semibold">{fuel.total}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={climbLevel >= 2 ? 'font-semibold text-success' : climbLevel === 1 ? 'font-semibold' : 'text-textMuted'}>
                          {climbLabel(climbLevel)}
                        </span>
                        {entry.teleop_climb_failed && (
                          <span className="ml-1 text-danger text-xs">(failed)</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-xs space-x-1">
                        {entry.lost_connection && <span className="text-danger">LOST</span>}
                        {entry.no_robot_on_field && <span className="text-danger">NO ROBOT</span>}
                        {entry.dedicated_passer && <span className="text-blueAlliance">PASSER</span>}
                        {entry.eff_rep_bulldozed_fuel && <span className="text-warning">BULLDOZE</span>}
                        {entry.auton_did_nothing && <span className="text-textMuted">NO AUTO</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-textSecondary max-w-[200px] truncate">
                        {entry.notes}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Auto Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Auto Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Auto Fuel Estimate</span>
              <span className="font-semibold">{(rs.avgAutoFuelEstimate ?? 0).toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Auto Points</span>
              <span className="font-semibold">{teamStats.avgAutoPoints.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Auto Climb Rate</span>
              <span className="font-semibold">{(rs.autoClimbRate ?? 0).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Did Nothing Rate</span>
              <span className={`font-semibold ${(rs.autoDidNothingRate ?? 0) > 20 ? 'text-danger' : ''}`}>
                {(rs.autoDidNothingRate ?? 0).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Teleop Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Teleop Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Teleop Fuel Estimate</span>
              <span className="font-semibold">{(rs.avgTeleopFuelEstimate ?? 0).toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Teleop Points</span>
              <span className="font-semibold">{teamStats.avgTeleopPoints.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Passes</span>
              <span className="font-semibold">{(rs.avgTotalPass ?? 0).toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Dedicated Passer Rate</span>
              <span className="font-semibold">{(rs.dedicatedPasserRate ?? 0).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Endgame Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Endgame Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">No Climb</span>
              <span className="font-semibold">{(rs.climbNoneRate ?? 0).toFixed(0)}%</span>
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
              <span className="text-textSecondary">Climb Failed Rate</span>
              <span className={`font-semibold ${(rs.climbFailedRate ?? 0) > 10 ? 'text-danger' : ''}`}>
                {(rs.climbFailedRate ?? 0).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Reliability */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Reliability & Quality</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Lost Connection</span>
              <span className={`font-semibold ${(rs.lostConnectionRate ?? 0) > 10 ? 'text-danger' : ''}`}>
                {(rs.lostConnectionRate ?? 0).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">No Robot on Field</span>
              <span className={`font-semibold ${(rs.noRobotRate ?? 0) > 0 ? 'text-danger' : ''}`}>
                {(rs.noRobotRate ?? 0).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Bulldozed Fuel</span>
              <span className={`font-semibold ${(rs.bulldozedFuelRate ?? 0) > 20 ? 'text-warning' : ''}`}>
                {(rs.bulldozedFuelRate ?? 0).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Poor Accuracy Flag</span>
              <span className={`font-semibold ${(rs.poorAccuracyRate ?? 0) > 20 ? 'text-warning' : ''}`}>
                {(rs.poorAccuracyRate ?? 0).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scout Notes */}
      {rs.notesList && rs.notesList.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Scout Notes ({rs.notesList.length})</h3>
          <div className="space-y-2">
            {rs.notesList.map((note: string, i: number) => (
              <div key={i} className="p-3 bg-surfaceElevated rounded-lg text-sm text-textSecondary">
                {note}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match Detail Modal */}
      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="bg-surface rounded-lg max-w-4xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">
                Match Q{selectedVideo.matchNumber} - Team {teamNum}
              </h3>
              <button
                onClick={() => setSelectedVideo(null)}
                className="p-1 hover:bg-interactive rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="aspect-video w-full">
              <iframe
                width="100%"
                height="100%"
                src={selectedVideo.videoUrl.replace('watch?v=', 'embed/')}
                title={`Match Q${selectedVideo.matchNumber}`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamDetail;
