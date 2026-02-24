import type { ScoutEntry, RobotActions, PgTBAMatch } from '../types/scouting';
import { computeRobotFuelFromActions, estimateMatchFuel, getAlliance } from '../types/scouting';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RobotMatchFuel {
  matchNumber: number;
  teamNumber: number;
  alliance: 'red' | 'blue';
  // From action data (or summary fallback)
  totalMoved: number;
  passes: number;
  shots: number;             // scoring attempts = totalMoved - passes
  isDedicatedPasser: boolean;
  hasActionData: boolean;
  // From FMS attribution (power curve β)
  fmsAllianceTotal: number;  // hubScore.totalCount for this alliance
  shotsScored: number;       // attributed scored balls via power curve
  scoringAccuracy: number;   // shotsScored / shots (0–1, or 0 if no shots)
}

// ── Power Curve Attribution ──────────────────────────────────────────────────

const DEFAULT_BETA = 0.7;

/**
 * Distribute fmsTotal across robots proportionally using shots^β.
 * Returns an array of attributed scored balls in the same order as `shots`.
 */
function powerCurveAttribution(
  shots: number[],
  fmsTotal: number,
  beta: number,
): number[] {
  const weights = shots.map(s => Math.pow(Math.max(s, 0), beta));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  if (totalWeight === 0) {
    // No shots tracked but FMS scored — divide equally among all robots
    const nonZero = shots.length || 1;
    return shots.map(() => fmsTotal / nonZero);
  }

  return weights.map(w => (w / totalWeight) * fmsTotal);
}

// ── Main Function ────────────────────────────────────────────────────────────

/**
 * Compute per-robot per-match fuel attribution table.
 *
 * For each robot in each match, produces:
 *   - totalMoved, passes, shots (from action data preferred, summary fallback)
 *   - shotsScored (attributed from FMS alliance total via power curve)
 *   - scoringAccuracy (shotsScored / shots)
 */
export function computeMatchFuelAttribution(
  scoutEntries: ScoutEntry[],
  scoutActions: RobotActions[],
  pgTbaMatches: PgTBAMatch[],
  beta: number = DEFAULT_BETA,
): RobotMatchFuel[] {
  // 1. Build lookups
  const actionLookup = new Map<string, RobotActions>();
  for (const a of scoutActions) {
    actionLookup.set(a.id, a); // id = "{matchNumber}_{teamNumber}"
  }

  const tbaLookup = new Map<number, PgTBAMatch>();
  for (const m of pgTbaMatches) {
    if (m.comp_level === 'qm') {
      tbaLookup.set(m.match_number, m);
    }
  }

  // 2. Compute per-robot shots/passes from action data
  interface RobotRaw {
    entry: ScoutEntry;
    totalMoved: number;
    passes: number;
    shots: number;
    isDedicatedPasser: boolean;
    hasActionData: boolean;
    alliance: 'red' | 'blue';
  }

  const robotRaws: RobotRaw[] = scoutEntries.map(entry => {
    const actionKey = `${entry.match_number}_${entry.team_number}`;
    const actions = actionLookup.get(actionKey);
    const alliance = getAlliance(entry.configured_team);
    const isDedicatedPasser = !!entry.dedicated_passer;

    let totalMoved: number;
    let passes: number;
    let shots: number;
    let hasActionData = false;

    if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
      hasActionData = true;
      const fuel = computeRobotFuelFromActions(actions);
      totalMoved = fuel.totalMoved;
      if (isDedicatedPasser) {
        // Scout flagged as passer — all fuel is passing, 0 shots
        passes = fuel.totalMoved;
        shots = 0;
      } else {
        passes = fuel.totalPasses;
        shots = fuel.totalShots;
      }
    } else {
      // Summary fallback
      const est = estimateMatchFuel(entry);
      totalMoved = est.total;
      if (isDedicatedPasser) {
        passes = est.total;
        shots = 0;
      } else {
        passes = (entry.auton_FUEL_PASS || 0) + (entry.teleop_FUEL_PASS || 0);
        shots = est.total - passes;
      }
    }

    return { entry, totalMoved, passes, shots, isDedicatedPasser, hasActionData, alliance };
  });

  // 3. Group by match + alliance
  const groupKey = (matchNum: number, alliance: string) => `${matchNum}_${alliance}`;
  const groups = new Map<string, RobotRaw[]>();
  for (const r of robotRaws) {
    const key = groupKey(r.entry.match_number, r.alliance);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // 4. Attribute FMS scored balls per alliance group
  const results: RobotMatchFuel[] = [];

  for (const [, group] of groups) {
    const matchNumber = group[0].entry.match_number;
    const alliance = group[0].alliance;
    const tbaMatch = tbaLookup.get(matchNumber);
    const hubScore = tbaMatch
      ? (alliance === 'red' ? tbaMatch.red_hubScore : tbaMatch.blue_hubScore)
      : null;
    const fmsAllianceTotal = hubScore?.totalCount ?? 0;

    // Get shots array for power curve
    const allShots = group.map(r => r.shots);
    const attributed = powerCurveAttribution(allShots, fmsAllianceTotal, beta);

    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      const shotsScored = attributed[i];
      const scoringAccuracy = r.shots > 0 ? shotsScored / r.shots : 0;

      results.push({
        matchNumber,
        teamNumber: r.entry.team_number,
        alliance,
        totalMoved: r.totalMoved,
        passes: r.passes,
        shots: r.shots,
        isDedicatedPasser: r.isDedicatedPasser,
        hasActionData: r.hasActionData,
        fmsAllianceTotal,
        shotsScored,
        scoringAccuracy,
      });
    }
  }

  // Sort by match number, then alliance, then team number
  results.sort((a, b) =>
    a.matchNumber - b.matchNumber ||
    a.alliance.localeCompare(b.alliance) ||
    a.teamNumber - b.teamNumber
  );

  return results;
}

// ── Team-Level Aggregation ──────────────────────────────────────────────────

export interface TeamFuelStats {
  teamNumber: number;
  matchesPlayed: number;
  // Totals across all matches
  totalShots: number;
  totalShotsScored: number;
  totalPasses: number;
  totalMoved: number;
  // Per-match averages
  avgShots: number;
  avgShotsScored: number;
  avgPasses: number;
  avgMoved: number;
  // Weighted accuracy: Σ(shotsScored) / Σ(shots) — not mean of per-match accuracies
  scoringAccuracy: number;
  // Role info
  dedicatedPasserMatches: number; // how many matches flagged as passer
  actionDataMatches: number;      // how many matches had action data
}

/**
 * Aggregate match-level fuel attribution into per-team stats.
 * Uses weighted accuracy (total scored / total shots) to avoid
 * low-shot matches distorting team accuracy.
 */
export function aggregateTeamFuel(matchRows: RobotMatchFuel[]): TeamFuelStats[] {
  const byTeam = new Map<number, RobotMatchFuel[]>();
  for (const row of matchRows) {
    if (!byTeam.has(row.teamNumber)) byTeam.set(row.teamNumber, []);
    byTeam.get(row.teamNumber)!.push(row);
  }

  const results: TeamFuelStats[] = [];

  for (const [teamNumber, rows] of byTeam) {
    const matchesPlayed = rows.length;
    const totalShots = rows.reduce((s, r) => s + r.shots, 0);
    const totalShotsScored = rows.reduce((s, r) => s + r.shotsScored, 0);
    const totalPasses = rows.reduce((s, r) => s + r.passes, 0);
    const totalMoved = rows.reduce((s, r) => s + r.totalMoved, 0);

    results.push({
      teamNumber,
      matchesPlayed,
      totalShots,
      totalShotsScored,
      totalPasses,
      totalMoved,
      avgShots: totalShots / matchesPlayed,
      avgShotsScored: totalShotsScored / matchesPlayed,
      avgPasses: totalPasses / matchesPlayed,
      avgMoved: totalMoved / matchesPlayed,
      scoringAccuracy: totalShots > 0 ? totalShotsScored / totalShots : 0,
      dedicatedPasserMatches: rows.filter(r => r.isDedicatedPasser).length,
      actionDataMatches: rows.filter(r => r.hasActionData).length,
    });
  }

  // Sort by avg shots scored descending
  results.sort((a, b) => b.avgShotsScored - a.avgShotsScored);

  return results;
}
