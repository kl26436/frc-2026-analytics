// Alliance Selection Mode Types

export type SessionRole = 'admin' | 'editor' | 'viewer';
export type SelectionTeamStatus = 'available' | 'picked' | 'declined';
export type SessionStatus = 'active' | 'completed';

export interface SelectionTeam {
  teamNumber: number;
  originalTier: 'tier1' | 'tier2' | 'tier3' | 'unranked';
  originalRank: number;
  globalRank: number;
  status: SelectionTeamStatus;
  pickedByAlliance: number | null; // 1-8
  notes: string;
  tags: string[];
  flagged: boolean;
}

export interface Alliance {
  number: number; // 1-8
  captain: number | null;
  firstPick: number | null;
  secondPick: number | null;
  backupPick: number | null;
}

export interface SessionParticipant {
  displayName: string;
  teamNumber?: number;
  role: SessionRole;
  joinedAt: string;
}

export interface ChatMessage {
  id: string;
  uid: string;
  displayName: string;
  teamNumber?: number;
  text: string;
  timestamp: string;
}

export interface AllianceSelectionSession {
  sessionId: string;
  sessionCode: string;
  eventKey: string;
  createdBy: string;
  createdAt: string;
  participants: Record<string, SessionParticipant>;
  editorUids: string[];
  teams: SelectionTeam[];
  alliances: Alliance[];
  status: SessionStatus;
  showTier3: boolean;
  messages: ChatMessage[];
  lastUpdatedBy: string;
}
