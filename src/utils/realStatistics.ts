import type { RealScoutEntry, RealTeamStatistics } from '../types/scoutingReal';
import { estimateMatchFuel, estimateMatchPoints, parseClimbLevel } from '../types/scoutingReal';

// ── Helpers ────────────────────────────────────────────────────────────────

const avg = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

const max = (values: number[]): number => {
  if (values.length === 0) return 0;
  return Math.max(...values);
};

const pct = (count: number, total: number): number => {
  if (total === 0) return 0;
  return (count / total) * 100; // 0–100 percentage (matches existing mock convention)
};

// ── Single Team Statistics ─────────────────────────────────────────────────

export function calculateRealTeamStatistics(
  teamNumber: number,
  allEntries: RealScoutEntry[],
  teamName?: string
): RealTeamStatistics {
  const entries = allEntries.filter(e => e.team_number === teamNumber);
  const n = entries.length;

  if (n === 0) {
    return emptyStats(teamNumber, teamName);
  }

  // ── Fuel estimates per match ──
  const fuelPerMatch = entries.map(e => estimateMatchFuel(e));
  const pointsPerMatch = entries.map(e => estimateMatchPoints(e));

  // ── Climb levels ──
  const climbLevels = entries.map(e => parseClimbLevel(e.climb_level));
  const climbNone = climbLevels.filter(l => l === 0).length;
  const climb1 = climbLevels.filter(l => l === 1).length;
  const climb2 = climbLevels.filter(l => l === 2).length;
  const climb3 = climbLevels.filter(l => l === 3).length;
  const climbFailed = entries.filter(e => e.teleop_climb_failed).length;

  // ── Start zone distribution ──
  const startZoneDistribution = [1, 2, 3, 4, 5, 6].map(zone => {
    const key = `prematch_AUTON_START_ZONE_${zone}` as keyof RealScoutEntry;
    const count = entries.filter(e => (e[key] as number) > 0).length;
    return pct(count, n);
  });

  // ── Pass totals ──
  const totalPassPerMatch = entries.map(e => e.auton_FUEL_PASS + e.teleop_FUEL_PASS);
  const totalScorePerMatch = fuelPerMatch.map(f => f.total);
  const avgTotalPass = avg(totalPassPerMatch);
  const avgTotalFuelEstimate = avg(totalScorePerMatch);
  const passerRatio =
    avgTotalFuelEstimate + avgTotalPass > 0
      ? avgTotalPass / (avgTotalFuelEstimate + avgTotalPass)
      : 0;

  // ── Notes aggregation ──
  const notesList = entries
    .map(e => e.notes)
    .filter(n => n && n.trim().length > 0);

  return {
    teamNumber,
    teamName,
    matchesPlayed: n,

    // Fuel scoring
    avgAutoFuelEstimate: avg(fuelPerMatch.map(f => f.auto)),
    avgTeleopFuelEstimate: avg(fuelPerMatch.map(f => f.teleop)),
    avgTotalFuelEstimate,
    maxAutoFuelEstimate: max(fuelPerMatch.map(f => f.auto)),
    maxTeleopFuelEstimate: max(fuelPerMatch.map(f => f.teleop)),
    maxTotalFuelEstimate: max(fuelPerMatch.map(f => f.total)),

    // Raw counts
    avgAutoFuelScore: avg(entries.map(e => e.auton_FUEL_SCORE)),
    avgTeleopFuelScore: avg(entries.map(e => e.teleop_FUEL_SCORE)),
    avgAutoFuelPass: avg(entries.map(e => e.auton_FUEL_PASS)),
    avgTeleopFuelPass: avg(entries.map(e => e.teleop_FUEL_PASS)),

    // Climb rates (0–1 fractions)
    climbNoneRate: pct(climbNone, n),
    level1ClimbRate: pct(climb1, n),
    level2ClimbRate: pct(climb2, n),
    level3ClimbRate: pct(climb3, n),
    climbFailedRate: pct(climbFailed, n),

    // Auto
    autoClimbRate: pct(entries.filter(e => e.auton_AUTON_CLIMBED > 0).length, n),
    autoDidNothingRate: pct(entries.filter(e => e.auton_did_nothing).length, n),
    startZoneDistribution,

    // Quality flags
    dedicatedPasserRate: pct(entries.filter(e => e.dedicated_passer).length, n),
    bulldozedFuelRate: pct(entries.filter(e => e.eff_rep_bulldozed_fuel).length, n),
    poorAccuracyRate: pct(entries.filter(e => e.poor_fuel_scoring_accuracy).length, n),
    lostConnectionRate: pct(entries.filter(e => e.lost_connection).length, n),
    noRobotRate: pct(entries.filter(e => e.no_robot_on_field).length, n),

    // Bonus bucket breakdown (avg count per match)
    avgAutoPlus1: avg(entries.map(e => e.auton_SCORE_PLUS_1)),
    avgAutoPlus2: avg(entries.map(e => e.auton_SCORE_PLUS_2)),
    avgAutoPlus3: avg(entries.map(e => e.auton_SCORE_PLUS_3)),
    avgAutoPlus5: avg(entries.map(e => e.auton_SCORE_PLUS_5)),
    avgAutoPlus10: avg(entries.map(e => e.auton_SCORE_PLUS_10)),
    avgTeleopPlus1: avg(entries.map(e => e.teleop_SCORE_PLUS_1)),
    avgTeleopPlus2: avg(entries.map(e => e.teleop_SCORE_PLUS_2)),
    avgTeleopPlus3: avg(entries.map(e => e.teleop_SCORE_PLUS_3)),
    avgTeleopPlus5: avg(entries.map(e => e.teleop_SCORE_PLUS_5)),
    avgTeleopPlus10: avg(entries.map(e => e.teleop_SCORE_PLUS_10)),

    // Estimated points
    avgAutoPoints: avg(pointsPerMatch.map(p => p.autoPoints)),
    avgTeleopPoints: avg(pointsPerMatch.map(p => p.teleopPoints)),
    avgEndgamePoints: avg(pointsPerMatch.map(p => p.endgamePoints)),
    avgTotalPoints: avg(pointsPerMatch.map(p => p.total)),
    maxTotalPoints: max(pointsPerMatch.map(p => p.total)),

    // Passing
    avgTotalPass,
    passerRatio,

    // Notes
    notesList,
  };
}

// ── All Teams ──────────────────────────────────────────────────────────────

export function calculateAllRealTeamStatistics(
  entries: RealScoutEntry[],
  teamNames?: Map<number, string>
): RealTeamStatistics[] {
  const teamNumbers = Array.from(new Set(entries.map(e => e.team_number)));
  return teamNumbers.map(num =>
    calculateRealTeamStatistics(num, entries, teamNames?.get(num))
  );
}

// ── Empty stats fallback ───────────────────────────────────────────────────

function emptyStats(teamNumber: number, teamName?: string): RealTeamStatistics {
  return {
    teamNumber,
    teamName,
    matchesPlayed: 0,
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
    startZoneDistribution: [0, 0, 0, 0, 0, 0],
    dedicatedPasserRate: 0,
    bulldozedFuelRate: 0,
    poorAccuracyRate: 0,
    lostConnectionRate: 0,
    noRobotRate: 0,
    avgAutoPlus1: 0,
    avgAutoPlus2: 0,
    avgAutoPlus3: 0,
    avgAutoPlus5: 0,
    avgAutoPlus10: 0,
    avgTeleopPlus1: 0,
    avgTeleopPlus2: 0,
    avgTeleopPlus3: 0,
    avgTeleopPlus5: 0,
    avgTeleopPlus10: 0,
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
