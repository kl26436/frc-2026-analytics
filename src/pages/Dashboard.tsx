import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { Trophy, Target, TrendingUp, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Hash, WifiOff, Eye, Flag, Clock, MessageSquare } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import { computeMatchup } from '../utils/predictions';
import { estimateMatchFuel, parseClimbLevel } from '../types/scoutingReal';
import type { PgTBAMatch } from '../types/scoutingReal';

const OUR_TEAM = 148;
const MATCHES_TO_SHOW = 3;
const RANKINGS_TO_SHOW = 5;

function Dashboard() {
  const teamStatistics = useAnalyticsStore(state => state.realTeamStatistics);
  const realScoutEntries = useAnalyticsStore(state => state.realScoutEntries);
  const pgTbaMatches = useAnalyticsStore(state => state.pgTbaMatches);
  const homeTeamNumber = useAnalyticsStore(state => state.homeTeamNumber);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const tbaLoading = useAnalyticsStore(state => state.tbaLoading);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);

  const navigate = useNavigate();
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

  // ── Top teams (only include teams that actually score in each category) ──
  const topScorers = [...teamStatistics].filter(t => t.avgTotalPoints > 0).sort((a, b) => b.avgTotalPoints - a.avgTotalPoints).slice(0, 5);
  const topClimbers = [...teamStatistics].filter(t => t.avgEndgamePoints > 0).sort((a, b) => b.avgEndgamePoints - a.avgEndgamePoints).slice(0, 5);
  const topAuto = [...teamStatistics].filter(t => t.avgAutoPoints > 0).sort((a, b) => b.avgAutoPoints - a.avgAutoPoints).slice(0, 5);

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

  // ── Match Row ──
  const MatchRow = ({ match, index }: { match: typeof homeMatches[0]; index: number }) => {
    const isRed = match.alliances.red.team_keys.includes(`frc${HOME}`);
    const isCompleted = match.alliances.red.score >= 0;
    const ourScore = isRed ? match.alliances.red.score : match.alliances.blue.score;
    const theirScore = isRed ? match.alliances.blue.score : match.alliances.red.score;
    const won = ourScore > theirScore;
    const lost = ourScore < theirScore;

    const prediction = matchPredictions.get(match.key);
    const ourRP = prediction ? (isRed ? prediction.redRP : prediction.blueRP) : null;

    return (
      <tr
        className={`border-b border-border/50 hover:bg-surfaceElevated cursor-pointer ${!isCompleted ? 'bg-surfaceElevated/50' : index % 2 === 0 ? 'bg-surfaceAlt' : ''}`}
        onClick={() => navigate('/predict')}
      >
        <td className="py-2.5 px-4 font-bold">{getMatchLabel(match)}</td>
        <td className="py-2.5 px-3 text-center font-mono">
          {isCompleted ? (
            <span>
              <span className={`${isRed ? 'text-redAlliance' : ''} ${match.alliances.red.score > match.alliances.blue.score ? 'font-bold' : ''}`}>{match.alliances.red.score}</span>
              <span className="text-textMuted"> - </span>
              <span className={`${!isRed ? 'text-blueAlliance' : ''} ${match.alliances.blue.score > match.alliances.red.score ? 'font-bold' : ''}`}>{match.alliances.blue.score}</span>
            </span>
          ) : <span className="text-textMuted">--</span>}
        </td>
        <td className="py-2.5 px-3 text-center">
          {isCompleted ? (
            <span className={`px-2 py-1 rounded text-xs font-bold ${won ? 'bg-success/20 text-success' : lost ? 'bg-danger/20 text-danger' : 'bg-textMuted/20 text-textMuted'}`}>
              {won ? 'W' : lost ? 'L' : 'T'}
            </span>
          ) : <span className="text-textMuted text-xs">Upcoming</span>}
        </td>
        <td className="py-2.5 px-4 text-center text-xs">
          {ourRP ? (
            <span className="text-warning font-medium">{ourRP.expectedTotalRP.toFixed(1)}</span>
          ) : <span className="text-textMuted">--</span>}
        </td>
      </tr>
    );
  };

  // ── Reliability concerns ──
  const unreliableTeams = useMemo(() =>
    teamStatistics.filter(
      t => t.matchesPlayed >= 2 && (t.lostConnectionRate > 15 || t.noRobotRate > 10)
    ).sort((a, b) => (b.lostConnectionRate + b.noRobotRate) - (a.lostConnectionRate + a.noRobotRate)),
    [teamStatistics]
  );

  // ── Shared card styles ──
  const card = 'bg-surface rounded-xl border border-border p-6 shadow-card';
  const cardHeader = 'text-base font-bold flex items-center gap-2 mb-4';

  return (
    <div className="space-y-6">
      {/* ═══ Home Team Hero ═══ */}
      {tbaData && (
        <div className="bg-gradient-to-r from-warning/15 to-transparent rounded-xl border border-warning/20 p-6 shadow-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-5xl font-black text-warning">{HOME}</div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">Robowranglers</h2>
                <p className="text-sm text-textSecondary">{tbaData.event?.name || 'Loading...'}</p>
              </div>
              <button
                onClick={() => fetchTBAData()}
                disabled={tbaLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surfaceElevated hover:bg-interactive rounded-lg border border-border transition-colors md:hidden"
              >
                <RefreshCw size={12} className={tbaLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex items-center gap-6">
              {[
                { label: 'Rank', value: homeRanking ? `#${homeRanking.rank}` : '--', sub: homeRanking ? `of ${tbaData.rankings?.rankings.length}` : undefined },
                { label: 'Record', value: null, sub: `${completedMatches.length} played` },
                { label: 'Next', value: nextMatch ? getMatchLabel(nextMatch) : '--', sub: nextMatch ? `vs ${(nextMatch.alliances.red.team_keys.includes(`frc${HOME}`) ? nextMatch.alliances.blue.team_keys : nextMatch.alliances.red.team_keys).map(k => teamKeyToNumber(k)).join(', ')}` : undefined },
              ].map(item => (
                <div key={item.label} className="text-center min-w-[70px]">
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest">{item.label}</p>
                  {item.label === 'Record' ? (
                    <p className="text-2xl font-bold">
                      <span className="text-success">{homeRecord.wins}</span>
                      <span className="text-textMuted">-</span>
                      <span className="text-danger">{homeRecord.losses}</span>
                      {homeRecord.ties > 0 && <><span className="text-textMuted">-</span><span>{homeRecord.ties}</span></>}
                    </p>
                  ) : (
                    <p className="text-2xl font-bold">{item.value}</p>
                  )}
                  {item.sub && <p className="text-[10px] text-textSecondary">{item.sub}</p>}
                </div>
              ))}
              <button
                onClick={() => fetchTBAData()}
                disabled={tbaLoading}
                className="ml-2 hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surfaceElevated hover:bg-interactive rounded-lg border border-border transition-colors"
              >
                <RefreshCw size={12} className={tbaLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Two-column layout: Main + Sidebar ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        {/* ── Left column: main content ── */}
        <div className="space-y-6 min-w-0">
          {/* Pre-event placeholder — no matches at all yet */}
          {tbaData && homeMatches.length === 0 && (
            <div className={card}>
              <div className="flex items-center gap-3 text-textSecondary">
                <Clock size={20} />
                <div>
                  <p className="font-semibold text-textPrimary">Waiting for matches</p>
                  <p className="text-sm">Match schedule and scouting summaries will appear here once the event begins.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Shared Match Preview/Recap ── */}
          {(() => {
            // Pick the match: upcoming or last completed
            const targetMatch = nextMatch || (completedMatches.length > 0 ? completedMatches[completedMatches.length - 1] : null);
            if (!targetMatch || !teamStatistics.length) return null;

            const isUpcoming = !!nextMatch;
            const isRed = targetMatch.alliances.red.team_keys.includes(`frc${HOME}`);
            const isCompleted = targetMatch.alliances.red.score >= 0;
            const prediction = matchPredictions.get(targetMatch.key);
            if (!prediction) return null;

            const red = prediction.red;
            const blue = prediction.blue;
            const redRP = prediction.redRP;
            const blueRP = prediction.blueRP;
            const scoreDiff = Math.abs(prediction.scoreDiff);
            const favored = prediction.favoredAlliance;
            const favoredLabel = favored === 'even' ? 'Even matchup' : `${favored === 'red' ? 'Red' : 'Blue'} favored by ${scoreDiff.toFixed(1)} pts`;
            const weFavored = (isRed && favored === 'red') || (!isRed && favored === 'blue');

            // Actual scores (for recap)
            const redActual = targetMatch.alliances.red.score;
            const blueActual = targetMatch.alliances.blue.score;
            const ourActual = isRed ? redActual : blueActual;
            const theirActual = isRed ? blueActual : redActual;
            const won = isCompleted && ourActual > theirActual;
            const lost = isCompleted && ourActual < theirActual;
            const predCorrect = isCompleted && (
              (weFavored && ourActual > theirActual) ||
              (!weFavored && favored === 'even') ||
              (!weFavored && ourActual < theirActual)
            );

            const phases = [
              { label: 'Auto', red: red.autoScore, blue: blue.autoScore },
              { label: 'Teleop', red: red.teleopScore, blue: blue.teleopScore },
              { label: 'Endgame', red: red.endgameScore, blue: blue.endgameScore },
              { label: 'TOTAL', red: red.totalScore, blue: blue.totalScore },
            ];

            return (
              <div className={card}>
                <h2 className={cardHeader}>
                  {isUpcoming
                    ? <><Eye className="text-warning" size={18} /> Next Match — {getMatchLabel(targetMatch)}</>
                    : <><Flag className={won ? 'text-success' : lost ? 'text-danger' : 'text-warning'} size={18} /> Last Match — {getMatchLabel(targetMatch)}</>
                  }
                </h2>

                {/* ── Big predicted scores ── */}
                <div className="bg-surfaceElevated rounded-lg p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-center flex-1">
                      <p className="text-xs text-redAlliance font-semibold mb-1">Red ({getMatchLabel(targetMatch)})</p>
                      <p className="text-4xl font-black text-redAlliance">{red.totalScore.toFixed(1)}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                        red.confidence === 'high' ? 'bg-success/20 text-success' : red.confidence === 'medium' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                      }`}>{red.confidence} confidence</span>
                    </div>
                    <span className="text-textMuted text-lg font-semibold px-4">vs</span>
                    <div className="text-center flex-1">
                      <p className="text-xs text-blueAlliance font-semibold mb-1">Blue ({getMatchLabel(targetMatch)})</p>
                      <p className="text-4xl font-black text-blueAlliance">{blue.totalScore.toFixed(1)}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                        blue.confidence === 'high' ? 'bg-success/20 text-success' : blue.confidence === 'medium' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                      }`}>{blue.confidence} confidence</span>
                    </div>
                  </div>
                  <p className={`text-center mt-3 text-sm font-semibold ${
                    favored === 'even' ? 'text-textMuted' : weFavored ? 'text-success' : 'text-danger'
                  }`}>→ {favoredLabel}</p>
                </div>

                {/* ── Actual result (recap only) ── */}
                {isCompleted && !isUpcoming && (
                  <div className={`mt-4 rounded-lg p-4 text-center ${won ? 'bg-success/10 border border-success/20' : lost ? 'bg-danger/10 border border-danger/20' : 'bg-warning/10 border border-warning/20'}`}>
                    <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Actual Result</p>
                    <p className="text-3xl font-black">
                      <span className="text-redAlliance">{redActual}</span>
                      <span className="text-textMuted mx-2 text-lg">vs</span>
                      <span className="text-blueAlliance">{blueActual}</span>
                    </p>
                    <p className={`text-xs mt-1 font-semibold ${predCorrect ? 'text-success' : 'text-danger'}`}>
                      {predCorrect ? '✓ Prediction correct' : '✗ Prediction wrong'}
                    </p>
                  </div>
                )}

                {/* ── Phase breakdown table ── */}
                <div className="mt-4 overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surfaceElevated text-xs text-textMuted">
                        <th className="text-left py-2 px-3 font-medium">Phase</th>
                        <th className="text-center py-2 px-3 font-medium text-redAlliance">Red</th>
                        <th className="text-center py-2 px-3 font-medium text-blueAlliance">Blue</th>
                        <th className="text-right py-2 px-3 font-medium">Advantage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phases.map(p => {
                        const diff = p.red - p.blue;
                        const advLabel = Math.abs(diff) < 0.5 ? 'Even' : `${diff > 0 ? 'Red' : 'Blue'} +${Math.abs(diff).toFixed(1)}`;
                        const advColor = Math.abs(diff) < 0.5 ? 'text-textMuted' : diff > 0 ? 'text-redAlliance' : 'text-blueAlliance';
                        const isTotal = p.label === 'TOTAL';
                        return (
                          <tr key={p.label} className={`border-t border-border/50 ${isTotal ? 'bg-surfaceElevated font-bold' : ''}`}>
                            <td className="py-2 px-3 font-medium">{p.label}</td>
                            <td className="py-2 px-3 text-center text-redAlliance">{p.red.toFixed(1)}</td>
                            <td className="py-2 px-3 text-center text-blueAlliance">{p.blue.toFixed(1)}</td>
                            <td className={`py-2 px-3 text-right ${advColor}`}>{advLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Detailed Breakdown + Scout Notes (single collapsible) ── */}
                {(() => {
                  // Scout notes data
                  const redNums = targetMatch.alliances.red.team_keys.map(teamKeyToNumber);
                  const blueNums = targetMatch.alliances.blue.team_keys.map(teamKeyToNumber);
                  const isHomeRed = redNums.includes(HOME);
                  const allyNums = isHomeRed ? redNums : blueNums;
                  const oppNums = isHomeRed ? blueNums : redNums;

                  const getTeamNotes = (nums: number[]) => nums
                    .filter(num => num !== HOME)
                    .map(num => {
                      const stats = teamStatistics.find(t => t.teamNumber === num);
                      const notes = (stats?.notesList ?? []).filter(n => n.trim().length > 0);
                      return { teamNumber: num, notes: notes.slice(-3) };
                    }).filter(t => t.notes.length > 0);

                  const allyNotes = getTeamNotes(allyNums);
                  const oppNotes = getTeamNotes(oppNums);
                  const hasNotes = allyNotes.length > 0 || oppNotes.length > 0;
                  const totalNotes = [...allyNotes, ...oppNotes].reduce((sum, t) => sum + t.notes.length, 0);

                  const renderTeamNotes = (teams: typeof allyNotes) => teams.map(t => (
                    <div key={t.teamNumber}>
                      <Link to={`/teams/${t.teamNumber}`} className="text-xs font-bold hover:underline">
                        {t.teamNumber}
                      </Link>
                      <div className="mt-1 space-y-1">
                        {t.notes.map((note, i) => (
                          <p key={i} className="text-xs text-textSecondary bg-surfaceElevated rounded px-2.5 py-1.5 leading-relaxed">
                            "{note}"
                          </p>
                        ))}
                      </div>
                    </div>
                  ));

                  return (
                    <details className="mt-4 group/detail">
                      <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-textSecondary hover:text-textPrimary transition-colors">
                        <ChevronDown size={14} className="transition-transform group-open/detail:rotate-180" />
                        Details{hasNotes ? ` & Scout Notes (${totalNotes})` : ''}
                      </summary>
                      <div className="mt-3 space-y-4">
                        {/* ── RP Predictions ── */}
                        <div className="grid grid-cols-2 gap-4">
                          {[
                            { label: 'Red', color: 'text-redAlliance', rp: redRP },
                            { label: 'Blue', color: 'text-blueAlliance', rp: blueRP },
                          ].map(side => (
                            <div key={side.label} className="bg-surfaceElevated rounded-lg p-3">
                              <p className={`text-xs font-semibold ${side.color} mb-2`}>{side.label} RP</p>
                              <div className="space-y-1.5 text-xs">
                                {[
                                  { label: 'Win Probability', val: `${(side.rp.winProbability * 100).toFixed(0)}%` },
                                  { label: 'Climb Bonus', val: `${(side.rp.climbBonusProb * 100).toFixed(0)}%` },
                                  { label: 'Score Bonus', val: `${(side.rp.scoringBonusProb * 100).toFixed(0)}%` },
                                ].map(row => (
                                  <div key={row.label} className="flex justify-between">
                                    <span className="text-textMuted">{row.label}</span>
                                    <span className="font-medium">{row.val}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between pt-1.5 border-t border-border/50 font-bold">
                                  <span>Expected Total RP</span>
                                  <span className="text-warning">{side.rp.expectedTotalRP.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ── Team breakdowns ── */}
                        <div className="grid grid-cols-2 gap-4">
                          {[
                            { label: 'Red' as const, color: 'redAlliance', headerBg: 'bg-redAlliance/10', teams: red.teams },
                            { label: 'Blue' as const, color: 'blueAlliance', headerBg: 'bg-blueAlliance/10', teams: blue.teams },
                          ].map(side => (
                            <div key={side.label} className="overflow-hidden rounded-lg border border-border">
                              <div className={`${side.headerBg} px-3 py-1.5`}>
                                <p className={`text-xs font-semibold text-${side.color}`}>{side.label} Breakdown</p>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-textMuted bg-surfaceElevated">
                                    <th className="text-left py-1 px-2 font-medium">Team</th>
                                    <th className="text-center py-1 px-1 font-medium">Auto</th>
                                    <th className="text-center py-1 px-1 font-medium">Tele</th>
                                    <th className="text-center py-1 px-1 font-medium">End</th>
                                    <th className="text-center py-1 px-1 font-medium">Total</th>
                                    <th className="text-right py-1 px-2 font-medium">Rel.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {side.teams.map((t: typeof red.teams[number]) => (
                                    <tr key={t.teamNumber} className="border-t border-border/30">
                                      <td className="py-1 px-2">
                                        <Link to={`/teams/${t.teamNumber}`} className={`font-semibold hover:underline ${t.teamNumber === HOME ? 'text-warning' : ''}`}>{t.teamNumber}</Link>
                                      </td>
                                      <td className="py-1 px-1 text-center">{t.autoPoints.toFixed(1)}</td>
                                      <td className="py-1 px-1 text-center">{t.teleopPoints.toFixed(1)}</td>
                                      <td className="py-1 px-1 text-center">{t.endgamePoints.toFixed(1)}</td>
                                      <td className="py-1 px-1 text-center font-bold">{t.totalPoints.toFixed(1)}</td>
                                      <td className={`py-1 px-2 text-right font-medium ${t.reliability >= 90 ? 'text-success' : t.reliability >= 70 ? 'text-warning' : 'text-danger'}`}>
                                        {t.reliability.toFixed(0)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>

                        {/* ── Scout Notes ── */}
                        {hasNotes && (
                          <>
                            <div className="border-t border-border/50" />
                            <div className="space-y-3">
                              <p className="text-xs font-semibold text-textSecondary flex items-center gap-1.5">
                                <MessageSquare size={12} /> Scout Notes
                              </p>
                              {allyNotes.length > 0 && (
                                <>
                                  <p className="text-[10px] uppercase tracking-widest text-success font-semibold">Alliance Partners</p>
                                  {renderTeamNotes(allyNotes)}
                                </>
                              )}
                              {allyNotes.length > 0 && oppNotes.length > 0 && (
                                <div className="border-t border-border/30" />
                              )}
                              {oppNotes.length > 0 && (
                                <>
                                  <p className="text-[10px] uppercase tracking-widest text-danger font-semibold">Opponents</p>
                                  {renderTeamNotes(oppNotes)}
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        className="w-full mt-3 flex items-center justify-center gap-1 py-1.5 text-xs text-textSecondary hover:text-textPrimary transition-colors"
                        onClick={(e) => {
                          const details = (e.currentTarget.parentElement as HTMLDetailsElement);
                          if (details) details.open = false;
                        }}
                      >
                        <ChevronUp size={12} />
                        Show less
                      </button>
                    </details>
                  );
                })()}
              </div>
            );
          })()}

          {/* Matches Table */}
          {tbaData && homeMatches.length > 0 && (
            <div className={card}>
              <h2 className={`${cardHeader} mb-4`}>
                <Clock className="text-warning" size={18} />
                Recent Matches
              </h2>
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-textMuted">
                      <th className="text-left py-2 px-4 font-medium">Match</th>
                      <th className="text-center py-2 px-3 font-medium">Score</th>
                      <th className="text-center py-2 px-3 font-medium">Result</th>
                      <th className="text-center py-2 px-4 font-medium">xRP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMatches.map((match, index) => (
                      <MatchRow key={match.key} match={match} index={index} />
                    ))}
                  </tbody>
                </table>
              </div>
              {(hasMoreMatches || showAllMatches) && (
                <button
                  onClick={() => setShowAllMatches(!showAllMatches)}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-2 text-xs text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated rounded-lg transition-colors"
                >
                  {showAllMatches ? (
                    <><ChevronUp size={14} /> Show Less</>
                  ) : (
                    <><ChevronDown size={14} /> All {homeMatches.length} Matches</>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right column: sidebar ── */}
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          {/* Rankings */}
          {eventRankings.length > 0 && (
            <div className={card}>
              <h2 className={cardHeader}>
                <Hash className="text-warning" size={18} />
                Rankings
                <span className="text-xs text-textMuted font-normal ml-1">Top {RANKINGS_TO_SHOW} of {totalRankedTeams}</span>
              </h2>
              <div className="space-y-1">
                {eventRankings.map(r => {
                  const teamNum = teamKeyToNumber(r.team_key);
                  const isHome = teamNum === HOME;
                  const rp = r.sort_orders?.length > 0 ? r.sort_orders[0].toFixed(1) : '--';
                  return (
                    <Link
                      key={r.team_key}
                      to={`/teams/${teamNum}`}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        isHome ? 'bg-warning/10' : 'hover:bg-surfaceElevated'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 text-right font-bold text-xs ${isHome ? 'text-warning' : 'text-textMuted'}`}>#{r.rank}</span>
                        <span className={`font-semibold ${isHome ? 'text-warning' : ''}`}>{teamNum}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span>
                          <span className="text-success">{r.record.wins}</span>
                          <span className="text-textMuted">-</span>
                          <span className="text-danger">{r.record.losses}</span>
                          {r.record.ties > 0 && <><span className="text-textMuted">-</span><span>{r.record.ties}</span></>}
                        </span>
                        <span className="text-warning font-semibold">{rp} RP</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Data Quality Alerts */}
          {dataAlerts && (
            <div className={`${card} !border-danger/30`}>
              <h2 className={cardHeader}>
                <AlertTriangle className="text-danger" size={18} />
                Data Quality
              </h2>
              <div className="space-y-1.5">
                {dataAlerts.map((alert, i) => (
                  <details key={i} className="group">
                    <summary className={`flex items-center justify-between cursor-pointer rounded-lg px-3 py-2 text-sm ${
                      alert.type === 'error' ? 'bg-danger/10 hover:bg-danger/15' :
                      alert.type === 'warning' ? 'bg-warning/10 hover:bg-warning/15' :
                      'bg-blueAlliance/10 hover:bg-blueAlliance/15'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          alert.type === 'error' ? 'bg-danger' : alert.type === 'warning' ? 'bg-warning' : 'bg-blueAlliance'
                        }`} />
                        <span className="font-medium">{alert.label}</span>
                        <ChevronDown size={12} className="transition-transform group-open:rotate-180 text-textMuted" />
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        alert.type === 'error' ? 'bg-danger/20 text-danger' :
                        alert.type === 'warning' ? 'bg-warning/20 text-warning' :
                        'bg-blueAlliance/20 text-blueAlliance'
                      }`}>{alert.count}</span>
                    </summary>
                    <div className="mt-1 px-3 py-2 text-xs text-textSecondary bg-surfaceElevated rounded-lg">{alert.details}</div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Reliability Concerns */}
          {unreliableTeams.length > 0 && (
            <div className={`${card} !border-danger/20`}>
              <h2 className={cardHeader}>
                <WifiOff className="text-danger" size={18} />
                Reliability Concerns
                <span className="text-xs text-textMuted font-normal ml-1">{unreliableTeams.length} team{unreliableTeams.length !== 1 ? 's' : ''}</span>
              </h2>
              <div className="space-y-1">
                {unreliableTeams.map(team => (
                  <Link
                    key={team.teamNumber}
                    to={`/teams/${team.teamNumber}`}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm hover:bg-surfaceElevated transition-colors"
                  >
                    <span className="font-semibold">{team.teamNumber}</span>
                    <div className="flex items-center gap-3 text-xs">
                      {team.lostConnectionRate > 15 && (
                        <span className="flex items-center gap-1 text-danger">
                          <WifiOff size={11} /> {team.lostConnectionRate.toFixed(0)}%
                        </span>
                      )}
                      {team.noRobotRate > 10 && (
                        <span className="text-warning">{team.noRobotRate.toFixed(0)}% no-show</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Leaderboards (full width) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Scorers */}
        <div className={card}>
          <h2 className={cardHeader}>
            <Trophy className="text-warning" size={18} />
            Top Scorers
          </h2>
          <div className="space-y-1">
            {topScorers.map((team, i) => (
              <Link key={team.teamNumber} to={`/teams/${team.teamNumber}`} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-surfaceElevated transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs text-textMuted font-mono">{i + 1}</span>
                  <div>
                    <span className="font-semibold text-sm">{team.teamNumber}</span>
                    {team.teamName && <p className="text-[11px] text-textSecondary leading-tight">{team.teamName}</p>}
                  </div>
                </div>
                <span className="font-bold text-sm text-success">{team.avgTotalPoints.toFixed(1)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Top Climbers */}
        <div className={card}>
          <h2 className={cardHeader}>
            <TrendingUp className="text-blueAlliance" size={18} />
            Top Climbers
          </h2>
          <div className="space-y-1">
            {topClimbers.map((team, i) => {
              const lvl = team.level3ClimbCount > 0 ? 'L3' : team.level2ClimbCount > 0 ? 'L2' : team.level1ClimbCount > 0 ? 'L1' : '--';
              const color = lvl === 'L3' ? 'bg-success/20 text-success' : lvl === 'L2' ? 'bg-blueAlliance/20 text-blueAlliance' : lvl === 'L1' ? 'bg-warning/20 text-warning' : 'bg-textMuted/20 text-textMuted';
              return (
                <Link key={team.teamNumber} to={`/teams/${team.teamNumber}`} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-surfaceElevated transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-right text-xs text-textMuted font-mono">{i + 1}</span>
                    <div>
                      <span className="font-semibold text-sm">{team.teamNumber}</span>
                      {team.teamName && <p className="text-[11px] text-textSecondary leading-tight">{team.teamName}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${color}`}>{lvl}</span>
                    <span className="font-bold text-sm text-blueAlliance">{team.avgEndgamePoints.toFixed(1)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Top Auto */}
        <div className={card}>
          <h2 className={cardHeader}>
            <Target className="text-redAlliance" size={18} />
            Top Auto
          </h2>
          <div className="space-y-1">
            {topAuto.map((team, i) => (
              <Link key={team.teamNumber} to={`/teams/${team.teamNumber}`} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-surfaceElevated transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs text-textMuted font-mono">{i + 1}</span>
                  <div>
                    <span className="font-semibold text-sm">{team.teamNumber}</span>
                    {team.teamName && <p className="text-[11px] text-textSecondary leading-tight">{team.teamName}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {team.autoClimbCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success">Climb</span>
                  )}
                  <span className="font-bold text-sm text-redAlliance">{team.avgAutoPoints.toFixed(1)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
