// REBUILT 2026 Pit Scouting Types

export type DriveType = 'swerve' | 'tank' | 'mecanum' | 'other';
export type ProgrammingLanguage = 'java' | 'cpp' | 'python' | 'labview' | 'other';
export type ClimbLevel = 'level1' | 'level2' | 'level3' | 'none';
export type FuelIntake = 'ground' | 'chute' | 'outpost' | 'all';
export type VibeCheck = 'good' | 'bad';

export interface PitScoutEntry {
  // Metadata
  id: string;
  eventCode: string;
  teamNumber: number;
  teamName: string;
  scoutName: string;
  timestamp: string;

  // Robot Photo
  photoUrl: string | null;
  photoPath: string | null; // Firebase Storage path

  // Drive Train
  driveType: DriveType | null;
  programmingLanguage: ProgrammingLanguage | null;

  // Fuel Capabilities
  fuelIntakeGround: boolean;    // Can pick up FUEL from ground
  fuelIntakeChute: boolean;     // Can receive from CHUTE (human player)
  fuelIntakeOutpost: boolean;   // Can receive from OUTPOST
  fuelCapacity: number;         // How many FUEL can hold at once
  fuelCycleTime: number;        // Estimated seconds per cycle

  // Scoring
  canScoreActiveHub: boolean;   // Can score in HUB
  canScoreInactiveHub: boolean; // Can score in inactive HUB (if applicable)

  // Obstacles
  canCrossBumps: boolean;       // Can cross BUMPS on the field

  // Tower/Climb
  climbLevel: ClimbLevel;       // Highest climb level
  climbTime: number;            // Estimated seconds to climb

  // Auto Capabilities
  autoMobility: boolean;        // Can leave starting zone
  autoFuelCapability: number;   // Typical FUEL scored in auto (0-10+)
  autoClimbLevel1: boolean;     // Can reach LEVEL 1 in auto
  autoNotes: string;

  // General
  coachName: string;
  batteryCount: number;

  // Subjective
  vibeCheck: VibeCheck | null;
  specialFeatures: string;
  concerns: string;
  notes: string;
}

// Default empty entry for form initialization
export const createEmptyPitScoutEntry = (eventCode: string, scoutName: string): Omit<PitScoutEntry, 'id' | 'timestamp'> => ({
  eventCode,
  teamNumber: 0,
  teamName: '',
  scoutName,
  photoUrl: null,
  photoPath: null,
  driveType: null,
  programmingLanguage: null,
  fuelIntakeGround: false,
  fuelIntakeChute: false,
  fuelIntakeOutpost: false,
  fuelCapacity: 0,
  fuelCycleTime: 0,
  canScoreActiveHub: false,
  canScoreInactiveHub: false,
  canCrossBumps: false,
  climbLevel: 'none',
  climbTime: 0,
  autoMobility: false,
  autoFuelCapability: 0,
  autoClimbLevel1: false,
  autoNotes: '',
  coachName: '',
  batteryCount: 0,
  vibeCheck: null,
  specialFeatures: '',
  concerns: '',
  notes: '',
});
