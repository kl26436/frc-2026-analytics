import { useState, useEffect, useRef } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import {
  RefreshCw,
  Trophy,
  Users,
  Calendar,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import type { TBAMatch } from '../types/tba';

const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

function EventSetup() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const tbaLoading = useAnalyticsStore(state => state.tbaLoading);
  const tbaError = useAnalyticsStore(state => state.tbaError);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);
  const autoRefreshEnabled = useAnalyticsStore(state => state.autoRefreshEnabled);
  const setAutoRefresh = useAnalyticsStore(state => state.setAutoRefresh);
  const syncMeta = useAnalyticsStore(state => state.syncMeta);
  const realScoutEntries = useAnalyticsStore(state => state.realScoutEntries);

  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshEnabled && eventCode) {
      if (!tbaData) fetchTBAData();
      refreshIntervalRef.current = setInterval(() => fetchTBAData(), AUTO_REFRESH_INTERVAL);
      return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
    } else {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    }
  }, [autoRefreshEnabled, eventCode, fetchTBAData, tbaData]);

  const formatLastUpdated = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleTimeString();
  };

  const toggleMatch = (key: string) => {
    setExpandedMatch(prev => prev === key ? null : key);
  };

  const climbLabel = (val: unknown) => {
    if (val === 'Level3') return 'L3';
    if (val === 'Level2') return 'L2';
    if (val === 'Level1') return 'L1';
    return '—';
  };

  const renderScoreBreakdown = (match: TBAMatch) => {
    const bd = match.score_breakdown;
    if (!bd) return <p className="text-xs text-textMuted py-2 px-3">No score breakdown available.</p>;
    const r = bd.red as Record<string, unknown>;
    const b = bd.blue as Record<string, unknown>;
    const hub = (side: Record<string, unknown>) => side.hubScore as Record<string, unknown> | undefined;

    const row = (label: string, red: unknown, blue: unknown, unit = '') => (
      <tr key={label} className="border-b border-border/30">
        <td className="py-1 px-2 text-xs text-textSecondary">{label}</td>
        <td className="py-1 px-2 text-xs text-center text-redAlliance font-medium">{String(red ?? '—')}{unit}</td>
        <td className="py-1 px-2 text-xs text-center text-blueAlliance font-medium">{String(blue ?? '—')}{unit}</td>
      </tr>
    );

    return (
      <div className="px-3 pb-3 pt-1 bg-surfaceElevated/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1 px-2 text-xs text-textMuted"></th>
              <th className="text-center py-1 px-2 text-xs font-semibold text-redAlliance">Red</th>
              <th className="text-center py-1 px-2 text-xs font-semibold text-blueAlliance">Blue</th>
            </tr>
          </thead>
          <tbody>
            {row('Auto Hub', hub(r)?.autoCount, hub(b)?.autoCount, ' balls')}
            {row('Auto Hub Pts', hub(r)?.autoPoints, hub(b)?.autoPoints, ' pts')}
            {row('Auto Tower', `${climbLabel(r.autoTowerRobot1)} / ${climbLabel(r.autoTowerRobot2)} / ${climbLabel(r.autoTowerRobot3)}`,
                              `${climbLabel(b.autoTowerRobot1)} / ${climbLabel(b.autoTowerRobot2)} / ${climbLabel(b.autoTowerRobot3)}`)}
            {row('Auto Tower Pts', r.autoTowerPoints, b.autoTowerPoints, ' pts')}
            {row('Total Auto', r.totalAutoPoints, b.totalAutoPoints, ' pts')}
            <tr><td colSpan={3} className="pt-1 pb-0"></td></tr>
            {row('Teleop Hub', hub(r)?.teleopCount, hub(b)?.teleopCount, ' balls')}
            {row('Teleop Hub Pts', hub(r)?.teleopPoints, hub(b)?.teleopPoints, ' pts')}
            {row('Total Teleop', r.totalTeleopPoints, b.totalTeleopPoints, ' pts')}
            <tr><td colSpan={3} className="pt-1 pb-0"></td></tr>
            {row('Endgame Climb', `${climbLabel(r.endGameTowerRobot1)} / ${climbLabel(r.endGameTowerRobot2)} / ${climbLabel(r.endGameTowerRobot3)}`,
                                 `${climbLabel(b.endGameTowerRobot1)} / ${climbLabel(b.endGameTowerRobot2)} / ${climbLabel(b.endGameTowerRobot3)}`)}
            {row('Endgame Tower Pts', r.endGameTowerPoints, b.endGameTowerPoints, ' pts')}
            {row('Foul Pts', r.foulPoints, b.foulPoints, ' pts')}
            <tr><td colSpan={3} className="pt-1 pb-0"></td></tr>
            {row('Total Score', r.totalPoints, b.totalPoints, ' pts')}
            {row('RPs Earned', r.rp, b.rp)}
            {row('Energized RP', r.energizedAchieved ? '✓' : '✗', b.energizedAchieved ? '✓' : '✗')}
            {row('Supercharged RP', r.superchargedAchieved ? '✓' : '✗', b.superchargedAchieved ? '✓' : '✗')}
            {row('Traversal RP', r.traversalAchieved ? '✓' : '✗', b.traversalAchieved ? '✓' : '✗')}
          </tbody>
        </table>
      </div>
    );
  };

  const sortedMatches = tbaData?.matches?.slice().sort((a, b) => {
    const levelOrder: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
    if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
      return levelOrder[a.comp_level] - levelOrder[b.comp_level];
    }
    return a.match_number - b.match_number;
  }) || [];

  const qualMatches = sortedMatches.filter(m => m.comp_level === 'qm');
  const playoffMatches = sortedMatches.filter(m => m.comp_level !== 'qm');
  const completedMatches = sortedMatches.filter(m => m.alliances.red.score >= 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Event</h1>
        <p className="text-textSecondary mt-1 text-sm">
          Live event data from The Blue Alliance · Event setup is managed in Admin Settings
        </p>
      </div>

      {/* Current Event Info */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-blueAlliance" />
            <h2 className="text-xl font-bold">{tbaData?.event?.name ?? eventCode}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTBAData()}
              disabled={tbaLoading}
              className="flex items-center gap-2 px-3 py-2 bg-surfaceElevated hover:bg-interactive rounded-lg transition-colors text-sm"
            >
              <RefreshCw size={16} className={tbaLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <label className="flex items-center gap-2 px-3 py-2 bg-surfaceElevated rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Auto (10 min)</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Event Code</p>
            <p className="text-xl font-bold">{eventCode}</p>
          </div>
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Teams</p>
            <p className="text-xl font-bold">{tbaData?.teams?.length || 0}</p>
          </div>
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Matches</p>
            <p className="text-xl font-bold">{tbaData?.matches?.length || 0}</p>
          </div>
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Last Updated</p>
            <p className="text-lg font-bold flex items-center gap-1">
              <Clock size={14} />
              {formatLastUpdated(tbaData?.lastUpdated || null)}
            </p>
          </div>
        </div>

        {/* Scout data sync status */}
        {syncMeta && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Scout Entries</p>
              <p className="text-xl font-bold">{realScoutEntries.length}</p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Last Sync</p>
              <p className="text-sm font-semibold">
                {new Date(syncMeta.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Sync Duration</p>
              <p className="text-xl font-bold">{(syncMeta.syncDurationMs / 1000).toFixed(1)}s</p>
            </div>
          </div>
        )}

        {tbaData?.event && (
          <div className="mt-4 p-3 bg-surfaceElevated rounded-lg text-sm text-textSecondary">
            {tbaData.event.city}, {tbaData.event.state_prov} · {tbaData.event.start_date} to {tbaData.event.end_date}
          </div>
        )}

        {tbaError && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {tbaError}
          </div>
        )}
      </div>

      {/* Rankings */}
      {tbaData?.rankings && tbaData.rankings.rankings.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={24} className="text-warning" />
            <h2 className="text-xl font-bold">Rankings</h2>
            <span className="text-sm text-textSecondary">({tbaData.rankings.rankings.length} teams)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2">Rank</th>
                  <th className="text-left py-2 px-2">Team</th>
                  <th className="text-center py-2 px-2">RP</th>
                  <th className="text-center py-2 px-2">W-L-T</th>
                  <th className="text-center py-2 px-2">Played</th>
                </tr>
              </thead>
              <tbody>
                {tbaData.rankings.rankings.map(r => {
                  const team = tbaData.teams.find(t => t.key === r.team_key);
                  return (
                    <tr key={r.team_key} className="border-b border-border/50 hover:bg-surfaceElevated">
                      <td className="py-2 px-2 font-bold">{r.rank}</td>
                      <td className="py-2 px-2">
                        <span className="font-semibold">{teamKeyToNumber(r.team_key)}</span>
                        {team?.nickname && <span className="text-textSecondary ml-2">{team.nickname}</span>}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-warning">{r.extra_stats?.[0] ?? '-'}</td>
                      <td className="py-2 px-2 text-center">{r.record.wins}-{r.record.losses}-{r.record.ties}</td>
                      <td className="py-2 px-2 text-center">{r.matches_played}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alliance Selection */}
      {tbaData?.alliances && tbaData.alliances.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Users size={24} className="text-success" />
            <h2 className="text-xl font-bold">Alliance Selection</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {tbaData.alliances.map((alliance, idx) => (
              <div key={idx} className="bg-surfaceElevated p-3 rounded-lg">
                <p className="font-bold text-sm mb-2">Alliance {idx + 1}</p>
                <div className="space-y-1">
                  {alliance.picks.map((teamKey, pickIdx) => (
                    <div key={teamKey} className={`text-sm ${pickIdx === 0 ? 'font-bold text-warning' : ''}`}>
                      {pickIdx === 0 ? '★ ' : ''}{teamKeyToNumber(teamKey)}
                    </div>
                  ))}
                </div>
                {alliance.status && (
                  <p className="text-xs text-textSecondary mt-2">
                    {alliance.status.record.wins}-{alliance.status.record.losses}-{alliance.status.record.ties}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match Schedule */}
      {tbaData?.matches && tbaData.matches.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Calendar size={24} className="text-blueAlliance" />
            <h2 className="text-xl font-bold">Matches</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Qual Matches</p>
              <p className="text-xl font-bold">{qualMatches.length}</p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Playoff Matches</p>
              <p className="text-xl font-bold">{playoffMatches.length}</p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Completed</p>
              <p className="text-xl font-bold">{completedMatches.length}</p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Remaining</p>
              <p className="text-xl font-bold">{sortedMatches.length - completedMatches.length}</p>
            </div>
          </div>

          <div className="space-y-4">
            {(['qm', 'qf', 'sf', 'f'] as const).map(level => {
              const levelMatches = sortedMatches.filter(m => m.comp_level === level);
              if (levelMatches.length === 0) return null;
              const levelLabel: Record<string, string> = { qm: 'Qualifications', qf: 'Quarterfinals', sf: 'Semifinals', f: 'Finals' };
              return (
                <div key={level} className="space-y-1">
                  <p className="text-sm font-semibold text-textSecondary">{levelLabel[level]}</p>
                  <div className="rounded-lg overflow-hidden border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surfaceElevated border-b border-border">
                          <th className="text-left py-2 px-3 w-6"></th>
                          <th className="text-left py-2 px-2">Match</th>
                          <th className="text-center py-2 px-2 text-redAlliance">Red</th>
                          <th className="text-center py-2 px-2">Score</th>
                          <th className="text-center py-2 px-2 text-blueAlliance">Blue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {levelMatches.map(match => {
                          const isExpanded = expandedMatch === match.key;
                          const played = match.alliances.red.score >= 0;
                          const matchLabel = level === 'qm'
                            ? `Q${match.match_number}`
                            : `${level.toUpperCase()} ${match.set_number}-${match.match_number}`;
                          return (
                            <>
                              <tr
                                key={match.key}
                                onClick={() => toggleMatch(match.key)}
                                className={`border-b border-border/50 cursor-pointer transition-colors ${isExpanded ? 'bg-surfaceElevated' : 'hover:bg-surfaceElevated/60'}`}
                              >
                                <td className="py-2 px-3 text-textMuted">
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </td>
                                <td className="py-2 px-2 font-bold">{matchLabel}</td>
                                <td className="py-2 px-2 text-center text-redAlliance text-xs">
                                  {match.alliances.red.team_keys.map(k => teamKeyToNumber(k)).join(', ')}
                                </td>
                                <td className="py-2 px-2 text-center font-mono">
                                  {played ? (
                                    <span>
                                      <span className={match.alliances.red.score > match.alliances.blue.score ? 'text-redAlliance font-bold' : 'text-textSecondary'}>
                                        {match.alliances.red.score}
                                      </span>
                                      <span className="text-textMuted"> – </span>
                                      <span className={match.alliances.blue.score > match.alliances.red.score ? 'text-blueAlliance font-bold' : 'text-textSecondary'}>
                                        {match.alliances.blue.score}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-textMuted text-xs">TBD</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center text-blueAlliance text-xs">
                                  {match.alliances.blue.team_keys.map(k => teamKeyToNumber(k)).join(', ')}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${match.key}-detail`}>
                                  <td colSpan={5} className="p-0">
                                    {renderScoreBreakdown(match)}
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default EventSetup;
