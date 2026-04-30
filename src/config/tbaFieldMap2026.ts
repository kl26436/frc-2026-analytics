/**
 * TBA API Field Name Mapping — 2026 REBUILT Season
 *
 * Calibrated from real FMS data at:
 *   - 2026week0: Bishop Guertin HS, Nashua NH (Feb 21, 2026)
 *   - 2026mnbt:  Blue Twilight, Eagan MN (Feb 21-22, 2026)
 *
 * All field names are from match.score_breakdown.red / match.score_breakdown.blue
 */

// ─── Per-Robot Fields ────────────────────────────────────────────────────────
// FMS tracks these individually per robot position (1/2/3).
// Use these directly — they are authoritative (Tier 1).

export const ROBOT_FIELDS = {
  /** End-of-match tower climb level per robot. Values: "None" | "Level1" | "Level2" | "Level3" */
  endGameTower: {
    robot1: 'endGameTowerRobot1',
    robot2: 'endGameTowerRobot2',
    robot3: 'endGameTowerRobot3',
  },

  /** Auto-period tower climb per robot. Values: "None" | "Level1" */
  autoTower: {
    robot1: 'autoTowerRobot1',
    robot2: 'autoTowerRobot2',
    robot3: 'autoTowerRobot3',
  },

  /**
   * Auto leave / mobility: NOT PRESENT in 2026 score_breakdown.
   * FMS does not publish a per-robot auto-leave field for REBUILT.
   * Must be tracked exclusively via scouting.
   */
  autoLeave: null,
} as const;

/** Maps climb string values to numeric levels (0–3) */
export const CLIMB_VALUE_MAP: Record<string, number> = {
  None: 0,
  Level1: 1,
  Level2: 2,
  Level3: 3,
};

/** Maps numeric level back to TBA string */
export const CLIMB_LEVEL_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Level 1',
  2: 'Level 2',
  3: 'Level 3',
};

// ─── Hub Scoring (Alliance-Level, inside score_breakdown.hubScore) ────────────
// All fuel/hub data is ALLIANCE-LEVEL only. Scouts must track per-robot breakdown.
// Access as: match.score_breakdown.red.hubScore.autoCount, etc.

export const HUB_SCORE_FIELDS = {
  /** Auto period hub scoring */
  autoCount: 'autoCount',
  autoPoints: 'autoPoints',

  /** Teleop shift zone scoring (hub was divided into 4 shift zones) */
  shift1Count: 'shift1Count',
  shift1Points: 'shift1Points',
  shift2Count: 'shift2Count',
  shift2Points: 'shift2Points',
  shift3Count: 'shift3Count',
  shift3Points: 'shift3Points',
  shift4Count: 'shift4Count',
  shift4Points: 'shift4Points',

  /** Transition period scoring (between shifts) */
  transitionCount: 'transitionCount',
  transitionPoints: 'transitionPoints',

  /** Endgame hub scoring */
  endgameCount: 'endgameCount',
  endgamePoints: 'endgamePoints',

  /** Teleop totals (shifts + transition + endgame) */
  teleopCount: 'teleopCount',
  teleopPoints: 'teleopPoints',

  /** Grand totals */
  totalCount: 'totalCount',
  totalPoints: 'totalPoints',

  /** Balls that did not score (shot into inactive hub, missed, etc.) */
  uncounted: 'uncounted',
} as const;

// ─── Tower Points (Top-level fields, NOT inside hubScore) ────────────────────

export const TOWER_FIELDS = {
  autoTowerPoints: 'autoTowerPoints',
  endGameTowerPoints: 'endGameTowerPoints',
  totalTowerPoints: 'totalTowerPoints',
} as const;

// ─── Ranking Points ──────────────────────────────────────────────────────────

export const RP_FIELDS = {
  /** Energized RP: alliance scored ≥240 fuel points. Boolean. */
  energized: 'energizedAchieved',

  /** Supercharged RP: alliance scored ≥360 fuel points. Boolean. Rare at week0. */
  supercharged: 'superchargedAchieved',

  /** Traversal RP: alliance earned ≥50 tower points. Boolean. Rare at week0. */
  traversal: 'traversalAchieved',

  /** Total ranking points earned this match (win=3, tie=1 + bonus RPs) */
  rp: 'rp',
} as const;

// ─── Fouls & Penalties ───────────────────────────────────────────────────────

export const FOUL_FIELDS = {
  foulPoints: 'foulPoints',
  majorFoulCount: 'majorFoulCount',
  minorFoulCount: 'minorFoulCount',
  /** G206 penalty boolean */
  g206Penalty: 'g206Penalty',
  /** "None" or penalty string */
  penalties: 'penalties',
} as const;

// ─── Score Totals ────────────────────────────────────────────────────────────

export const SCORE_FIELDS = {
  totalAutoPoints: 'totalAutoPoints',
  totalTeleopPoints: 'totalTeleopPoints',
  totalPoints: 'totalPoints',
  adjustPoints: 'adjustPoints',
} as const;

// ─── Calibration Notes ───────────────────────────────────────────────────────

export const CALIBRATION_NOTES = {
  autoLeaveAbsent: 'No autoLeaveRobot1/2/3 field exists in 2026 FMS data. Auto mobility is scout-only.',
  fuelIsAllianceLevel: 'All hubScore fields are alliance totals. Per-robot fuel requires scouting.',
  shiftGranularity: 'shift1-4Count/Points provide per-shift-window fuel data — a surprise from 2026 FMS.',
  climbEnums: 'endGameTowerRobot values: "None", "Level1", "Level2", "Level3". autoTowerRobot: "None" or "Level1" only.',
  rpBooleans: 'energizedAchieved, superchargedAchieved, traversalAchieved are plain booleans (not "TRUE"/"FALSE" strings).',
  week0BaselineScores: 'Week0 avg total: ~85 pts. Max seen: 215. Energized RP ~37% frequency. Supercharged/Traversal near 0%.',
} as const;
