import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { Trophy, Target, TrendingUp, Users, Calendar, RefreshCw, ChevronDown, ChevronUp, Swords, AlertTriangle, Hash } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import { computeMatchup } from '../utils/predictions';
import { estimateMatchFuel, parseClimbLevel } from '../types/scoutingReal';
import type { PgTBAMatch } from '../types/scoutingReal';

const OUR_TEAM = 148;
const MATCHES_TO_SHOW = 3;
const RANKINGS_TO_SHOW = 10;

function Dashboard() {
  const teamStatistics = useAnalyticsStore(state => state.realTeamStatistics);
  const realScoutEntries = useAnalyticsStore(state => state.realScoutEntries);
  const pgTbaMatches = useAnalyticsStore(state => state.pgTbaMatches);
  const homeTeamNumber = useAnalyticsStore(state => state.homeTeamNumber);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const tbaLoading = useAnalyticsStore(state => state.tbaLoading);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);

  const HOME = homeTeamNumber || OUR_TEAM;

  useEffect(() => {
    if (!tbaData) {
      fetchTBAData();
    }
  }, [tbaData, fetchTBAData]);

  // ── Home team matches ──
  const homeMatches = tbaData?.matches
    ?.filter(match =>
      match.alliances.red.team_keys.includes(`frc${HOME}`) ||
      match.alliances.blue.team_keys.includes(`frc${HOME}`)
    )
    .sort((a, b) => {
      const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
      if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
        return levelOrder[a.comp_level] - levelOrder[b.comp_level];
      }
      return a.match_number - b.match_number;
    }) || [];

  const completedMatches = homeMatches.filter(m => m.alliances.red.score >= 0);
  const upcomingMatches = homeMatches.filter(m => m.alliances.red.score < 0);

  const homeRecord = completedMatches.reduce(
    (acc, match) => {
      const isRed = match.alliances.red.team_keys.includes(`frc${HOME}`);
      const ourScore = isRed ? match.alliances.red.score : match.alliances.blue.score;
      const theirScore = isRed ? match.alliances.blue.score : match.alliances.red.score;
      if (ourScore > theirScore) acc.wins++;
      else if (ourScore < theirScore) acc.losses++;
      else acc.ties++;
      return acc;
    },
    { wins: 0, losses: 0, ties: 0 }
  );

  const homeRanking = tbaData?.rankings?.rankings.find(r => r.team_key === `frc${HOME}`);
  const nextMatch = upcomingMatches[0];

  // ── Overview stats ──
  const totalEntries = realScoutEntries.length;
  const totalTeams = teamStatistics.length;
  const avgPointsAllTeams = totalTeams > 0
    ? teamStatistics.reduce((sum, t) => sum + t.avgTotalPoints, 0) / totalTeams
    : 0;

  // ── Top teams ──
  const topScorers = [...teamStatistics].sort((a, b) => b.avgTotalPoints - a.avgTotalPoints).slice(0, 5);
  const topClimbers = [...teamStatistics].sort((a, b) => b.level3ClimbRate - a.level3ClimbRate).slice(0, 5);
  const topAuto = [...teamStatistics].sort((a, b) => b.avgAutoPoints - a.avgAutoPoints).slice(0, 5);

  const [showAllMatches, setShowAllMatches] = useState(false);

  // ── Match predictions ──
  const matchPredictions = useMemo(() => {
    if (!teamStatistics.length || !homeMatches.length) return new Map();
    const map = new Map<string, ReturnType<typeof computeMatchup>>();
    for (const match of homeMatches) {
      const redNums = match.alliances.red.team_keys.map(teamKeyToNumber);
      const blueNums = match.alliances.blue.team_keys.map(teamKeyToNumber);
      map.set(match.key, computeMatchup(redNums, blueNums, teamStatistics));
    }
    return map;
  }, [homeMatches, teamStatistics]);

  const getMatchLabel = (match: typeof homeMatches[0]) => {
    const prefixes = { qm: 'Q', ef: 'E', qf: 'QF', sf: 'SF', f: 'F' };
    return `${prefixes[match.comp_level]}${match.match_number}`;
  };

  const recentCompleted = completedMatches.slice(-MATCHES_TO_SHOW);
  const nextUpcoming = upcomingMatches.slice(0, MATCHES_TO_SHOW);
  const displayMatches = showAllMatches ? homeMatches : [...recentCompleted, ...nextUpcoming];
  const hasMoreMatches = homeMatches.length > displayMatches.length;

  // ── Data Quality Alerts ──
  const dataAlerts = useMemo(() => {
    if (realScoutEntries.length === 0) return null;

    const secondReview = realScoutEntries.filter(e => e.second_review);
    const lostConn = realScoutEntries.filter(e => e.lost_connection);
    const noRobot = realScoutEntries.filter(e => e.no_robot_on_field);
    const zeroFuel = realScoutEntries.filter(e => {
      const fuel = estimateMatchFuel(e);
      return fuel.total === 0 && !e.lost_connection && !e.no_robot_on_field && !e.dedicated_passer;
    });

    const allQualMatches = tbaData?.matches?.filter(m => m.comp_level === 'qm' && m.alliances.red.score >= 0) ?? [];
    const scoutedMatchNums = new Set(realScoutEntries.map(e => e.match_number));
    const missingMatches = allQualMatches.filter(m => !scoutedMatchNums.has(m.match_number));

    const teamEntryCounts = new Map<number, number>();
    realScoutEntries.forEach(e => {
      teamEntryCounts.set(e.team_number, (teamEntryCounts.get(e.team_number) || 0) + 1);
    });
    const maxEntries = Math.max(...teamEntryCounts.values(), 0);
    const lowCoverageTeams = [...teamEntryCounts.entries()]
      .filter(([, count]) => count <= 1 && maxEntries > 2)
      .map(([team]) => team);

    // Cross-validate scout data vs TBA score breakdowns
    const fuelMismatches: string[] = [];
    const climbMismatches: string[] = [];

    if (pgTbaMatches.length > 0) {
      const tbaByMatch = new Map<number, PgTBAMatch>();
      pgTbaMatches.forEach(m => {
        if (m.comp_level === 'qm') tbaByMatch.set(m.match_number, m);
      });

      const byMatchAlliance = new Map<string, typeof realScoutEntries>();
      realScoutEntries.forEach(e => {
        const alliance = e.configured_team.startsWith('red') ? 'red' : 'blue';
        const key = `${e.match_number}_${alliance}`;
        if (!byMatchAlliance.has(key)) byMatchAlliance.set(key, []);
        byMatchAlliance.get(key)!.push(e);
      });

      for (const [key, entries] of byMatchAlliance) {
        const [matchNumStr, alliance] = key.split('_');
        const matchNum = parseInt(matchNumStr);
        const tbaMatch = tbaByMatch.get(matchNum);
        if (!tbaMatch) continue;

        const scoutFuelSum = entries.reduce((sum, e) => sum + estimateMatchFuel(e).total, 0);
        const tbaHubCount = alliance === 'red'
          ? tbaMatch.red_hubScore?.totalCount ?? 0
          : tbaMatch.blue_hubScore?.totalCount ?? 0;

        if (tbaHubCount > 0 && Math.abs(scoutFuelSum - tbaHubCount) > Math.max(tbaHubCount * 0.5, 5)) {
          fuelMismatches.push(`Q${matchNum} ${alliance}: scout=${scoutFuelSum} vs TBA=${tbaHubCount}`);
        }

        entries.forEach(e => {
          const station = e.configured_team.split('_')[1];
          const tbaClimbField = `${alliance}_endGameTowerRobot${station}` as keyof PgTBAMatch;
          const tbaClimbStr = tbaMatch[tbaClimbField] as string | undefined;
          if (!tbaClimbStr) return;

          const tbaLevel = tbaClimbStr.includes('3') ? 3 : tbaClimbStr.includes('2') ? 2 : tbaClimbStr.includes('1') ? 1 : 0;
          const scoutLevel = parseClimbLevel(e.climb_level);

          if (Math.abs(tbaLevel - scoutLevel) >= 2) {
            climbMismatches.push(`Q${matchNum} ${e.team_number}: scout=L${scoutLevel} vs TBA=L${tbaLevel}`);
          }
        });
      }
    }

    const alerts: { type: 'error' | 'warning' | 'info'; label: string; count: number; details: string }[] = [];

    if (secondReview.length > 0) alerts.push({ type: 'error', label: 'Flagged for Review', count: secondReview.length, details: secondReview.map(e => `Q${e.match_number} - ${e.team_number}`).join(', ') });
    if (missingMatches.length > 0) alerts.push({ type: 'error', label: 'Unscounted Matches', count: missingMatches.length, details: missingMatches.map(m => `Q${m.match_number}`).join(', ') });
    if (fuelMismatches.length > 0) alerts.push({ type: 'error', label: 'Fuel Count Mismatch (vs TBA)', count: fuelMismatches.length, details: fuelMismatches.join(' | ') });
    if (climbMismatches.length > 0) alerts.push({ type: 'error', label: 'Climb Mismatch (vs TBA)', count: climbMismatches.length, details: climbMismatches.join(' | ') });
    if (lostConn.length > 0) alerts.push({ type: 'warning', label: 'Lost Connection', count: lostConn.length, details: lostConn.map(e => `Q${e.match_number} - ${e.team_number}`).join(', ') });
    if (noRobot.length > 0) alerts.push({ type: 'warning', label: 'No Robot on Field', count: noRobot.length, details: noRobot.map(e => `Q${e.match_number} - ${e.team_number}`).join(', ') });
    if (zeroFuel.length > 0) alerts.push({ type: 'warning', label: 'Zero Fuel (not passer/disconn)', count: zeroFuel.length, details: zeroFuel.map(e => `Q${e.match_number} - ${e.team_number}`).join(', ') });
    if (lowCoverageTeams.length > 0) alerts.push({ type: 'info', label: 'Low Scouting Coverage', count: lowCoverageTeams.length, details: `Teams: ${lowCoverageTeams.join(', ')}` });

    return alerts.length > 0 ? alerts : null;
  }, [realScoutEntries, tbaData, pgTbaMatches]);

  // ── Event Rankings (top N, always includes home team) ──
  const eventRankings = useMemo(() => {
    const all = tbaData?.rankings?.rankings?.slice().sort((a, b) => a.rank - b.rank) ?? [];
    const topN = all.slice(0, RANKINGS_TO_SHOW);
    const homeInTopN = topN.some(r => teamKeyToNumber(r.team_key) === HOME);
    if (!homeInTopN) {
      const homeRank = all.find(r => teamKeyToNumber(r.team_key) === HOME);
      if (homeRank) topN.push(homeRank);
    }
    return topN;
  }, [tbaData, HOME]);

  const totalRankedTeams = tbaData?.rankings?.rankings?.length ?? 0;

  // Event-wide averages
  const eventAvgFuel = totalTeams > 0
    ? teamStatistics.reduce((sum, t) => sum + t.avgTotalFuelEstimate, 0) / totalTeams
    : 0;
  const eventAvgAutoFuel = totalTeams > 0
    ? teamStatistics.reduce((sum, t) => sum + t.avgAutoFuelEstimate, 0) / totalTeams
    : 0;
  const eventL3Rate = totalTeams > 0
    ? teamStatistics.reduce((sum, t) => sum + t.level3ClimbRate, 0) / totalTeams
    : 0;
  const eventAutoClimbRate = totalTeams > 0
    ? teamStatistics.reduce((sum, t) => sum + t.autoClimbRate, 0) / totalTeams
    : 0;

  // ── Match Row ──
  const MatchRow = ({ match }: { match: typeof homeMatches[0] }) => {
    const isRed = match.alliances.red.team_keys.includes(`frc${HOME}`);
    const isCompleted = match.alliances.red.score >= 0;
    const ourScore = isRed ? match.alliances.red.score : match.alliances.blue.score;
    const theirScore = isRed ? match.alliances.blue.score : match.alliances.red.score;
    const won = ourScore > theirScore;
    const lost = ourScore < theirScore;

    const prediction = matchPredictions.get(match.key);
    const ourRP = prediction ? (isRed ? prediction.redRP : prediction.blueRP) : null;
    const ourWinProb = ourRP?.winProbability ?? 0;

    return (
      <tr className={`border-b border-border/50 hover:bg-surfaceElevated ${!isCompleted ? 'bg-surfaceElevated/50' : ''}`}>
        <td className="py-2 px-2 font-bold">{getMatchLabel(match)}</td>
        <td className={`py-2 px-2 text-center ${isRed ? 'font-bold' : ''}`}>
          {match.alliances.red.team_keys.map(k => {
            const num = teamKeyToNumber(k);
            return (
              <span key={k} className={num === HOME ? 'text-warning font-bold' : 'text-redAlliance'}>{num}</span>
            );
          }).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ', ', curr], [] as React.ReactNode[])}
        </td>
        <td className="py-2 px-2 text-center font-mono">
          {isCompleted ? (
            <span>
              <span className={match.alliances.red.score > match.alliances.blue.score ? 'text-success font-bold' : ''}>{match.alliances.red.score}</span>
              {' - '}
              <span className={match.alliances.blue.score > match.alliances.red.score ? 'text-success font-bold' : ''}>{match.alliances.blue.score}</span>
            </span>
          ) : <span className="text-textMuted">--</span>}
        </td>
        <td className={`py-2 px-2 text-center ${!isRed ? 'font-bold' : ''}`}>
          {match.alliances.blue.team_keys.map(k => {
            const num = teamKeyToNumber(k);
            return (
              <span key={k} className={num === HOME ? 'text-warning font-bold' : 'text-blueAlliance'}>{num}</span>
            );
          }).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ', ', curr], [] as React.ReactNode[])}
        </td>
        <td className="py-2 px-2 text-center">
          {isCompleted ? (
            <span className={`px-2 py-1 rounded text-xs font-bold ${won ? 'bg-success/20 text-success' : lost ? 'bg-danger/20 text-danger' : 'bg-textMuted/20 text-textMuted'}`}>
              {won ? 'W' : lost ? 'L' : 'T'}
            </span>
          ) : <span className="text-textMuted text-xs">Upcoming</span>}
        </td>
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
      {/* Home Team Status Card */}
      {tbaData && (
        <div className="bg-gradient-to-r from-warning/20 to-warning/5 p-6 rounded-lg border border-warning/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold text-warning">{HOME}</div>
              <div>
                <h2 className="text-xl font-bold">Robowranglers</h2>
                <p className="text-textSecondary">{tbaData.event?.name || 'Event Data Loading...'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 md:gap-6">
              <div className="text-center">
                <p className="text-xs text-textSecondary uppercase tracking-wide">Rank</p>
                <p className="text-3xl font-bold">{homeRanking ? `#${homeRanking.rank}` : '--'}</p>
                {homeRanking && <p className="text-xs text-textSecondary">of {tbaData.rankings?.rankings.length}</p>}
              </div>
              <div className="text-center">
                <p className="text-xs text-textSecondary uppercase tracking-wide">Record</p>
                <p className="text-3xl font-bold">
                  <span className="text-success">{homeRecord.wins}</span>
                  <span className="text-textMuted">-</span>
                  <span className="text-danger">{homeRecord.losses}</span>
                  {homeRecord.ties > 0 && <><span className="text-textMuted">-</span><span className="text-textSecondary">{homeRecord.ties}</span></>}
                </p>
                <p className="text-xs text-textSecondary">{completedMatches.length} played</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-textSecondary uppercase tracking-wide">Next Match</p>
                {nextMatch ? (
                  <>
                    <p className="text-3xl font-bold">{getMatchLabel(nextMatch)}</p>
                    <p className="text-xs text-textSecondary">
                      vs {nextMatch.alliances.red.team_keys.includes(`frc${HOME}`)
                        ? nextMatch.alliances.blue.team_keys.map(k => teamKeyToNumber(k)).join(', ')
                        : nextMatch.alliances.red.team_keys.map(k => teamKeyToNumber(k)).join(', ')
                      }
                    </p>
                  </>
                ) : <p className="text-2xl font-bold text-textMuted">--</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Quality Alerts */}
      {dataAlerts && (
        <div className="bg-surface p-6 rounded-lg border border-danger/40">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="text-danger" size={20} />
            Data Quality Alerts
          </h2>
          <div className="space-y-2">
            {dataAlerts.map((alert, i) => (
              <details key={i} className="group">
                <summary className={`flex items-center justify-between cursor-pointer rounded-lg px-4 py-2 ${
                  alert.type === 'error' ? 'bg-danger/10 hover:bg-danger/20' :
                  alert.type === 'warning' ? 'bg-warning/10 hover:bg-warning/20' :
                  'bg-blueAlliance/10 hover:bg-blueAlliance/20'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      alert.type === 'error' ? 'bg-danger' :
                      alert.type === 'warning' ? 'bg-warning' :
                      'bg-blueAlliance'
                    }`} />
                    <span className="font-medium">{alert.label}</span>
                  </div>
                  <span className={`font-bold text-lg ${
                    alert.type === 'error' ? 'text-danger' :
                    alert.type === 'warning' ? 'text-warning' :
                    'text-blueAlliance'
                  }`}>{alert.count}</span>
                </summary>
                <div className="mt-1 px-4 py-2 text-sm text-textSecondary bg-surfaceElevated rounded-lg">
                  {alert.details}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Home Team Matches Section */}
      {tbaData && homeMatches.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="text-warning" size={20} />
              Team {HOME} Matches
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
          {(hasMoreMatches || showAllMatches) && (
            <button
              onClick={() => setShowAllMatches(!showAllMatches)}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 text-sm text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated rounded transition-colors"
            >
              {showAllMatches ? (
                <><ChevronUp size={16} /> Show Less</>
              ) : (
                <><ChevronDown size={16} /> Show All {homeMatches.length} Matches ({completedMatches.length - recentCompleted.length} more completed)</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <p className="text-textSecondary text-sm">Scout Entries</p>
              <p className="text-3xl font-bold mt-1">{totalEntries}</p>
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
      </div>

      {/* Event Rankings (compact — top N) */}
      {eventRankings.length > 0 && (
        <div className="bg-surface p-4 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Hash className="text-warning" size={18} />
              Rankings
              <span className="text-xs text-textMuted font-normal">Top {RANKINGS_TO_SHOW} of {totalRankedTeams}</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-textMuted">
                  <th className="text-left py-1.5 px-2">#</th>
                  <th className="text-left py-1.5 px-2">Team</th>
                  <th className="text-center py-1.5 px-2">W-L-T</th>
                  <th className="text-right py-1.5 px-2">RP</th>
                  <th className="text-right py-1.5 px-2">Avg Pts</th>
                </tr>
              </thead>
              <tbody>
                {eventRankings.map(r => {
                  const teamNum = teamKeyToNumber(r.team_key);
                  const isHome = teamNum === HOME;
                  const stat = teamStatistics.find(t => t.teamNumber === teamNum);
                  const rp = r.sort_orders?.length > 0 ? r.sort_orders[0].toFixed(2) : null;

                  return (
                    <tr
                      key={r.team_key}
                      className={`border-b border-border/30 ${isHome ? 'bg-warning/10 font-bold' : 'hover:bg-surfaceElevated'}`}
                    >
                      <td className="py-1.5 px-2">
                        <span className={isHome ? 'text-warning' : ''}>{r.rank}</span>
                      </td>
                      <td className="py-1.5 px-2">
                        <Link to={`/teams/${teamNum}`} className="hover:text-blueAlliance transition-colors">
                          {teamNum}
                          {isHome && <span className="ml-1 text-warning">★</span>}
                        </Link>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className="text-success">{r.record.wins}</span>
                        <span className="text-textMuted">-</span>
                        <span className="text-danger">{r.record.losses}</span>
                        {r.record.ties > 0 && <><span className="text-textMuted">-</span><span>{r.record.ties}</span></>}
                      </td>
                      <td className="py-1.5 px-2 text-right text-warning">{rp ?? '--'}</td>
                      <td className="py-1.5 px-2 text-right">
                        {stat ? stat.avgTotalPoints.toFixed(1) : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    {team.teamName && <p className="text-sm text-textSecondary">{team.teamName}</p>}
                  </div>
                </div>
                <span className="font-bold text-success">{team.avgTotalPoints.toFixed(1)} pts</span>
              </div>
            ))}
          </div>
        </div>

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
                    {team.teamName && <p className="text-sm text-textSecondary">{team.teamName}</p>}
                  </div>
                </div>
                <span className="font-bold text-blueAlliance">{team.level3ClimbRate.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

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
                    {team.teamName && <p className="text-sm text-textSecondary">{team.teamName}</p>}
                  </div>
                </div>
                <span className="font-bold text-redAlliance">{team.avgAutoPoints.toFixed(1)} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Event Statistics */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">Event Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-textSecondary text-sm">Avg Total Fuel</p>
            <p className="text-2xl font-bold mt-1">{eventAvgFuel.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-textSecondary text-sm">Avg Auto Fuel</p>
            <p className="text-2xl font-bold mt-1">{eventAvgAutoFuel.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-textSecondary text-sm">Avg L3 Climb Rate</p>
            <p className="text-2xl font-bold mt-1">{eventL3Rate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-textSecondary text-sm">Avg Auto Climb Rate</p>
            <p className="text-2xl font-bold mt-1">{eventAutoClimbRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
