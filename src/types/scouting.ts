// Match Scouting Entry (56 fields)
export interface MatchScoutingEntry {
  // Metadata
  id: string;
  eventCode: string;
  matchType: 'practice' | 'qualification' | 'playoff';
  matchNumber: number;
  teamNumber: number;
  alliance: 'red' | 'blue';
  driverStation: 1 | 2 | 3;
  scoutName: string;
  timestamp: string;

  // Pre-Match
  preloadedFuel: number;
  startingPosition: 'left' | 'center' | 'right';
  noShow: boolean;

  // Autonomous
  autoMobility: boolean;
  autoFuelScored: number;
  autoFuelMissed: number;
  autoFuelFromDepot: number;
  autoFuelFromNeutral: number;
  autoFuelFromHuman: number;
  autoClimbAttempted: boolean;
  autoClimbSuccess: boolean;
  autoCrossedBump: boolean;
  autoUsedTrench: boolean;

  // Teleop
  teleopTotalScored: number;
  teleopTotalMissed: number;
  teleopScoresDuringActive: number;
  teleopScoresDuringInactive: number;
  teleopFuelFromDepot: number;
  teleopFuelFromNeutral: number;
  teleopFuelFromHuman: number;
  teleopFuelToHuman: number;
  cycleCount: number;
  playedDefense: boolean;
  defenseEffectiveness: 'none' | 'poor' | 'fair' | 'good' | 'excellent';
  wasDefended: boolean;
  defenseEvasion: 'none' | 'poor' | 'fair' | 'good' | 'excellent';

  // Endgame
  climbAttempted: boolean;
  climbLevel: 'none' | 'level1' | 'level2' | 'level3';
  climbTime: number;
  climbAssisted: boolean;
  climbAssistedOther: boolean;
  parked: boolean;
  endgameFuelScored: number;

  // Performance Ratings
  driverSkill: number; // 1-5
  intakeSpeed: number; // 1-5
  shootingAccuracy: number; // 1-5
  shootingSpeed: number; // 1-5
  humanPlayerRating: 'poor' | 'average' | 'good' | 'excellent';

  // Issues & Notes
  robotDied: boolean;
  robotTipped: boolean;
  cardReceived: 'none' | 'yellow' | 'red';
  mechanicalIssues: boolean;
  commentsAuto: string;
  commentsTeleop: string;
  commentsOverall: string;

  // Sync Status
  synced: boolean;
  syncedAt: string;
}

// Pit Scouting Entry (33 fields)
export interface PitScoutingEntry {
  // Team Info
  id: string;
  teamNumber: number;
  teamName: string;
  scoutName: string;
  timestamp: string;

  // Robot Specs
  drivetrainType: 'tank' | 'swerve' | 'mecanum' | 'other';
  drivetrainMotors: string;
  robotWeight: number;
  robotHeight: number;
  robotWidth: number;
  robotLength: number;

  // Capabilities
  maxFuelCapacity: number;
  intakeType: string;
  intakeGround: boolean;
  intakeHumanPlayer: boolean;
  intakeDepot: boolean;
  shooterType: string;
  shooterAdjustable: boolean;
  maxShootingRange: number;
  canScoreInactive: boolean;
  canUseTrench: boolean;
  canCrossBump: boolean;

  // Climbing
  climbCapability: 'none' | 'level1' | 'level2' | 'level3';
  climbTime: number;
  canAssistClimb: boolean;
  canBeAssisted: boolean;

  // Strategy
  preferredRole: 'scorer' | 'defender' | 'hybrid';
  autoCapabilities: string;
  preferredStartPosition: 'left' | 'center' | 'right' | 'any';
  driverExperience: string;
  comments: string;

  // Sync Status
  synced: boolean;
  syncedAt: string;
}

// Team Statistics - calculated from match data
export interface TeamStatistics {
  teamNumber: number;
  teamName?: string;
  matchesPlayed: number;

  // AUTO stats
  avgAutoFuelScored: number;
  avgAutoFuelMissed: number;
  autoAccuracy: number; // percentage
  autoMobilityRate: number; // percentage
  autoClimbRate: number; // percentage
  autoClimbSuccessRate: number; // percentage of attempts

  // TELEOP stats
  avgTeleopFuelScored: number;
  avgTeleopFuelMissed: number;
  teleopAccuracy: number; // percentage
  avgCycleCount: number;
  avgActiveHubScores: number;
  avgInactiveHubScores: number;

  // ENDGAME stats
  climbAttemptRate: number; // percentage
  level1ClimbRate: number;
  level2ClimbRate: number;
  level3ClimbRate: number;
  avgClimbTime: number;
  avgEndgameFuelScored: number;

  // DEFENSE stats
  defensePlayedRate: number; // percentage of matches
  avgDefenseEffectiveness: number; // 0-4 scale
  wasDefendedRate: number;
  avgDefenseEvasion: number; // 0-4 scale

  // PERFORMANCE ratings
  avgDriverSkill: number; // 1-5
  avgIntakeSpeed: number; // 1-5
  avgShootingAccuracy: number; // 1-5
  avgShootingSpeed: number; // 1-5

  // RELIABILITY
  noShowRate: number; // percentage
  diedRate: number; // percentage
  tippedRate: number; // percentage
  mechanicalIssuesRate: number; // percentage
  yellowCardRate: number;
  redCardRate: number;

  // OVERALL
  avgTotalPoints: number; // estimated points per match
  avgAutoPoints: number;
  avgTeleopPoints: number;
  avgEndgamePoints: number;

  // PIT data (if available)
  pitData?: PitScoutingEntry;
}

// For team comparison
export interface TeamComparison {
  teams: TeamStatistics[];
  comparisonDate: string;
}

// Event info
export interface EventInfo {
  eventCode: string;
  eventName: string;
  teams: number[];
}
