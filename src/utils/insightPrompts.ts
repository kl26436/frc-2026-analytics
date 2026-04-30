import type { TeamStatistics, ScoutEntry, PgTBAMatch } from '../types/scouting';
import type { TeamFuelStats } from './fuelAttribution';
import type { TeamTrend } from './trendAnalysis';
import type { PredictionTeamInput } from './predictions';
import type { TBAEventRanking } from '../types/tba';
import { simulateSnakeDraft, formatDraftResultForPrompt } from './draftSimulator';

// ── Types ────────────────────────────────────────────────────────────────────

export type InsightTemplateId =
  | 'event_overview'
  | 'pick_list_helper'
  | 'draft_simulator'
  | 'playoff_strategy'
  | 'match_preview'
  | 'data_quality_audit';

export interface InsightTemplate {
  id: InsightTemplateId;
  label: string;
  description: string;
  icon: string; // lucide icon name for reference
}

export const INSIGHT_TEMPLATES: InsightTemplate[] = [
  {
    id: 'event_overview',
    label: 'Event Overview',
    description: 'Full event analysis — top performers, RP trends, scoring distribution, reliability flags, and key takeaways.',
    icon: 'BarChart3',
  },
{
    id: 'pick_list_helper',
    label: 'Pick List Helper',
    description: 'Alliance selection strategy — tier recommendations, synergy analysis, which teams pair well together.',
    icon: 'ClipboardList',
  },
  {
    id: 'draft_simulator',
    label: 'Draft Simulator',
    description: 'Simulate alliance selection — predict all 8 alliances, best/worst case scenarios for your team, and likely declines.',
    icon: 'Dices',
  },
  {
    id: 'playoff_strategy',
    label: 'Playoff Strategy',
    description: 'Post-selection game plan — role assignments, opponent breakdowns, ball movement strategy, and how to win each round.',
    icon: 'Trophy',
  },
  {
    id: 'match_preview',
    label: 'Match Preview',
    description: 'Pre-match breakdown — alliance strengths, scoring potential, RP likelihood, key matchup factors.',
    icon: 'Swords',
  },
  {
    id: 'data_quality_audit',
    label: 'Data Quality Audit',
    description: 'Scout accuracy analysis — per-scouter consistency, common error patterns, teams needing rescouting.',
    icon: 'AlertTriangle',
  },
];

// ── Shared Context ──────────────────────────────────────────────────────────

function buildGameContext(): string {
  return `You are an FRC (FIRST Robotics Competition) analytics assistant for Team 148 Robowranglers. The 2026 game is "REBUILT."

Key game mechanics:
- **Fuel**: Balls scored into a hub. FMS tracks alliance-level totals only. We use power curve attribution (beta=0.7) to estimate per-robot scoring. Fuel scoring is BY FAR the most important factor — it drives both match wins and the Energized/Supercharged bonus RPs.
- **Endgame Climbing**: Levels 0-3 (None=0, L1=10, L2=20, L3=30 points). Per-robot data from FMS.
- **Auto Climb**: 15 points if robot climbs tower during autonomous. Very valuable — worth more than 10 fuel points and contributes to Traversal RP.
- **Ranking Points**: Win=3 RP, Energized (hub>=360 at Champs)=1 RP, Supercharged (hub>=500 at Champs)=1 RP, Traversal (tower>=50)=1 RP. Max 6 RP/match.

## Strategic Priority Order (MUST FOLLOW)
1. **Fuel scoring volume** — the #1 differentiator between good and great teams. High-volume shooters win matches. You can easily outscore any climb advantage with a few extra balls.
2. **Passing & ball movement** — REBUILT is a passing game. Great passers enable their alliance's best shooters by feeding them balls. Teams that move balls out of the opponent's zone also starve the other alliance of scoring opportunities. Passing is a force multiplier — a great passer makes the whole alliance better.
3. **Auto performance** — auto fuel + auto climbing. Strong auto creates large leads that are hard to overcome.
4. **Reliability** — disconnects, no-shows, and breakdowns are disqualifying. A reliable 30-point robot beats a flaky 50-point robot.
5. **Endgame reliability** — does the team consistently climb L1 or L2? Consistency matters more than level. L3 is a non-factor (see below).

## L3 Climbing — IRRELEVANT, DO NOT OVERWEIGHT
L3 climbing is worth only 10 more points than L2 (30 vs 20). That's equivalent to just 1-2 extra fuel balls — which any decent shooter can outscore easily. A team that shoots 5 more balls per match is worth FAR more than a team that sometimes hits L3. At most events, fewer than 5% of robots attempt L3 and even fewer do it reliably. The risk of a failed L3 attempt (scoring 0 instead of 20) far outweighs the 10-point upside. DO NOT treat L3 capability as a differentiator. Only mention L3 if a team has >50% L3 success rate AND you've already fully covered fuel scoring, passing, auto, and reliability. The real endgame differentiator is L2 vs L1 reliability, not L3.

## Passing & Ball Movement — VERY IMPORTANT
Passing is a critical and often underrated mechanic in REBUILT. Teams that can pass effectively increase their alliance's overall cycle speed and scoring volume. A great passer enables their alliance partners to score more — look at pass counts alongside scoring. High-pass teams are excellent alliance partners even if their own scoring is moderate, because they multiply the alliance's output. When evaluating teams, always consider their passing contribution.

## Output Style — IMPORTANT
- Lead with fuel scoring and passing. These are what matter.
- Do NOT waste time listing reliability percentages for every team. Most teams are 90%+ reliable — that's normal, not noteworthy. ONLY mention reliability if a team has a genuine problem (>15% disconnect rate, multiple lost connections).
- Do NOT list climb percentages for every team. Only mention climbing if it's specifically relevant (e.g., "this team can't climb at all" or discussing Traversal RP math).
- Do NOT pad your analysis with stats the reader can see in the tables. Add insight, not recitation.
- Keep it short and actionable. Strategy leads don't need a paragraph per team — they need clear rankings and key differentiators.

Be specific with team numbers. Use data to support claims. Keep analysis actionable for strategy meetings.`;
}

function formatTeamStats(stats: TeamStatistics[]): string {
  if (stats.length === 0) return 'No team statistics available.';

  const sorted = [...stats].sort((a, b) => {
    const aTotal = (a.avgAutoFuelEstimate || 0) + (a.avgTeleopFuelEstimate || 0);
    const bTotal = (b.avgAutoFuelEstimate || 0) + (b.avgTeleopFuelEstimate || 0);
    return bTotal - aTotal;
  });

  // Flag unreliable teams separately instead of cluttering the main table
  const unreliable = sorted.filter(t => t.lostConnectionRate !== undefined && t.lostConnectionRate > 0.15);

  const rows = sorted.map(t => {
    const autoFuel = t.avgAutoFuelEstimate?.toFixed(1) ?? '0';
    const teleopFuel = t.avgTeleopFuelEstimate?.toFixed(1) ?? '0';
    const avgPts = t.avgTotalPoints?.toFixed(1) ?? '?';
    return `| ${t.teamNumber} | ${t.matchesPlayed} | ${autoFuel} | ${teleopFuel} | ${avgPts} |`;
  });

  let table = `| Team | Matches | Avg Auto Fuel | Avg Teleop Fuel | Avg Pts |
|------|---------|---------------|-----------------|---------|
${rows.join('\n')}`;

  if (unreliable.length > 0) {
    table += `\n\n**Reliability Concerns** (>15% disconnect rate — most teams are fine, only these have issues):\n${unreliable.map(t => `- Team ${t.teamNumber}: ${(t.lostConnectionRate! * 100).toFixed(0)}% disconnect rate (${t.lostConnectionCount} disconnects in ${t.matchesPlayed} matches)`).join('\n')}`;
  }

  return table;
}

function formatFuelStats(fuelStats: TeamFuelStats[]): string {
  if (fuelStats.length === 0) return 'No fuel attribution data available.';

  const sorted = [...fuelStats].sort((a, b) => b.avgShotsScored - a.avgShotsScored);
  const rows = sorted.map(t => {
    const accuracy = t.totalShots > 0 ? `${((t.totalShotsScored / t.totalShots) * 100).toFixed(0)}%` : '?';
    return `| ${t.teamNumber} | ${t.matchesPlayed} | ${t.avgShotsScored.toFixed(1)} | ${t.avgAutoScored.toFixed(1)} | ${t.avgTeleopScored.toFixed(1)} | ${t.avgPasses.toFixed(1)} | ${accuracy} |`;
  });

  return `| Team | Matches | Avg Scored | Avg Auto | Avg Teleop | Avg Passes | Accuracy |
|------|---------|------------|----------|------------|------------|----------|
${rows.join('\n')}`;
}

function formatTrends(trends: TeamTrend[]): string {
  if (trends.length === 0) return 'No trend data available.';

  const rows = trends
    .filter(t => t.matchResults.length >= 3)
    .sort((a, b) => b.delta - a.delta)
    .map(t => {
      const dir = t.trend === 'improving' ? 'UP' : t.trend === 'declining' ? 'DOWN' : 'STABLE';
      return `| ${t.teamNumber} | ${t.overallAvg.total.toFixed(1)} | ${t.last3Avg.total.toFixed(1)} | ${t.delta > 0 ? '+' : ''}${t.delta.toFixed(0)}% | ${dir} |`;
    });

  return `| Team | Overall Avg | Last 3 Avg | Delta | Trend |
|------|-------------|------------|-------|-------|
${rows.join('\n')}`;
}

function formatMatchResults(matches: PgTBAMatch[]): string {
  if (matches.length === 0) return 'No match results available.';

  const sorted = [...matches].sort((a, b) => a.match_number - b.match_number);
  const rows = sorted.map(m => {
    const redHub = m.red_hubScore?.totalCount ?? '?';
    const blueHub = m.blue_hubScore?.totalCount ?? '?';
    return `| Q${m.match_number} | ${m.red_score}-${m.blue_score} | ${m.winning_alliance || 'tie'} | R:${redHub} B:${blueHub} | ${m.red_energizedAchieved ? 'R' : ''}${m.blue_energizedAchieved ? 'B' : ''} | ${m.red_traversalAchieved ? 'R' : ''}${m.blue_traversalAchieved ? 'B' : ''} |`;
  });

  return `| Match | Score | Winner | Hub Balls | Energized | Traversal |
|-------|-------|--------|-----------|-----------|-----------|
${rows.join('\n')}`;
}

// ── Prompt Builders ─────────────────────────────────────────────────────────

export function buildEventOverviewPrompt(
  teamStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
  trends: TeamTrend[],
  matches: PgTBAMatch[],
  eventCode: string,
): string {
  return `${buildGameContext()}

# Event Overview Analysis — ${eventCode}

## Team Statistics (Scout Data)
${formatTeamStats(teamStats)}

## Fuel Attribution (FMS-Calibrated Per-Robot Scoring)
${formatFuelStats(fuelStats)}

## Performance Trends (Last 3 vs Overall)
${formatTrends(trends)}

## Match Results
${formatMatchResults(matches)}

## Analysis Requested

Provide a comprehensive event overview covering:

1. **Top Performers**: Who are the best 5-8 teams overall? Rank primarily by fuel scoring volume, then passing/ball movement, then auto performance.
2. **Scoring Patterns**: What's the typical match score? How often are Energized/Supercharged/Traversal RPs being achieved?
3. **Ball Movement & Passing**: Which teams are the best passers/feeders? Who moves the most balls? Passing is a critical and often underrated skill — highlight teams that enable their alliance.
4. **Auto & Climbing**: Who auto-climbs reliably? What's the L1/L2 split? (Ignore L3 unless a team does it >50% of the time.)
5. **Hot & Cold Teams**: Who is trending up vs down based on recent matches?
6. **Reliability Concerns**: Which teams have reliability issues (disconnects, no-shows)?
7. **Key Insights**: What non-obvious patterns do you see? Which teams are the best alliance partners because they feed shooters and move balls effectively?

Be specific with team numbers. Rank teams where appropriate. Format for a strategy meeting.`;
}

export function buildTeamDeepDivePrompt(
  teamNumber: number,
  teamStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
  trends: TeamTrend[],
  entries: ScoutEntry[],
  matches: PgTBAMatch[],
): string {
  const stat = teamStats.find(t => t.teamNumber === teamNumber);
  const fuel = fuelStats.find(t => t.teamNumber === teamNumber);
  const trend = trends.find(t => t.teamNumber === teamNumber);
  const teamEntries = entries.filter(e => e.team_number === teamNumber);

  // Match-by-match breakdown
  const matchBreakdown = teamEntries
    .sort((a, b) => a.match_number - b.match_number)
    .map(e => {
      const autoFuel = (e.auton_FUEL_SCORE || 0);
      const teleopFuel = (e.teleop_FUEL_SCORE || 0);
      const autoPasses = (e.auton_FUEL_PASS || 0);
      const teleopPasses = (e.teleop_FUEL_PASS || 0);
      const notes = e.notes || '';
      return `| Q${e.match_number} | ${autoFuel} | ${teleopFuel} | ${autoPasses + teleopPasses} | ${e.climb_level} | ${e.lost_connection ? 'YES' : ''} | ${notes.slice(0, 80)} |`;
    })
    .join('\n');

  // Find matches this team played in (from TBA)
  const teamKey = `frc${teamNumber}`;
  const tbaMatches = matches.filter(m =>
    m.red_teams?.includes(teamKey) || m.blue_teams?.includes(teamKey)
  );

  return `${buildGameContext()}

# Team ${teamNumber} Deep Dive

## Scout Statistics
${stat ? `- Matches played: ${stat.matchesPlayed}
- Avg auto fuel: ${stat.avgAutoFuelEstimate?.toFixed(1)}
- Avg teleop fuel: ${stat.avgTeleopFuelEstimate?.toFixed(1)}
- Auto climb rate: ${stat.autoClimbRate !== undefined ? (stat.autoClimbRate * 100).toFixed(0) + '%' : '?'}
- L3 climb rate (low priority): ${stat.level3ClimbRate !== undefined ? (stat.level3ClimbRate * 100).toFixed(0) + '%' : '?'}
- Reliability: ${stat.lostConnectionRate !== undefined ? ((1 - stat.lostConnectionRate) * 100).toFixed(0) + '%' : '?'}
- Climb failed count: ${stat.climbFailedCount || 0}
- Lost connection count: ${stat.lostConnectionCount || 0}` : 'No statistics available.'}

## Fuel Attribution (FMS-Calibrated)
${fuel ? `- Avg balls scored/match: ${fuel.avgShotsScored.toFixed(1)}
- Avg auto scored: ${fuel.avgAutoScored.toFixed(1)}
- Avg teleop scored: ${fuel.avgTeleopScored.toFixed(1)}
- Avg passes: ${fuel.avgPasses.toFixed(1)}
- Scoring accuracy: ${fuel.totalShots > 0 ? ((fuel.totalShotsScored / fuel.totalShots) * 100).toFixed(0) + '%' : '?'}` : 'No fuel data available.'}

## Trend
${trend ? `- Overall avg total: ${trend.overallAvg.total.toFixed(1)} pts
- Last 3 avg total: ${trend.last3Avg.total.toFixed(1)} pts
- Delta: ${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(0)}%
- Classification: ${trend.trend}` : 'Not enough data for trend analysis.'}

## Match-by-Match Scout Data
| Match | Auto Fuel | Teleop Fuel | Passes | Climb | Lost Conn | Notes |
|-------|-----------|-------------|--------|-------|-----------|-------|
${matchBreakdown || 'No entries.'}

## FMS Match Results (${tbaMatches.length} matches)
${tbaMatches.map(m => {
  const isRed = m.red_teams?.includes(teamKey);
  const allianceScore = isRed ? m.red_score : m.blue_score;
  const opponentScore = isRed ? m.blue_score : m.red_score;
  const won = m.winning_alliance === (isRed ? 'red' : 'blue');
  return `- Q${m.match_number}: ${won ? 'W' : 'L'} ${allianceScore}-${opponentScore}`;
}).join('\n') || 'No TBA match data.'}

## Analysis Requested

1. **Scoring Profile**: How does this team score? High-volume shooter, passer, or balanced?
2. **Consistency**: How consistent are they match-to-match? Any outlier matches?
3. **Trend**: Are they improving, declining, or stable? What's driving the trend?
4. **Climbing**: How reliable is their climbing? What level do they typically achieve?
5. **Strengths & Weaknesses**: What should alliance partners expect from this team?
6. **Alliance Fit**: What type of alliance would this team fit best in (carry, support, specialist)?
7. **Concerns**: Any red flags (reliability, accuracy, declining performance)?`;
}

export function buildPickListHelperPrompt(
  teamStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
  trends: TeamTrend[],
  predictions: PredictionTeamInput[],
  homeTeamNumber: number,
): string {
  return `${buildGameContext()}

# Pick List Strategy Helper — Team ${homeTeamNumber}

## All Team Statistics
${formatTeamStats(teamStats)}

## Fuel Attribution Rankings
${formatFuelStats(fuelStats)}

## Performance Trends
${formatTrends(trends)}

## Home Team (${homeTeamNumber}) Profile
${(() => {
  const stat = teamStats.find(t => t.teamNumber === homeTeamNumber);
  const fuel = fuelStats.find(t => t.teamNumber === homeTeamNumber);
  if (!stat) return 'No data for home team.';
  return `- Avg auto fuel: ${stat.avgAutoFuelEstimate?.toFixed(1)}, Avg teleop fuel: ${stat.avgTeleopFuelEstimate?.toFixed(1)}
- Auto climb rate: ${stat.autoClimbRate !== undefined ? (stat.autoClimbRate * 100).toFixed(0) + '%' : '?'}
- Fuel scored/match (FMS): ${fuel?.avgShotsScored.toFixed(1) || '?'}
- Reliability: ${stat.lostConnectionRate !== undefined ? ((1 - stat.lostConnectionRate) * 100).toFixed(0) + '%' : '?'}`;
})()}

## Prediction Inputs Available
${predictions.length} teams with prediction-ready data (${predictions.filter(p => p.dataSource === 'fms').length} FMS-sourced, ${predictions.filter(p => p.dataSource === 'scout').length} scout-sourced)

## Analysis Requested

You are helping Team ${homeTeamNumber} prepare their alliance selection pick list. Provide:

1. **Tier Recommendations**: Split all teams into 4 tiers:
   - **Steak** (top 4-6 first-pick targets)
   - **Potatoes** (solid second picks, complementary partners)
   - **Chicken Nuggets** (acceptable picks if top choices taken)
   - **Do Not Pick** (teams to avoid and why)

2. **For each Steak-tier team**: Why they're top-tier, what they bring, any concerns.

3. **Synergy Analysis**: Based on Team ${homeTeamNumber}'s profile, which partners maximize:
   - Total scoring potential
   - RP probability (especially Energized and Traversal)
   - Consistency and reliability

4. **Draft Strategy**: If Team ${homeTeamNumber} is captain vs a mid-tier pick, how should strategy change?

5. **Sleeper Picks**: Any underrated teams that the data suggests are better than their ranking shows?

**Alliance Selection Format — Snake Draft (CRITICAL — understand this before making recommendations):**

FRC alliance selection uses a snake draft with 8 alliances of 3-4 robots each. The top 8 ranked teams become alliance captains (seeds 1-8).

**How it works:**
- **Round 1**: Captains pick in seed order (1→2→3→4→5→6→7→8). Each captain invites one team.
- **Round 2**: Order REVERSES (8→7→6→5→4→3→2→1). Each captain picks again.
- **Round 3** (backup robot, if needed): Order returns to 1→8.
- Any team can DECLINE an invitation (they stay in the pool for a higher-seeded captain to pick later, or become captain of a lower alliance). Teams cannot decline twice.

**Key strategic implications you MUST account for:**
- **Alliance 1** picks the best available team first, but then picks LAST in Round 2 — their second pick will be the ~16th best available robot.
- **Alliance 8** picks last in Round 1, but picks FIRST in Round 2 — they get back-to-back picks. Alliance 8 often ends up with a stronger overall trio than Alliances 4-6.
- **The "8th alliance advantage"**: Getting two consecutive picks means Alliance 8 can grab two complementary robots before anyone else picks in Round 2.
- **Captains are locked**: The 8 alliance captains cannot be picked by other alliances. So when recommending picks, exclude any team likely to be a top-8 seed (they'll be captains).
- **Declines matter**: Top teams may decline lower seeds hoping to be picked by a higher seed or to captain their own alliance.

**When making tier/pairing recommendations:**
- Consider which teams will realistically be available at each draft position
- Don't suggest pairing two teams that would both be first-round picks — only one captain gets a first-round pick
- Think about which teams complement each other (e.g., a high-volume shooter + a strong passer + a reliable climber)
- Consider whether Team ${homeTeamNumber} is likely to be a captain (picking) or a pick (being selected)

Be decisive. Give clear rankings, not hedged recommendations.`;
}

export function buildDraftSimulatorPrompt(
  teamStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
  trends: TeamTrend[],
  predictions: PredictionTeamInput[],
  homeTeamNumber: number,
  homeTeamSeed?: number,
  tbaRankings?: TBAEventRanking[],
): string {
  // ── Run algorithmic draft simulation if TBA rankings available ──
  let draftResultBlock = '';
  if (tbaRankings && tbaRankings.length > 0) {
    const draftResult = simulateSnakeDraft(
      tbaRankings, teamStats, fuelStats, predictions,
    );
    draftResultBlock = formatDraftResultForPrompt(draftResult);
  }

  // ── Build captain/pick pool tables from TBA rankings (or fallback to avgTotalPoints) ──
  let captains: TeamStatistics[];
  let pickPool: TeamStatistics[];

  if (tbaRankings && tbaRankings.length > 0) {
    // Seed from TBA rankings
    const sortedRankings = [...tbaRankings].sort((a, b) => a.rank - b.rank);
    const allianceCount = tbaRankings.length <= 24
      ? Math.max(2, Math.min(8, Math.floor((tbaRankings.length - 1 - 8) / 3)))
      : 8;
    const captainNums = new Set(
      sortedRankings.slice(0, allianceCount).map(r => parseInt(r.team_key.replace('frc', ''), 10))
    );

    captains = sortedRankings
      .slice(0, allianceCount)
      .map(r => {
        const num = parseInt(r.team_key.replace('frc', ''), 10);
        return teamStats.find(t => t.teamNumber === num);
      })
      .filter((t): t is TeamStatistics => !!t);

    // Pick pool sorted by scouting strength (not TBA rank)
    const poolTeams = teamStats.filter(t => !captainNums.has(t.teamNumber));
    pickPool = [...poolTeams].sort((a, b) => (b.avgTotalPoints || 0) - (a.avgTotalPoints || 0));
  } else {
    // Fallback: rank by avgTotalPoints
    const rankedTeams = [...teamStats].sort((a, b) => (b.avgTotalPoints || 0) - (a.avgTotalPoints || 0));
    captains = rankedTeams.slice(0, 8);
    pickPool = rankedTeams.slice(8);
  }

  const captainTable = captains.map((t, i) => {
    const fuel = fuelStats.find(f => f.teamNumber === t.teamNumber);
    const tbaRank = tbaRankings?.find(r => r.team_key === `frc${t.teamNumber}`)?.rank;
    const rankLabel = tbaRank ? `#${tbaRank}` : `Seed ${i + 1}`;
    return `| ${rankLabel} | ${t.teamNumber} | ${t.avgTotalPoints?.toFixed(1) ?? '?'} | ${t.avgAutoFuelEstimate?.toFixed(1) ?? '?'} | ${t.avgTeleopFuelEstimate?.toFixed(1) ?? '?'} | ${fuel?.avgPasses.toFixed(1) ?? '?'} |`;
  }).join('\n');

  const pickPoolTable = pickPool.map((t, i) => {
    const fuel = fuelStats.find(f => f.teamNumber === t.teamNumber);
    const trend = trends.find(tr => tr.teamNumber === t.teamNumber);
    const trendDir = trend ? (trend.trend === 'improving' ? 'UP' : trend.trend === 'declining' ? 'DOWN' : 'STABLE') : '?';
    const tbaRank = tbaRankings?.find(r => r.team_key === `frc${t.teamNumber}`)?.rank;
    const tbaCol = tbaRank ? `#${tbaRank}` : '?';
    return `| ${i + 1} | ${t.teamNumber} | ${t.avgTotalPoints?.toFixed(1) ?? '?'} | ${tbaCol} | ${t.avgAutoFuelEstimate?.toFixed(1) ?? '?'} | ${t.avgTeleopFuelEstimate?.toFixed(1) ?? '?'} | ${fuel?.avgPasses.toFixed(1) ?? '?'} | ${trendDir} |`;
  }).join('\n');

  const homeRank = tbaRankings?.find(r => r.team_key === `frc${homeTeamNumber}`)?.rank;
  const scoutRank = [...teamStats].sort((a, b) => (b.avgTotalPoints || 0) - (a.avgTotalPoints || 0))
    .findIndex(t => t.teamNumber === homeTeamNumber) + 1;
  const seedInfo = homeTeamSeed
    ? `Team ${homeTeamNumber} is seed **#${homeTeamSeed}**${homeTeamSeed <= 8 ? ' (CAPTAIN — picks in Round 1)' : ' (in the pick pool — will be selected by a captain)'}.`
    : homeRank
    ? `Team ${homeTeamNumber} is TBA rank **#${homeRank}** (scout strength rank #${scoutRank})${homeRank <= 8 ? ' — **CAPTAIN** (picks in Round 1)' : ' — in the pick pool'}.`
    : `Based on scouting data, Team ${homeTeamNumber} is ranked approximately **#${scoutRank}** out of ${teamStats.length} teams${scoutRank <= 8 ? ' (likely a CAPTAIN)' : ' (likely in the pick pool)'}.`;

  const seedingSource = tbaRankings && tbaRankings.length > 0
    ? '**Seeding is from TBA qualification rankings.** Pick pool is ranked by DW scouting strength (avgTotalPoints composite).'
    : '**WARNING: No TBA rankings available.** Seeding estimated from scouting data.';

  return `${buildGameContext()}

# Alliance Selection Draft Simulator — Team ${homeTeamNumber}

## ${seedInfo}

${seedingSource}

${draftResultBlock ? draftResultBlock + '\n\n---\n' : ''}
## CAPTAINS — These teams CANNOT be picked. They do the picking.
Seeded by TBA qualification ranking.
| TBA Rank | Team | Avg Pts (DW) | Auto Fuel | Teleop Fuel | Passes |
|----------|------|--------------|-----------|-------------|--------|
${captainTable}

## PICK POOL — Available to be picked, ranked by DW scouting strength
Captains choose from this pool. Pool Rank #1 = strongest available robot by scouting data.
| Pool Rank | Team | Avg Pts (DW) | TBA Rank | Auto Fuel | Teleop Fuel | Passes | Trend |
|-----------|------|--------------|----------|-----------|-------------|--------|-------|
${pickPoolTable}

## SNAKE DRAFT RULES (FRC Section 10.6.1)

**Round 1 — Descending (Alliance 1→${captains.length}):**
- TBA rank #1 captain picks first. Best available from the pick pool.
- Each captain picks one team in seed order.

**Round 2 — ASCENDING (Alliance ${captains.length}→1) — THE SNAKE:**
- Alliance ${captains.length} picks first (back-to-back with their Round 1 pick).
- Alliance 1 picks LAST — their 2nd pick is the ~${captains.length * 2}th best available.

**Round 3 — Backups (Alliance 1→${captains.length}):**
- Up to 8 highest-ranked unselected teams form the backup pool.

**Declines (T606):**
- A team can decline an invitation. Declined teams CANNOT be picked by anyone else and are ineligible for backup.
- Declines are most common from teams ranked 9-12 who prefer to captain a lower alliance.

## YOUR ANALYSIS

The algorithmic simulation above gives a baseline prediction. Now analyze it critically:

### 1. Do You Agree With the Simulated Draft?
Review each pick. Are there specific picks where a captain would deviate from "best available" for strategic reasons (synergy, complementary skills, passing/scoring balance)?

### 2. Decline Predictions
Which teams in the 9-12 TBA ranking range might realistically decline? What cascading effects would each decline create?

### 3. Best Case Scenario for Team ${homeTeamNumber}
Dream alliance composition. What declines or surprises make this happen?

### 4. Worst Case Scenario for Team ${homeTeamNumber}
Floor scenario. What if key targets are taken?

### 5. Scariest Opposing Alliances
Which 2-3 alliances are the biggest playoff threats based on the simulation?

### 6. Key Decision Points
Specific draft moments that change everything for Team ${homeTeamNumber}.

Be specific with team numbers. Be bold. The simulation is a starting point — challenge it where your analysis differs.`;
}

export function buildPlayoffStrategyPrompt(
  allianceTeams: number[],
  teamStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
  trends: TeamTrend[],
  _predictions: PredictionTeamInput[],
  entries: ScoutEntry[],
): string {
  const formatAllianceRobot = (num: number) => {
    const stat = teamStats.find(t => t.teamNumber === num);
    const fuel = fuelStats.find(t => t.teamNumber === num);
    const trend = trends.find(t => t.teamNumber === num);
    const teamEntries = entries.filter(e => e.team_number === num);

    const matchBreakdown = teamEntries
      .sort((a, b) => a.match_number - b.match_number)
      .map(e => {
        const autoFuel = e.auton_FUEL_SCORE || 0;
        const teleopFuel = e.teleop_FUEL_SCORE || 0;
        const autoPasses = e.auton_FUEL_PASS || 0;
        const teleopPasses = e.teleop_FUEL_PASS || 0;
        return `| Q${e.match_number} | ${autoFuel} | ${teleopFuel} | ${autoPasses + teleopPasses} | ${e.climb_level} | ${e.lost_connection ? 'YES' : ''} | ${(e.notes || '').slice(0, 60)} |`;
      })
      .join('\n');

    const hasReliabilityIssue = stat?.lostConnectionRate !== undefined && stat.lostConnectionRate > 0.15;

    return `### Team ${num}
- FMS attributed: ${fuel?.avgShotsScored.toFixed(1) ?? '?'} balls/match (Auto=${fuel?.avgAutoScored.toFixed(1) ?? '?'}, Teleop=${fuel?.avgTeleopScored.toFixed(1) ?? '?'})
- Passes: ${fuel?.avgPasses.toFixed(1) ?? '?'}/match
- Avg total pts: ${stat?.avgTotalPoints?.toFixed(1) ?? '?'}
- Trend: ${trend ? `${trend.trend} (${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(0)}%)` : '?'}${hasReliabilityIssue ? `\n- ⚠️ RELIABILITY ISSUE: ${(stat!.lostConnectionRate! * 100).toFixed(0)}% disconnect rate (${stat!.lostConnectionCount} disconnects)` : ''}

| Match | Auto Fuel | Teleop Fuel | Passes | Climb | Lost Conn | Notes |
|-------|-----------|-------------|--------|-------|-----------|-------|
${matchBreakdown || 'No entries.'}`;
  };

  // Get all other teams as potential opponents
  const opponentStats = teamStats
    .filter(t => !allianceTeams.includes(t.teamNumber))
    .sort((a, b) => {
      const aTotal = (a.avgAutoFuelEstimate || 0) + (a.avgTeleopFuelEstimate || 0);
      const bTotal = (b.avgAutoFuelEstimate || 0) + (b.avgTeleopFuelEstimate || 0);
      return bTotal - aTotal;
    });

  const opponentTable = opponentStats.map(t => {
    const fuel = fuelStats.find(f => f.teamNumber === t.teamNumber);
    return `| ${t.teamNumber} | ${t.avgTotalPoints?.toFixed(1) ?? '?'} | ${t.avgAutoFuelEstimate?.toFixed(1) ?? '?'} | ${t.avgTeleopFuelEstimate?.toFixed(1) ?? '?'} | ${fuel?.avgPasses.toFixed(1) ?? '?'} |`;
  }).join('\n');

  // Identify do-not-pick / terrible teams
  const terribleTeams = opponentStats.filter(t => {
    const totalFuel = (t.avgAutoFuelEstimate || 0) + (t.avgTeleopFuelEstimate || 0);
    return totalFuel < 3 || (t.lostConnectionRate !== undefined && t.lostConnectionRate > 0.3);
  });

  return `${buildGameContext()}

# Playoff Strategy — Alliance: ${allianceTeams.join(', ')}

## Your Alliance — Detailed Profiles

${allianceTeams.map(t => formatAllianceRobot(t)).join('\n\n')}

## All Other Teams (Potential Opponents)
| Team | Avg Pts | Auto Fuel | Teleop Fuel | Passes |
|------|---------|-----------|-------------|--------|
${opponentTable}

${terribleTeams.length > 0 ? `## Weak Teams to Watch For
These teams are significantly below average — if they're on the opposing alliance, exploit it:
${terribleTeams.map(t => `- **${t.teamNumber}**: ${(t.avgAutoFuelEstimate || 0) + (t.avgTeleopFuelEstimate || 0) < 3 ? 'barely scores' : ''}${t.lostConnectionRate !== undefined && t.lostConnectionRate > 0.3 ? ' unreliable (' + (t.lostConnectionRate * 100).toFixed(0) + '% disconnect rate)' : ''}`).join('\n')}` : ''}

## Analysis Requested

You are the strategy coach for this alliance in playoffs. Provide a complete game plan:

1. **Role Assignments**: For each robot on the alliance, assign their primary role:
   - Primary shooter (best scorer — gets fed balls)
   - Feeder/passer (moves balls to the shooter, starves opponents)
   - Flex/support (fills gaps — maybe shoots AND passes)
   - Who climbs where in endgame? Assign climb levels to maximize Traversal RP.

2. **Ball Movement Strategy**: This is critical. How should balls flow?
   - Who picks up from where?
   - Who passes to whom?
   - How do you starve the opposing alliance of balls?
   - What's the auto plan for ball positioning?

3. **Auto Period Plan**: What should each robot do in auto?
   - Auto climb priority (who goes for it, who doesn't bother?)
   - Auto fuel scoring plan
   - Starting positions

4. **Opponent Scouting — Key Threats**: Who are the scariest teams you'll likely face in playoffs?
   - Top 8-10 teams you're most worried about and why
   - How do you defend against or outscore each threat?
   - Any teams with specific weaknesses to exploit?

5. **Worst-Case Scenarios**: What happens if...
   - Your best shooter disconnects?
   - You face the #1 alliance?
   - A robot breaks down mid-match?

6. **RP Strategy**: How do you consistently get bonus RPs?
   - Energized (hub>=360 at Champs) — is your alliance capable?
   - Traversal (tower>=50) — climb assignment plan
   - When to play safe vs aggressive

Be specific, actionable, and decisive. This is for the drive team and strategy leads.`;
}

export function buildMatchPreviewPrompt(
  redTeams: number[],
  blueTeams: number[],
  teamStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
  predictions: PredictionTeamInput[],
  matchNumber?: number,
): string {
  const formatAllianceTeams = (teams: number[], color: string) => {
    return teams.map(num => {
      const stat = teamStats.find(t => t.teamNumber === num);
      const fuel = fuelStats.find(t => t.teamNumber === num);
      const pred = predictions.find(p => p.teamNumber === num);
      return `### ${color} ${num}
- Scout: Auto=${stat?.avgAutoFuelEstimate?.toFixed(1) ?? '?'}, Teleop=${stat?.avgTeleopFuelEstimate?.toFixed(1) ?? '?'}, AutoClimb=${stat?.autoClimbRate !== undefined ? (stat.autoClimbRate * 100).toFixed(0) + '%' : '?'}
- FMS attributed: ${fuel?.avgShotsScored.toFixed(1) ?? '?'} balls/match, accuracy=${fuel && fuel.totalShots > 0 ? ((fuel.totalShotsScored / fuel.totalShots) * 100).toFixed(0) + '%' : '?'}
- Reliability: ${stat?.lostConnectionRate !== undefined ? ((1 - stat.lostConnectionRate) * 100).toFixed(0) + '%' : '?'}
- Prediction input: ${pred ? `auto=${pred.avgAutoHubPoints.toFixed(1)}, teleop=${pred.avgTeleopHubPoints.toFixed(1)}, endgame=${pred.avgEndgameTowerPoints.toFixed(1)}` : 'N/A'}`;
    }).join('\n\n');
  };

  return `${buildGameContext()}

# Match Preview${matchNumber ? ` — Q${matchNumber}` : ''}

## Red Alliance
${formatAllianceTeams(redTeams, 'Red')}

## Blue Alliance
${formatAllianceTeams(blueTeams, 'Blue')}

## Analysis Requested

1. **Predicted Winner**: Which alliance is favored and by how much?
2. **Scoring Breakdown**: Expected auto, teleop, and endgame points per alliance.
3. **RP Predictions**: Likelihood of each alliance achieving Energized, Supercharged, and Traversal RPs.
4. **Key Matchup Factors**: What will decide this match? (e.g., "If Team X's passing enables Team Y to score 10+ teleop balls, Red wins")
5. **Upset Potential**: Could the underdog win? What would need to happen?`;
}

export function buildDataQualityAuditPrompt(
  entries: ScoutEntry[],
  matches: PgTBAMatch[],
  fuelStats: TeamFuelStats[],
  eventCode: string,
): string {
  // Per-scouter summary
  const scouterMap = new Map<string, { count: number; flagged: number; lostConn: number; noRobot: number }>();
  for (const e of entries) {
    const id = e.scouter_id || 'unknown';
    const prev = scouterMap.get(id) || { count: 0, flagged: 0, lostConn: 0, noRobot: 0 };
    prev.count++;
    if (e.second_review) prev.flagged++;
    if (e.lost_connection) prev.lostConn++;
    if (e.no_robot_on_field) prev.noRobot++;
    scouterMap.set(id, prev);
  }

  const scouterTable = Array.from(scouterMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, s]) => `| ${id} | ${s.count} | ${s.flagged} | ${s.lostConn} | ${s.noRobot} |`)
    .join('\n');

  // Coverage: which teams have been scouted and how many times
  const teamCoverage = new Map<number, number>();
  for (const e of entries) {
    teamCoverage.set(e.team_number, (teamCoverage.get(e.team_number) || 0) + 1);
  }

  const totalMatches = matches.length;
  const totalEntries = entries.length;
  const uniqueTeams = teamCoverage.size;

  // Accuracy summary from fuel stats
  const accuracySummary = fuelStats
    .filter(t => t.totalShots > 0)
    .sort((a, b) => (a.totalShotsScored / a.totalShots) - (b.totalShotsScored / b.totalShots))
    .slice(0, 10)
    .map(t => `| ${t.teamNumber} | ${t.matchesPlayed} | ${t.totalShots} | ${t.totalShotsScored.toFixed(0)} | ${((t.totalShotsScored / t.totalShots) * 100).toFixed(0)}% |`)
    .join('\n');

  return `${buildGameContext()}

# Data Quality Audit — ${eventCode}

## Coverage Summary
- Total TBA matches: ${totalMatches}
- Total scout entries: ${totalEntries}
- Unique teams scouted: ${uniqueTeams}
- Expected entries (3 robots x ${totalMatches} matches): ${totalMatches * 3}
- Coverage rate: ${totalMatches > 0 ? ((totalEntries / (totalMatches * 3)) * 100).toFixed(0) : 0}%

## Per-Scouter Summary
| Scouter | Entries | Flagged | Lost Conn | No Robot |
|---------|---------|---------|-----------|----------|
${scouterTable}

## Lowest Accuracy Teams (Scout Shots vs FMS Scored)
| Team | Matches | Scout Shots | FMS Attributed | Accuracy |
|------|---------|-------------|----------------|----------|
${accuracySummary || 'No fuel data.'}

## Analysis Requested

1. **Coverage Gaps**: Are there missing entries? Which matches or teams are underrepresented?
2. **Scouter Performance**: Any scouters with unusually high flag rates or inconsistencies?
3. **Accuracy Patterns**: Which teams consistently have large scout-vs-FMS discrepancies? Is it the team or the scouter?
4. **Data Reliability**: On a scale of 1-5, how trustworthy is this dataset overall?
5. **Recommendations**: Specific actions to improve data quality for remaining matches.`;
}
