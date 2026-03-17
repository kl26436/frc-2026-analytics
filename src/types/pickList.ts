// Pick List Types

export interface PickListTeam {
  teamNumber: number;
  tier: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  rank: number; // Position within the tier
  notes: string;
  isPicked: boolean;
  pickedBy?: number; // Team number that picked them
  tags: string[]; // e.g., ["great-auto", "defensive", "fast-cycles"]
  flagged: boolean; // Red flag for reliability issues
  onWatchlist: boolean; // Track during final matches
  watchlistRank?: number | null; // Rank within watchlist (1 = best)
  watchlistNotes?: string | null; // Notes from watching final matches
  reviewed?: boolean; // Has this team been manually moved or edited?
}

export interface PickListConfig {
  eventKey: string;
  tier1Name: string; // Custom name like "God Tier", "Elites", etc.
  tier2Name: string; // Custom name like "Definitely Getting Picked"
  tier3Name: string; // Custom name like "Do Not Pick", "Trash Bots"
  tier4Name?: string; // Custom name like "Do Not Pick" (optional for backward compatibility)
  lastUpdated: string;
}

export interface PickList {
  config: PickListConfig;
  teams: PickListTeam[];
}

// ─── Filter Config (shared for live sync) ────────────────────────────────────

export interface FilterCondition {
  field: string;
  operator: '>=' | '<=' | '>' | '<';
  threshold: number;
}

export interface FilterConfig {
  id: string;
  label: string;
  icon: string;
  field: string; // keyof TeamStatistics, typed loosely for portability
  operator: '>=' | '<=' | '>' | '<';
  threshold: number;
  active: boolean;
  additionalConditions?: FilterCondition[];
  /** Filter data source. */
  filterType?: 'stats' | 'pit-boolean' | 'pit-select' | 'pit-number';
  /** For pit-select filters: which categorical values to match (any of). */
  pitValues?: string[];
  /** For pit filters: which pit field to read from PitScoutEntry. */
  pitField?: string;
}

// ─── Live Pick List (Firestore-backed) ───────────────────────────────────────

export interface LiveComment {
  id: string;           // Firestore doc ID
  teamNumber: number;
  uid: string;
  email: string;
  displayName: string;
  text: string;
  ts: string;           // ISO string (converted from Timestamp)
}

export interface LiveSuggestion {
  id: string;           // Firestore doc ID
  teamNumber: number;
  uid: string;
  displayName: string;
  suggestedTier: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  reason: string;
  votes: string[];      // array of UIDs who upvoted
  ts: string;           // ISO string
  status: 'pending' | 'accepted' | 'dismissed';
}

export interface LiveLockStatus {
  uid: string;
  email: string;
  displayName: string;
  lockedAt: string;     // ISO string
}

export interface LivePickListDoc {
  eventKey: string;
  config: PickListConfig;
  teams: PickListTeam[];
  rankingsSnapshot: Record<string, unknown> | null;
  snapshotTakenAt: string | null;
  snapshotTakenBy: string | null;
  lockedBy: LiveLockStatus | null;
  updatedAt: string;
  updatedBy: string;
}
