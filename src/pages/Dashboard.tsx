import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { Trophy, Target, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Hash, WifiOff, Eye, Flag, Clock, MessageSquare, Flame, Binoculars, GitBranch } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import { computeMatchup } from '../utils/predictions';
import { matchLabel, matchSortKey } from '../utils/formatting';

const OUR_TEAM = 148;
const RANKINGS_TO_SHOW = 5;

function Dashboard() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const teamTrends = useAnalyticsStore(state => state.teamTrends);
  const predictionInputs = useAnalyticsStore(state => state.predictionInputs);

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
    .sort((a, b) => matchSortKey(a) - matchSortKey(b)) || [];

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

  // ── Playoffs detection ──
  const inPlayoffs = (tbaData?.alliances?.length ?? 0) > 0 ||
    (tbaData?.matches ?? []).some(m => m.comp_level !== 'qm');

  // ── Top teams (only include teams that actually score in each category) ──
  const topScorers = [...teamStatistics].filter(t => t.avgTotalPoints > 0).sort((a, b) => b.avgTotalPoints - a.avgTotalPoints).slice(0, 5);
  const topClimbers = [...teamStatistics].filter(t => t.avgEndgamePoints > 0).sort((a, b) => b.avgEndgamePoints - a.avgEndgamePoints).slice(0, 5);
  const topAuto = [...teamStatistics].filter(t => t.avgAutoPoints > 0).sort((a, b) => b.avgAutoPoints - a.avgAutoPoints).slice(0, 5);
  // Teams on hot streaks — improving with 6+ matches, sorted by biggest positive delta
  const hotStreaks = useMemo(() =>
    teamTrends
      .filter(t => t.matchResults.length >= 6 && t.delta > 5)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5),
    [teamTrends]
  );

  const [showAllMatches, setShowAllMatches] = useState(false);

  // ── Match predictions ──
  const matchPredictions = useMemo(() => {
    if (!predictionInputs.length || !homeMatches.length) return new Map();
    const map = new Map<string, ReturnType<typeof computeMatchup>>();
    for (const match of homeMatches) {
      const redNums = match.alliances.red.team_keys.map(teamKeyToNumber);
      const blueNums = match.alliances.blue.team_keys.map(teamKeyToNumber);
      map.set(match.key, computeMatchup(redNums, blueNums, predictionInputs));
    }
    return map;
  }, [homeMatches, predictionInputs]);

  const getMatchLabel = (match: typeof homeMatches[0]) => matchLabel(match);

  const rankClass = (i: number) =>
    i === 0 ? 'text-sm font-extrabold text-warning'
    : i <= 2 ? 'text-xs font-bold text-textSecondary'
    : 'text-xs text-textMuted';

  const nickname = (teamNum: number) =>
    tbaData?.teams?.find(t => t.team_number === teamNum)?.nickname
    || teamStatistics.find(t => t.teamNumber === teamNum)?.teamName;

  // ── Next (or last) match for every team at the event ──
  const teamMatchLabel = useMemo(() => {
    const map = new Map<number, { label: string; upcoming: boolean }>();
    if (!tbaData?.matches) return map;
    const allMatches = [...tbaData.matches].sort((a, b) => matchSortKey(a) - matchSortKey(b));
    // First pass: next upcoming match per team
    for (const m of allMatches) {
      if (m.alliances.red.score >= 0) continue;
      const label = matchLabel(m);
      for (const k of [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys]) {
        const num = teamKeyToNumber(k);
        if (!map.has(num)) map.set(num, { label, upcoming: true });
      }
    }
    // Second pass: last completed match for teams with no upcoming
    for (let i = allMatches.length - 1; i >= 0; i--) {
      const m = allMatches[i];
      if (m.alliances.red.score < 0) continue;
      const label = matchLabel(m);
      for (const k of [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys]) {
        const num = teamKeyToNumber(k);
        if (!map.has(num)) map.set(num, { label, upcoming: false });
      }
    }
    return map;
  }, [tbaData]);

  // Teams to watch NOW — teams in the current match that are our upcoming partners/opponents
  const watchNow = useMemo(() => {
    if (!tbaData?.matches || !homeMatches.length) return [];
    const homeKey = `frc${HOME}`;
    const sorted = [...tbaData.matches].sort((a, b) => matchSortKey(a) - matchSortKey(b));

    // Current match = first unplayed
    const current = sorted.find(m => m.alliances.red.score < 0);
    if (!current) return [];

    // Teams in the current match
    const currentTeams = new Set([
      ...current.alliances.red.team_keys.map(teamKeyToNumber),
      ...current.alliances.blue.team_keys.map(teamKeyToNumber),
    ]);
    const currentRedSet = new Set(current.alliances.red.team_keys.map(teamKeyToNumber));

    // Check each upcoming home match for partners/opponents in the current match
    const results: { teamNumber: number; role: 'partner' | 'opponent'; forMatch: string; onRed: boolean }[] = [];
    const seen = new Set<number>();

    for (const hm of upcomingMatches) {
      const homeOnRed = hm.alliances.red.team_keys.includes(homeKey);
      const partnerKeys = (homeOnRed ? hm.alliances.red.team_keys : hm.alliances.blue.team_keys).filter(tk => tk !== homeKey);
      const opponentKeys = homeOnRed ? hm.alliances.blue.team_keys : hm.alliances.red.team_keys;
      const label = matchLabel(hm);

      for (const tk of partnerKeys) {
        const num = teamKeyToNumber(tk);
        if (currentTeams.has(num) && !seen.has(num)) {
          seen.add(num);
          results.push({ teamNumber: num, role: 'partner', forMatch: label, onRed: currentRedSet.has(num) });
        }
      }
      for (const tk of opponentKeys) {
        const num = teamKeyToNumber(tk);
        if (currentTeams.has(num) && !seen.has(num)) {
          seen.add(num);
          results.push({ teamNumber: num, role: 'opponent', forMatch: label, onRed: currentRedSet.has(num) });
        }
      }
    }

    return results;
  }, [tbaData, homeMatches, upcomingMatches, HOME]);

  // Current match on the field (first unplayed match = last completed + 1)
  const currentMatchLabel = useMemo(() => {
    if (!tbaData?.matches) return null;
    const sorted = [...tbaData.matches].sort((a, b) => matchSortKey(a) - matchSortKey(b));
    // First unplayed match = currently on the field or queuing
    const current = sorted.find(m => m.alliances.red.score < 0);
    if (current) return matchLabel(current);
    return null;
  }, [tbaData]);

  const SCHEDULE_PREVIEW = 5;
  const schedulePreview = useMemo(() => {
    // Show last 2 completed + next 3 upcoming, or fill from whichever side has more
    const recent = completedMatches.slice(-2);
    const upcoming = upcomingMatches.slice(0, SCHEDULE_PREVIEW - recent.length);
    const preview = [...recent, ...upcoming];
    // If still short, backfill more completed
    if (preview.length < SCHEDULE_PREVIEW && completedMatches.length > 2) {
      const extra = completedMatches.slice(-(SCHEDULE_PREVIEW - upcoming.length), -2);
      return [...extra, ...recent, ...upcoming];
    }
    return preview;
  }, [completedMatches, upcomingMatches]);
  const displayMatches = showAllMatches ? homeMatches : schedulePreview;
  const hasMoreMatches = homeMatches.length > displayMatches.length;

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
        <td className={`py-2.5 px-3 text-center font-mono ${isCompleted ? (won ? 'bg-success/5' : lost ? 'bg-danger/5' : '') : ''}`}>
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
  const card = 'bg-surface rounded-xl border border-border p-4 md:p-6 shadow-card';
  const cardHeader = 'text-sm md:text-base font-bold flex items-center gap-2 mb-3 md:mb-4';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ═══ Home Team Hero ═══ */}
      {tbaData && (
        <div className="bg-gradient-to-r from-warning/15 to-transparent rounded-xl border border-warning/20 p-4 md:p-6 shadow-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="text-4xl md:text-5xl font-black text-warning">{HOME}</div>
              <div className="flex-1">
                <h2 className="text-lg md:text-xl font-bold">Robowranglers</h2>
                <p className="text-sm text-textSecondary">{tbaData.event?.name || 'Loading...'}</p>
                {currentMatchLabel && <p className="text-xs text-textMuted">Current Match {currentMatchLabel}</p>}
              </div>
              <button
                onClick={() => fetchTBAData()}
                disabled={tbaLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surfaceElevated hover:bg-interactive rounded-lg border border-border transition-colors md:hidden"
              >
                <RefreshCw size={12} className={tbaLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex items-center gap-3 md:gap-4 divide-x divide-border">
              {[
                { label: 'Rank', value: homeRanking ? `#${homeRanking.rank}` : '--', sub: homeRanking ? `of ${tbaData.rankings?.rankings.length}` : undefined },
                { label: 'Record', value: null, sub: `${completedMatches.length} played` },
                ...(nextMatch ? [{ label: 'Next', value: getMatchLabel(nextMatch), sub: `vs ${(nextMatch.alliances.red.team_keys.includes(`frc${HOME}`) ? nextMatch.alliances.blue.team_keys : nextMatch.alliances.red.team_keys).map(k => teamKeyToNumber(k)).join(', ')}` }] : []),
              ].map(item => (
                <div key={item.label} className="text-center min-w-[50px] md:min-w-[70px] pl-3 md:pl-4 first:pl-0">
                  <p className="text-xs md:text-[10px] text-textSecondary uppercase tracking-widest">{item.label}</p>
                  {item.label === 'Record' ? (
                    <p className="text-xl md:text-2xl font-bold">
                      <span className="text-success">{homeRecord.wins}</span>
                      <span className="text-textMuted">-</span>
                      <span className="text-danger">{homeRecord.losses}</span>
                      {homeRecord.ties > 0 && <><span className="text-textMuted">-</span><span>{homeRecord.ties}</span></>}
                    </p>
                  ) : (
                    <p className="text-xl md:text-2xl font-bold">{item.value}</p>
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

      {/* Watch now banner */}
      {watchNow.length > 0 && currentMatchLabel && (
        <Link to="/schedule" className="block bg-blueAlliance/10 border border-blueAlliance/25 rounded-lg px-4 py-2.5 hover:bg-blueAlliance/15 transition-colors">
          <div className="flex items-center gap-2 text-sm">
            <Binoculars size={16} className="text-blueAlliance flex-shrink-0" />
            <span className="text-textSecondary font-medium">Match {currentMatchLabel}:</span>
            <div className="flex items-center gap-3 flex-wrap">
              {watchNow.map(tw => (
                <span key={tw.teamNumber} className="inline-flex items-center gap-1">
                  <span className={`font-bold ${tw.onRed ? 'text-redAlliance' : 'text-blueAlliance'}`}>{tw.teamNumber}</span>
                  <span className={`text-[10px] ${tw.role === 'partner' ? 'text-success' : 'text-danger'}`}>{tw.role}</span>
                  <span className="text-textMuted text-xs">for {tw.forMatch}</span>
                </span>
              ))}
            </div>
          </div>
        </Link>
      )}

      {/* Playoffs banner */}
      {inPlayoffs && (
        <Link to="/bracket" className="block bg-warning/10 border border-warning/25 rounded-lg px-4 py-2.5 hover:bg-warning/15 transition-colors">
          <div className="flex items-center gap-2 text-sm">
            <GitBranch size={16} className="text-warning flex-shrink-0" />
            <span className="font-medium text-warning">Playoffs Active</span>
            <span className="text-textSecondary">— View bracket, predictions & alliance matchups</span>
          </div>
        </Link>
      )}

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
            if (!targetMatch || !predictionInputs.length) return null;

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
              { label: 'Auto', red: red.autoHubScore + red.autoTowerScore, blue: blue.autoHubScore + blue.autoTowerScore },
              { label: 'Teleop', red: red.teleopHubScore, blue: blue.teleopHubScore },
              { label: 'Endgame', red: red.endgameTowerScore, blue: blue.endgameTowerScore },
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
                <div className="bg-surfaceElevated rounded-lg p-4 md:p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-center flex-1">
                      <p className="text-xs text-redAlliance font-semibold mb-1">Red</p>
                      <div className="flex justify-center gap-1 mb-2 flex-wrap">
                        {targetMatch.alliances.red.team_keys.map(k => {
                          const num = teamKeyToNumber(k);
                          return (
                            <Link key={k} to={`/teams/${num}`} onClick={e => e.stopPropagation()}
                              className={`text-[11px] font-bold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${num === HOME ? 'bg-redAlliance/20 text-redAlliance ring-1 ring-redAlliance/50' : 'bg-surface text-textSecondary'}`}>
                              {num}
                            </Link>
                          );
                        })}
                      </div>
                      <p className="text-3xl md:text-4xl font-black text-redAlliance">{red.totalScore.toFixed(1)}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                        red.confidence === 'high' ? 'bg-success/20 text-success' : red.confidence === 'medium' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                      }`}>{red.confidence} confidence</span>
                    </div>
                    <span className="text-textMuted text-lg font-semibold px-4">vs</span>
                    <div className="text-center flex-1">
                      <p className="text-xs text-blueAlliance font-semibold mb-1">Blue</p>
                      <div className="flex justify-center gap-1 mb-2 flex-wrap">
                        {targetMatch.alliances.blue.team_keys.map(k => {
                          const num = teamKeyToNumber(k);
                          return (
                            <Link key={k} to={`/teams/${num}`} onClick={e => e.stopPropagation()}
                              className={`text-[11px] font-bold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${num === HOME ? 'bg-blueAlliance/20 text-blueAlliance ring-1 ring-blueAlliance/50' : 'bg-surface text-textSecondary'}`}>
                              {num}
                            </Link>
                          );
                        })}
                      </div>
                      <p className="text-3xl md:text-4xl font-black text-blueAlliance">{blue.totalScore.toFixed(1)}</p>
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
                  <div className={`mt-4 bg-surfaceElevated rounded-lg p-4 text-center border-l-4 ${won ? 'border-success' : lost ? 'border-danger' : 'border-warning'}`}>
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
                      <tr className="bg-surfaceElevated text-xs uppercase tracking-wider">
                        <th className="text-left py-2.5 px-3 font-semibold text-textSecondary">Phase</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-redAlliance">Red</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-blueAlliance">Blue</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-textSecondary">Advantage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phases.map((p, index) => {
                        const diff = p.red - p.blue;
                        const advLabel = Math.abs(diff) < 0.5 ? 'Even' : `${diff > 0 ? 'Red' : 'Blue'} +${Math.abs(diff).toFixed(1)}`;
                        const advColor = Math.abs(diff) < 0.5 ? 'text-textMuted' : diff > 0 ? 'text-redAlliance' : 'text-blueAlliance';
                        const isTotal = p.label === 'TOTAL';
                        return (
                          <tr key={p.label} className={`border-t border-border/50 ${isTotal ? 'bg-surfaceElevated font-bold' : index % 2 === 1 ? 'bg-surfaceAlt/50' : ''}`}>
                            <td className="py-2 px-3 font-medium">{p.label}</td>
                            <td className="py-2 px-3 text-center text-redAlliance">{p.red.toFixed(1)}</td>
                            <td className="py-2 px-3 text-center text-blueAlliance">{p.blue.toFixed(1)}</td>
                            <td className={`py-2 px-3 text-right font-semibold ${advColor}`}>
                              {Math.abs(diff) >= 0.5 && <span className="text-[10px] mr-0.5">{diff > 0 ? '\u25B2' : '\u25BC'}</span>}
                              {advLabel}
                            </td>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                          {[
                            { label: 'Red', color: 'text-redAlliance', rp: redRP },
                            { label: 'Blue', color: 'text-blueAlliance', rp: blueRP },
                          ].map(side => (
                            <div key={side.label} className="bg-surfaceElevated rounded-lg p-3">
                              <p className={`text-xs font-semibold ${side.color} mb-2`}>{side.label} RP</p>
                              <div className="space-y-1.5 text-xs">
                                {[
                                  { label: 'Win Probability', val: `${(side.rp.winProbability * 100).toFixed(0)}%` },
                                  { label: 'Energized', val: `${(side.rp.energizedProb * 100).toFixed(0)}%` },
                                  { label: 'Traversal', val: `${(side.rp.traversalProb * 100).toFixed(0)}%` },
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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
                                      <td className="py-1 px-1 text-center">{(t.autoHubPoints + t.autoTowerPoints).toFixed(1)}</td>
                                      <td className="py-1 px-1 text-center">{t.teleopHubPoints.toFixed(1)}</td>
                                      <td className="py-1 px-1 text-center">{(t.autoTowerPoints + t.endgameTowerPoints).toFixed(1)}</td>
                                      <td className="py-1 px-1 text-center font-bold">{t.totalPoints.toFixed(1)}</td>
                                      <td className={`py-1 px-2 text-right font-medium ${t.reliability >= 0.9 ? 'text-success' : t.reliability >= 0.7 ? 'text-warning' : 'text-danger'}`}>
                                        {(t.reliability * 100).toFixed(0)}%
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

      {/* ═══ Match Schedule ═══ */}
      {tbaData && homeMatches.length > 0 && (
        <div className={card}>
          <h2 className={`${cardHeader} mb-4`}>
            <Clock className="text-warning" size={18} />
            Match Schedule
            <span className="text-xs text-textMuted font-normal ml-1">{completedMatches.length} of {homeMatches.length} played</span>
          </h2>
          <div className="overflow-x-auto -mx-4 md:-mx-6">
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
                <><ChevronUp size={14} /> Collapse</>
              ) : (
                <><ChevronDown size={14} /> Full Schedule ({homeMatches.length} matches)</>
              )}
            </button>
          )}
        </div>
      )}

      {/* ═══ 6-Card Grid: Rankings, Reliability, Leaderboards ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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
                const teamNickname = tbaData?.teams?.find(t => t.team_number === teamNum)?.nickname;
                const rp = r.sort_orders?.length > 0 ? r.sort_orders[0].toFixed(1) : '--';
                const ml = teamMatchLabel.get(teamNum);
                return (
                  <Link
                    key={r.team_key}
                    to={`/teams/${teamNum}`}
                    title={teamNickname || undefined}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isHome ? 'bg-warning/10' : 'hover:bg-surfaceElevated'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-6 text-right font-bold text-xs ${isHome ? 'text-warning' : 'text-textMuted'}`}>#{r.rank}</span>
                      <div>
                        <span className={`font-semibold text-sm ${isHome ? 'text-warning' : ''}`}>{teamNum}</span>
                        {teamNickname && <p className="text-xs text-textSecondary leading-tight">{teamNickname}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span>
                        <span className="text-success">{r.record.wins}</span>
                        <span className="text-textMuted">-</span>
                        <span className="text-danger">{r.record.losses}</span>
                      </span>
                      <span className="text-warning font-semibold">{rp} RP</span>
                      {ml && <span className={`text-right text-xs font-medium whitespace-nowrap ${ml.upcoming ? 'text-textSecondary' : 'text-textMuted'}`}>{ml.upcoming ? `Next: ${ml.label}` : ml.label}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Reliability Concerns */}
        {unreliableTeams.length > 0 && (
          <div className={`${card} !border-danger/20`}>
            <h2 className={cardHeader}>
              <WifiOff className="text-danger" size={18} />
              Reliability Concerns
              <span className="text-xs text-textMuted font-normal ml-1">{unreliableTeams.length}</span>
            </h2>
            <div className="flex items-center gap-4 mb-3 text-xs text-textMuted">
              <span className="flex items-center gap-1"><WifiOff size={10} className="text-danger" /> Disconnect</span>
              <span>No-show = absent</span>
            </div>
            <div className="space-y-1">
              {unreliableTeams.map(team => {
                const nickname = tbaData?.teams?.find(t => t.team_number === team.teamNumber)?.nickname;
                const isHome = team.teamNumber === HOME;
                const ml = teamMatchLabel.get(team.teamNumber);
                return (
                  <Link
                    key={team.teamNumber}
                    to={`/teams/${team.teamNumber}`}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${isHome ? 'bg-warning/10' : 'hover:bg-surfaceElevated'}`}
                  >
                    <div>
                      <span className={`font-semibold text-sm ${isHome ? 'text-warning' : ''}`}>{team.teamNumber}</span>
                      {nickname && <p className="text-xs text-textSecondary leading-tight">{nickname}</p>}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {team.lostConnectionRate > 15 && (
                        <span className="flex items-center gap-1 text-danger" title="Lost connection rate">
                          <WifiOff size={11} /> {team.lostConnectionRate.toFixed(0)}%
                        </span>
                      )}
                      {team.noRobotRate > 10 && (
                        <span className="text-warning" title="No robot on field">{team.noRobotRate.toFixed(0)}% no-show</span>
                      )}
                      {ml && <span className={`text-right text-xs font-medium whitespace-nowrap ${ml.upcoming ? 'text-textSecondary' : 'text-textMuted'}`}>{ml.upcoming ? `Next: ${ml.label}` : ml.label}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Scorers */}
        <div className={card}>
          <h2 className={cardHeader}>
            <Trophy className="text-warning" size={18} />
            Top Scorers
          </h2>
          <div className="space-y-1">
            {topScorers.map((team, i) => {
              const isHome = team.teamNumber === HOME;
              const ml = teamMatchLabel.get(team.teamNumber);
              return (
                <Link key={team.teamNumber} to={`/teams/${team.teamNumber}`} className={`flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors ${isHome ? 'bg-warning/10' : 'hover:bg-surfaceElevated'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-5 text-right font-mono ${rankClass(i)}`}>{i + 1}</span>
                    <div>
                      <span className={`font-semibold text-sm ${isHome ? 'text-warning' : ''}`}>{team.teamNumber}</span>
                      {nickname(team.teamNumber) && <p className="text-xs text-textSecondary leading-tight">{nickname(team.teamNumber)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-success">{team.avgTotalPoints.toFixed(1)}</span>
                    {ml && <span className={`text-right text-xs font-medium whitespace-nowrap ${ml.upcoming ? 'text-textSecondary' : 'text-textMuted'}`}>{ml.upcoming ? `Next: ${ml.label}` : ml.label}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Top Climbers */}
        <div className={card}>
          <h2 className={cardHeader}>
            <TrendingUp className="text-blueAlliance" size={18} />
            Top Endgame
          </h2>
          <div className="space-y-1">
            {topClimbers.map((team, i) => {
              const isHome = team.teamNumber === HOME;
              const ml = teamMatchLabel.get(team.teamNumber);
              return (
                <Link key={team.teamNumber} to={`/teams/${team.teamNumber}`} className={`flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors ${isHome ? 'bg-warning/10' : 'hover:bg-surfaceElevated'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-5 text-right font-mono ${rankClass(i)}`}>{i + 1}</span>
                    <div>
                      <span className={`font-semibold text-sm ${isHome ? 'text-warning' : ''}`}>{team.teamNumber}</span>
                      {nickname(team.teamNumber) && <p className="text-xs text-textSecondary leading-tight">{nickname(team.teamNumber)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-blueAlliance">{team.avgEndgamePoints.toFixed(1)} pts</span>
                    {ml && <span className={`text-right text-xs font-medium whitespace-nowrap ${ml.upcoming ? 'text-textSecondary' : 'text-textMuted'}`}>{ml.upcoming ? `Next: ${ml.label}` : ml.label}</span>}
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
            {topAuto.map((team, i) => {
              const isHome = team.teamNumber === HOME;
              const ml = teamMatchLabel.get(team.teamNumber);
              return (
                <Link key={team.teamNumber} to={`/teams/${team.teamNumber}`} className={`flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors ${isHome ? 'bg-warning/10' : 'hover:bg-surfaceElevated'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-5 text-right font-mono ${rankClass(i)}`}>{i + 1}</span>
                    <div>
                      <span className={`font-semibold text-sm ${isHome ? 'text-warning' : ''}`}>{team.teamNumber}</span>
                      {nickname(team.teamNumber) && <p className="text-xs text-textSecondary leading-tight">{nickname(team.teamNumber)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {team.autoClimbCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-success/20 text-success">Climb</span>
                    )}
                    <span className="font-bold text-sm text-redAlliance">{team.avgAutoPoints.toFixed(1)}</span>
                    {ml && <span className={`text-right text-xs font-medium whitespace-nowrap ${ml.upcoming ? 'text-textSecondary' : 'text-textMuted'}`}>{ml.upcoming ? `Next: ${ml.label}` : ml.label}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Hot Streaks */}
        {hotStreaks.length > 0 && (
          <div className={card}>
            <h2 className={cardHeader}>
              <Flame className="text-warning" size={18} />
              Hot Streaks
              <span className="text-xs text-textMuted font-normal ml-1">Last 3 vs overall</span>
            </h2>
            <div className="space-y-1">
              {hotStreaks.map((t, i) => {
                const isHome = t.teamNumber === HOME;
                const ml = teamMatchLabel.get(t.teamNumber);
                const name = nickname(t.teamNumber);
                return (
                  <Link key={t.teamNumber} to={`/teams/${t.teamNumber}`} className={`flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors ${isHome ? 'bg-warning/10' : 'hover:bg-surfaceElevated'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-5 text-right font-mono ${rankClass(i)}`}>{i + 1}</span>
                      <div>
                        <span className={`font-semibold text-sm ${isHome ? 'text-warning' : ''}`}>{t.teamNumber}</span>
                        {name && <p className="text-xs text-textSecondary leading-tight">{name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="font-bold text-sm text-success">+{t.delta.toFixed(0)}%</span>
                        <p className="text-[10px] text-textMuted">{t.overallAvg.total.toFixed(0)} → {t.last3Avg.total.toFixed(0)}</p>
                      </div>
                      {ml && <span className={`text-right text-xs font-medium whitespace-nowrap ${ml.upcoming ? 'text-textSecondary' : 'text-textMuted'}`}>{ml.upcoming ? `Next: ${ml.label}` : ml.label}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
