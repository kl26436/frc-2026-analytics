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

  // Ninja Inspection Checklist — ASK
  wheelsType: string;
  batteryStrappedDown: boolean | null;
  mainBreakerProtected: boolean | null;
  functionChecksBetweenMatches: boolean | null;
  unusedPortsCovered: boolean | null;
  wireConnectorType: string; // WAGOs preferred
  ferrulesAndHotGlue: boolean | null;
  fragileMechanisms: string;

  // Ninja Inspection Checklist — OBSERVE (1-5 scale)
  buildQuality: number | null;
  wiringQuality: number | null;
  wiringPhotoUrl: string | null;
  robotComplexity: number | null;
  complexityPhotoUrl: string | null;
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
  // Ninja inspection defaults
  wheelsType: '',
  batteryStrappedDown: null,
  mainBreakerProtected: null,
  functionChecksBetweenMatches: null,
  unusedPortsCovered: null,
  wireConnectorType: '',
  ferrulesAndHotGlue: null,
  fragileMechanisms: '',
  buildQuality: null,
  wiringQuality: null,
  wiringPhotoUrl: null,
  robotComplexity: null,
  complexityPhotoUrl: null,
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

  // Normalize ninja inspection fields for legacy entries
  if (entry.wheelsType === undefined) entry.wheelsType = '';
  if (entry.batteryStrappedDown === undefined) entry.batteryStrappedDown = null;
  if (entry.mainBreakerProtected === undefined) entry.mainBreakerProtected = null;
  if (entry.functionChecksBetweenMatches === undefined) entry.functionChecksBetweenMatches = null;
  if (entry.unusedPortsCovered === undefined) entry.unusedPortsCovered = null;
  if (entry.wireConnectorType === undefined) entry.wireConnectorType = '';
  if (entry.ferrulesAndHotGlue === undefined) entry.ferrulesAndHotGlue = null;
  if (entry.fragileMechanisms === undefined) entry.fragileMechanisms = '';
  if (entry.buildQuality === undefined) entry.buildQuality = null;
  if (entry.wiringQuality === undefined) entry.wiringQuality = null;
  if (entry.wiringPhotoUrl === undefined) entry.wiringPhotoUrl = null;
  if (entry.robotComplexity === undefined) entry.robotComplexity = null;
  if (entry.complexityPhotoUrl === undefined) entry.complexityPhotoUrl = null;

  const primary = entry.photos.find(p => p.isPrimary) ?? entry.photos[0];
  entry.photoUrl = primary?.url ?? null;
  entry.photoPath = primary?.path ?? null;

  return entry;
}
