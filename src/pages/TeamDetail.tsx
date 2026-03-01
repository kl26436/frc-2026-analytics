import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';

import { ArrowLeft, TrendingUp, TrendingDown, Minus, Play, X, Trophy, Hash, Droplets, ArrowUpCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { estimateMatchFuel, estimateMatchPoints, parseClimbLevel, computeRobotFuelFromActions } from '../types/scouting';
import type { ScoutEntry } from '../types/scouting';
import type { TBAMatch } from '../types/tba';
import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';
import MatchDetailModal from '../components/MatchDetailModal';
import { usePitScoutStore } from '../store/usePitScoutStore';

// Chart colors — read from CSS design tokens (SVG attributes can't use var())
const getCssHsl = (name: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim()})`;
const chartColors = () => ({
  grid: getCssHsl('--border'),
  axis: getCssHsl('--text-muted'),
  tick: getCssHsl('--text-secondary'),
  success: getCssHsl('--success'),
  warning: getCssHsl('--warning'),
  blue: getCssHsl('--blue-alliance'),
  tooltipBg: getCssHsl('--surface-elevated'),
  tooltipBorder: getCssHsl('--border'),
  tooltipText: getCssHsl('--text-primary'),
  tooltipLabel: getCssHsl('--text-secondary'),
});

function TeamDetail() {
  const { teamNumber } = useParams<{ teamNumber: string }>();
  const navigate = useNavigate();

  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const scoutActions = useAnalyticsStore(s => s.scoutActions);
  const teamTrends = useAnalyticsStore(s => s.teamTrends);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const tbaApiKey = useAnalyticsStore(s => s.tbaApiKey);

  const teamNum = parseInt(teamNumber || '0');

  const pitScoutEntry = usePitScoutStore(s => s.getEntryByTeam(teamNum));

  const [tbaMatches, setTbaMatches] = useState<TBAMatch[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{ matchNumber: number; videoUrl: string } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<ScoutEntry | null>(null);
  const [photoExpanded, setPhotoExpanded] = useState(false);

  // Derive primary photo URL from photos array with legacy fallback
  const primaryPhotoUrl = useMemo(() => {
    if (!pitScoutEntry) return null;
    if (pitScoutEntry.photos?.length) {
      const primary = pitScoutEntry.photos.find(p => p.isPrimary) ?? pitScoutEntry.photos[0];
      return primary?.url ?? null;
    }
    return pitScoutEntry.photoUrl ?? null;
  }, [pitScoutEntry]);
  const teamStats = teamStatistics.find(t => t.teamNumber === teamNum);

  // Get real scout entries for this team
  const teamEntries = useMemo(() =>
    scoutEntries
      .filter(e => e.team_number === teamNum)
      .sort((a, b) => a.match_number - b.match_number),
    [scoutEntries, teamNum]
  );

  // Calculate per-match data from real entries, with action-derived fuel when available
  const matchData = useMemo(() =>
    teamEntries.map(entry => {
      const actions = scoutActions.find(
        a => a.match_number === entry.match_number && a.team_number === entry.team_number
      );
      const actionFuel = actions ? computeRobotFuelFromActions(actions) : null;
      return {
        entry,
        fuel: estimateMatchFuel(entry),
        points: estimateMatchPoints(entry),
        climbLevel: parseClimbLevel(entry.climb_level),
        actions: actions ?? null,
        actionFuel,
      };
    }),
    [teamEntries, scoutActions]
  );

  // Fetch TBA match data for videos
  useEffect(() => {
    async function fetchMatches() {
      try {
        const teamKey = teamNumberToKey(teamNum);
        const matches = await getTeamEventMatches(teamKey, eventCode, tbaApiKey);
        setTbaMatches(matches);
      } catch (error) {
        // TBA fetch failed — matches section will be empty
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

  // Use shared trend analysis
  const teamTrend = teamTrends.find(t => t.teamNumber === teamNum);
  const trend = teamTrend?.trend === 'improving' ? 'up'
    : teamTrend?.trend === 'declining' ? 'down'
    : 'stable';

  // Climb level label
  const climbLabel = (level: number) => {
    return ['None', 'L1', 'L2', 'L3'][level] ?? 'None';
  };

  // Extract which start zone (1-6) was selected, or 0 if none
  const getStartZone = (entry: ScoutEntry): number => {
    for (let i = 1; i <= 6; i++) {
      if ((entry as any)[`prematch_AUTON_START_ZONE_${i}`] > 0) return i;
    }
    return 0;
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
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 md:gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-surface hover:bg-interactive rounded-lg transition-colors"
          title="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        {primaryPhotoUrl && (
          <button
            onClick={() => setPhotoExpanded(true)}
            className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden border border-border hover:border-blueAlliance transition-colors cursor-pointer"
            title="View robot photos"
          >
            <img
              src={primaryPhotoUrl}
              alt={`Team ${teamNum} robot`}
              className="w-full h-full object-cover"
            />
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 md:gap-4">
            <h1 className="text-3xl md:text-4xl font-bold">{teamStats.teamNumber}</h1>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-surface p-4 md:p-6 rounded-lg border border-border border-l-4 border-l-warning">
          <div className="flex items-center justify-between mb-2">
            <p className="text-textSecondary text-sm">Avg Total Points</p>
            <Trophy size={20} className="text-warning" />
          </div>
          <p className="text-3xl font-bold">{teamStats.avgTotalPoints.toFixed(1)}</p>
        </div>
        <div className="bg-surface p-4 md:p-6 rounded-lg border border-border border-l-4 border-l-blueAlliance">
          <div className="flex items-center justify-between mb-2">
            <p className="text-textSecondary text-sm">Matches Played</p>
            <Hash size={20} className="text-blueAlliance" />
          </div>
          <p className="text-3xl font-bold">{n}</p>
        </div>
        {(() => {
          const minFuel = matchData.length > 0
            ? Math.min(...matchData.map(m => m.fuel.total))
            : 0;
          return (
            <div className="bg-surface p-4 md:p-6 rounded-lg border border-border border-l-4 border-l-success">
              <div className="flex items-center justify-between mb-2">
                <p className="text-textSecondary text-sm">Total Fuel</p>
                <Droplets size={20} className="text-success" />
              </div>
              <div className="flex items-end justify-between gap-1">
                <div className="text-center">
                  <p className="text-sm font-medium text-textSecondary">Min</p>
                  <p className="text-2xl font-bold">{minFuel}</p>
                </div>
                <p className="text-lg text-textMuted pb-0.5">-</p>
                <div className="text-center">
                  <p className="text-sm font-medium text-textSecondary">Avg</p>
                  <p className="text-2xl font-bold">{teamStats.avgTotalFuelEstimate.toFixed(1)}</p>
                </div>
                <p className="text-lg text-textMuted pb-0.5">-</p>
                <div className="text-center">
                  <p className="text-sm font-medium text-textSecondary">Max</p>
                  <p className="text-2xl font-bold text-success">{teamStats.maxTotalFuelEstimate}</p>
                </div>
              </div>
            </div>
          );
        })()}
        {(() => {
          const highest = teamStats.level3ClimbCount > 0
            ? { label: 'L3', count: teamStats.level3ClimbCount, rate: teamStats.level3ClimbRate }
            : teamStats.level2ClimbCount > 0
            ? { label: 'L2', count: teamStats.level2ClimbCount, rate: teamStats.level2ClimbRate }
            : teamStats.level1ClimbCount > 0
            ? { label: 'L1', count: teamStats.level1ClimbCount, rate: teamStats.level1ClimbRate }
            : { label: 'None', count: 0, rate: 0 };
          return (
            <div className="bg-surface p-4 md:p-6 rounded-lg border border-border border-l-4 border-l-danger">
              <div className="flex items-center justify-between mb-2">
                <p className="text-textSecondary text-sm">Highest Climb</p>
                <ArrowUpCircle size={20} className="text-danger" />
              </div>
              <p className="text-3xl font-bold">{highest.label}</p>
              {highest.count > 0 && (
                <p className="text-xs text-textSecondary mt-0.5">{highest.count}/{n} ({highest.rate.toFixed(0)}%)</p>
              )}
            </div>
          );
        })()}
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
                  <th className="hidden md:table-cell px-3 py-3 text-center text-textSecondary text-sm font-semibold">Start</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Auto Scored</th>
                  <th className="hidden md:table-cell px-3 py-3 text-center text-textSecondary text-sm font-semibold">Auto Climb</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Auto Pts</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Teleop Scored</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Passes</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Teleop Pts</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Climb</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">End Pts</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Total Pts</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Flags</th>
                  <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matchData.map(({ entry, fuel, points, climbLevel, actionFuel }, index) => {
                  const alliance = entry.configured_team.startsWith('red') ? 'red' : 'blue';
                  const tbaMatch = tbaMatches.find(
                    m => m.comp_level === 'qm' && m.match_number === entry.match_number
                  );
                  const videoUrl = tbaMatch ? getMatchVideoUrl(tbaMatch) : null;
                  const startZone = getStartZone(entry);
                  const autoScored = actionFuel ? actionFuel.autoShots : fuel.auto;
                  const teleopScored = actionFuel ? actionFuel.teleopShots : fuel.teleop;
                  const passes = actionFuel ? actionFuel.totalPasses : entry.auton_FUEL_PASS + entry.teleop_FUEL_PASS;

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
                      <td className="hidden md:table-cell px-3 py-3 text-center text-textSecondary">
                        {startZone > 0 ? `Z${startZone}` : '-'}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{autoScored}</td>
                      <td className="hidden md:table-cell px-3 py-3 text-center">
                        {entry.auton_AUTON_CLIMBED > 0 ? (
                          <span className="text-success font-semibold">Y</span>
                        ) : (
                          <span className="text-textMuted">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{points.autoPoints}</td>
                      <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{teleopScored}</td>
                      <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{passes > 0 ? passes : '-'}</td>
                      <td className="px-3 py-3 text-right font-semibold">{points.teleopPoints}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={climbLevel >= 2 ? 'font-semibold text-success' : climbLevel === 1 ? 'font-semibold' : 'text-textMuted'}>
                          {climbLabel(climbLevel)}
                        </span>
                        {entry.teleop_climb_failed && (
                          <span className="ml-1 text-danger text-xs">(failed)</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-right font-semibold">{points.endgamePoints}</td>
                      <td className="px-3 py-3 text-right font-bold">{points.total}</td>
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

      {/* Match Performance Trend Chart */}
      {matchData.length >= 2 && (() => {
        const cc = chartColors();
        return (
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
                  <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
                  <XAxis
                    dataKey="match"
                    stroke={cc.axis}
                    tick={{ fill: cc.tick, fontSize: 12 }}
                  />
                  <YAxis
                    stroke={cc.axis}
                    tick={{ fill: cc.tick, fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: cc.tooltipBg,
                      border: `1px solid ${cc.tooltipBorder}`,
                      borderRadius: '8px',
                      color: cc.tooltipText,
                    }}
                    labelStyle={{ color: cc.tooltipLabel }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={cc.success}
                    strokeWidth={2}
                    dot={{ fill: cc.success, r: 4 }}
                    name="Total Points"
                  />
                  <Line
                    type="monotone"
                    dataKey="auto"
                    stroke={cc.warning}
                    strokeWidth={1.5}
                    dot={{ fill: cc.warning, r: 3 }}
                    name="Auto"
                    strokeDasharray="5 5"
                  />
                  <Line
                    type="monotone"
                    dataKey="teleop"
                    stroke={cc.blue}
                    strokeWidth={1.5}
                    dot={{ fill: cc.blue, r: 3 }}
                    name="Teleop"
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Derived Statistics — calculated averages/rates */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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
              <span className="font-semibold">{teamStats.level3ClimbCount}/{n} ({teamStats.level3ClimbRate.toFixed(0)}%)</span>
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
          robotActions={scoutActions.find(
            a => a.match_number === selectedMatch.match_number && a.team_number === selectedMatch.team_number
          )}
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
      {/* Robot Photo Gallery Modal */}
      {photoExpanded && pitScoutEntry && (primaryPhotoUrl || pitScoutEntry.photos?.length > 0) && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPhotoExpanded(false)}
        >
          <div
            className="bg-surface rounded-lg max-w-3xl w-full overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <h3 className="font-bold">Team {teamNum} Robot Photos</h3>
              <button
                onClick={() => setPhotoExpanded(false)}
                className="p-1 hover:bg-interactive rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              {(pitScoutEntry.photos?.length
                ? pitScoutEntry.photos
                : pitScoutEntry.photoUrl
                  ? [{ url: pitScoutEntry.photoUrl, path: '', caption: '', isPrimary: true }]
                  : []
              ).map((photo, idx) => (
                <div key={idx}>
                  <img
                    src={photo.url}
                    alt={photo.caption || `Team ${teamNum} photo ${idx + 1}`}
                    className="w-full h-auto max-h-[50vh] object-contain rounded"
                  />
                  {photo.caption && (
                    <p className="text-sm text-textSecondary mt-1 text-center">{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamDetail;
