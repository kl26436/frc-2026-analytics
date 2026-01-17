import type { MatchScoutingEntry, PitScoutingEntry, TeamStatistics } from '../types/scouting';

// Helper to calculate average
const avg = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

// Helper to calculate percentage
const percentage = (count: number, total: number): number => {
  if (total === 0) return 0;
  return (count / total) * 100;
};

// Convert enum to numeric value
const defenseToNumber = (defense: string): number => {
  const map: Record<string, number> = { none: 0, poor: 1, fair: 2, good: 3, excellent: 4 };
  return map[defense] || 0;
};

// Calculate estimated points for a match
function calculateMatchPoints(match: MatchScoutingEntry): {
  autoPoints: number;
  teleopPoints: number;
  endgamePoints: number;
  total: number;
} {
  // AUTO points
  const autoFuelPoints = match.autoFuelScored * 1; // 1 pt per FUEL
  const autoClimbPoints = match.autoClimbSuccess ? 15 : 0; // 15 pt for L1 in auto
  const autoPoints = autoFuelPoints + autoClimbPoints;

  // TELEOP points (only active HUB scores count)
  const teleopPoints = match.teleopScoresDuringActive * 1; // 1 pt per FUEL in active HUB

  // ENDGAME points
  const climbPoints: Record<string, number> = {
    none: 0,
    level1: 10,
    level2: 20,
    level3: 30,
  };
  const endgameClimbPoints = climbPoints[match.climbLevel] || 0;
  const endgameFuelPoints = match.endgameFuelScored * 1; // 1 pt per FUEL (both HUBs active)
  const endgamePoints = endgameClimbPoints + endgameFuelPoints;

  return {
    autoPoints,
    teleopPoints,
    endgamePoints,
    total: autoPoints + teleopPoints + endgamePoints,
  };
}

// Calculate team statistics from match entries
export function calculateTeamStatistics(
  teamNumber: number,
  matchEntries: MatchScoutingEntry[],
  pitEntry?: PitScoutingEntry
): TeamStatistics {
  // Filter entries for this team, excluding no-shows
  const teamMatches = matchEntries.filter(
    m => m.teamNumber === teamNumber && !m.noShow
  );

  const matchesPlayed = teamMatches.length;

  if (matchesPlayed === 0) {
    // Return empty stats if no matches
    return {
      teamNumber,
      teamName: pitEntry?.teamName,
      matchesPlayed: 0,
      avgAutoFuelScored: 0,
      avgAutoFuelMissed: 0,
      autoAccuracy: 0,
      autoMobilityRate: 0,
      autoClimbRate: 0,
      autoClimbSuccessRate: 0,
      avgTeleopFuelScored: 0,
      avgTeleopFuelMissed: 0,
      teleopAccuracy: 0,
      avgCycleCount: 0,
      avgActiveHubScores: 0,
      avgInactiveHubScores: 0,
      climbAttemptRate: 0,
      level1ClimbRate: 0,
      level2ClimbRate: 0,
      level3ClimbRate: 0,
      avgClimbTime: 0,
      avgEndgameFuelScored: 0,
      defensePlayedRate: 0,
      avgDefenseEffectiveness: 0,
      wasDefendedRate: 0,
      avgDefenseEvasion: 0,
      avgDriverSkill: 0,
      avgIntakeSpeed: 0,
      avgShootingAccuracy: 0,
      avgShootingSpeed: 0,
      noShowRate: 0,
      diedRate: 0,
      tippedRate: 0,
      mechanicalIssuesRate: 0,
      yellowCardRate: 0,
      redCardRate: 0,
      avgTotalPoints: 0,
      avgAutoPoints: 0,
      avgTeleopPoints: 0,
      avgEndgamePoints: 0,
      pitData: pitEntry,
    };
  }

  // AUTO statistics
  const autoFuelScored = teamMatches.map(m => m.autoFuelScored);
  const autoFuelMissed = teamMatches.map(m => m.autoFuelMissed);
  const autoTotalAttempts = teamMatches.reduce((sum, m) => sum + m.autoFuelScored + m.autoFuelMissed, 0);
  const autoTotalScored = teamMatches.reduce((sum, m) => sum + m.autoFuelScored, 0);

  const autoMobilityCount = teamMatches.filter(m => m.autoMobility).length;
  const autoClimbAttemptedCount = teamMatches.filter(m => m.autoClimbAttempted).length;
  const autoClimbSuccessCount = teamMatches.filter(m => m.autoClimbSuccess).length;

  // TELEOP statistics
  const teleopTotalScored = teamMatches.map(m => m.teleopTotalScored);
  const teleopTotalMissed = teamMatches.map(m => m.teleopTotalMissed);
  const teleopTotalAttempts = teamMatches.reduce((sum, m) => sum + m.teleopTotalScored + m.teleopTotalMissed, 0);
  const teleopTotalScoredSum = teamMatches.reduce((sum, m) => sum + m.teleopTotalScored, 0);

  const cycleCount = teamMatches.map(m => m.cycleCount);
  const activeHubScores = teamMatches.map(m => m.teleopScoresDuringActive);
  const inactiveHubScores = teamMatches.map(m => m.teleopScoresDuringInactive);

  // ENDGAME statistics
  const climbAttemptedCount = teamMatches.filter(m => m.climbAttempted).length;
  const level1Count = teamMatches.filter(m => m.climbLevel === 'level1').length;
  const level2Count = teamMatches.filter(m => m.climbLevel === 'level2').length;
  const level3Count = teamMatches.filter(m => m.climbLevel === 'level3').length;

  const climbTimes = teamMatches.filter(m => m.climbTime > 0).map(m => m.climbTime);
  const endgameFuelScored = teamMatches.map(m => m.endgameFuelScored);

  // DEFENSE statistics
  const defensePlayedCount = teamMatches.filter(m => m.playedDefense).length;
  const defenseEffectiveness = teamMatches.map(m => defenseToNumber(m.defenseEffectiveness));
  const wasDefendedCount = teamMatches.filter(m => m.wasDefended).length;
  const defenseEvasion = teamMatches.map(m => defenseToNumber(m.defenseEvasion));

  // PERFORMANCE ratings
  const driverSkill = teamMatches.map(m => m.driverSkill);
  const intakeSpeed = teamMatches.map(m => m.intakeSpeed);
  const shootingAccuracy = teamMatches.map(m => m.shootingAccuracy);
  const shootingSpeed = teamMatches.map(m => m.shootingSpeed);

  // RELIABILITY
  const allEntries = matchEntries.filter(m => m.teamNumber === teamNumber); // Include no-shows
  const noShowCount = allEntries.filter(m => m.noShow).length;
  const diedCount = teamMatches.filter(m => m.robotDied).length;
  const tippedCount = teamMatches.filter(m => m.robotTipped).length;
  const mechanicalIssuesCount = teamMatches.filter(m => m.mechanicalIssues).length;
  const yellowCardCount = teamMatches.filter(m => m.cardReceived === 'yellow').length;
  const redCardCount = teamMatches.filter(m => m.cardReceived === 'red').length;

  // POINTS
  const matchPoints = teamMatches.map(m => calculateMatchPoints(m));
  const autoPoints = matchPoints.map(p => p.autoPoints);
  const teleopPoints = matchPoints.map(p => p.teleopPoints);
  const endgamePoints = matchPoints.map(p => p.endgamePoints);
  const totalPoints = matchPoints.map(p => p.total);

  return {
    teamNumber,
    teamName: pitEntry?.teamName,
    matchesPlayed,

    avgAutoFuelScored: avg(autoFuelScored),
    avgAutoFuelMissed: avg(autoFuelMissed),
    autoAccuracy: percentage(autoTotalScored, autoTotalAttempts),
    autoMobilityRate: percentage(autoMobilityCount, matchesPlayed),
    autoClimbRate: percentage(autoClimbSuccessCount, matchesPlayed),
    autoClimbSuccessRate: percentage(autoClimbSuccessCount, autoClimbAttemptedCount),

    avgTeleopFuelScored: avg(teleopTotalScored),
    avgTeleopFuelMissed: avg(teleopTotalMissed),
    teleopAccuracy: percentage(teleopTotalScoredSum, teleopTotalAttempts),
    avgCycleCount: avg(cycleCount),
    avgActiveHubScores: avg(activeHubScores),
    avgInactiveHubScores: avg(inactiveHubScores),

    climbAttemptRate: percentage(climbAttemptedCount, matchesPlayed),
    level1ClimbRate: percentage(level1Count, matchesPlayed),
    level2ClimbRate: percentage(level2Count, matchesPlayed),
    level3ClimbRate: percentage(level3Count, matchesPlayed),
    avgClimbTime: avg(climbTimes),
    avgEndgameFuelScored: avg(endgameFuelScored),

    defensePlayedRate: percentage(defensePlayedCount, matchesPlayed),
    avgDefenseEffectiveness: avg(defenseEffectiveness),
    wasDefendedRate: percentage(wasDefendedCount, matchesPlayed),
    avgDefenseEvasion: avg(defenseEvasion),

    avgDriverSkill: avg(driverSkill),
    avgIntakeSpeed: avg(intakeSpeed),
    avgShootingAccuracy: avg(shootingAccuracy),
    avgShootingSpeed: avg(shootingSpeed),

    noShowRate: percentage(noShowCount, allEntries.length),
    diedRate: percentage(diedCount, matchesPlayed),
    tippedRate: percentage(tippedCount, matchesPlayed),
    mechanicalIssuesRate: percentage(mechanicalIssuesCount, matchesPlayed),
    yellowCardRate: percentage(yellowCardCount, matchesPlayed),
    redCardRate: percentage(redCardCount, matchesPlayed),

    avgTotalPoints: avg(totalPoints),
    avgAutoPoints: avg(autoPoints),
    avgTeleopPoints: avg(teleopPoints),
    avgEndgamePoints: avg(endgamePoints),

    pitData: pitEntry,
  };
}

// Calculate statistics for all teams
export function calculateAllTeamStatistics(
  matchEntries: MatchScoutingEntry[],
  pitEntries: PitScoutingEntry[]
): TeamStatistics[] {
  // Get unique team numbers
  const teamNumbers = Array.from(new Set(matchEntries.map(m => m.teamNumber)));

  // Calculate stats for each team
  return teamNumbers.map(teamNumber => {
    const pitEntry = pitEntries.find(p => p.teamNumber === teamNumber);
    return calculateTeamStatistics(teamNumber, matchEntries, pitEntry);
  });
}
