// REBUILT 2026 Pit Scouting Types

export type DriveType = 'swerve' | 'tank' | 'mecanum' | 'other';
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
  driveType: DriveType;

  // Fuel Capabilities
  fuelIntakeGround: boolean;    // Can pick up FUEL from ground
  fuelIntakeChute: boolean;     // Can receive from CHUTE (human player)
  fuelIntakeOutpost: boolean;   // Can receive from OUTPOST
  fuelCapacity: number;         // How many FUEL can hold at once
  fuelCycleTime: number;        // Estimated seconds per cycle

  // Scoring
  canScoreActiveHub: boolean;   // Can score in active HUB
  canScoreInactiveHub: boolean; // Can score in inactive HUB (if applicable)

  // Obstacles
  canCrossBumps: boolean;       // Can cross BUMPS on the field

  // Tower/Climb
  climbLevel: ClimbLevel;       // Highest climb level
  climbTime: number;            // Estimated seconds to climb
  canAssistClimb: boolean;      // Can help other robots climb

  // Auto Capabilities
  autoMobility: boolean;        // Can leave starting zone
  autoFuelCapability: number;   // Typical FUEL scored in auto (0-10+)
  autoClimbLevel1: boolean;     // Can reach LEVEL 1 in auto
  autoNotes: string;

  // General
  coachName: string;
  batteryCount: number;

  // Subjective
  vibeCheck: VibeCheck;
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
  driveType: 'swerve',
  fuelIntakeGround: false,
  fuelIntakeChute: true,
  fuelIntakeOutpost: false,
  fuelCapacity: 1,
  fuelCycleTime: 0,
  canScoreActiveHub: true,
  canScoreInactiveHub: false,
  canCrossBumps: true,
  climbLevel: 'none',
  climbTime: 0,
  canAssistClimb: false,
  autoMobility: true,
  autoFuelCapability: 0,
  autoClimbLevel1: false,
  autoNotes: '',
  coachName: '',
  batteryCount: 4,
  vibeCheck: 'good',
  specialFeatures: '',
  concerns: '',
  notes: '',
});
