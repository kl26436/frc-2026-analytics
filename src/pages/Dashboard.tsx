import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useWatchlistStore } from '../store/useWatchlistStore';
import { db } from '../lib/firebase';
import { Trophy, Target, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Hash, WifiOff, Clock, Flame, Binoculars } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import { computeMatchup } from '../utils/predictions';
import { matchLabel, matchSortKey } from '../utils/formatting';
import { diffSinceLastVisit, recordVisit, type VisitDiff } from '../utils/lastVisit';
import { buildOpponentBriefing } from '../utils/strategicInsights';
import type { LiveComment } from '../types/pickList';
import DataSourceToggle from '../components/DataSourceToggle';
import HomeAllianceHero from '../components/HomeAllianceHero';
import MiniBracketWidget from '../components/MiniBracketWidget';
import RecentPlayoffResults from '../components/RecentPlayoffResults';
import MatchPreviewCard from '../components/MatchPreviewCard';
import WhatChangedGreeting from '../components/dashboard/WhatChangedGreeting';
import ThreatAssessment from '../components/dashboard/ThreatAssessment';
import WatchlistCards from '../components/dashboard/WatchlistCards';
import TopMoversStrip from '../components/dashboard/TopMoversStrip';
import PicklistActivityFeed from '../components/dashboard/PicklistActivityFeed';

const OUR_TEAM = 148;
const RANKINGS_TO_SHOW = 5;

function Dashboard() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const teamTrends = useAnalyticsStore(state => state.teamTrends);
  const predictionInputs = useAnalyticsStore(state => state.predictionInputs);
  const scoutEntries = useAnalyticsStore(state => state.scoutEntries);
  const eventCode = useAnalyticsStore(state => state.eventCode);

  const homeTeamNumber = useAnalyticsStore(state => state.homeTeamNumber);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const tbaLoading = useAnalyticsStore(state => state.tbaLoading);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);

  const pinnedTeams = useWatchlistStore(s => s.pinnedTeams);

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
  const [expandedMatchKey, setExpandedMatchKey] = useState<string | null>(null);

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

  // ── Home alliance + next-match hero props (used in both modes) ──
  const homeAllianceNum = useMemo(() => {
    const alliances = tbaData?.alliances ?? [];
    for (let i = 0; i < alliances.length; i++) {
      if (alliances[i].picks.includes(`frc${HOME}`)) return i + 1;
    }
    return null;
  }, [tbaData?.alliances, HOME]);


  const rankClass = (i: number) =>
    i === 0 ? 'text-sm font-bold text-warning'
    : i <= 2 ? 'text-xs font-semibold text-textSecondary'
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
  // Returns a fragment containing the row plus an optional expansion row (briefing) for upcoming matches.
  const MatchRow = ({ match, index }: { match: typeof homeMatches[0]; index: number }) => {
    const isRed = match.alliances.red.team_keys.includes(`frc${HOME}`);
    const isCompleted = match.alliances.red.score >= 0;
    const ourScore = isRed ? match.alliances.red.score : match.alliances.blue.score;
    const theirScore = isRed ? match.alliances.blue.score : match.alliances.red.score;
    const won = ourScore > theirScore;
    const lost = ourScore < theirScore;

    const prediction = matchPredictions.get(match.key);
    const ourRP = prediction ? (isRed ? prediction.redRP : prediction.blueRP) : null;
    const expanded = expandedMatchKey === match.key;

    const oppKeys = isRed ? match.alliances.blue.team_keys : match.alliances.red.team_keys;
    const oppNums = oppKeys.map(teamKeyToNumber);
    const briefing = !isCompleted && expanded
      ? buildOpponentBriefing(oppNums, teamStatistics, teamTrends)
      : null;

    return (
      <>
        <tr
          className={`border-b border-border/50 hover:bg-surfaceElevated cursor-pointer ${!isCompleted ? 'bg-surfaceElevated/50' : index % 2 === 0 ? 'bg-surfaceAlt' : ''} ${expanded ? 'bg-surfaceElevated' : ''}`}
          onClick={() => {
            if (isCompleted) {
              navigate('/predict');
            } else {
              setExpandedMatchKey(prev => (prev === match.key ? null : match.key));
            }
          }}
        >
          <td className="py-2.5 px-4 font-bold">
            {!isCompleted && (
              <span className="inline-block mr-1 text-textMuted">{expanded ? '▾' : '▸'}</span>
            )}
            {getMatchLabel(match)}
          </td>
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
        {!isCompleted && expanded && briefing && (
          <tr className="bg-surfaceElevated">
            <td colSpan={4} className="px-4 pb-3 pt-0">
              <div className="bg-surface rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <p className="text-textSecondary">
                    <span className="text-xs text-textMuted mr-1">vs</span>
                    {oppNums.map((n, i) => (
                      <span key={n}>
                        <Link
                          to={`/teams/${n}`}
                          className="font-semibold text-blueAlliance hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {n}
                        </Link>
                        {i < oppNums.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    <span className="text-textMuted mx-2">·</span>
                    {briefing.headline}
                  </p>
                  <Link
                    to="/predict"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-blueAlliance hover:underline"
                  >
                    Open in Predict →
                  </Link>
                </div>
                {briefing.bullets.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-textMuted">
                    {briefing.bullets.map((b, i) => (
                      <li key={i}>· {b}</li>
                    ))}
                  </ul>
                )}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  };

  // ── Reliability concerns ──
  const unreliableTeams = useMemo(() =>
    teamStatistics.filter(
      t => t.matchesPlayed >= 2 && (t.lostConnectionRate > 15 || t.noRobotRate > 10)
    ).sort((a, b) => (b.lostConnectionRate + b.noRobotRate) - (a.lostConnectionRate + a.noRobotRate)),
    [teamStatistics]
  );

  // ── Live picklist comments (lightweight subscription, just for activity feed) ──
  const [picklistComments, setPicklistComments] = useState<LiveComment[]>([]);
  useEffect(() => {
    if (!eventCode) return;
    const ref = collection(db, 'pick-lists', eventCode, 'comments');
    const unsub = onSnapshot(
      ref,
      snap => {
        const items: LiveComment[] = snap.docs.map(d => {
          const data = d.data();
          const ts = data.ts;
          const iso =
            ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString()
            : typeof ts === 'string' ? ts
            : new Date().toISOString();
          return {
            id: d.id,
            teamNumber: data.teamNumber as number,
            uid: data.uid as string,
            email: data.email as string,
            displayName: data.displayName as string,
            text: data.text as string,
            ts: iso,
          };
        });
        setPicklistComments(items);
      },
      () => setPicklistComments([]),
    );
    return unsub;
  }, [eventCode]);

  // ── Visit diff: capture prev snapshot once, record current snapshot on mount ──
  const [visitDiff, setVisitDiff] = useState<VisitDiff | null>(null);
  useEffect(() => {
    if (!tbaData || !teamStatistics.length) return;
    const topByPoints = [...teamStatistics]
      .filter(t => t.avgTotalPoints > 0)
      .sort((a, b) => b.avgTotalPoints - a.avgTotalPoints)
      .slice(0, 5)
      .map(t => t.teamNumber);
    const homeRank = tbaData?.rankings?.rankings.find(r => r.team_key === `frc${HOME}`)?.rank ?? null;
    const matchesPlayedCount = (tbaData?.matches ?? []).filter(m => m.alliances.red.score >= 0).length;
    const snapshot = {
      homeRank,
      matchesPlayedCount,
      topTeamNumbers: topByPoints,
      matches: tbaData?.matches ?? [],
      homeTeamNumber: HOME,
    };
    setVisitDiff(diffSinceLastVisit(snapshot));
    recordVisit(snapshot);
    // Only run on first useful data — we want the snapshot captured once per page mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tbaData?.event?.key, teamStatistics.length]);

  const homeStats = useMemo(
    () => teamStatistics.find(t => t.teamNumber === HOME),
    [teamStatistics, HOME],
  );

  const nicknameOf = useMemo(
    () => (n: number) =>
      tbaData?.teams?.find(t => t.team_number === n)?.nickname ??
      teamStatistics.find(t => t.teamNumber === n)?.teamName ??
      undefined,
    [tbaData, teamStatistics],
  );

  // ── Shared card styles ──
  const card = 'bg-surface rounded-xl border border-border p-4 md:p-6 shadow-card';
  const cardHeader = 'text-sm md:text-base font-bold flex items-center gap-2 mb-3 md:mb-4';

  // Pick the match for the rich preview: next upcoming, or last completed if none upcoming
  const previewMatch = useMemo(() => {
    if (nextMatch) return nextMatch;
    if (completedMatches.length > 0) return completedMatches[completedMatches.length - 1];
    return null;
  }, [nextMatch, completedMatches]);
  const previewPrediction = previewMatch ? matchPredictions.get(previewMatch.key) : null;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Data source flip — visible above the hero so it's the first thing the user sees */}
      <div className="flex justify-end">
        <DataSourceToggle />
      </div>

      {/* "What changed since last visit" greeting */}
      <WhatChangedGreeting
        diff={visitDiff}
        homeTeam={HOME}
        pinnedTeams={pinnedTeams}
        nicknameOf={nicknameOf}
      />

      {/* ═══ Home Team Hero (quals-only — playoffs replaces it with HomeAllianceHero) ═══ */}
      {tbaData && !inPlayoffs && (
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

      {/* Watch now banner — quals-only signal */}
      {!inPlayoffs && watchNow.length > 0 && currentMatchLabel && (() => {
        const redTeams = watchNow.filter(tw => tw.onRed);
        const blueTeams = watchNow.filter(tw => !tw.onRed);
        return (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
              <Binoculars size={16} className="text-textSecondary flex-shrink-0" />
              <span className="text-sm font-bold">Watch {currentMatchLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 py-2">
              <div className="bg-redAlliance/5 rounded px-2 py-1.5 border-l-2 border-redAlliance/40">
                {redTeams.length > 0 ? redTeams.map(tw => (
                  <div key={tw.teamNumber} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/pit-scouting?team=${tw.teamNumber}&tab=notes`} className="font-bold font-mono text-redAlliance underline decoration-dotted">{tw.teamNumber}</Link>
                      <span className={`text-[10px] ${tw.role === 'partner' ? 'text-success' : 'text-textMuted'}`}>
                        {tw.role === 'partner' ? 'partner' : 'opp'}
                      </span>
                    </div>
                    <span className="text-[10px] text-warning font-semibold">{tw.forMatch}</span>
                  </div>
                )) : <span className="text-textMuted text-[10px]">—</span>}
              </div>
              <div className="bg-blueAlliance/5 rounded px-2 py-1.5 border-l-2 border-blueAlliance/40">
                {blueTeams.length > 0 ? blueTeams.map(tw => (
                  <div key={tw.teamNumber} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/pit-scouting?team=${tw.teamNumber}&tab=notes`} className="font-bold font-mono text-blueAlliance underline decoration-dotted">{tw.teamNumber}</Link>
                      <span className={`text-[10px] ${tw.role === 'partner' ? 'text-success' : 'text-textMuted'}`}>
                        {tw.role === 'partner' ? 'partner' : 'opp'}
                      </span>
                    </div>
                    <span className="text-[10px] text-warning font-semibold">{tw.forMatch}</span>
                  </div>
                )) : <span className="text-textMuted text-[10px]">—</span>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Playoffs Mode Body ═══ */}
      {inPlayoffs && (
        <>
          <HomeAllianceHero homeTeam={HOME} />
          {previewMatch && previewPrediction && (
            <MatchPreviewCard
              match={previewMatch}
              prediction={previewPrediction}
              homeTeam={HOME}
              matchLabel={getMatchLabel(previewMatch)}
              teamStatistics={teamStatistics}
              teamTrends={teamTrends}
              slim
            />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
            <div className="lg:col-span-3">
              <MiniBracketWidget homeTeam={HOME} />
            </div>
            <div className="lg:col-span-2">
              <RecentPlayoffResults homeTeam={HOME} homeAllianceNum={homeAllianceNum} />
            </div>
          </div>
        </>
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

      {/* ── Quals: rich match preview (replaces the slim NextMatchHero) ── */}
      {!inPlayoffs && previewMatch && previewPrediction && (
        <MatchPreviewCard
          match={previewMatch}
          prediction={previewPrediction}
          homeTeam={HOME}
          matchLabel={getMatchLabel(previewMatch)}
          teamStatistics={teamStatistics}
          teamTrends={teamTrends}
        />
      )}

      {/* ═══ Match Schedule (quals-only) ═══
          Upcoming rows expand inline to show the opponent briefing — replaces the
          standalone UpcomingOpponentsBrief card to save vertical space. */}
      {!inPlayoffs && tbaData && homeMatches.length > 0 && (
        <div className={card}>
          <h2 className={`${cardHeader} mb-2`}>
            <Clock className="text-warning" size={18} />
            Match Schedule
            <span className="text-xs text-textMuted font-normal ml-1">{completedMatches.length} of {homeMatches.length} played</span>
          </h2>
          <p className="text-xs text-textMuted mb-3">
            Tap an upcoming match to preview the opponent briefing.
          </p>
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

      {/* ── Strategist console widgets row ── */}
      {!inPlayoffs && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <ThreatAssessment
            homeStats={homeStats}
            candidateStats={teamStatistics}
            nicknameOf={nicknameOf}
          />
          <TopMoversStrip trends={teamTrends} />
        </div>
      )}

      {/* ── Watchlist cards (full width) ── */}
      {!inPlayoffs && (
        <WatchlistCards
          pinnedTeams={pinnedTeams}
          allStats={teamStatistics}
          allTrends={teamTrends}
          allMatches={tbaData?.matches ?? []}
          scoutEntries={scoutEntries}
          nicknameOf={nicknameOf}
        />
      )}

      {/* ── Picklist activity feed (only renders if recent activity) ── */}
      {!inPlayoffs && (
        <PicklistActivityFeed comments={picklistComments} />
      )}

      {/* ═══ 6-Card Grid: Rankings, Reliability, Leaderboards (quals-only) ═══ */}
      {!inPlayoffs && (
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
      )}
    </div>
  );
}

export default Dashboard;
