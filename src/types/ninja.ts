// ── Ninja Scouting Types ─────────────────────────────────────────────────────

export const NINJA_TAGS = [
  'mechanical-issue',
  'electrical-issue',
  'pit-visit',
  'strong-driver',
  'weak-driver',
  'improving',
  'declining',
  'good-auto',
  'bad-auto',
  'good-defense',
  'red-flag',
  'green-flag',
  'strategy',
  'general',
] as const;

export type NinjaTag = (typeof NINJA_TAGS)[number];

export const NINJA_TAG_LABELS: Record<NinjaTag, string> = {
  'mechanical-issue': 'Mechanical Issue',
  'electrical-issue': 'Electrical Issue',
  'pit-visit': 'Pit Visit',
  'strong-driver': 'Strong Driver',
  'weak-driver': 'Weak Driver',
  'improving': 'Improving',
  'declining': 'Declining',
  'good-auto': 'Good Auto',
  'bad-auto': 'Bad Auto',
  'good-defense': 'Good Defense',
  'red-flag': 'Red Flag',
  'green-flag': 'Green Flag',
  'strategy': 'Strategy',
  'general': 'General',
};

export const NINJA_TAG_COLORS: Record<NinjaTag, string> = {
  'mechanical-issue': 'bg-danger/20 text-danger border-danger/30',
  'electrical-issue': 'bg-danger/20 text-danger border-danger/30',
  'pit-visit': 'bg-blueAlliance/20 text-blueAlliance border-blueAlliance/30',
  'strong-driver': 'bg-success/20 text-success border-success/30',
  'weak-driver': 'bg-warning/20 text-warning border-warning/30',
  'improving': 'bg-success/20 text-success border-success/30',
  'declining': 'bg-danger/20 text-danger border-danger/30',
  'good-auto': 'bg-success/20 text-success border-success/30',
  'bad-auto': 'bg-warning/20 text-warning border-warning/30',
  'good-defense': 'bg-success/20 text-success border-success/30',
  'red-flag': 'bg-danger/20 text-danger border-danger/30',
  'green-flag': 'bg-success/20 text-success border-success/30',
  'strategy': 'bg-blueAlliance/20 text-blueAlliance border-blueAlliance/30',
  'general': 'bg-surfaceElevated text-textSecondary border-border',
};

export interface NinjaAssignment {
  ninjaEmail: string;
  ninjaName: string;
  assignedAt: string;
  assignedBy: string;
}

export const NINJA_CATEGORIES = ['general', 'fix', 'conversation'] as const;
export type NinjaCategory = (typeof NINJA_CATEGORIES)[number];

export const NINJA_CATEGORY_LABELS: Record<NinjaCategory, string> = {
  general: 'General Notes',
  fix: 'Fixes',
  conversation: 'Conversations',
};

export const NINJA_CATEGORY_COLORS: Record<NinjaCategory, string> = {
  general: 'bg-surfaceElevated text-textPrimary border-border',
  fix: 'bg-warning/20 text-warning border-warning/30',
  conversation: 'bg-blueAlliance/20 text-blueAlliance border-blueAlliance/30',
};

export interface NinjaPhoto {
  url: string;
  path: string;
  caption: string;
}

export interface NinjaNote {
  id: string;
  teamNumber: number;
  authorEmail: string;
  authorName: string;
  text: string;
  category: NinjaCategory;
  tags: NinjaTag[];
  matchNumber: number | null;
  photos: NinjaPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface NinjaAssignmentsDoc {
  assignments: Record<string, NinjaAssignment>;
}
