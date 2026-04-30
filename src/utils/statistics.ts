import type { ScoutEntry, TeamStatistics } from '../types/scouting';
import { estimateMatchFuel, estimateMatchPoints, parseClimbLevel } from '../types/scouting';

// ── Helpers ────────────────────────────────────────────────────────────────

const avg = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

const max = (values: number[]): number => {
  if (values.length === 0) return 0;
  return Math.max(...values);
};

const sum = (values: number[]): number =>
  values.reduce((s, v) => s + v, 0);

const pct = (count: number, total: number): number => {
  if (total === 0) return 0;
  return (count / total) * 100; // 0–100 percentage
};

// ── Single Team Statistics ─────────────────────────────────────────────────

export function calculateTeamStatistics(
  teamNumber: number,
  allEntries: ScoutEntry[],
  teamName?: string
): TeamStatistics {
  const entries = allEntries.filter(e => e.team_number === teamNumber);
  const n = entries.length;

  if (n === 0) {
    return emptyStats(teamNumber, teamName);
  }

  // ── Per-match estimates ──
  const fuelPerMatch = entries.map(e => estimateMatchFuel(e));
  const pointsPerMatch = entries.map(e => estimateMatchPoints(e));

  // ══════════════════════════════════════════════════════════════════════
  // RAW COUNTS (compute these first, derive rates from them)
  // ══════════════════════════════════════════════════════════════════════

  // ── Climb counts ──
  const climbLevels = entries.map(e => parseClimbLevel(e.climb_level));
  const climbNoneCount = climbLevels.filter(l => l === 0).length;
  const level1ClimbCount = climbLevels.filter(l => l === 1).length;
  const level2ClimbCount = climbLevels.filter(l => l === 2).length;
  const level3ClimbCount = climbLevels.filter(l => l === 3).length;
  const climbFailedCount = entries.filter(e => e.teleop_climb_failed).length;

  // ── Auto counts ──
  const autoClimbCount = entries.filter(e => e.auton_AUTON_CLIMBED > 0).length;
  // auton_did_nothing in the scouting app actually means "went to mid-field"
  const autoDidNothingCount = 0; // not tracked separately
  const centerFieldAutoCount = entries.filter(e => e.auton_did_nothing).length;

  // ── Start zone counts ──
  const startZoneCounts = [1, 2, 3, 4, 5, 6].map(zone => {
    const key = `prematch_AUTON_START_ZONE_${zone}` as keyof ScoutEntry;
    return entries.filter(e => (e[key] as number) > 0).length;
  });

  // ── Flag counts ──
  const dedicatedPasserCount = entries.filter(e => e.dedicated_passer).length;
  const bulldozedFuelCount = entries.filter(e => e.eff_rep_bulldozed_fuel).length;
  const poorAccuracyCount = entries.filter(e => e.poor_fuel_scoring_accuracy).length;
  const lostConnectionCount = entries.filter(e => e.lost_connection).length;
  const noRobotCount = entries.filter(e => e.no_robot_on_field).length;
  const unreliableMatchCount = entries.filter(e => e.lost_connection || e.no_robot_on_field).length;
  const secondReviewCount = entries.filter(e => e.second_review).length;

  // ── Fuel scoring totals ──
  const totalAutoFuelScore = sum(entries.map(e => e.auton_FUEL_SCORE));
  const totalTeleopFuelScore = sum(entries.map(e => e.teleop_FUEL_SCORE));
  const totalAutoFuelPass = sum(entries.map(e => e.auton_FUEL_PASS));
  const totalTeleopFuelPass = sum(entries.map(e => e.teleop_FUEL_PASS));

  // ── Bonus bucket totals ──
  const totalAutoPlus1 = sum(entries.map(e => e.auton_SCORE_PLUS_1));
  const totalAutoPlus2 = sum(entries.map(e => e.auton_SCORE_PLUS_2));
  const totalAutoPlus3 = sum(entries.map(e => e.auton_SCORE_PLUS_3));
  const totalAutoPlus5 = sum(entries.map(e => e.auton_SCORE_PLUS_5));
  const totalAutoPlus10 = sum(entries.map(e => e.auton_SCORE_PLUS_10));
  const totalAutoPlus20 = sum(entries.map(e => e.auton_SCORE_PLUS_20));
  const totalTeleopPlus1 = sum(entries.map(e => e.teleop_SCORE_PLUS_1));
  const totalTeleopPlus2 = sum(entries.map(e => e.teleop_SCORE_PLUS_2));
  const totalTeleopPlus3 = sum(entries.map(e => e.teleop_SCORE_PLUS_3));
  const totalTeleopPlus5 = sum(entries.map(e => e.teleop_SCORE_PLUS_5));
  const totalTeleopPlus10 = sum(entries.map(e => e.teleop_SCORE_PLUS_10));
  const totalTeleopPlus20 = sum(entries.map(e => e.teleop_SCORE_PLUS_20));

  // ── Fuel estimate totals ──
  const totalAutoFuelEstimate = sum(fuelPerMatch.map(f => f.auto));
  const totalTeleopFuelEstimate = sum(fuelPerMatch.map(f => f.teleop));
  const totalTotalFuelEstimate = sum(fuelPerMatch.map(f => f.total));

  // ── Points estimate totals ──
  const totalAutoPoints = sum(pointsPerMatch.map(p => p.autoPoints));
  const totalTeleopPoints = sum(pointsPerMatch.map(p => p.teleopPoints));
  const totalEndgamePoints = sum(pointsPerMatch.map(p => p.endgamePoints));
  const totalTotalPoints = sum(pointsPerMatch.map(p => p.total));

  // ── Pass totals ──
  const totalPassPerMatch = entries.map(e => e.auton_FUEL_PASS + e.teleop_FUEL_PASS);
  const avgTotalPass = avg(totalPassPerMatch);
  const avgTotalFuelEstimate = totalTotalFuelEstimate / n;
  const passerRatio =
    avgTotalFuelEstimate + avgTotalPass > 0
      ? avgTotalPass / (avgTotalFuelEstimate + avgTotalPass)
      : 0;

  // ── Notes aggregation ──
  const notesList = entries
    .map(e => e.notes)
    .filter(n => n && n.trim().length > 0);

  // ══════════════════════════════════════════════════════════════════════
  // BUILD RESULT — raw counts + derived stats
  // ══════════════════════════════════════════════════════════════════════

  return {
    teamNumber,
    teamName,
    matchesPlayed: n,

    // ── Raw Counts ──
    climbNoneCount,
    level1ClimbCount,
    level2ClimbCount,
    level3ClimbCount,
    climbFailedCount,
    autoClimbCount,
    autoDidNothingCount,
    startZoneCounts,
    dedicatedPasserCount,
    bulldozedFuelCount,
    poorAccuracyCount,
    lostConnectionCount,
    noRobotCount,
    unreliableMatchCount,
    secondReviewCount,
    totalAutoFuelScore,
    totalTeleopFuelScore,
    totalAutoFuelPass,
    totalTeleopFuelPass,
    totalAutoPlus1,
    totalAutoPlus2,
    totalAutoPlus3,
    totalAutoPlus5,
    totalAutoPlus10,
    totalAutoPlus20,
    totalTeleopPlus1,
    totalTeleopPlus2,
    totalTeleopPlus3,
    totalTeleopPlus5,
    totalTeleopPlus10,
    totalTeleopPlus20,
    totalAutoFuelEstimate,
    totalTeleopFuelEstimate,
    totalTotalFuelEstimate,
    totalAutoPoints,
    totalTeleopPoints,
    totalEndgamePoints,
    totalTotalPoints,

    // ── Derived: Fuel Averages ──
    avgAutoFuelEstimate: totalAutoFuelEstimate / n,
    avgTeleopFuelEstimate: totalTeleopFuelEstimate / n,
    avgTotalFuelEstimate,
    maxAutoFuelEstimate: max(fuelPerMatch.map(f => f.auto)),
    maxTeleopFuelEstimate: max(fuelPerMatch.map(f => f.teleop)),
    maxTotalFuelEstimate: max(fuelPerMatch.map(f => f.total)),

    // ── Derived: Raw Fuel Averages ──
    avgAutoFuelScore: totalAutoFuelScore / n,
    avgTeleopFuelScore: totalTeleopFuelScore / n,
    avgAutoFuelPass: totalAutoFuelPass / n,
    avgTeleopFuelPass: totalTeleopFuelPass / n,

    // ── Derived: Climb Rates ──
    climbNoneRate: pct(climbNoneCount, n),
    level1ClimbRate: pct(level1ClimbCount, n),
    level2ClimbRate: pct(level2ClimbCount, n),
    level3ClimbRate: pct(level3ClimbCount, n),
    climbFailedRate: pct(climbFailedCount, n),

    // ── Derived: Auto Rates ──
    autoClimbRate: pct(autoClimbCount, n),
    autoDidNothingRate: pct(autoDidNothingCount, n),
    centerFieldAutoRate: pct(centerFieldAutoCount, n),
    centerFieldAutoCount,
    startZoneDistribution: startZoneCounts.map(c => pct(c, n)),

    // ── Derived: Flag Rates ──
    dedicatedPasserRate: pct(dedicatedPasserCount, n),
    bulldozedFuelRate: pct(bulldozedFuelCount, n),
    poorAccuracyRate: pct(poorAccuracyCount, n),
    lostConnectionRate: pct(lostConnectionCount, n),
    noRobotRate: pct(noRobotCount, n),
    overallUnreliabilityRate: pct(unreliableMatchCount, n),

    // ── Derived: Bonus Bucket Averages ──
    avgAutoPlus1: totalAutoPlus1 / n,
    avgAutoPlus2: totalAutoPlus2 / n,
    avgAutoPlus3: totalAutoPlus3 / n,
    avgAutoPlus5: totalAutoPlus5 / n,
    avgAutoPlus10: totalAutoPlus10 / n,
    avgAutoPlus20: totalAutoPlus20 / n,
    avgTeleopPlus1: totalTeleopPlus1 / n,
    avgTeleopPlus2: totalTeleopPlus2 / n,
    avgTeleopPlus3: totalTeleopPlus3 / n,
    avgTeleopPlus5: totalTeleopPlus5 / n,
    avgTeleopPlus10: totalTeleopPlus10 / n,
    avgTeleopPlus20: totalTeleopPlus20 / n,

    // ── Derived: Points Averages ──
    avgAutoPoints: totalAutoPoints / n,
    avgTeleopPoints: totalTeleopPoints / n,
    avgEndgamePoints: totalEndgamePoints / n,
    avgTotalPoints: totalTotalPoints / n,
    maxTotalPoints: max(pointsPerMatch.map(p => p.total)),

    // ── Passing ──
    avgTotalPass,
    passerRatio,

    // ── Notes ──
    notesList,
  };
}

// ── All Teams ──────────────────────────────────────────────────────────────

export function calculateAllTeamStatistics(
  entries: ScoutEntry[],
  teamNames?: Map<number, string>
): TeamStatistics[] {
  const teamNumbers = Array.from(new Set(entries.map(e => e.team_number)));
  return teamNumbers.map(num =>
    calculateTeamStatistics(num, entries, teamNames?.get(num))
  );
}

// ── Empty stats fallback ───────────────────────────────────────────────────

function emptyStats(teamNumber: number, teamName?: string): TeamStatistics {
  return {
    teamNumber,
    teamName,
    matchesPlayed: 0,

    // Raw counts
    climbNoneCount: 0,
    level1ClimbCount: 0,
    level2ClimbCount: 0,
    level3ClimbCount: 0,
    climbFailedCount: 0,
    autoClimbCount: 0,
    autoDidNothingCount: 0,
    startZoneCounts: [0, 0, 0, 0, 0, 0],
    dedicatedPasserCount: 0,
    bulldozedFuelCount: 0,
    poorAccuracyCount: 0,
    lostConnectionCount: 0,
    noRobotCount: 0,
    unreliableMatchCount: 0,
    secondReviewCount: 0,
    totalAutoFuelScore: 0,
    totalTeleopFuelScore: 0,
    totalAutoFuelPass: 0,
    totalTeleopFuelPass: 0,
    totalAutoPlus1: 0,
    totalAutoPlus2: 0,
    totalAutoPlus3: 0,
    totalAutoPlus5: 0,
    totalAutoPlus10: 0,
    totalAutoPlus20: 0,
    totalTeleopPlus1: 0,
    totalTeleopPlus2: 0,
    totalTeleopPlus3: 0,
    totalTeleopPlus5: 0,
    totalTeleopPlus10: 0,
    totalTeleopPlus20: 0,
    totalAutoFuelEstimate: 0,
    totalTeleopFuelEstimate: 0,
    totalTotalFuelEstimate: 0,
    totalAutoPoints: 0,
    totalTeleopPoints: 0,
    totalEndgamePoints: 0,
    totalTotalPoints: 0,

    // Derived
    avgAutoFuelEstimate: 0,
    avgTeleopFuelEstimate: 0,
    avgTotalFuelEstimate: 0,
    maxAutoFuelEstimate: 0,
    maxTeleopFuelEstimate: 0,
    maxTotalFuelEstimate: 0,
    avgAutoFuelScore: 0,
    avgTeleopFuelScore: 0,
    avgAutoFuelPass: 0,
    avgTeleopFuelPass: 0,
    climbNoneRate: 0,
    level1ClimbRate: 0,
    level2ClimbRate: 0,
    level3ClimbRate: 0,
    climbFailedRate: 0,
    autoClimbRate: 0,
    autoDidNothingRate: 0,
    centerFieldAutoRate: 0,
    centerFieldAutoCount: 0,
    startZoneDistribution: [0, 0, 0, 0, 0, 0],
    dedicatedPasserRate: 0,
    bulldozedFuelRate: 0,
    poorAccuracyRate: 0,
    lostConnectionRate: 0,
    noRobotRate: 0,
    overallUnreliabilityRate: 0,
    avgAutoPlus1: 0,
    avgAutoPlus2: 0,
    avgAutoPlus3: 0,
    avgAutoPlus5: 0,
    avgAutoPlus10: 0,
    avgAutoPlus20: 0,
    avgTeleopPlus1: 0,
    avgTeleopPlus2: 0,
    avgTeleopPlus3: 0,
    avgTeleopPlus5: 0,
    avgTeleopPlus10: 0,
    avgTeleopPlus20: 0,
    avgAutoPoints: 0,
    avgTeleopPoints: 0,
    avgEndgamePoints: 0,
    avgTotalPoints: 0,
    maxTotalPoints: 0,
    avgTotalPass: 0,
    passerRatio: 0,
    notesList: [],
  };
}
