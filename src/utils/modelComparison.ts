import type { RobotMatchFuel } from './fuelAttribution';
import { powerCurveAttribution, DEFAULT_BETA } from './fuelAttribution';
import type { CrossEventPriors } from './crossEventPriors';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ModelVariant {
  id: string;        // e.g. "power_0.7", "log", "equal", "rank", "bayesian"
  label: string;     // e.g. "Power β=0.7", "Log", "Equal", "Rank", "Bayesian"
  family: 'power' | 'log' | 'equal' | 'rank' | 'bayesian';
  beta?: number;     // only for power family
  isCurrent: boolean; // true for the model currently used in production
  isActive: boolean;  // false if model can't run yet (e.g. bayesian with insufficient data)
}

export interface PerTeamModelStats {
  teamNumber: number;
  matchesPlayed: number;
  avgScoredPerMatch: number;
  totalShots: number;
  totalScored: number;
  accuracy: number;          // totalScored / totalShots (weighted)
  cv: number;                // coefficient of variation across matches
  matchScored: number[];     // per-match attributed scored (for CV calculation)
}

export interface ModelResult {
  variant: ModelVariant;
  avgCV: number;             // average CV across all teams with 2+ matches
  perTeamStats: PerTeamModelStats[];
  // Per-alliance-match: sum of |attributed - shots| for error analysis
  meanAbsError: number;      // average |shotsScored - shots| per robot
}

export interface ModelComparisonResult {
  models: ModelResult[];
  // Shared metadata
  totalMatches: number;
  totalAllianceGroups: number;
  totalRobots: number;
  actionDataPct: number;     // % of robots with action data
  flaggedPct: number;        // % of robots with quality flags
}

// ── Alliance Group (shared across models) ────────────────────────────────────

interface AllianceGroup {
  matchNumber: number;
  alliance: 'red' | 'blue';
  robots: {
    teamNumber: number;
    shots: number;
    isZeroWeight: boolean;
  }[];
  fmsTotal: number;
}

function groupByAlliance(rows: RobotMatchFuel[]): AllianceGroup[] {
  const key = (r: RobotMatchFuel) => `${r.matchNumber}_${r.alliance}`;
  const groups = new Map<string, RobotMatchFuel[]>();
  for (const row of rows) {
    if (!groups.has(key(row))) groups.set(key(row), []);
    groups.get(key(row))!.push(row);
  }

  return Array.from(groups.values()).map(robots => ({
    matchNumber: robots[0].matchNumber,
    alliance: robots[0].alliance,
    robots: robots.map(r => ({
      teamNumber: r.teamNumber,
      shots: r.shots,
      isZeroWeight: r.isZeroWeight,
    })),
    fmsTotal: robots[0].fmsAllianceTotal,
  }));
}

// ── Attribution Functions ────────────────────────────────────────────────────

/** Log curve: weight = ln(shots + 1) */
export function logCurveAttribution(shots: number[], fmsTotal: number): number[] {
  const weights = shots.map(s => Math.log(Math.max(s, 0) + 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return shots.map(() => 0);
  return weights.map(w => (w / totalWeight) * fmsTotal);
}

/** Equal distribution: fmsTotal / numActiveRobots (zero-weight robots get 0) */
export function equalAttribution(shots: number[], fmsTotal: number, isZeroWeight: boolean[]): number[] {
  const activeCount = isZeroWeight.filter(z => !z).length;
  if (activeCount === 0) return shots.map(() => 0);
  const perRobot = fmsTotal / activeCount;
  return isZeroWeight.map(z => z ? 0 : perRobot);
}

/**
 * Rank-based: allocate by ordinal shot rank.
 * Weights: 1st place = 3, 2nd = 2, 3rd = 1 (normalized).
 * Ties share the average of their rank weights.
 */
export function rankBasedAttribution(shots: number[], fmsTotal: number, isZeroWeight: boolean[]): number[] {
  // Assign rank weights: sort by shots descending, assign [3, 2, 1] for 3 robots
  const n = shots.length;
  const RANK_WEIGHTS = [3, 2, 1]; // 1st, 2nd, 3rd for 3-robot alliances

  // Create indexed array, filter out zero-weight
  const indexed = shots.map((s, i) => ({ shots: s, idx: i, isZero: isZeroWeight[i] }));
  const active = indexed.filter(x => !x.isZero).sort((a, b) => b.shots - a.shots);

  if (active.length === 0) return shots.map(() => 0);

  // Assign rank weights with tie handling
  const weights = new Array(n).fill(0);
  let rank = 0;
  let i = 0;
  while (i < active.length) {
    // Find all tied robots
    let j = i;
    while (j < active.length && active[j].shots === active[i].shots) j++;
    // Average the rank weights for tied positions
    const tiedCount = j - i;
    let avgWeight = 0;
    for (let k = i; k < j; k++) {
      avgWeight += (rank + k - i) < RANK_WEIGHTS.length ? RANK_WEIGHTS[rank + k - i] : 1;
    }
    avgWeight /= tiedCount;
    for (let k = i; k < j; k++) {
      weights[active[k].idx] = avgWeight;
    }
    rank += tiedCount;
    i = j;
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return shots.map(() => 0);
  return weights.map(w => (w / totalWeight) * fmsTotal);
}

/**
 * Bayesian: weight = shots × historicalAccuracy.
 * Falls back to power curve β=0.7 if a robot has no prior accuracy.
 * Returns null if no teams have sufficient prior data (caller should skip).
 */
export function bayesianAttribution(
  shots: number[],
  fmsTotal: number,
  priorAccuracies: (number | null)[], // null = no prior for this team
  isZeroWeight: boolean[],
): number[] | null {
  // Check if at least one team has a prior
  const hasPriors = priorAccuracies.some((a, i) => a !== null && !isZeroWeight[i]);
  if (!hasPriors) return null;

  // For teams without priors, use a default accuracy (median of those with priors)
  const validPriors = priorAccuracies.filter((a): a is number => a !== null);
  const defaultAccuracy = validPriors.length > 0
    ? validPriors.sort((a, b) => a - b)[Math.floor(validPriors.length / 2)]
    : 0.5;

  const weights = shots.map((s, i) => {
    if (isZeroWeight[i]) return 0;
    const accuracy = priorAccuracies[i] ?? defaultAccuracy;
    return Math.max(s, 0) * Math.max(accuracy, 0.01); // floor accuracy at 1% to avoid 0-weight
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return shots.map(() => 0);
  return weights.map(w => (w / totalWeight) * fmsTotal);
}

// ── Aggregation Helpers ──────────────────────────────────────────────────────

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

interface RobotAttribution {
  teamNumber: number;
  matchNumber: number;
  shots: number;
  attributed: number;
}

function aggregatePerTeam(attributions: RobotAttribution[]): PerTeamModelStats[] {
  const byTeam = new Map<number, RobotAttribution[]>();
  for (const a of attributions) {
    if (!byTeam.has(a.teamNumber)) byTeam.set(a.teamNumber, []);
    byTeam.get(a.teamNumber)!.push(a);
  }

  const results: PerTeamModelStats[] = [];
  for (const [teamNumber, rows] of byTeam) {
    const matchScored = rows.map(r => r.attributed);
    const totalShots = rows.reduce((s, r) => s + r.shots, 0);
    const totalScored = rows.reduce((s, r) => s + r.attributed, 0);
    results.push({
      teamNumber,
      matchesPlayed: rows.length,
      avgScoredPerMatch: rows.length > 0 ? totalScored / rows.length : 0,
      totalShots,
      totalScored,
      accuracy: totalShots > 0 ? totalScored / totalShots : 0,
      cv: coefficientOfVariation(matchScored),
      matchScored,
    });
  }
  return results.sort((a, b) => b.avgScoredPerMatch - a.avgScoredPerMatch);
}

// ── Main Comparison Function ─────────────────────────────────────────────────

/** Build historical accuracy priors from matches before matchNumber. */
function buildPriorAccuracies(
  allGroups: AllianceGroup[],
  currentMatchNumber: number,
  betaForPrior: number,
): Map<number, { totalShots: number; totalScored: number }> {
  const priors = new Map<number, { totalShots: number; totalScored: number }>();

  // Only use matches before the current one
  const priorGroups = allGroups.filter(g => g.matchNumber < currentMatchNumber);

  for (const group of priorGroups) {
    const shots = group.robots.map(r => r.isZeroWeight ? 0 : r.shots);
    const attributed = powerCurveAttribution(shots, group.fmsTotal, betaForPrior);

    for (let i = 0; i < group.robots.length; i++) {
      const team = group.robots[i].teamNumber;
      if (!priors.has(team)) priors.set(team, { totalShots: 0, totalScored: 0 });
      const p = priors.get(team)!;
      p.totalShots += shots[i];
      p.totalScored += attributed[i];
    }
  }

  return priors;
}

const BETA_VALUES = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const MIN_MATCHES_FOR_BAYESIAN = 3;

export function computeModelComparison(
  matchFuelAttribution: RobotMatchFuel[],
  activeModelId?: string,
  crossEventPriors?: CrossEventPriors,
): ModelComparisonResult {
  const groups = groupByAlliance(matchFuelAttribution);
  // Default to power_DEFAULT_BETA if no active model specified
  const currentId = activeModelId ?? `power_${DEFAULT_BETA}`;

  // Define all model variants
  const variants: ModelVariant[] = [
    { id: 'equal', label: 'Equal', family: 'equal', isCurrent: currentId === 'equal', isActive: true },
    { id: 'rank', label: 'Rank', family: 'rank', isCurrent: currentId === 'rank', isActive: true },
    ...BETA_VALUES.map(beta => ({
      id: `power_${beta}`,
      label: beta === 1.0 ? 'Linear (β=1.0)' : `Power β=${beta}`,
      family: 'power' as const,
      beta,
      isCurrent: currentId === `power_${beta}`,
      isActive: true,
    })),
    { id: 'log', label: 'Log', family: 'log', isCurrent: currentId === 'log', isActive: true },
    { id: 'bayesian', label: 'Bayesian', family: 'bayesian', isCurrent: currentId === 'bayesian', isActive: false },
  ];

  // Check if bayesian can run (need teams with 3+ matches)
  const matchCountByTeam = new Map<number, number>();
  for (const row of matchFuelAttribution) {
    matchCountByTeam.set(row.teamNumber, (matchCountByTeam.get(row.teamNumber) || 0) + 1);
  }
  const teamsWithEnoughData = Array.from(matchCountByTeam.values()).filter(c => c >= MIN_MATCHES_FOR_BAYESIAN).length;
  const hasCrossEventPriors = crossEventPriors && crossEventPriors.size > 0;
  const bayesianVariant = variants.find(v => v.id === 'bayesian')!;
  bayesianVariant.isActive = teamsWithEnoughData > 0 || !!hasCrossEventPriors;

  // Run each model
  const models: ModelResult[] = [];

  for (const variant of variants) {
    if (!variant.isActive) {
      // Still include in results but with empty stats
      models.push({
        variant,
        avgCV: 0,
        perTeamStats: [],
        meanAbsError: 0,
      });
      continue;
    }

    const attributions: RobotAttribution[] = [];

    for (const group of groups) {
      const shots = group.robots.map(r => r.isZeroWeight ? 0 : r.shots);
      const isZeroWeight = group.robots.map(r => r.isZeroWeight);
      let attributed: number[] | null;

      switch (variant.family) {
        case 'equal':
          attributed = equalAttribution(shots, group.fmsTotal, isZeroWeight);
          break;
        case 'rank':
          attributed = rankBasedAttribution(shots, group.fmsTotal, isZeroWeight);
          break;
        case 'power':
          attributed = powerCurveAttribution(shots, group.fmsTotal, variant.beta!);
          break;
        case 'log':
          attributed = logCurveAttribution(shots, group.fmsTotal);
          break;
        case 'bayesian': {
          const eventPriors = buildPriorAccuracies(groups, group.matchNumber, DEFAULT_BETA);
          const priorAccuracies = group.robots.map(r => {
            // Merge cross-event priors with in-event priors
            const ep = eventPriors.get(r.teamNumber);
            const xp = crossEventPriors?.get(r.teamNumber);
            const totalShots = (ep?.totalShots ?? 0) + (xp?.totalShots ?? 0);
            const totalScored = (ep?.totalScored ?? 0) + (xp?.totalScored ?? 0);
            if (totalShots < 5) return null;
            // With cross-event priors, don't require MIN_MATCHES at current event
            if (!xp) {
              const teamMatches = matchFuelAttribution.filter(
                m => m.teamNumber === r.teamNumber && m.matchNumber < group.matchNumber
              ).length;
              if (teamMatches < MIN_MATCHES_FOR_BAYESIAN) return null;
            }
            return totalScored / totalShots;
          });
          attributed = bayesianAttribution(shots, group.fmsTotal, priorAccuracies, isZeroWeight);
          if (!attributed) {
            attributed = powerCurveAttribution(shots, group.fmsTotal, DEFAULT_BETA);
          }
          break;
        }
      }

      for (let i = 0; i < group.robots.length; i++) {
        attributions.push({
          teamNumber: group.robots[i].teamNumber,
          matchNumber: group.matchNumber,
          shots: shots[i],
          attributed: attributed![i],
        });
      }
    }

    const perTeamStats = aggregatePerTeam(attributions);

    // Average CV across teams with 2+ matches
    const teamsWithMultiple = perTeamStats.filter(t => t.matchesPlayed >= 2);
    const avgCV = teamsWithMultiple.length > 0
      ? teamsWithMultiple.reduce((s, t) => s + t.cv, 0) / teamsWithMultiple.length
      : 0;

    // Mean absolute error (per robot)
    const totalAbsError = attributions.reduce((s, a) => s + Math.abs(a.attributed - a.shots), 0);
    const meanAbsError = attributions.length > 0 ? totalAbsError / attributions.length : 0;

    models.push({ variant, avgCV, perTeamStats, meanAbsError });
  }

  // Metadata
  const uniqueMatches = new Set(matchFuelAttribution.map(r => r.matchNumber));
  const actionDataCount = matchFuelAttribution.filter(r => r.hasActionData).length;
  const flaggedCount = matchFuelAttribution.filter(r => r.isZeroWeight || r.isLostConnection).length;

  return {
    models,
    totalMatches: uniqueMatches.size,
    totalAllianceGroups: groups.length,
    totalRobots: matchFuelAttribution.length,
    actionDataPct: matchFuelAttribution.length > 0 ? actionDataCount / matchFuelAttribution.length : 0,
    flaggedPct: matchFuelAttribution.length > 0 ? flaggedCount / matchFuelAttribution.length : 0,
  };
}

// ── Bayesian Active-Model Re-attribution ─────────────────────────────────────

/**
 * Re-attribute match fuel using a sequential Bayesian model.
 * Processes alliance groups in match order, building per-team accuracy priors
 * from all previously seen matches. Falls back to power curve β=DEFAULT_BETA
 * for any group where no team has enough prior data (< 5 shots).
 *
 * @param rows - Match fuel attribution from current event (first pass)
 * @param crossEventPriors - Optional pre-seeded priors from prior events.
 *   When provided, teams with prior-event history start match 1 with accuracy
 *   priors instead of falling back to power curve. This is the key improvement
 *   for multi-event scouting — returning teams get informed attribution from
 *   the very first match at a new event.
 */
export function reattributeWithBayesian(
  rows: RobotMatchFuel[],
  crossEventPriors?: CrossEventPriors,
): RobotMatchFuel[] {
  if (rows.length === 0) return rows;

  // Group by match + alliance
  const groupMap = new Map<string, RobotMatchFuel[]>();
  for (const r of rows) {
    const key = `${r.matchNumber}_${r.alliance}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(r);
  }

  // Sort groups by match number then alliance
  const sortedGroups = Array.from(groupMap.values()).sort((a, b) =>
    a[0].matchNumber - b[0].matchNumber || a[0].alliance.localeCompare(b[0].alliance)
  );

  // Running priors: team → { shots, scored }
  // Pre-seed with cross-event data if available
  const priors = new Map<number, { shots: number; scored: number }>();
  if (crossEventPriors) {
    for (const [teamNumber, prior] of crossEventPriors) {
      priors.set(teamNumber, {
        shots: prior.totalShots,
        scored: prior.totalScored,
      });
    }
  }
  const result: RobotMatchFuel[] = [];

  for (const group of sortedGroups) {
    const shots = group.map(r => r.isZeroWeight ? 0 : r.shots);
    const isZeroWeight = group.map(r => r.isZeroWeight);
    const fmsTotal = group[0].fmsAllianceTotal;

    // Build prior accuracies (null = not enough history)
    const priorAccuracies = group.map(r => {
      const p = priors.get(r.teamNumber);
      if (!p || p.shots < 5) return null;
      return p.scored / p.shots;
    });

    // Total scored balls: Bayesian or fall back to power curve
    const attributed = bayesianAttribution(shots, fmsTotal, priorAccuracies, isZeroWeight)
      ?? powerCurveAttribution(shots, fmsTotal, DEFAULT_BETA);

    // Per-phase totals reconstructed from current per-robot attribution sums
    const allianceFmsAutoScored = group.reduce((s, r) => s + r.autoScored, 0);
    const allianceFmsTeleopScored = group.reduce((s, r) => s + r.teleopScored, 0);
    const allianceFmsAutoPoints = group.reduce((s, r) => s + r.autoPointsScored, 0);
    const allianceFmsTeleopPoints = group.reduce((s, r) => s + r.teleopPointsScored, 0);

    const autoShots = group.map(r => r.isZeroWeight ? 0 : r.autoShots);
    const teleopShots = group.map(r => r.isZeroWeight ? 0 : r.teleopShots);

    const autoAttributed = bayesianAttribution(autoShots, allianceFmsAutoScored, priorAccuracies, isZeroWeight)
      ?? powerCurveAttribution(autoShots, allianceFmsAutoScored, DEFAULT_BETA);
    const teleopAttributed = bayesianAttribution(teleopShots, allianceFmsTeleopScored, priorAccuracies, isZeroWeight)
      ?? powerCurveAttribution(teleopShots, allianceFmsTeleopScored, DEFAULT_BETA);
    const autoPointsAttributed = bayesianAttribution(autoShots, allianceFmsAutoPoints, priorAccuracies, isZeroWeight)
      ?? powerCurveAttribution(autoShots, allianceFmsAutoPoints, DEFAULT_BETA);
    const teleopPointsAttributed = bayesianAttribution(teleopShots, allianceFmsTeleopPoints, priorAccuracies, isZeroWeight)
      ?? powerCurveAttribution(teleopShots, allianceFmsTeleopPoints, DEFAULT_BETA);

    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      const newScored = attributed[i];
      const newAutoPoints = autoPointsAttributed[i];
      const newTeleopPoints = teleopPointsAttributed[i];

      result.push({
        ...r,
        shotsScored: newScored,
        autoScored: autoAttributed[i],
        teleopScored: teleopAttributed[i],
        scoringAccuracy: r.shots > 0 ? newScored / r.shots : 0,
        autoPointsScored: newAutoPoints,
        teleopPointsScored: newTeleopPoints,
        totalPointsScored: newAutoPoints + newTeleopPoints,
      });

      // Update running priors for next matches
      if (!r.isZeroWeight && r.shots > 0) {
        const prior = priors.get(r.teamNumber) ?? { shots: 0, scored: 0 };
        prior.shots += r.shots;
        prior.scored += newScored;
        priors.set(r.teamNumber, prior);
      }
    }
  }

  return result.sort((a, b) =>
    a.matchNumber - b.matchNumber ||
    a.alliance.localeCompare(b.alliance) ||
    a.teamNumber - b.teamNumber
  );
}
