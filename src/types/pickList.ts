// Pick List Types

export interface PickListTeam {
  teamNumber: number;
  tier: 'tier1' | 'tier2' | 'tier3';
  rank: number; // Position within the tier
  notes: string;
  isPicked: boolean;
  pickedBy?: number; // Team number that picked them
  tags: string[]; // e.g., ["great-auto", "defensive", "fast-cycles"]
  flagged: boolean; // Red flag for reliability issues
}

export interface PickListConfig {
  eventKey: string;
  tier1Name: string; // Custom name like "God Tier", "Elites", etc.
  tier2Name: string; // Custom name like "Definitely Getting Picked"
  tier3Name: string; // Custom name like "Do Not Pick", "Trash Bots"
  lastUpdated: string;
}

export interface PickList {
  config: PickListConfig;
  teams: PickListTeam[];
}
