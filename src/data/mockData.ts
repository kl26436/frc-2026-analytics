import type { MatchScoutingEntry, PitScoutingEntry } from '../types/scouting';
import { getEventTeams, getEventMatches, teamKeyToNumber } from '../utils/tbaApi';
import type { TBAMatch } from '../types/tba';

// Helper to generate random number in range
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randChoice = <T,>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const randBool = (probability = 0.5) => Math.random() < probability;

// Event to use for mock data - 2025 Texas Championship 1
const EVENT_CODE = '2025txcmp1';

// Cache for TBA data
let cachedTeams: { number: number; name: string }[] | null = null;
let cachedMatches: TBAMatch[] | null = null;
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

// Fetch teams from TBA
async function fetchTeamsFromTBA(): Promise<{ number: number; name: string }[]> {
  if (cachedTeams) return cachedTeams;

  try {
    const tbaTeams = await getEventTeams(EVENT_CODE);
    cachedTeams = tbaTeams.map(team => ({
      number: team.team_number,
      name: team.nickname || `Team ${team.team_number}`,
    }));
    return cachedTeams;
  } catch (error) {
    console.error('Failed to fetch teams from TBA, using fallback:', error);
    // Fallback to some default teams
    cachedTeams = [
      { number: 148, name: 'Robowranglers' },
      { number: 118, name: 'Robonauts' },
      { number: 1477, name: 'Texas Torque' },
    ];
    return cachedTeams;
  }
}

// Fetch matches from TBA
async function fetchMatchesFromTBA(): Promise<TBAMatch[]> {
  if (cachedMatches) return cachedMatches;

  try {
    cachedMatches = await getEventMatches(EVENT_CODE);
    return cachedMatches;
  } catch (error) {
    console.error('Failed to fetch matches from TBA:', error);
    cachedMatches = [];
    return cachedMatches;
  }
}

// Generate mock data for all teams based on TBA event
export async function generateMockData(): Promise<{
  matchEntries: MatchScoutingEntry[];
  pitEntries: PitScoutingEntry[];
}> {
  const matchEntries: MatchScoutingEntry[] = [];
  const pitEntries: PitScoutingEntry[] = [];

  // Fetch real teams and matches from TBA
  const teams = await fetchTeamsFromTBA();
  const tbaMatches = await fetchMatchesFromTBA();

  // Generate pit scouting for all teams
  teams.forEach(team => {
    pitEntries.push(generatePitEntry(team.number, team.name));
  });

  // Generate match entries based on real TBA matches
  tbaMatches.forEach(match => {
    // Only process qualification matches for now
    if (match.comp_level === 'qm') {
      // Generate entries for all 6 teams in the match (3 red, 3 blue)
      const allTeamKeys = [...match.alliances.red.team_keys, ...match.alliances.blue.team_keys];

      allTeamKeys.forEach(teamKey => {
        const teamNumber = teamKeyToNumber(teamKey);
        if (teams.some(t => t.number === teamNumber)) {
          matchEntries.push(generateMatchEntry(teamNumber, match.match_number, 'qualification'));
        }
      });
    }
  });

  // If no TBA matches, generate fallback data
  if (matchEntries.length === 0) {
    teams.forEach(team => {
      for (let match = 1; match <= 6; match++) {
        matchEntries.push(generateMatchEntry(team.number, match, 'qualification'));
      }
    });
  }

  return { matchEntries, pitEntries };
}

// Export teams getter
export async function getTeams() {
  return await fetchTeamsFromTBA();
}
