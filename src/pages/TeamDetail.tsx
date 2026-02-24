import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Play, X, Trophy, Hash, Droplets, ArrowUpCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
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

  const n = teamStats.matchesPlayed;

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

  // Reusable totals row component
  const TotalsRow = ({ items }: { items: { label: string; value: string; color?: string }[] }) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(({ label, value, color }) => (
        <span key={label} className="text-sm">
          <span className="text-textSecondary">{label}:</span>{' '}
          <span className={`font-semibold ${color || ''}`}>{value}</span>
        </span>
      ))}
    </div>
  );

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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface p-6 rounded-lg border border-border border-l-4 border-l-warning">
          <div className="flex items-center justify-between mb-2">
            <p className="text-textSecondary text-sm">Avg Total Points</p>
            <Trophy size={20} className="text-warning" />
          </div>
          <p className="text-3xl font-bold">{teamStats.avgTotalPoints.toFixed(1)}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border border-l-4 border-l-blueAlliance">
          <div className="flex items-center justify-between mb-2">
            <p className="text-textSecondary text-sm">Matches Played</p>
            <Hash size={20} className="text-blueAlliance" />
          </div>
          <p className="text-3xl font-bold">{n}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border border-l-4 border-l-success">
          <div className="flex items-center justify-between mb-2">
            <p className="text-textSecondary text-sm">Avg Total Fuel</p>
            <Droplets size={20} className="text-success" />
          </div>
          <p className="text-3xl font-bold">{teamStats.avgTotalFuelEstimate.toFixed(1)}</p>
        </div>
        <div className="bg-surface p-6 rounded-lg border border-border border-l-4 border-l-danger">
          <div className="flex items-center justify-between mb-2">
            <p className="text-textSecondary text-sm">L3 Climb</p>
            <ArrowUpCircle size={20} className="text-danger" />
          </div>
          <p className="text-3xl font-bold">{teamStats.level3ClimbCount}/{n}</p>
          <p className="text-xs text-textSecondary mt-0.5">({teamStats.level3ClimbRate.toFixed(0)}%)</p>
        </div>
      </div>

      {/* Match Performance Trend Chart */}
      {matchData.length >= 2 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4">Match Performance Trend</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={matchData.map(({ entry, points }) => ({
                match: `Q${entry.match_number}`,
                total: points.total,
                auto: points.autoPoints,
                teleop: points.teleopPoints,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis
                  dataKey="match"
                  stroke="#737373"
                  tick={{ fill: '#A3A3A3', fontSize: 12 }}
                />
                <YAxis
                  stroke="#737373"
                  tick={{ fill: '#A3A3A3', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #333333',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                  }}
                  labelStyle={{ color: '#A3A3A3' }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#22C55E"
                  strokeWidth={2}
                  dot={{ fill: '#22C55E', r: 4 }}
                  name="Total Points"
                />
                <Line
                  type="monotone"
                  dataKey="auto"
                  stroke="#EAB308"
                  strokeWidth={1.5}
                  dot={{ fill: '#EAB308', r: 3 }}
                  name="Auto"
                  strokeDasharray="5 5"
                />
                <Line
                  type="monotone"
                  dataKey="teleop"
                  stroke="#2563EB"
                  strokeWidth={1.5}
                  dot={{ fill: '#2563EB', r: 3 }}
                  name="Teleop"
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Scouting Totals — raw database counts */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface rounded-lg border border-border">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold">Scouting Totals</h2>
          <p className="text-xs text-textSecondary mt-1">Raw counts from {n} scouted matches</p>
        </div>
        <div className="p-6 space-y-5">
          {/* Climb Distribution */}
          <div>
            <h3 className="text-sm font-bold text-textSecondary mb-2">Endgame Climb</h3>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'None', count: teamStats.climbNoneCount, color: 'text-textMuted' },
                { label: 'L1', count: teamStats.level1ClimbCount, color: '' },
                { label: 'L2', count: teamStats.level2ClimbCount, color: 'text-blueAlliance' },
                { label: 'L3', count: teamStats.level3ClimbCount, color: 'text-success' },
                { label: 'Failed', count: teamStats.climbFailedCount, color: 'text-danger' },
              ].map(({ label, count, color }) => (
                <div key={label} className="bg-surfaceElevated rounded-lg px-4 py-2 text-center min-w-[60px]">
                  <p className="text-xs text-textSecondary">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{count}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Auto */}
          <div>
            <h3 className="text-sm font-bold text-textSecondary mb-2">Autonomous</h3>
            <TotalsRow items={[
              { label: 'Auto Climb', value: `${teamStats.autoClimbCount}/${n}` },
              { label: 'Did Nothing', value: `${teamStats.autoDidNothingCount}/${n}`, color: teamStats.autoDidNothingCount > 0 ? 'text-danger' : '' },
              { label: 'Passer', value: `${teamStats.dedicatedPasserCount}/${n}` },
            ]} />
          </div>

          {/* Fuel Scoring */}
          <div>
            <h3 className="text-sm font-bold text-textSecondary mb-2">Fuel Scoring</h3>
            <TotalsRow items={[
              { label: 'Auto Fuel', value: `${teamStats.totalAutoFuelEstimate} total (${teamStats.avgAutoFuelEstimate.toFixed(1)} avg)` },
              { label: 'Teleop Fuel', value: `${teamStats.totalTeleopFuelEstimate} total (${teamStats.avgTeleopFuelEstimate.toFixed(1)} avg)` },
              { label: 'Passes', value: `${teamStats.totalAutoFuelPass + teamStats.totalTeleopFuelPass} total (${teamStats.avgTotalPass.toFixed(1)} avg)` },
            ]} />
          </div>

          {/* Bonus Buckets */}
          <div>
            <h3 className="text-sm font-bold text-textSecondary mb-2">Bonus Buckets (Total Counts)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-surfaceElevated rounded p-3">
                <p className="text-xs text-textSecondary mb-2">Auto</p>
                <div className="flex gap-4 text-center">
                  {[
                    { label: '+1', val: teamStats.totalAutoPlus1 },
                    { label: '+2', val: teamStats.totalAutoPlus2 },
                    { label: '+3', val: teamStats.totalAutoPlus3 },
                    { label: '+5', val: teamStats.totalAutoPlus5 },
                    { label: '+10', val: teamStats.totalAutoPlus10 },
                  ].map(b => (
                    <div key={b.label}>
                      <p className="text-xs text-textMuted">{b.label}</p>
                      <p className="font-bold">{b.val}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-surfaceElevated rounded p-3">
                <p className="text-xs text-textSecondary mb-2">Teleop</p>
                <div className="flex gap-4 text-center">
                  {[
                    { label: '+1', val: teamStats.totalTeleopPlus1 },
                    { label: '+2', val: teamStats.totalTeleopPlus2 },
                    { label: '+3', val: teamStats.totalTeleopPlus3 },
                    { label: '+5', val: teamStats.totalTeleopPlus5 },
                    { label: '+10', val: teamStats.totalTeleopPlus10 },
                  ].map(b => (
                    <div key={b.label}>
                      <p className="text-xs text-textMuted">{b.label}</p>
                      <p className="font-bold">{b.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Flags */}
          <div>
            <h3 className="text-sm font-bold text-textSecondary mb-2">Flags</h3>
            <TotalsRow items={[
              { label: 'Lost Conn', value: `${teamStats.lostConnectionCount}/${n}`, color: teamStats.lostConnectionCount > 0 ? 'text-danger' : '' },
              { label: 'No Robot', value: `${teamStats.noRobotCount}/${n}`, color: teamStats.noRobotCount > 0 ? 'text-danger' : '' },
              { label: 'Bulldozed', value: `${teamStats.bulldozedFuelCount}/${n}`, color: teamStats.bulldozedFuelCount > 0 ? 'text-warning' : '' },
              { label: 'Poor Accuracy', value: `${teamStats.poorAccuracyCount}/${n}`, color: teamStats.poorAccuracyCount > 0 ? 'text-warning' : '' },
              { label: '2nd Review', value: `${teamStats.secondReviewCount}/${n}`, color: teamStats.secondReviewCount > 0 ? 'text-danger' : '' },
            ]} />
          </div>

          {/* Start Zones */}
          <div>
            <h3 className="text-sm font-bold text-textSecondary mb-2">Start Zones</h3>
            <div className="flex flex-wrap gap-3">
              {teamStats.startZoneCounts.map((count, i) => (
                <div key={i} className="bg-surfaceElevated rounded-lg px-4 py-2 text-center min-w-[50px]">
                  <p className="text-xs text-textSecondary">Z{i + 1}</p>
                  <p className={`text-lg font-bold ${count > 0 ? '' : 'text-textMuted'}`}>{count}</p>
                </div>
              ))}
            </div>
          </div>
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
              <thead className="bg-surfaceElevated border-b border-border sticky top-0 z-10">
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
                {matchData.map(({ entry, fuel, points, climbLevel }, index) => {
                  const alliance = entry.configured_team.startsWith('red') ? 'red' : 'blue';
                  const tbaMatch = tbaMatches.find(
                    m => m.comp_level === 'qm' && m.match_number === entry.match_number
                  );
                  const videoUrl = tbaMatch ? getMatchVideoUrl(tbaMatch) : null;

                  return (
                    <tr key={entry.id} className={`hover:bg-interactive transition-colors ${index % 2 === 0 ? 'bg-surfaceAlt' : ''}`}>
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
                        <span className={`px-3 py-1 rounded text-sm font-bold ${
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Derived Statistics — calculated averages/rates */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Auto Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Auto Performance</h3>
          <p className="text-xs text-textSecondary mb-4">Calculated averages</p>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Auto Fuel Estimate</span>
              <span className="font-semibold">{teamStats.avgAutoFuelEstimate.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Auto Points</span>
              <span className="font-semibold">{teamStats.avgAutoPoints.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Auto Climb</span>
              <span className="font-semibold">{teamStats.autoClimbCount}/{n} ({teamStats.autoClimbRate.toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Did Nothing</span>
              <span className={`font-semibold ${teamStats.autoDidNothingCount > 0 ? 'text-danger' : ''}`}>
                {teamStats.autoDidNothingCount}/{n} ({teamStats.autoDidNothingRate.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Teleop Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Teleop Performance</h3>
          <p className="text-xs text-textSecondary mb-4">Calculated averages</p>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Teleop Fuel Estimate</span>
              <span className="font-semibold">{teamStats.avgTeleopFuelEstimate.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Teleop Points</span>
              <span className="font-semibold">{teamStats.avgTeleopPoints.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Avg Passes</span>
              <span className="font-semibold">{teamStats.avgTotalPass.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Dedicated Passer</span>
              <span className="font-semibold">{teamStats.dedicatedPasserCount}/{n} ({teamStats.dedicatedPasserRate.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

        {/* Endgame Performance */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Endgame Performance</h3>
          <p className="text-xs text-textSecondary mb-4">Climb distribution</p>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">No Climb</span>
              <span className="font-semibold">{teamStats.climbNoneCount}/{n} ({teamStats.climbNoneRate.toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Level 1</span>
              <span className="font-semibold">{teamStats.level1ClimbCount}/{n} ({teamStats.level1ClimbRate.toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Level 2</span>
              <span className="font-semibold">{teamStats.level2ClimbCount}/{n} ({teamStats.level2ClimbRate.toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Level 3</span>
              <span className="font-semibold text-success">{teamStats.level3ClimbCount}/{n} ({teamStats.level3ClimbRate.toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Climb Failed</span>
              <span className={`font-semibold ${teamStats.climbFailedCount > 0 ? 'text-danger' : ''}`}>
                {teamStats.climbFailedCount}/{n} ({teamStats.climbFailedRate.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Reliability */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Reliability & Quality</h3>
          <p className="text-xs text-textSecondary mb-4">Flag counts</p>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-textSecondary">Lost Connection</span>
              <span className={`font-semibold ${teamStats.lostConnectionCount > 0 ? 'text-danger' : ''}`}>
                {teamStats.lostConnectionCount}/{n} ({teamStats.lostConnectionRate.toFixed(0)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">No Robot on Field</span>
              <span className={`font-semibold ${teamStats.noRobotCount > 0 ? 'text-danger' : ''}`}>
                {teamStats.noRobotCount}/{n} ({teamStats.noRobotRate.toFixed(0)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Bulldozed Fuel</span>
              <span className={`font-semibold ${teamStats.bulldozedFuelCount > 0 ? 'text-warning' : ''}`}>
                {teamStats.bulldozedFuelCount}/{n} ({teamStats.bulldozedFuelRate.toFixed(0)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textSecondary">Poor Accuracy Flag</span>
              <span className={`font-semibold ${teamStats.poorAccuracyCount > 0 ? 'text-warning' : ''}`}>
                {teamStats.poorAccuracyCount}/{n} ({teamStats.poorAccuracyRate.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scout Notes */}
      {teamStats.notesList && teamStats.notesList.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-4">Scout Notes ({teamStats.notesList.length})</h3>
          <div className="space-y-2">
            {teamStats.notesList.map((note: string, i: number) => (
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
          teamStats={teamStats}
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
