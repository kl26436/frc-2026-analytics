import type { TeamStatistics, ScoutEntry, PgTBAMatch } from '../types/scouting';
import type { TeamFuelStats } from './fuelAttribution';
import type { TeamTrend } from './trendAnalysis';
import type { PredictionTeamInput } from './predictions';

// ── Types ────────────────────────────────────────────────────────────────────

export type InsightTemplateId =
  | 'event_overview'
  | 'team_deep_dive'
  | 'pick_list_helper'
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
    id: 'team_deep_dive',
    label: 'Team Deep Dive',
    description: 'Detailed analysis of a specific team — scoring trends, consistency, climb reliability, strengths & weaknesses.',
    icon: 'Users',
  },
  {
    id: 'pick_list_helper',
    label: 'Pick List Helper',
    description: 'Alliance selection strategy — tier recommendations, synergy analysis, which teams pair well together.',
    icon: 'ClipboardList',
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
- **Fuel**: Balls scored into a hub. FMS tracks alliance-level totals only. We use power curve attribution (beta=0.7) to estimate per-robot scoring.
- **Tower Climbing**: Levels 0-3 (None=0, L1=10, L2=20, L3=30 points). Per-robot data from FMS.
- **Auto Climb**: 15 points if robot climbs tower during autonomous.
- **Ranking Points**: Win=3 RP, Energized (hub>=100)=1 RP, Supercharged (hub>=360)=1 RP, Traversal (tower>=50)=1 RP. Max 6 RP/match.

Be specific with team numbers. Use data to support claims. Keep analysis actionable for strategy meetings.`;
}

function formatTeamStats(stats: TeamStatistics[]): string {
  if (stats.length === 0) return 'No team statistics available.';

  const sorted = [...stats].sort((a, b) => {
    const aTotal = (a.avgAutoFuelEstimate || 0) + (a.avgTeleopFuelEstimate || 0);
    const bTotal = (b.avgAutoFuelEstimate || 0) + (b.avgTeleopFuelEstimate || 0);
    return bTotal - aTotal;
  });

  const rows = sorted.map(t => {
    const autoFuel = t.avgAutoFuelEstimate?.toFixed(1) ?? '0';
    const teleopFuel = t.avgTeleopFuelEstimate?.toFixed(1) ?? '0';
    const l3Rate = t.level3ClimbRate !== undefined ? `${(t.level3ClimbRate * 100).toFixed(0)}%` : '?';
    const autoClimb = t.autoClimbRate !== undefined ? `${(t.autoClimbRate * 100).toFixed(0)}%` : '?';
    const reliability = t.lostConnectionRate !== undefined ? `${((1 - t.lostConnectionRate) * 100).toFixed(0)}%` : '?';
    return `| ${t.teamNumber} | ${t.matchesPlayed} | ${autoFuel} | ${teleopFuel} | ${l3Rate} | ${autoClimb} | ${reliability} |`;
  });

  return `| Team | Matches | Avg Auto Fuel | Avg Teleop Fuel | L3 Climb% | Auto Climb% | Reliability |
|------|---------|---------------|-----------------|-----------|-------------|-------------|
${rows.join('\n')}`;
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

1. **Top Performers**: Who are the best 5-8 teams overall? Break down by fuel scoring, climbing, and auto.
2. **Scoring Patterns**: What's the typical match score? How often are Energized/Supercharged/Traversal RPs being achieved?
3. **Climbing Landscape**: How many teams can reliably L3? L2? Who auto-climbs?
4. **Hot & Cold Teams**: Who is trending up vs down based on recent matches?
5. **Reliability Concerns**: Which teams have reliability issues (disconnects, no-shows)?
6. **Key Insights**: What non-obvious patterns do you see? Anything that would affect pick list strategy?

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
- L3 climb rate: ${stat.level3ClimbRate !== undefined ? (stat.level3ClimbRate * 100).toFixed(0) + '%' : '?'}
- Auto climb rate: ${stat.autoClimbRate !== undefined ? (stat.autoClimbRate * 100).toFixed(0) + '%' : '?'}
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
- L3 climb rate: ${stat.level3ClimbRate !== undefined ? (stat.level3ClimbRate * 100).toFixed(0) + '%' : '?'}
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

Be decisive. Give clear rankings, not hedged recommendations.`;
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
- Scout: Auto=${stat?.avgAutoFuelEstimate?.toFixed(1) ?? '?'}, Teleop=${stat?.avgTeleopFuelEstimate?.toFixed(1) ?? '?'}, L3=${stat?.level3ClimbRate !== undefined ? (stat.level3ClimbRate * 100).toFixed(0) + '%' : '?'}
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
4. **Key Matchup Factors**: What will decide this match? (e.g., "If Team X climbs L3, Red wins")
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
