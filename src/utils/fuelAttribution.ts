import type { ScoutEntry, RobotActions, PgTBAMatch } from '../types/scouting';
import { computeRobotFuelFromActions, estimateMatchFuel, getAlliance } from '../types/scouting';
import { CLIMB_VALUE_MAP } from '../config/tbaFieldMap2026';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RobotMatchFuel {
  matchNumber: number;
  teamNumber: number;
  alliance: 'red' | 'blue';
  // From action data (or summary fallback)
  totalMoved: number;
  passes: number;
  shots: number;             // scoring attempts = totalMoved - passes
  autoShots: number;
  teleopShots: number;
  isDedicatedPasser: boolean;
  hasActionData: boolean;
  // Quality flags
  isNoShow: boolean;         // no_robot_on_field flag was set by scouter
  isRealNoShow: boolean;     // truly no data — no-show flag AND no fuel data
  noShowMislabeled: boolean; // no-show flag set but robot has fuel data (scouter mistake)
  isLostConnection: boolean; // lost_connection → keep pre-death data, flag for review
  isBulldozedOnly: boolean;  // eff_rep_bulldozed_fuel AND no FUEL_SCORE/FUEL_PASS actions
  isZeroWeight: boolean;     // true if excluded from power curve (real-no-show OR bulldozed-only)
  hasFuelActions: boolean;   // has at least one FUEL_SCORE or FUEL_PASS (trusted signal)
  // From FMS attribution (power curve β) — ball counts
  fmsAllianceTotal: number;  // hubScore.totalCount for this alliance
  allianceScoutShots: number; // sum of all alliance shots (for FMS/scout ratio)
  allianceUnattributed: number; // FMS balls not attributed to any robot
  shotsScored: number;       // attributed scored balls via power curve
  autoScored: number;        // attributed auto scored (proportional split of FMS autoCount)
  teleopScored: number;      // attributed teleop scored (proportional split of FMS teleopCount)
  scoringAccuracy: number;   // shotsScored / shots (0–1, or 0 if no shots)
  // From FMS attribution (power curve β) — points
  autoPointsScored: number;      // attributed from hubScore.autoPoints
  teleopPointsScored: number;    // attributed from hubScore.teleopPoints
  totalPointsScored: number;     // autoPointsScored + teleopPointsScored
  // Tower data (per-robot from FMS — no attribution needed)
  autoClimbed: boolean;          // autoTowerRobot{N} === "Level1"
  endgameClimbLevel: number;     // 0–3 from endGameTowerRobot{N}
  autoTowerPoints: number;       // 15 if autoClimbed, else 0
  endgameTowerPoints: number;    // [0, 10, 20, 30][endgameClimbLevel]
  totalTowerPoints: number;      // autoTowerPoints + endgameTowerPoints
}

// ── Power Curve Attribution ──────────────────────────────────────────────────

/**
 * Default β for power curve attribution.
 *
 * β=1.0 (linear) — distributes FMS alliance total proportionally to scout shot
 * counts. Linear is preferred because:
 *   1. FMS total constrains the sum — overestimates can't inflate totals
 *   2. Relative proportions between alliance robots are more stable than absolutes
 *   3. β<1 systematically undervalues dominant scorers by 15-25% per match
 *   4. Even with 30% scout overcount, linear error (~7%) ≈ power curve error (~7%)
 *      but without the guaranteed bias against high-volume robots
 *
 * Previously β=0.7 (chosen for lowest CV at Week 0), but this compressed top-end
 * scorers. Rankings are identical regardless of β; only magnitudes change.
 */
export const DEFAULT_BETA = 1.0;

/**
 * Distribute fmsTotal across robots proportionally using shots^β.
 * Returns an array of attributed scored balls in the same order as `shots`.
 *
 * With β=1.0 (default), this is simple proportional distribution:
 *   robotScored = (robotShots / allianceShots) × fmsAllianceTotal
 */
export function powerCurveAttribution(
  shots: number[],
  fmsTotal: number,
  beta: number = DEFAULT_BETA,
): number[] {
  const weights = shots.map(s => Math.pow(Math.max(s, 0), beta));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  if (totalWeight === 0) {
    // No shots tracked — return zeros; caller tracks FMS total as unattributed
    return shots.map(() => 0);
  }

  return weights.map(w => (w / totalWeight) * fmsTotal);
}

// ── Tower Lookup ─────────────────────────────────────────────────────────────

/** Look up per-robot FMS tower data by matching team number to robot position. */
function getTowerData(
  tbaMatch: PgTBAMatch | null,
  alliance: 'red' | 'blue',
  teamNumber: number,
): { autoClimbed: boolean; endgameClimbLevel: number } {
  if (!tbaMatch) return { autoClimbed: false, endgameClimbLevel: 0 };

  const teams = alliance === 'red' ? tbaMatch.red_teams : tbaMatch.blue_teams;
  const robotIdx = teams.findIndex(tk => tk === `frc${teamNumber}`);
  if (robotIdx < 0) return { autoClimbed: false, endgameClimbLevel: 0 };

  const autoVal = alliance === 'red'
    ? [tbaMatch.red_autoTowerRobot1, tbaMatch.red_autoTowerRobot2, tbaMatch.red_autoTowerRobot3][robotIdx]
    : [tbaMatch.blue_autoTowerRobot1, tbaMatch.blue_autoTowerRobot2, tbaMatch.blue_autoTowerRobot3][robotIdx];
  const endVal = alliance === 'red'
    ? [tbaMatch.red_endGameTowerRobot1, tbaMatch.red_endGameTowerRobot2, tbaMatch.red_endGameTowerRobot3][robotIdx]
    : [tbaMatch.blue_endGameTowerRobot1, tbaMatch.blue_endGameTowerRobot2, tbaMatch.blue_endGameTowerRobot3][robotIdx];

  return {
    autoClimbed: autoVal === 'Level1',
    endgameClimbLevel: CLIMB_VALUE_MAP[endVal ?? ''] ?? 0,
  };
}

// ── Main Function ────────────────────────────────────────────────────────────

/**
 * Compute per-robot per-match fuel attribution table.
 *
 * For each robot in each match, produces:
 *   - totalMoved, passes, shots (from action data preferred, summary fallback)
 *   - shotsScored (attributed from FMS alliance total via power curve)
 *   - autoScored, teleopScored (same curve applied to FMS auto/teleop counts)
 *   - scoringAccuracy (shotsScored / shots)
 */
/** A function that distributes fmsTotal across robots given their shots. */
export type AttributionFn = (shots: number[], fmsTotal: number) => number[];

export function computeMatchFuelAttribution(
  scoutEntries: ScoutEntry[],
  scoutActions: RobotActions[],
  pgTbaMatches: PgTBAMatch[],
  beta: number = DEFAULT_BETA,
  attributionFn?: AttributionFn,
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
    autoShots: number;
    teleopShots: number;
    isDedicatedPasser: boolean;
    hasActionData: boolean;
    hasFuelActions: boolean;
    isNoShow: boolean;
    isRealNoShow: boolean;
    noShowMislabeled: boolean;
    isLostConnection: boolean;
    isBulldozedOnly: boolean;
    isZeroWeight: boolean;
    alliance: 'red' | 'blue';
  }

  const robotRaws: RobotRaw[] = scoutEntries.map(entry => {
    const actionKey = `${entry.match_number}_${entry.team_number}`;
    const actions = actionLookup.get(actionKey);
    const alliance = getAlliance(entry.configured_team);
    const isDedicatedPasser = !!entry.dedicated_passer;
    const isNoShow = !!entry.no_robot_on_field;
    const isLostConnection = !!entry.lost_connection;

    // Check if robot has any FUEL_SCORE or FUEL_PASS actions (trusted signal)
    let hasFuelActions = false;
    let hasScoreActions = false;
    if (actions) {
      const allActions = [...actions.auto, ...actions.teleop];
      hasScoreActions = allActions.some(a => a.type === 'FUEL_SCORE');
      hasFuelActions = hasScoreActions || allActions.some(a => a.type === 'FUEL_PASS');
    }

    // Check summary-level scoring signal (FUEL_SCORE events counted by tablet)
    const hasSummaryFuel = (entry.auton_FUEL_SCORE || 0) + (entry.teleop_FUEL_SCORE || 0) +
      (entry.auton_FUEL_PASS || 0) + (entry.teleop_FUEL_PASS || 0) > 0;
    const hasSummaryScoring = (entry.auton_FUEL_SCORE || 0) + (entry.teleop_FUEL_SCORE || 0) > 0;

    // A robot has a scoring signal if there's any FUEL_SCORE in actions or summary.
    // When this is true, PASSER/BULLDOZE flags shouldn't zero out shots — the robot scores too.
    const hasScoringSignal = hasScoreActions || hasSummaryScoring;

    // Bulldozed-only = flagged as bulldozer AND has no scoring signal at all
    // (if they have FUEL_SCORE events, they score AND bulldoze — use normal shot data)
    const isBulldozedOnly = !!entry.eff_rep_bulldozed_fuel && !hasScoringSignal;

    // Dedicated passer should only zero shots if robot truly never scores
    // (if they have FUEL_SCORE events, they score AND pass — use actual shot/pass split)
    const isTrulyDedicatedPasser = isDedicatedPasser && !hasScoringSignal;

    // No-show: only trust the flag if the robot has no actual fuel data.
    // If there's fuel data despite the no-show flag, the flag is likely a scouter mistake.
    const isRealNoShow = isNoShow && !hasFuelActions && !hasSummaryFuel;
    const isZeroWeight = isRealNoShow || isBulldozedOnly;

    let totalMoved: number;
    let passes: number;
    let shots: number;
    let autoShots: number;
    let teleopShots: number;
    let hasActionData = false;

    // Only zero out if genuinely no data — if no-show flag + fuel data, compute normally
    if (isRealNoShow) {
      totalMoved = 0;
      passes = 0;
      shots = 0;
      autoShots = 0;
      teleopShots = 0;
    } else if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
      hasActionData = true;
      const fuel = computeRobotFuelFromActions(actions);
      totalMoved = fuel.totalMoved;
      if (isTrulyDedicatedPasser) {
        // Only zero shots if robot truly never scores (no FUEL_SCORE events at all)
        passes = fuel.totalMoved;
        shots = 0;
        autoShots = 0;
        teleopShots = 0;
      } else if (isBulldozedOnly) {
        // Bulldozed-only: zero shots (balls must be shot in air to score)
        passes = fuel.totalPasses;
        shots = 0;
        autoShots = 0;
        teleopShots = 0;
      } else {
        // Normal path — also handles robots flagged PASSER/BULLDOZE that have scoring data
        passes = fuel.totalPasses;
        shots = fuel.totalShots;
        autoShots = fuel.autoShots;
        teleopShots = fuel.teleopShots;
      }
    } else {
      // Summary fallback
      const est = estimateMatchFuel(entry);
      totalMoved = est.total;
      if (isTrulyDedicatedPasser) {
        passes = est.total;
        shots = 0;
        autoShots = 0;
        teleopShots = 0;
      } else if (isBulldozedOnly) {
        passes = 0;
        shots = 0;
        autoShots = 0;
        teleopShots = 0;
      } else {
        passes = (entry.auton_FUEL_PASS || 0) + (entry.teleop_FUEL_PASS || 0);
        shots = est.total - passes;
        autoShots = est.auto - (entry.auton_FUEL_PASS || 0);
        teleopShots = shots - autoShots;
      }
    }

    return {
      entry, totalMoved, passes, shots, autoShots, teleopShots,
      isDedicatedPasser, hasActionData, hasFuelActions,
      isNoShow, isRealNoShow, noShowMislabeled: isNoShow && !isRealNoShow,
      isLostConnection, isBulldozedOnly, isZeroWeight,
      alliance,
    };
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
    const fmsAutoCount = hubScore?.autoCount ?? 0;
    // teleopCount already includes endgameCount (endgame is a sub-phase of teleop)
    const fmsTeleopCount = hubScore?.teleopCount ?? 0;
    // FMS points (for point-level attribution)
    const fmsAutoPoints = hubScore?.autoPoints ?? 0;
    const fmsTeleopPoints = hubScore?.teleopPoints ?? 0;

    // Sum of all alliance shots (for FMS/scout ratio)
    const allianceScoutShots = group.reduce((s, r) => s + r.shots, 0);

    // Attribution function: use custom if provided, otherwise linear proportional (β=1.0)
    const attrib = attributionFn ?? ((s: number[], t: number) => powerCurveAttribution(s, t, beta));

    // Distribute FMS totals to individual robots
    const allShots = group.map(r => r.shots);
    const attributed = attrib(allShots, fmsAllianceTotal);

    const allAutoShots = group.map(r => r.autoShots);
    const allTeleopShots = group.map(r => r.teleopShots);
    const autoAttributed = attrib(allAutoShots, fmsAutoCount);
    const teleopAttributed = attrib(allTeleopShots, fmsTeleopCount);

    const autoPointsAttributed = attrib(allAutoShots, fmsAutoPoints);
    const teleopPointsAttributed = attrib(allTeleopShots, fmsTeleopPoints);

    // Unattributed = FMS total minus what was attributed (human player balls, etc)
    const totalAttributed = attributed.reduce((s, v) => s + v, 0);
    const allianceUnattributed = fmsAllianceTotal - totalAttributed;

    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      const shotsScored = attributed[i];
      const scoringAccuracy = r.shots > 0 ? shotsScored / r.shots : 0;
      const autoPointsScored = autoPointsAttributed[i];
      const teleopPointsScored = teleopPointsAttributed[i];

      // Tower data from FMS per-robot fields
      const tower = getTowerData(tbaMatch ?? null, alliance, r.entry.team_number);
      const autoTowerPoints = tower.autoClimbed ? 15 : 0;
      const endgameTowerPoints = [0, 10, 20, 30][tower.endgameClimbLevel] ?? 0;

      results.push({
        matchNumber,
        teamNumber: r.entry.team_number,
        alliance,
        totalMoved: r.totalMoved,
        passes: r.passes,
        shots: r.shots,
        autoShots: r.autoShots,
        teleopShots: r.teleopShots,
        isDedicatedPasser: r.isDedicatedPasser,
        hasActionData: r.hasActionData,
        isNoShow: r.isNoShow,
        isRealNoShow: r.isRealNoShow,
        noShowMislabeled: r.noShowMislabeled,
        isLostConnection: r.isLostConnection,
        isBulldozedOnly: r.isBulldozedOnly,
        isZeroWeight: r.isZeroWeight,
        hasFuelActions: r.hasFuelActions,
        fmsAllianceTotal,
        allianceScoutShots,
        allianceUnattributed,
        shotsScored,
        autoScored: autoAttributed[i],
        teleopScored: teleopAttributed[i],
        scoringAccuracy,
        autoPointsScored,
        teleopPointsScored,
        totalPointsScored: autoPointsScored + teleopPointsScored,
        autoClimbed: tower.autoClimbed,
        endgameClimbLevel: tower.endgameClimbLevel,
        autoTowerPoints,
        endgameTowerPoints,
        totalTowerPoints: autoTowerPoints + endgameTowerPoints,
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
  totalAutoScored: number;
  totalTeleopScored: number;
  totalPasses: number;
  totalMoved: number;
  // Per-match averages
  avgShots: number;
  avgShotsScored: number;
  avgAutoScored: number;
  avgTeleopScored: number;
  avgPasses: number;
  avgMoved: number;
  // Weighted accuracy: Σ(shotsScored) / Σ(shots) — not mean of per-match accuracies
  scoringAccuracy: number;
  // FMS point averages (hub fuel points attributed via power curve)
  avgAutoPointsScored: number;
  avgTeleopPointsScored: number;
  avgFuelPointsScored: number;    // auto + teleop hub points per match
  // Tower stats (from FMS per-robot data)
  autoClimbCount: number;
  autoClimbRate: number;           // 0–1 fraction
  endgameClimbCounts: [number, number, number, number]; // [none, L1, L2, L3]
  endgameClimbRates: [number, number, number, number];  // [none, L1, L2, L3] as 0–1
  avgAutoTowerPoints: number;
  avgEndgameTowerPoints: number;
  avgTowerPoints: number;
  avgTotalPointsScored: number;  // avgFuelPointsScored + avgTowerPoints (total attributed points per match)
  // Variance (standard deviations for Monte Carlo)
  stdAutoPointsScored: number;
  stdTeleopPointsScored: number;
  stdFuelPointsScored: number;
  stdAutoTowerPoints: number;
  stdEndgameTowerPoints: number;
  stdTowerPoints: number;
  // Reliability
  reliabilityRate: number;         // 1 - (noShow + lostConnection) / matchesPlayed
  // Role info
  dedicatedPasserMatches: number; // how many matches flagged as passer
  actionDataMatches: number;      // how many matches had action data
  // Quality flag counts
  noShowMatches: number;
  lostConnectionMatches: number;
  bulldozedOnlyMatches: number;
  zeroWeightMatches: number;
}

/** Population standard deviation — used as parameters for Monte Carlo simulation. Returns 0 for < 2 values. */
function populationStddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const sumSqDiff = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return Math.sqrt(sumSqDiff / values.length);
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
    const n = rows.length;
    const totalShots = rows.reduce((s, r) => s + r.shots, 0);
    const totalShotsScored = rows.reduce((s, r) => s + r.shotsScored, 0);
    const totalAutoScored = rows.reduce((s, r) => s + r.autoScored, 0);
    const totalTeleopScored = rows.reduce((s, r) => s + r.teleopScored, 0);
    const totalPasses = rows.reduce((s, r) => s + r.passes, 0);
    const totalMoved = rows.reduce((s, r) => s + r.totalMoved, 0);

    // FMS point averages
    const avgAutoPointsScored = rows.reduce((s, r) => s + r.autoPointsScored, 0) / n;
    const avgTeleopPointsScored = rows.reduce((s, r) => s + r.teleopPointsScored, 0) / n;
    const avgFuelPointsScored = avgAutoPointsScored + avgTeleopPointsScored;

    // Tower stats
    const autoClimbCount = rows.filter(r => r.autoClimbed).length;
    const endgameClimbCounts: [number, number, number, number] = [0, 0, 0, 0];
    for (const r of rows) endgameClimbCounts[r.endgameClimbLevel]++;
    const endgameClimbRates: [number, number, number, number] = [
      endgameClimbCounts[0] / n, endgameClimbCounts[1] / n,
      endgameClimbCounts[2] / n, endgameClimbCounts[3] / n,
    ];
    const avgAutoTowerPoints = rows.reduce((s, r) => s + r.autoTowerPoints, 0) / n;
    const avgEndgameTowerPoints = rows.reduce((s, r) => s + r.endgameTowerPoints, 0) / n;
    const avgTowerPoints = avgAutoTowerPoints + avgEndgameTowerPoints;

    // Variance (per-match std devs for Monte Carlo)
    const stdAutoPointsScored = populationStddev(rows.map(r => r.autoPointsScored), avgAutoPointsScored);
    const stdTeleopPointsScored = populationStddev(rows.map(r => r.teleopPointsScored), avgTeleopPointsScored);
    const stdFuelPointsScored = populationStddev(rows.map(r => r.totalPointsScored), avgFuelPointsScored);
    const stdAutoTowerPoints = populationStddev(rows.map(r => r.autoTowerPoints), avgAutoTowerPoints);
    const stdEndgameTowerPoints = populationStddev(rows.map(r => r.endgameTowerPoints), avgEndgameTowerPoints);
    const stdTowerPoints = populationStddev(rows.map(r => r.totalTowerPoints), avgTowerPoints);

    // Reliability
    const noShowMatches = rows.filter(r => r.isNoShow).length;
    const lostConnectionMatches = rows.filter(r => r.isLostConnection).length;
    // Deduplicate: a match flagged with both no-show AND lost-connection counts once
    const unreliableMatches = rows.filter(r => r.isNoShow || r.isLostConnection).length;
    const reliabilityRate = Math.max(0, 1 - unreliableMatches / n);

    results.push({
      teamNumber,
      matchesPlayed: n,
      totalShots,
      totalShotsScored,
      totalAutoScored,
      totalTeleopScored,
      totalPasses,
      totalMoved,
      avgShots: totalShots / n,
      avgShotsScored: totalShotsScored / n,
      avgAutoScored: totalAutoScored / n,
      avgTeleopScored: totalTeleopScored / n,
      avgPasses: totalPasses / n,
      avgMoved: totalMoved / n,
      scoringAccuracy: totalShots > 0 ? totalShotsScored / totalShots : 0,
      avgAutoPointsScored,
      avgTeleopPointsScored,
      avgFuelPointsScored,
      autoClimbCount,
      autoClimbRate: autoClimbCount / n,
      endgameClimbCounts,
      endgameClimbRates,
      avgAutoTowerPoints,
      avgEndgameTowerPoints,
      avgTowerPoints,
      avgTotalPointsScored: avgFuelPointsScored + avgTowerPoints,
      stdAutoPointsScored,
      stdTeleopPointsScored,
      stdFuelPointsScored,
      stdAutoTowerPoints,
      stdEndgameTowerPoints,
      stdTowerPoints,
      reliabilityRate,
      dedicatedPasserMatches: rows.filter(r => r.isDedicatedPasser).length,
      actionDataMatches: rows.filter(r => r.hasActionData).length,
      noShowMatches,
      lostConnectionMatches,
      bulldozedOnlyMatches: rows.filter(r => r.isBulldozedOnly).length,
      zeroWeightMatches: rows.filter(r => r.isZeroWeight).length,
    });
  }

  // Sort by avg shots scored descending
  results.sort((a, b) => b.avgShotsScored - a.avgShotsScored);

  return results;
}
