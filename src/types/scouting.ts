// ============================================================================
// Scouting Data Types — matches the Postgres summary_2026 schema exactly
// ============================================================================

/**
 * One row from summary_2026: what one scouter recorded about one robot in one match.
 * Field names match Postgres column names. NULL scoring fields → 0, NULL booleans → false.
 */
export interface ScoutEntry {
  /** Firestore doc ID: `${match_number}_${team_number}` */
  id: string;

  // ── Metadata ──
  match_number: number;
  team_number: number;
  year: string; // "2026"
  configured_team: string; // "blue_1" | "blue_2" | "blue_3" | "red_1" | "red_2" | "red_3"
  event_key: string; // "2026week0", "2026txwac", etc.
  match_key: string; // "2026week0_qm5"
  scouter_id: string;

  // ── Flags ──
  lost_connection: boolean;
  no_robot_on_field: boolean;
  second_review: boolean;
  dedicated_passer: boolean;
  teleop_climb_failed: boolean;

  // ── Prematch ──
  prematch_AUTON_START_ZONE_1: number;
  prematch_AUTON_START_ZONE_2: number;
  prematch_AUTON_START_ZONE_3: number;
  prematch_AUTON_START_ZONE_4: number;
  prematch_AUTON_START_ZONE_5: number;
  prematch_AUTON_START_ZONE_6: number;

  // ── Auto Scoring ──
  auton_FUEL_SCORE: number;
  auton_FUEL_PASS: number;
  auton_AUTON_CLIMBED: number;
  auton_SCORE_PLUS_1: number;
  auton_SCORE_PLUS_2: number;
  auton_SCORE_PLUS_3: number;
  auton_SCORE_PLUS_5: number;
  auton_SCORE_PLUS_10: number;
  auton_did_nothing: boolean;

  // ── Teleop Scoring ──
  teleop_FUEL_SCORE: number;
  teleop_FUEL_PASS: number;
  teleop_SCORE_PLUS_1: number;
  teleop_SCORE_PLUS_2: number;
  teleop_SCORE_PLUS_3: number;
  teleop_SCORE_PLUS_5: number;
  teleop_SCORE_PLUS_10: number;

  // ── Endgame ──
  /** Raw string from Postgres: "1. None", "2. Level 1", "3. Level 2", "4. Level 3" */
  climb_level: string;

  // ── Quality Flags ──
  eff_rep_bulldozed_fuel: boolean;
  poor_fuel_scoring_accuracy: boolean;
  relative_driver_performance: string;
  notes: string;
}

// ============================================================================
// Hub Score (alliance-level FMS fuel data)
// ============================================================================

export interface HubScore {
  autoCount: number;
  autoPoints: number;
  teleopCount: number;
  teleopPoints: number;
  endgameCount: number;
  endgamePoints: number;
  shift1Count: number;
  shift1Points: number;
  shift2Count: number;
  shift2Points: number;
  shift3Count: number;
  shift3Points: number;
  shift4Count: number;
  shift4Points: number;
  transitionCount: number;
  transitionPoints: number;
  totalCount: number;
  totalPoints: number;
  uncounted: number;
}

// ============================================================================
// TBA Match (flattened from Postgres tba.{event}_matches, one row per match)
// ============================================================================

export interface PgTBAMatch {
  match_key: string; // "2026week0_qm5"
  event_key: string;
  comp_level: string; // "qm" | "sf" | "f"
  match_number: number;
  set_number: number;
  winning_alliance: string;
  actual_time: number | null;

  // Alliance teams
  red_teams: [string, string, string]; // ["frc148", "frc118", "frc1477"]
  blue_teams: [string, string, string];

  // Final scores
  red_score: number;
  blue_score: number;

  // Red score breakdown
  red_totalAutoPoints: number;
  red_totalTeleopPoints: number;
  red_totalPoints: number;
  red_foulPoints: number;
  red_majorFoulCount: number;
  red_minorFoulCount: number;
  red_rp: number;
  red_energizedAchieved: boolean;
  red_superchargedAchieved: boolean;
  red_traversalAchieved: boolean;
  red_hubScore: HubScore;
  red_endGameTowerRobot1: string;
  red_endGameTowerRobot2: string;
  red_endGameTowerRobot3: string;
  red_autoTowerRobot1: string;
  red_autoTowerRobot2: string;
  red_autoTowerRobot3: string;
  red_autoTowerPoints: number;
  red_endGameTowerPoints: number;
  red_totalTowerPoints: number;

  // Blue score breakdown
  blue_totalAutoPoints: number;
  blue_totalTeleopPoints: number;
  blue_totalPoints: number;
  blue_foulPoints: number;
  blue_majorFoulCount: number;
  blue_minorFoulCount: number;
  blue_rp: number;
  blue_energizedAchieved: boolean;
  blue_superchargedAchieved: boolean;
  blue_traversalAchieved: boolean;
  blue_hubScore: HubScore;
  blue_endGameTowerRobot1: string;
  blue_endGameTowerRobot2: string;
  blue_endGameTowerRobot3: string;
  blue_autoTowerRobot1: string;
  blue_autoTowerRobot2: string;
  blue_autoTowerRobot3: string;
  blue_autoTowerPoints: number;
  blue_endGameTowerPoints: number;
  blue_totalTowerPoints: number;
}

// ============================================================================
// TBA Ranking (from Postgres tba.{event}_rankings)
// ============================================================================

export interface PgTBARanking {
  team_key: string; // "frc148"
  rank: number;
  matches_played: number;
  wins: number;
  losses: number;
  ties: number;
  sort_orders: string;
  extra_stats: string;
  dq: number;
}

// ============================================================================
// Scout Actions (timestamped button presses from tablets)
// ============================================================================

/** A single timestamped button press recorded by a scout tablet */
export interface ScoutAction {
  x: number;           // field x-coordinate
  y: number;           // field y-coordinate
  time_stamp: number;  // Unix timestamp (seconds)
  type: string;        // "FUEL_SCORE" | "FUEL_PASS" | "SCORE_PLUS_1" | ... | "SCORE_PLUS_10" | "AUTON_CLIMBED"
  value: number;       // typically 1
  score: number;       // running score at time of action
}

/** All timestamped actions for one robot in one match, grouped by phase */
export interface RobotActions {
  id: string;              // "{matchNumber}_{teamNumber}"
  match_number: number;
  team_number: number;
  auto: ScoutAction[];     // sorted by time_stamp ascending
  teleop: ScoutAction[];   // sorted by time_stamp ascending
}

/**
 * Attribute SCORE_PLUS_X presses to their following FUEL_SCORE or FUEL_PASS action.
 * Returns exact counts of balls passed vs balls shot (scoring attempts).
 *
 * Tablet UI workflow: scouter taps quantity buttons (SCORE_PLUS_X) first,
 * then confirms with FUEL_SCORE or FUEL_PASS. So the sequence is:
 *   [SCORE_PLUS_5, SCORE_PLUS_3] → FUEL_SCORE = 8 balls scored
 *   [SCORE_PLUS_10] → FUEL_PASS = 10 balls passed
 *
 * A FUEL_SCORE/FUEL_PASS with no preceding SCORE_PLUS counts as 1 ball.
 */
export function attributePassesAndShots(actions: ScoutAction[]): {
  shots: number;
  passes: number;
  total: number;
} {
  let shots = 0;
  let passes = 0;
  let pendingMultiplier = 0; // accumulated SCORE_PLUS values waiting for a FUEL event

  for (const action of actions) {
    if (action.type.startsWith('SCORE_PLUS_')) {
      const value = parseInt(action.type.replace('SCORE_PLUS_', ''), 10) || 1;
      pendingMultiplier += value;
    } else if (action.type === 'FUEL_SCORE') {
      // Confirm: attribute pending multiplier (or 1 if none) as shots
      shots += pendingMultiplier > 0 ? pendingMultiplier : 1;
      pendingMultiplier = 0;
    } else if (action.type === 'FUEL_PASS') {
      // Confirm: attribute pending multiplier (or 1 if none) as passes
      passes += pendingMultiplier > 0 ? pendingMultiplier : 1;
      pendingMultiplier = 0;
    }
    // Ignore AUTON_CLIMBED, AUTON_START_ZONE_X, and other non-fuel actions
  }

  // Trailing SCORE_PLUS with no confirming FUEL event — discard (incomplete input)

  return { shots, passes, total: shots + passes };
}

/**
 * Compute full fuel breakdown for one robot in one match from action data.
 * Returns per-phase and total shots/passes/moved.
 */
export function computeRobotFuelFromActions(robotActions: RobotActions): {
  autoShots: number;
  autoPasses: number;
  autoTotal: number;
  teleopShots: number;
  teleopPasses: number;
  teleopTotal: number;
  totalShots: number;
  totalPasses: number;
  totalMoved: number;
} {
  const auto = attributePassesAndShots(robotActions.auto);
  const teleop = attributePassesAndShots(robotActions.teleop);
  return {
    autoShots: auto.shots,
    autoPasses: auto.passes,
    autoTotal: auto.total,
    teleopShots: teleop.shots,
    teleopPasses: teleop.passes,
    teleopTotal: teleop.total,
    totalShots: auto.shots + teleop.shots,
    totalPasses: auto.passes + teleop.passes,
    totalMoved: auto.total + teleop.total,
  };
}

// ============================================================================
// Robot Pictures (from Postgres public.robot_pictures)
// ============================================================================

export interface RobotPicture {
  team_number: number;
  year: string;
  robot_image_link: string;
  timestamp: string;
}

// ============================================================================
// Excluded Entries (Data Quality exclusions)
// ============================================================================

/** A scout entry marked as excluded from team stats, fuel attribution, and predictions */
export interface ExcludedEntry {
  matchNumber: number;
  teamNumber: number;
  excludedAt: string;   // ISO timestamp
  excludedBy: string;   // user email
}

// ============================================================================
// Sync Metadata
// ============================================================================

export interface SyncMeta {
  lastSyncAt: string; // ISO timestamp
  lastSyncBy: string; // "manual" | "scheduled" | user email
  scoutEntriesCount: number;
  tbaMatchesCount: number;
  tbaRankingsCount: number;
  scoutActionsCount?: number;
  eventKey: string;
  syncDurationMs: number;
  error?: string;
}

// ============================================================================
// Computed Team Statistics (from real scout data)
// ============================================================================

export interface TeamStatistics {
  teamNumber: number;
  teamName?: string;
  matchesPlayed: number;

  // ══════════════════════════════════════════════════════════════════════
  // RAW COUNTS (totals across all matches — what's actually in the DB)
  // ══════════════════════════════════════════════════════════════════════

  // ── Climb Counts ──
  climbNoneCount: number;
  level1ClimbCount: number;
  level2ClimbCount: number;
  level3ClimbCount: number;
  climbFailedCount: number;

  // ── Auto Counts ──
  autoClimbCount: number;
  autoDidNothingCount: number;

  // ── Start Zone Counts (per zone, how many matches started there) ──
  startZoneCounts: number[];

  // ── Flag Counts ──
  dedicatedPasserCount: number;
  bulldozedFuelCount: number;
  poorAccuracyCount: number;
  lostConnectionCount: number;
  noRobotCount: number;
  unreliableMatchCount: number; // matches where lost_connection OR no_robot_on_field
  secondReviewCount: number;

  // ── Fuel Scoring Totals (sum of raw DB fields across all matches) ──
  totalAutoFuelScore: number;
  totalTeleopFuelScore: number;
  totalAutoFuelPass: number;
  totalTeleopFuelPass: number;

  // ── Bonus Bucket Totals (sum of SCORE_PLUS counts) ──
  totalAutoPlus1: number;
  totalAutoPlus2: number;
  totalAutoPlus3: number;
  totalAutoPlus5: number;
  totalAutoPlus10: number;
  totalTeleopPlus1: number;
  totalTeleopPlus2: number;
  totalTeleopPlus3: number;
  totalTeleopPlus5: number;
  totalTeleopPlus10: number;

  // ── Fuel Estimate Totals (sum of per-match SCORE_PLUS formula results) ──
  totalAutoFuelEstimate: number;
  totalTeleopFuelEstimate: number;
  totalTotalFuelEstimate: number;

  // ── Points Estimate Totals (sum of per-match estimated points) ──
  totalAutoPoints: number;
  totalTeleopPoints: number;
  totalEndgamePoints: number;
  totalTotalPoints: number;

  // ══════════════════════════════════════════════════════════════════════
  // DERIVED STATISTICS (calculated from raw counts)
  // ══════════════════════════════════════════════════════════════════════

  // ── Fuel Averages ──
  avgAutoFuelEstimate: number;
  avgTeleopFuelEstimate: number;
  avgTotalFuelEstimate: number;
  maxAutoFuelEstimate: number;
  maxTeleopFuelEstimate: number;
  maxTotalFuelEstimate: number;

  // ── Raw Fuel Averages ──
  avgAutoFuelScore: number;
  avgTeleopFuelScore: number;
  avgAutoFuelPass: number;
  avgTeleopFuelPass: number;

  // ── Climb Rates (%) ──
  climbNoneRate: number;
  level1ClimbRate: number;
  level2ClimbRate: number;
  level3ClimbRate: number;
  climbFailedRate: number;

  // ── Auto Rates (%) ──
  autoClimbRate: number;
  autoDidNothingRate: number;
  /** % of matches where robot went to center field during auto */
  centerFieldAutoRate: number;
  centerFieldAutoCount: number;
  /** % of matches in each start zone [zone1, zone2, ..., zone6] */
  startZoneDistribution: number[];

  // ── Flag Rates (%) ──
  dedicatedPasserRate: number;
  bulldozedFuelRate: number;
  poorAccuracyRate: number;
  lostConnectionRate: number;
  noRobotRate: number;
  overallUnreliabilityRate: number; // % of matches with lost_connection OR no_robot_on_field

  // ── Bonus Bucket Averages (avg count per match) ──
  avgAutoPlus1: number;
  avgAutoPlus2: number;
  avgAutoPlus3: number;
  avgAutoPlus5: number;
  avgAutoPlus10: number;
  avgTeleopPlus1: number;
  avgTeleopPlus2: number;
  avgTeleopPlus3: number;
  avgTeleopPlus5: number;
  avgTeleopPlus10: number;

  // ── Points Averages ──
  avgAutoPoints: number;
  avgTeleopPoints: number;
  avgEndgamePoints: number;
  avgTotalPoints: number;
  maxTotalPoints: number;

  // ── Passing Profile ──
  avgTotalPass: number;
  /** passes / (scores + passes) — 0 if no activity */
  passerRatio: number;

  // ── Notes (aggregated) ──
  notesList: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/** Parse the Postgres climb_level string into a numeric level (0-3) */
export function parseClimbLevel(raw: string | null | undefined): number {
  if (!raw) return 0;
  if (raw.includes('Level 3') || raw.startsWith('4.')) return 3;
  if (raw.includes('Level 2') || raw.startsWith('3.')) return 2;
  if (raw.includes('Level 1') || raw.startsWith('2.')) return 1;
  return 0; // "1. None" or anything else
}

/** Climb level → endgame points */
export function climbPoints(level: number): number {
  return [0, 10, 20, 30][level] ?? 0;
}

/**
 * Estimate total fuel MOVED (scores + passes) from a single scout entry
 * using the SCORE_PLUS bucket formula.
 *
 * NOTE: FUEL_SCORE/FUEL_PASS are event markers, not additional balls.
 * The tablet records: [SCORE_PLUS_X ...] → FUEL_SCORE/FUEL_PASS.
 * So the multiplier sum IS the total — don't add FUEL_SCORE on top.
 *
 * This includes both shots and passes. Use action data via
 * computeRobotFuelFromActions() for the shots/passes breakdown.
 */
export function estimateMatchFuel(entry: ScoutEntry): {
  auto: number;
  teleop: number;
  total: number;
} {
  const auto =
    entry.auton_SCORE_PLUS_1 * 1 +
    entry.auton_SCORE_PLUS_2 * 2 +
    entry.auton_SCORE_PLUS_3 * 3 +
    entry.auton_SCORE_PLUS_5 * 5 +
    entry.auton_SCORE_PLUS_10 * 10;

  const teleop =
    entry.teleop_SCORE_PLUS_1 * 1 +
    entry.teleop_SCORE_PLUS_2 * 2 +
    entry.teleop_SCORE_PLUS_3 * 3 +
    entry.teleop_SCORE_PLUS_5 * 5 +
    entry.teleop_SCORE_PLUS_10 * 10;

  return { auto, teleop, total: auto + teleop };
}

/**
 * Estimate match points for a single scout entry.
 */
export function estimateMatchPoints(entry: ScoutEntry): {
  autoPoints: number;
  teleopPoints: number;
  endgamePoints: number;
  total: number;
} {
  const fuel = estimateMatchFuel(entry);
  // fuel.auto/teleop include both shots and passes — estimate scored fraction
  // using ratio of FUEL_SCORE events to total events (FUEL_SCORE + FUEL_PASS)
  const autoScoreEvents = entry.auton_FUEL_SCORE || 0;
  const autoPassEvents = entry.auton_FUEL_PASS || 0;
  const autoTotal = autoScoreEvents + autoPassEvents;
  const autoFuelPoints = autoTotal > 0 ? fuel.auto * (autoScoreEvents / autoTotal) : fuel.auto;

  const teleopScoreEvents = entry.teleop_FUEL_SCORE || 0;
  const teleopPassEvents = entry.teleop_FUEL_PASS || 0;
  const teleopTotal = teleopScoreEvents + teleopPassEvents;
  const teleopFuelPoints = teleopTotal > 0 ? fuel.teleop * (teleopScoreEvents / teleopTotal) : fuel.teleop;

  const autoClimbPts = entry.auton_AUTON_CLIMBED > 0 ? 15 : 0;
  const autoPoints = autoFuelPoints + autoClimbPts;
  const teleopPoints = teleopFuelPoints;
  const endgamePoints = climbPoints(parseClimbLevel(entry.climb_level));

  return {
    autoPoints,
    teleopPoints,
    endgamePoints,
    total: autoPoints + teleopPoints + endgamePoints,
  };
}

/** Extract alliance color from configured_team string */
export function getAlliance(configuredTeam: string): 'red' | 'blue' {
  return configuredTeam.startsWith('red') ? 'red' : 'blue';
}

/** Extract driver station number (1-3) from configured_team string */
export function getStation(configuredTeam: string): 1 | 2 | 3 {
  const num = parseInt(configuredTeam.split('_')[1]);
  return (num >= 1 && num <= 3 ? num : 1) as 1 | 2 | 3;
}
