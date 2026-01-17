import type { MatchScoutingEntry, PitScoutingEntry } from '../types/scouting';

// Helper to generate random number in range
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randChoice = <T,>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const randBool = (probability = 0.5) => Math.random() < probability;

// Teams at a typical Texas regional
const TEAMS = [
  { number: 148, name: 'Robowranglers' },
  { number: 118, name: 'Robonauts' },
  { number: 1477, name: 'Texas Torque' },
  { number: 2848, name: 'Gear It Forward' },
  { number: 624, name: 'CRyptonite' },
  { number: 3310, name: 'Blackhawks' },
  { number: 3005, name: 'RoboChargers' },
  { number: 4522, name: 'SCREAM Robotics' },
  { number: 5549, name: 'Grizzly Robotics' },
  { number: 6377, name: 'Howdy Bots' },
  { number: 4639, name: 'The RoboDawgs' },
  { number: 1296, name: 'Full Metal Jackets' },
  { number: 3847, name: 'Spectrum' },
  { number: 5940, name: 'BREAD' },
  { number: 418, name: 'Purple Haze' },
  { number: 1429, name: 'The Wyldcats' },
  { number: 2881, name: 'Lady Cans' },
  { number: 3200, name: 'STRYKE' },
  { number: 4206, name: 'Roarbots' },
  { number: 4587, name: 'Jersey Voltage' },
  { number: 5431, name: 'Titan Robotics' },
  { number: 6357, name: 'The Spring Konstant' },
  { number: 7157, name: 'Bobcat Robotics' },
  { number: 8230, name: 'Infinity Robotics' },
];

const EVENT_CODE = '2026txgre';
const SCOUT_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley'];

// Generate a single match entry for a team
function generateMatchEntry(
  teamNumber: number,
  matchNumber: number,
  matchType: 'practice' | 'qualification' | 'playoff' = 'qualification'
): MatchScoutingEntry {
  const alliance = randChoice(['red', 'blue'] as const);
  const driverStation = randChoice([1, 2, 3] as const);

  // Simulate different team skill levels
  const teamSkillMultiplier = 0.5 + Math.random() * 1.5; // 0.5 to 2.0

  const autoFuelScored = Math.floor(randInt(0, 8) * teamSkillMultiplier);
  const autoFuelMissed = randInt(0, 3);

  const teleopTotalScored = Math.floor(randInt(10, 40) * teamSkillMultiplier);
  const teleopTotalMissed = randInt(5, 20);

  const teleopScoresDuringActive = Math.floor(teleopTotalScored * (0.6 + Math.random() * 0.3));
  const teleopScoresDuringInactive = teleopTotalScored - teleopScoresDuringActive;

  const climbLevel = randChoice(['none', 'none', 'level1', 'level1', 'level2', 'level2', 'level3'] as const);

  return {
    id: `${teamNumber}-${matchType}-${matchNumber}-${Date.now()}-${Math.random()}`,
    eventCode: EVENT_CODE,
    matchType,
    matchNumber,
    teamNumber,
    alliance,
    driverStation,
    scoutName: randChoice(SCOUT_NAMES),
    timestamp: new Date(2026, 2, 20 + Math.floor(matchNumber / 10), 9 + (matchNumber % 8), randInt(0, 59)).toISOString(),

    preloadedFuel: randInt(0, 5),
    startingPosition: randChoice(['left', 'center', 'right'] as const),
    noShow: randBool(0.02),

    autoMobility: randBool(0.85),
    autoFuelScored,
    autoFuelMissed,
    autoFuelFromDepot: randInt(0, 5),
    autoFuelFromNeutral: randInt(0, 3),
    autoFuelFromHuman: randInt(0, 2),
    autoClimbAttempted: randBool(0.15),
    autoClimbSuccess: randBool(0.10),
    autoCrossedBump: randBool(0.7),
    autoUsedTrench: randBool(0.4),

    teleopTotalScored,
    teleopTotalMissed,
    teleopScoresDuringActive,
    teleopScoresDuringInactive,
    teleopFuelFromDepot: randInt(5, 15),
    teleopFuelFromNeutral: randInt(8, 20),
    teleopFuelFromHuman: randInt(3, 12),
    teleopFuelToHuman: randInt(0, 5),
    cycleCount: randInt(3, 12),
    playedDefense: randBool(0.25),
    defenseEffectiveness: randChoice(['none', 'none', 'poor', 'fair', 'good', 'excellent'] as const),
    wasDefended: randBool(0.3),
    defenseEvasion: randChoice(['none', 'poor', 'fair', 'good', 'excellent'] as const),

    climbAttempted: climbLevel !== 'none',
    climbLevel,
    climbTime: climbLevel !== 'none' ? randInt(5, 25) : 0,
    climbAssisted: randBool(0.15),
    climbAssistedOther: randBool(0.15),
    parked: climbLevel === 'none' && randBool(0.6),
    endgameFuelScored: randInt(0, 8),

    driverSkill: randInt(2, 5),
    intakeSpeed: randInt(2, 5),
    shootingAccuracy: randInt(2, 5),
    shootingSpeed: randInt(2, 5),
    humanPlayerRating: randChoice(['poor', 'average', 'good', 'excellent'] as const),

    robotDied: randBool(0.05),
    robotTipped: randBool(0.03),
    cardReceived: randChoice(['none', 'none', 'none', 'none', 'none', 'yellow', 'red'] as const),
    mechanicalIssues: randBool(0.1),
    commentsAuto: randBool(0.3) ? 'Good auto routine' : '',
    commentsTeleop: randBool(0.3) ? 'Strong teleop performance' : '',
    commentsOverall: randBool(0.2) ? 'Solid all-around robot' : '',

    synced: true,
    syncedAt: new Date().toISOString(),
  };
}

// Generate pit scouting entry for a team
function generatePitEntry(teamNumber: number, teamName: string): PitScoutingEntry {
  return {
    id: `pit-${teamNumber}-${Date.now()}`,
    teamNumber,
    teamName,
    scoutName: randChoice(SCOUT_NAMES),
    timestamp: new Date(2026, 2, 19, randInt(10, 16), randInt(0, 59)).toISOString(),

    drivetrainType: randChoice(['tank', 'swerve', 'swerve', 'mecanum', 'other'] as const),
    drivetrainMotors: randChoice(['4x NEO', '4x Falcon 500', '6x CIM', '4x Kraken X60']),
    robotWeight: randInt(100, 125),
    robotHeight: randInt(42, 72),
    robotWidth: randInt(24, 32),
    robotLength: randInt(28, 36),

    maxFuelCapacity: randInt(4, 12),
    intakeType: randChoice(['Roller', 'Wheeled', 'Conveyor', 'Gripper']),
    intakeGround: randBool(0.9),
    intakeHumanPlayer: randBool(0.8),
    intakeDepot: randBool(0.85),
    shooterType: randChoice(['Flywheel', 'Catapult', 'Puncher', 'Hood']),
    shooterAdjustable: randBool(0.7),
    maxShootingRange: randInt(10, 30),
    canScoreInactive: randBool(0.3),
    canUseTrench: randBool(0.6),
    canCrossBump: randBool(0.8),

    climbCapability: randChoice(['none', 'level1', 'level1', 'level2', 'level2', 'level3'] as const),
    climbTime: randInt(8, 20),
    canAssistClimb: randBool(0.4),
    canBeAssisted: randBool(0.5),

    preferredRole: randChoice(['scorer', 'scorer', 'scorer', 'defender', 'hybrid'] as const),
    autoCapabilities: randChoice([
      'Simple 2-ball auto',
      '3-ball auto with mobility',
      '5-ball auto',
      'Defensive auto',
      'Mobility only',
    ]),
    preferredStartPosition: randChoice(['left', 'center', 'right', 'any'] as const),
    driverExperience: randChoice(['1 year', '2 years', '3+ years', 'Rookie']),
    comments: randBool(0.4) ? 'Well-built robot with good driving' : '',

    synced: true,
    syncedAt: new Date().toISOString(),
  };
}

// Generate mock data for all teams
export function generateMockData(): {
  matchEntries: MatchScoutingEntry[];
  pitEntries: PitScoutingEntry[];
} {
  const matchEntries: MatchScoutingEntry[] = [];
  const pitEntries: PitScoutingEntry[] = [];

  // Generate pit scouting for all teams
  TEAMS.forEach(team => {
    pitEntries.push(generatePitEntry(team.number, team.name));
  });

  // Generate 6 qualification matches per team (typical for early in event)
  TEAMS.forEach(team => {
    for (let match = 1; match <= 6; match++) {
      matchEntries.push(generateMatchEntry(team.number, match, 'qualification'));
    }
  });

  return { matchEntries, pitEntries };
}

// Export team list
export { TEAMS };
