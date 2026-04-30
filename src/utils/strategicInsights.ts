import type { TeamStatistics, ScoutEntry } from '../types/scouting';
import type { TeamFuelStats } from './fuelAttribution';
import type { TeamTrend } from './trendAnalysis';

// Pure-function helpers that synthesize existing analytics into strategy-grade
// insights. No React, no Firestore, no I/O.

// ── Percentile ───────────────────────────────────────────────────────────────

/** Returns a 0-1 percentile rank of `value` within `all` (linear interpolation). */
export function percentileRank(value: number, all: number[]): number {
  if (all.length === 0) return 0.5;
  let lower = 0;
  let equal = 0;
  for (const v of all) {
    if (v < value) lower++;
    else if (v === value) equal++;
  }
  return (lower + 0.5 * equal) / all.length;
}

// ── Trait extraction ─────────────────────────────────────────────────────────

export interface CharacterizeContext {
  allStats: TeamStatistics[];
  /** Optional rate (0-1) of pre-scout matches where played_defense was true. */
  defenseRate?: number;
}

/** Convenience: compute defense rate from raw entries for a team. */
export function defenseRateForTeam(teamNumber: number, entries: ScoutEntry[]): number {
  const teamEntries = entries.filter(e => e.team_number === teamNumber);
  if (teamEntries.length === 0) return 0;
  const flagged = teamEntries.filter(e => e.played_defense === true).length;
  return flagged / teamEntries.length;
}

/**
 * Build a 2-3 trait phrase characterizing the team. Capped at ~50 chars for
 * inline use. Returns empty string if no traits qualify.
 *
 * Examples:
 *  "Aggressive scorer, weak L2 climbs, plays defense"
 *  "Reliable climber, trending up"
 *  "Unreliable, weak auto"
 */
export function characterizeTeam(
  stats: TeamStatistics,
  trend: TeamTrend | undefined,
  ctx: CharacterizeContext,
  fuelStats?: TeamFuelStats,
): string {
  void fuelStats; // reserved for future trait extraction
  const traits: string[] = [];

  // Score percentile
  const allTotalPoints = ctx.allStats.map(s => s.avgTotalPoints);
  const scorePct = percentileRank(stats.avgTotalPoints, allTotalPoints);
  if (scorePct >= 0.75) traits.push('aggressive scorer');
  else if (scorePct < 0.25) traits.push('low scorer');

  // Climb success — any successful climb (L1/L2/L3 in percent units, 0-100)
  const climbSuccessPct = stats.level1ClimbRate + stats.level2ClimbRate + stats.level3ClimbRate;
  if (climbSuccessPct >= 70) traits.push('reliable climber');
  else if (stats.matchesPlayed >= 3 && climbSuccessPct < 30) traits.push('rarely climbs');

  // Defense (only signal-rich if the caller passed pre-scout-derived rate)
  if (ctx.defenseRate != null && ctx.defenseRate > 0.3) {
    traits.push('plays defense');
  }

  // Reliability — lost-connection or no-show rates are 0-100
  const unreliable =
    stats.lostConnectionRate > 15 || stats.noRobotRate > 15;
  if (unreliable) traits.push('unreliable');

  // Trend
  if (trend && trend.matchResults.length >= 4) {
    if (trend.delta > 15) traits.push('trending up');
    else if (trend.delta < -15) traits.push('trending down');
  }

  // Auto
  const allAuto = ctx.allStats.map(s => s.avgAutoPoints);
  const autoPct = percentileRank(stats.avgAutoPoints, allAuto);
  if (autoPct >= 0.75) traits.push('strong auto');
  else if (autoPct < 0.25 && stats.matchesPlayed >= 3) traits.push('weak auto');

  // Cap at 3 traits, oxford-comma join
  return joinTraits(traits.slice(0, 3));
}

function joinTraits(traits: string[]): string {
  if (traits.length === 0) return '';
  if (traits.length === 1) return capitalize(traits[0]);
  if (traits.length === 2) return `${capitalize(traits[0])}, ${traits[1]}`;
  return `${capitalize(traits[0])}, ${traits[1]}, ${traits[2]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Opponent briefing ────────────────────────────────────────────────────────

export interface OpponentBriefing {
  headline: string;
  bullets: string[];
}

/**
 * Build a 1-line headline + per-team bullets for an opposing alliance.
 * `opponentTeams` is ordered (alliance station 1, 2, 3).
 */
export function buildOpponentBriefing(
  opponentTeams: number[],
  allStats: TeamStatistics[],
  allTrends: TeamTrend[],
): OpponentBriefing {
  const opponentStats = opponentTeams
    .map(n => allStats.find(s => s.teamNumber === n))
    .filter((s): s is TeamStatistics => !!s);

  if (opponentStats.length === 0) {
    return { headline: 'No data on opponents', bullets: [] };
  }

  // Headline: alliance-level rollup
  const avgClimbSuccess =
    opponentStats.reduce(
      (sum, s) => sum + s.level1ClimbRate + s.level2ClimbRate + s.level3ClimbRate,
      0,
    ) / opponentStats.length;
  const avgAuto =
    opponentStats.reduce((sum, s) => sum + s.avgAutoPoints, 0) / opponentStats.length;

  const allAuto = allStats.map(s => s.avgAutoPoints);
  const autoPct = percentileRank(avgAuto, allAuto);

  const tags: string[] = [];
  if (avgClimbSuccess >= 70) tags.push('climbers');
  else if (avgClimbSuccess < 30) tags.push('weak endgame');
  if (autoPct >= 0.75) tags.push('strong auto');
  else if (autoPct < 0.25) tags.push('weak auto');

  const totalAvg = opponentStats.reduce((s, t) => s + t.avgTotalPoints, 0);
  const allianceTrend =
    opponentTeams
      .map(n => allTrends.find(t => t.teamNumber === n))
      .filter((t): t is TeamTrend => !!t)
      .reduce((s, t) => s + t.delta, 0) / Math.max(1, opponentStats.length);
  if (allianceTrend > 10) tags.push('trending up');
  else if (allianceTrend < -10) tags.push('trending down');

  const tagPart = tags.length > 0 ? ` (${tags.join(', ')})` : '';
  const headline = `${totalAvg.toFixed(0)} pts/match avg${tagPart}`;

  // Bullets: one per team
  const bullets = opponentStats.map(s => {
    const trend = allTrends.find(t => t.teamNumber === s.teamNumber);
    const traits = characterizeTeam(s, trend, { allStats });
    return `${s.teamNumber} — ${traits || 'no notable traits'}`;
  });

  return { headline, bullets };
}

// ── Threat assessment ────────────────────────────────────────────────────────

export type DangerLevel = 'high' | 'medium' | 'low';

export interface Threat {
  team: number;
  metric: string;
  delta: number; // percentage points the candidate beats home by
  danger: DangerLevel;
}

/** Teams beating us at our own strengths, ranked by danger. */
export function assessThreat(
  homeStats: TeamStatistics,
  candidateStats: TeamStatistics[],
): Threat[] {
  const threats: Threat[] = [];
  const candidates = candidateStats.filter(c => c.teamNumber !== homeStats.teamNumber);

  for (const c of candidates) {
    const checks: Array<{ metric: string; home: number; them: number }> = [
      { metric: 'total points', home: homeStats.avgTotalPoints, them: c.avgTotalPoints },
      { metric: 'auto points', home: homeStats.avgAutoPoints, them: c.avgAutoPoints },
      { metric: 'endgame points', home: homeStats.avgEndgamePoints, them: c.avgEndgamePoints },
      {
        metric: 'L3 climb rate',
        home: homeStats.level3ClimbRate,
        them: c.level3ClimbRate,
      },
    ];

    for (const check of checks) {
      if (check.home <= 0) continue;
      const deltaPct = ((check.them - check.home) / check.home) * 100;
      if (deltaPct < 10) continue;
      const danger: DangerLevel = deltaPct >= 25 ? 'high' : deltaPct >= 15 ? 'medium' : 'low';
      threats.push({
        team: c.teamNumber,
        metric: check.metric,
        delta: deltaPct,
        danger,
      });
    }
  }

  // Sort by danger then delta, dedupe to top metric per team
  const dangerOrder: Record<DangerLevel, number> = { high: 3, medium: 2, low: 1 };
  threats.sort((a, b) => {
    if (dangerOrder[a.danger] !== dangerOrder[b.danger]) {
      return dangerOrder[b.danger] - dangerOrder[a.danger];
    }
    return b.delta - a.delta;
  });

  const seen = new Set<number>();
  const top: Threat[] = [];
  for (const t of threats) {
    if (seen.has(t.team)) continue;
    seen.add(t.team);
    top.push(t);
  }
  return top;
}

// ── Top movers ───────────────────────────────────────────────────────────────

export interface TopMovers {
  climbing: TeamTrend[];
  falling: TeamTrend[];
}

/** Top trend movers, filtered to teams with at least `windowMatches` matches. */
export function topMovers(trends: TeamTrend[], windowMatches: number): TopMovers {
  const eligible = trends.filter(t => t.matchResults.length >= windowMatches);
  const climbing = [...eligible].sort((a, b) => b.delta - a.delta).slice(0, 5);
  const falling = [...eligible].sort((a, b) => a.delta - b.delta).slice(0, 5);
  return { climbing, falling };
}

// ── "Watch for" list ─────────────────────────────────────────────────────────

/**
 * Up to 4 short bullets summarizing what the home team should watch for in a
 * specific upcoming match. Mixes opponent strengths with reliability flags.
 */
export function buildWatchForList(
  redTeams: number[],
  blueTeams: number[],
  allStats: TeamStatistics[],
  allTrends: TeamTrend[],
): string[] {
  const out: string[] = [];

  const allAuto = allStats.map(s => s.avgAutoPoints);
  const allTotal = allStats.map(s => s.avgTotalPoints);

  const everyTeam = [...redTeams, ...blueTeams];
  for (const teamNumber of everyTeam) {
    const stats = allStats.find(s => s.teamNumber === teamNumber);
    if (!stats || stats.matchesPlayed < 3) continue;

    // High auto threat
    const autoPct = percentileRank(stats.avgAutoPoints, allAuto);
    if (autoPct >= 0.9) {
      out.push(
        `${teamNumber}'s auto (avg ${stats.avgAutoPoints.toFixed(0)}, top ${Math.round((1 - autoPct) * 100)}%)`,
      );
    }

    // Strong climber
    const climbSuccess =
      stats.level1ClimbRate + stats.level2ClimbRate + stats.level3ClimbRate;
    if (stats.level3ClimbRate >= 60) {
      out.push(`${teamNumber} reliably hits L3 climb (${stats.level3ClimbRate.toFixed(0)}%)`);
    } else if (climbSuccess < 30) {
      out.push(`${teamNumber} rarely climbs (${climbSuccess.toFixed(0)}%)`);
    }

    // Reliability concern
    if (stats.lostConnectionRate > 15 || stats.noRobotRate > 15) {
      out.push(
        `${teamNumber} unreliable (${stats.lostConnectionRate.toFixed(0)}% drop, ${stats.noRobotRate.toFixed(0)}% no-show)`,
      );
    }

    // Trending hot
    const trend = allTrends.find(t => t.teamNumber === teamNumber);
    if (trend && trend.matchResults.length >= 4 && trend.delta > 25) {
      out.push(`${teamNumber} trending up — last 3 are ${trend.delta.toFixed(0)}% above season avg`);
    }

    // Top scorer
    const totalPct = percentileRank(stats.avgTotalPoints, allTotal);
    if (totalPct >= 0.95) {
      out.push(`${teamNumber} is top-tier scoring (${stats.avgTotalPoints.toFixed(0)} pts/match)`);
    }
  }

  // Cap at 4
  return out.slice(0, 4);
}

// ── Trend explanation ────────────────────────────────────────────────────────

export interface TrendAnalysis {
  direction: 'improving' | 'declining' | 'consistent' | 'volatile';
  magnitude: number; // percentage delta
  reasoning: string;
}

/** Richer trend chip: name a direction, magnitude, and a one-line reason. */
export function analyzeTrend(
  stats: TeamStatistics,
  trend: TeamTrend,
  recentEntries: ScoutEntry[],
): TrendAnalysis {
  const delta = trend.delta;
  const matchesAvailable = trend.matchResults.length;

  if (matchesAvailable < 3) {
    return { direction: 'consistent', magnitude: 0, reasoning: 'too few matches yet' };
  }

  // Volatility check — large swings between matches
  const totals = trend.matchResults.map(m => m.total);
  const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
  const variance =
    totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;

  if (cv > 0.5 && Math.abs(delta) < 15) {
    return {
      direction: 'volatile',
      magnitude: delta,
      reasoning: `big swings — σ/μ = ${(cv * 100).toFixed(0)}%`,
    };
  }

  if (delta > 15) {
    return {
      direction: 'improving',
      magnitude: delta,
      reasoning: `+${delta.toFixed(0)}% over last ${Math.min(3, matchesAvailable)} matches`,
    };
  }

  if (delta < -15) {
    // Try to attribute the decline to recent flags
    const last4 = recentEntries
      .filter(e => e.team_number === stats.teamNumber)
      .slice(-4);
    const dropouts = last4.filter(e => e.lost_connection || e.no_robot_on_field).length;
    if (dropouts >= 2) {
      return {
        direction: 'declining',
        magnitude: delta,
        reasoning: `lost connection or no-show ${dropouts}/${last4.length} recent`,
      };
    }
    return {
      direction: 'declining',
      magnitude: delta,
      reasoning: `${delta.toFixed(0)}% below season avg`,
    };
  }

  return {
    direction: 'consistent',
    magnitude: delta,
    reasoning: `σ/μ ${(cv * 100).toFixed(0)}%`,
  };
}
