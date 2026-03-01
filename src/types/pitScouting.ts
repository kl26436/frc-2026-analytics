// REBUILT 2026 Pit Scouting Types

export type DriveType = 'swerve' | 'tank' | 'mecanum' | 'other';
export type ProgrammingLanguage = 'java' | 'cpp' | 'python' | 'labview' | 'other';
export type ClimbLevel = 'level1' | 'level2' | 'level3' | 'none';
export type DriverExperience = '1stYear' | '2ndYear' | '3plusYears';
export type DriveTeamRole = 'driver' | 'driveCoach' | 'humanPlayer';
export type VibeCheck = 'good' | 'bad';

export interface PitPhoto {
  url: string;
  path: string;
  caption: string;
  isPrimary: boolean;
}

export interface PitScoutEntry {
  // Metadata
  id: string;
  eventCode: string;
  teamNumber: number;
  teamName: string;
  scoutName: string;
  timestamp: string;

  // Robot Photos
  photos: PitPhoto[];
  /** @deprecated Use photos array. Kept for backward compat. */
  photoUrl: string | null;
  /** @deprecated Use photos array. Kept for backward compat. */
  photoPath: string | null;

  // Drive Train
  driveType: DriveType | null;
  programmingLanguage: ProgrammingLanguage | null;

  // Field Navigation
  canGoUnderTrench: boolean;

  // Tower/Climb
  climbLevel: ClimbLevel | null;

  // General
  coachName: string;
  batteryCount: number;
  rotatesDriveTeam: boolean;
  rotatingRoles: DriveTeamRole[];
  driverExperience: DriverExperience | null;

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
  photos: [],
  photoUrl: null,
  photoPath: null,
  driveType: null,
  programmingLanguage: null,
  canGoUnderTrench: false,
  climbLevel: null,
  coachName: '',
  batteryCount: 0,
  rotatesDriveTeam: false,
  rotatingRoles: [],
  driverExperience: null,
  vibeCheck: null,
  specialFeatures: '',
  concerns: '',
  notes: '',
});

/** Normalize a PitScoutEntry loaded from Firestore or localStorage.
 *  Handles legacy entries with photoUrl/photoPath but no photos array. */
export function normalizePitScoutEntry(raw: Record<string, unknown>): PitScoutEntry {
  const entry = raw as unknown as PitScoutEntry;

  if (!entry.photos || !Array.isArray(entry.photos)) {
    if (entry.photoUrl && entry.photoPath) {
      entry.photos = [{ url: entry.photoUrl, path: entry.photoPath, caption: '', isPrimary: true }];
    } else {
      entry.photos = [];
    }
  }

  if (!entry.rotatingRoles || !Array.isArray(entry.rotatingRoles)) {
    entry.rotatingRoles = [];
  }

  const primary = entry.photos.find(p => p.isPrimary) ?? entry.photos[0];
  entry.photoUrl = primary?.url ?? null;
  entry.photoPath = primary?.path ?? null;

  return entry;
}
