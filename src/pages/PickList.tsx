import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePickListStore, DEFAULT_RED_FLAG_THRESHOLDS, type RedFlagThresholds } from '../store/usePickListStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useAuth } from '../contexts/AuthContext';
import { usePickListSync } from '../hooks/usePickListSync';
import ComparisonModal from '../components/ComparisonModal';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Settings,
  Download,
  Upload,
  Flag,
  StickyNote,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Ban,
  Filter,
  Mountain,
  Zap,
  Shield,
  Trophy,
  Target,
  Wrench,
  SlidersHorizontal,
  Trash2,
  Plus,
  AlertTriangle,
  Handshake,
  Eye,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Check,
  MessageSquare,
  ThumbsUp,
  Lock,
  Unlock,
  UserCheck,
  Loader,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PickListTeam, PickListConfig, FilterConfig } from '../types/pickList';
import type { LiveComment, LiveSuggestion, LiveLockStatus } from '../types/pickList';
import type { TeamStatistics } from '../types/scouting';
import { doesTeamPassAllFilters, countTeamsPassingFilter } from '../utils/filterUtils';

// Multi-column DnD collision strategy:
//   1. If the pointer is directly over a team card → use that card (precise within-tier insertion)
//   2. If the pointer is in a column gap (between cards) → closestCenter scoped to that column's cards
//   3. If the pointer is over a column header / empty column → return the column (drop at end)
//   4. Pointer outside all droppables → rectIntersection fallback
// This beats plain closestCenter (which fails for horizontal left/right drags because
// same-column cards at the same Y have a smaller center-distance than the target column).
const multiColumnCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);

  if (pointerHits.length > 0) {
    // Stage 1: prefer team card droppables (smallest / most specific)
    const teamHits = pointerHits.filter(h => h.id.toString().startsWith('team-'));
    if (teamHits.length > 0) return teamHits;

    // Stage 2: pointer is within a column container but in a gap between cards.
    // Restrict closestCenter to only the cards that visually belong to that column.
    const colId = pointerHits[0]?.id;
    const colContainer = args.droppableContainers.find(c => c.id === colId);
    if (colContainer?.rect.current) {
      const { left, right } = colContainer.rect.current;
      const teamsInCol = args.droppableContainers.filter(c => {
        if (!c.id.toString().startsWith('team-') || !c.rect.current) return false;
        const r = c.rect.current;
        return r.left >= left - 10 && r.right <= right + 10;
      });
      if (teamsInCol.length > 0) {
        return closestCenter({ ...args, droppableContainers: teamsInCol });
      }
    }

    // Stage 3: empty column or column header area
    return pointerHits;
  }

  // Stage 4: not within any droppable
  return rectIntersection(args);
};

const FILTER_ICONS: Record<string, LucideIcon> = {
  mountain: Mountain,
  zap: Zap,
  shield: Shield,
  trophy: Trophy,
  target: Target,
  wrench: Wrench,
};

const STAT_OPTIONS: { value: keyof TeamStatistics; label: string }[] = [
  { value: 'avgTotalPoints', label: 'Avg Total Points' },
  { value: 'avgAutoPoints', label: 'Avg Auto Points' },
  { value: 'avgTeleopPoints', label: 'Avg Teleop Points' },
  { value: 'avgEndgamePoints', label: 'Avg Endgame Points' },
  { value: 'avgTotalFuelEstimate', label: 'Avg Total Fuel' },
  { value: 'avgAutoFuelEstimate', label: 'Avg Auto Fuel' },
  { value: 'avgTeleopFuelEstimate', label: 'Avg Teleop Fuel' },
  { value: 'level3ClimbRate', label: 'L3 Climb Rate (%)' },
  { value: 'level2ClimbRate', label: 'L2 Climb Rate (%)' },
  { value: 'level1ClimbRate', label: 'L1 Climb Rate (%)' },
  { value: 'climbFailedRate', label: 'Climb Failed Rate (%)' },
  { value: 'autoClimbRate', label: 'Auto Climb Rate (%)' },
  { value: 'autoDidNothingRate', label: 'Auto Did Nothing (%)' },
  { value: 'dedicatedPasserRate', label: 'Dedicated Passer (%)' },
  { value: 'lostConnectionRate', label: 'Lost Connection (%)' },
  { value: 'noRobotRate', label: 'No Robot (%)' },
  { value: 'poorAccuracyRate', label: 'Poor Accuracy (%)' },
];

const DEFAULT_FILTERS: FilterConfig[] = [
  { id: 'l3Climber', label: 'L3 Climber', icon: 'mountain', field: 'level3ClimbRate', operator: '>=', threshold: 20, active: false },
  { id: 'strongAuto', label: 'Strong Auto', icon: 'zap', field: 'avgAutoPoints', operator: '>=', threshold: 10, active: false },
  { id: 'reliable', label: 'Reliable', icon: 'shield', field: 'lostConnectionRate', operator: '<=', threshold: 15, active: false },
  { id: 'highScorer', label: 'High Scorer', icon: 'trophy', field: 'avgTotalPoints', operator: '>=', threshold: 35, active: false },
];

// ── Live mode helpers ──────────────────────────────────────────────────────────

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function updateLiveNotes(teams: PickListTeam[], teamNumber: number, notes: string): PickListTeam[] {
  return teams.map(t => t.teamNumber === teamNumber ? { ...t, notes } : t);
}

function toggleLiveFlag(teams: PickListTeam[], teamNumber: number): PickListTeam[] {
  return teams.map(t => t.teamNumber === teamNumber ? { ...t, flagged: !t.flagged } : t);
}

function toggleLiveWatchlist(teams: PickListTeam[], teamNumber: number): PickListTeam[] {
  const team = teams.find(t => t.teamNumber === teamNumber);
  if (!team) return teams;
  if (team.onWatchlist) {
    // Removing — clear rank/notes then re-number remaining
    const removed = teams.map(t => t.teamNumber === teamNumber
      ? { ...t, onWatchlist: false, watchlistRank: undefined, watchlistNotes: undefined }
      : t,
    );
    const remaining = removed.filter(t => t.onWatchlist).sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
    const ranks: Record<number, number> = {};
    remaining.forEach((t, i) => { ranks[t.teamNumber] = i + 1; });
    return removed.map(t => t.onWatchlist ? { ...t, watchlistRank: ranks[t.teamNumber] } : t);
  } else {
    // Adding — assign next rank
    const nextRank = teams.filter(t => t.onWatchlist).length + 1;
    return teams.map(t => t.teamNumber === teamNumber
      ? { ...t, onWatchlist: true, watchlistRank: nextRank, watchlistNotes: '' }
      : t,
    );
  }
}

function updateLiveWatchlistNotes(teams: PickListTeam[], teamNumber: number, notes: string): PickListTeam[] {
  return teams.map(t => t.teamNumber === teamNumber ? { ...t, watchlistNotes: notes } : t);
}

function reorderLiveWatchlist(teams: PickListTeam[], teamNumber: number, newRank: number): PickListTeam[] {
  const watchlistTeams = teams.filter(t => t.onWatchlist).sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
  const teamIndex = watchlistTeams.findIndex(t => t.teamNumber === teamNumber);
  if (teamIndex === -1) return teams;
  const [moved] = watchlistTeams.splice(teamIndex, 1);
  watchlistTeams.splice(newRank - 1, 0, moved);
  const ranks: Record<number, number> = {};
  watchlistTeams.forEach((t, i) => { ranks[t.teamNumber] = i + 1; });
  return teams.map(t => t.onWatchlist ? { ...t, watchlistRank: ranks[t.teamNumber] } : t);
}

function clearLiveWatchlist(teams: PickListTeam[]): PickListTeam[] {
  return teams.map(t => ({ ...t, onWatchlist: false, watchlistRank: undefined, watchlistNotes: undefined }));
}

function finalizeLiveWatchlist(teams: PickListTeam[], insertAtRank: number): PickListTeam[] {
  const watchlistTeams = teams.filter(t => t.onWatchlist).sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
  if (watchlistTeams.length === 0) return teams;
  const tier2Teams = teams.filter(t => t.tier === 'tier2' && !t.onWatchlist).sort((a, b) => a.rank - b.rank);
  const newTier2Order = [
    ...tier2Teams.slice(0, insertAtRank - 1),
    ...watchlistTeams,
    ...tier2Teams.slice(insertAtRank - 1),
  ];
  return teams.map(team => {
    if (team.onWatchlist) {
      const newRank = newTier2Order.findIndex(t => t.teamNumber === team.teamNumber) + 1;
      return {
        ...team,
        tier: 'tier2' as const,
        rank: newRank,
        onWatchlist: false,
        watchlistRank: undefined,
        notes: team.watchlistNotes ? `${team.notes}\n[Watchlist] ${team.watchlistNotes}`.trim() : team.notes,
        watchlistNotes: undefined,
      };
    }
    if (team.tier === 'tier2') {
      const newRank = newTier2Order.findIndex(t => t.teamNumber === team.teamNumber) + 1;
      if (newRank > 0) return { ...team, rank: newRank };
    }
    return team;
  });
}

// Same-tier reorder: slide teamNumber to position where overTeam was
function applyLiveSameTierMove(
  teams: PickListTeam[],
  teamNumber: number,
  tier: PickListTeam['tier'],
  targetRank: number,
): PickListTeam[] {
  const tierTeams = teams.filter(t => t.tier === tier).sort((a, b) => a.rank - b.rank);
  const fromIdx = tierTeams.findIndex(t => t.teamNumber === teamNumber);
  const toIdx = tierTeams.findIndex(t => t.rank === targetRank);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return teams;
  const [moved] = tierTeams.splice(fromIdx, 1);
  tierTeams.splice(toIdx, 0, moved);
  const updated = tierTeams.map((t, i) => ({ ...t, rank: i + 1 }));
  return teams.map(t => t.tier !== tier ? t : (updated.find(u => u.teamNumber === t.teamNumber) ?? t));
}

// Cross-tier move: move teamNumber into newTier at targetRank
function applyLiveCrossTierMove(
  teams: PickListTeam[],
  teamNumber: number,
  newTier: PickListTeam['tier'],
  targetRank: number,
): PickListTeam[] {
  const team = teams.find(t => t.teamNumber === teamNumber);
  if (!team) return teams;
  const oldTier = team.tier;
  const oldTierUpdated = teams
    .filter(t => t.tier === oldTier && t.teamNumber !== teamNumber)
    .sort((a, b) => a.rank - b.rank)
    .map((t, i) => ({ ...t, rank: i + 1 }));
  const newTierTeams = teams.filter(t => t.tier === newTier).sort((a, b) => a.rank - b.rank);
  const insertIdx = newTierTeams.findIndex(t => t.rank >= targetRank);
  const movedTeam = { ...team, tier: newTier, rank: targetRank };
  if (insertIdx === -1) newTierTeams.push(movedTeam);
  else newTierTeams.splice(insertIdx, 0, movedTeam);
  const newTierUpdated = newTierTeams.map((t, i) => ({ ...t, rank: i + 1 }));
  return teams.map(t => {
    if (t.teamNumber === teamNumber) return newTierUpdated.find(u => u.teamNumber === teamNumber)!;
    if (t.tier === newTier) return newTierUpdated.find(u => u.teamNumber === t.teamNumber) ?? t;
    if (t.tier === oldTier) return oldTierUpdated.find(u => u.teamNumber === t.teamNumber) ?? t;
    return t;
  });
}

// Move winner immediately above loser (comparison result)
function applyLiveMoveAbove(
  teams: PickListTeam[],
  winnerNumber: number,
  loserNumber: number,
): PickListTeam[] {
  const winner = teams.find(t => t.teamNumber === winnerNumber);
  const loser = teams.find(t => t.teamNumber === loserNumber);
  if (!winner || !loser) return teams;
  if (winner.tier === loser.tier) {
    return applyLiveSameTierMove(teams, winnerNumber, winner.tier, loser.rank);
  }
  return applyLiveCrossTierMove(teams, winnerNumber, loser.tier, loser.rank);
}

// ── LiveTeamExtras ─────────────────────────────────────────────────────────────
// Renders comments + suggestions panel below each live mode team card

interface LiveTeamExtrasProps {
  teamNumber: number;
  tierNames: { tier1: string; tier2: string; tier3: string; tier4: string };
  canEdit: boolean;
  uid: string | null;
  teamComments: LiveComment[];
  teamSuggestions: LiveSuggestion[];
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
  onAddSuggestion: (tier: LiveSuggestion['suggestedTier'], reason: string) => void;
  onVoteSuggestion: (id: string) => void;
  onAcceptSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
}

function LiveTeamExtras({
  teamNumber: _tn, tierNames, canEdit, uid,
  teamComments, teamSuggestions,
  onAddComment, onDeleteComment,
  onAddSuggestion, onVoteSuggestion, onAcceptSuggestion, onDismissSuggestion,
}: LiveTeamExtrasProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestTier, setSuggestTier] = useState<LiveSuggestion['suggestedTier']>('tier1');
  const [suggestReason, setSuggestReason] = useState('');

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    onAddComment(commentText.trim());
    setCommentText('');
  };

  const handleSuggest = () => {
    if (!suggestReason.trim()) return;
    onAddSuggestion(suggestTier, suggestReason.trim());
    setShowSuggest(false);
    setSuggestReason('');
  };

  const hasComments = teamComments.length > 0;

  return (
    <div className="-mt-2 mb-2 border border-t-0 border-border rounded-b-lg px-2 pb-2">
      {/* Pending suggestions — editor sees accept/dismiss */}
      {canEdit && teamSuggestions.length > 0 && (
        <div className="pt-1 space-y-1">
          {teamSuggestions.map(s => (
            <div key={s.id} className="flex items-center gap-1 px-2 py-1 bg-warning/10 border border-warning/30 rounded text-xs flex-wrap">
              <span className="font-medium text-warning">{s.displayName}</span>
              <span className="text-textSecondary">→ {tierNames[s.suggestedTier]}:</span>
              <span className="text-textPrimary flex-1 min-w-0 truncate">{s.reason}</span>
              <span className="text-textMuted">👍 {s.votes.length}</span>
              <button onClick={() => onAcceptSuggestion(s.id)}
                className="p-0.5 text-success hover:bg-success/20 rounded transition-colors" title="Accept">
                <Check size={12} />
              </button>
              <button onClick={() => onDismissSuggestion(s.id)}
                className="p-0.5 text-danger hover:bg-danger/20 rounded transition-colors" title="Dismiss">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Non-editor sees pending suggestions with vote button */}
      {!canEdit && teamSuggestions.length > 0 && (
        <div className="pt-1 space-y-1">
          {teamSuggestions.map(s => (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1 bg-warning/10 border border-warning/30 rounded text-xs">
              <span className="text-warning font-medium">{s.displayName}</span>
              <span className="text-textSecondary">→ {tierNames[s.suggestedTier]}</span>
              <span className="text-textMuted flex-1 truncate">{s.reason}</span>
              <button
                onClick={() => onVoteSuggestion(s.id)}
                disabled={s.votes.includes(uid ?? '')}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${s.votes.includes(uid ?? '') ? 'text-success' : 'text-textMuted hover:text-success'}`}
                    title="Vote for this suggestion"
              >
                <ThumbsUp size={11} />
                <span>{s.votes.length}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action row: comments + suggest */}
      <div className="flex items-center gap-3 pt-1.5">
        <button
          onClick={() => setShowComments(!showComments)}
          className={`flex items-center gap-1 text-xs transition-colors ${showComments ? 'text-blueAlliance' : hasComments ? 'text-textSecondary hover:text-blueAlliance' : 'text-textMuted hover:text-blueAlliance'}`}
        >
          <MessageSquare size={12} />
          {hasComments ? teamComments.length : 'Comment'}
        </button>
        {!canEdit && (
          <button
            onClick={() => setShowSuggest(!showSuggest)}
            className={`flex items-center gap-1 text-xs transition-colors ${showSuggest ? 'text-warning' : 'text-textMuted hover:text-warning'}`}
          >
            <ArrowUp size={12} />
            Suggest tier
          </button>
        )}
      </div>

      {/* Comment panel */}
      {showComments && (
        <div className="mt-1.5 px-2 py-2 bg-background/60 border border-border rounded-lg space-y-2">
          {teamComments.length === 0 ? (
            <p className="text-xs text-textMuted italic">No comments yet.</p>
          ) : (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {[...teamComments]
                .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
                .map(c => (
                  <div key={c.id} className="flex items-start gap-1.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-textSecondary">{c.displayName}</span>
                      <span className="text-textMuted ml-1">{formatRelativeTime(c.ts)}</span>
                      <p className="text-textPrimary">{c.text}</p>
                    </div>
                    {c.uid === uid && (
                      <button onClick={() => onDeleteComment(c.id)}
                        className="p-0.5 text-textMuted hover:text-danger rounded transition-colors flex-shrink-0">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
              placeholder="Add a comment..."
              className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs"
            />
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim()}
              className="px-2 py-1 bg-blueAlliance text-white text-xs rounded disabled:opacity-50 hover:bg-blueAlliance/90 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Suggest tier panel (non-editor) */}
      {showSuggest && !canEdit && (
        <div className="mt-1.5 px-2 py-2 bg-background/60 border border-border rounded-lg space-y-2">
          <p className="text-xs text-textSecondary font-medium">Suggest a tier change:</p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={suggestTier}
              onChange={e => setSuggestTier(e.target.value as LiveSuggestion['suggestedTier'])}
              className="px-2 py-1 bg-background border border-border rounded text-xs"
            >
              <option value="tier1">{tierNames.tier1}</option>
              <option value="tier2">{tierNames.tier2}</option>
              <option value="tier3">{tierNames.tier3}</option>
              <option value="tier4">{tierNames.tier4}</option>
            </select>
            <input
              type="text"
              value={suggestReason}
              onChange={e => setSuggestReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSuggest(); }}
              placeholder="Reason (required)..."
              className="flex-1 min-w-0 px-2 py-1 bg-background border border-border rounded text-xs"
            />
            <button
              onClick={handleSuggest}
              disabled={!suggestReason.trim()}
              className="px-2 py-1 bg-warning text-background text-xs rounded disabled:opacity-50 hover:bg-warning/90 transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LivePickListView ───────────────────────────────────────────────────────────

interface LivePickListViewProps {
  personalPickList: ReturnType<typeof usePickListStore.getState>['pickList'];
  isAdmin: boolean;
  uid: string | null;
  userEmail: string | null;
  liveList: ReturnType<typeof usePickListSync>['liveList'];
  lockStatus: LiveLockStatus | null;
  snapshotTakenAt: string | null;
  snapshotTakenBy: string | null;
  pendingControlFor: string | null;
  comments: LiveComment[];
  suggestions: LiveSuggestion[];
  syncing: boolean;
  exists: boolean;
  isLockHolder: boolean;
  isLockStale: boolean;
  canEdit: boolean;
  takeControl: () => Promise<void>;
  releaseControl: () => Promise<void>;
  pushTeams: (teams: PickListTeam[]) => Promise<void>;
  pushConfig: (config: PickListConfig) => Promise<void>;
  initializeLiveList: (...args: Parameters<ReturnType<typeof usePickListSync>['initializeLiveList']>) => Promise<void>;
  acceptSuggestion: (id: string, teams: PickListTeam[]) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
  deleteLiveList: () => Promise<void>;
  passControl: (email: string, displayName: string) => Promise<void>;
  claimPendingControl: () => Promise<void>;
  addComment: (teamNumber: number, text: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  addSuggestion: (teamNumber: number, tier: LiveSuggestion['suggestedTier'], reason: string) => Promise<void>;
  voteSuggestion: (id: string) => Promise<void>;
  tbaData: ReturnType<typeof useAnalyticsStore.getState>['tbaData'];
  filterConfigs: FilterConfig[];
  toggleFilter: (id: string) => void;
  updateFilter: (id: string, updates: Partial<FilterConfig>) => void;
  addFilter: () => void;
  removeFilter: (id: string) => void;
  hasActiveFilters: boolean;
  teamPassesFilters: (teamNumber: number) => boolean;
  liveFilterConfigs: FilterConfig[] | null;
  pushLiveFilterConfigs: (configs: FilterConfig[]) => Promise<void>;
  compareTeams: number[];
  onToggleCompare: (teamNumber: number) => void;
  allowedUsers: { email: string; displayName: string }[];
}

function LivePickListView({
  personalPickList,
  isAdmin, uid, userEmail,
  liveList, lockStatus, snapshotTakenAt, snapshotTakenBy, pendingControlFor,
  comments, suggestions, syncing, exists,
  isLockHolder, isLockStale, canEdit,
  takeControl, releaseControl, pushTeams, pushConfig,
  initializeLiveList, acceptSuggestion, dismissSuggestion, deleteLiveList,
  passControl, claimPendingControl,
  addComment, deleteComment, addSuggestion, voteSuggestion,
  tbaData,
  filterConfigs, toggleFilter, updateFilter, addFilter, removeFilter,
  liveFilterConfigs, pushLiveFilterConfigs,
  compareTeams, onToggleCompare,
  allowedUsers,
}: LivePickListViewProps) {
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const [showSuggestionSummary, setShowSuggestionSummary] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [showLiveSettings, setShowLiveSettings] = useState(false);
  const [showFilterSettings, setShowFilterSettings] = useState(false);
  const [liveTier1Name, setLiveTier1Name] = useState('');
  const [liveTier2Name, setLiveTier2Name] = useState('');
  const [liveTier3Name, setLiveTier3Name] = useState('');
  const [liveTier4Name, setLiveTier4Name] = useState('Do Not Pick');
  const [showPassControl, setShowPassControl] = useState(false);
  const [liveActiveId, setLiveActiveId] = useState<string | null>(null);
  const [dragItems, setDragItems] = useState<PickListTeam[] | null>(null);
  const [showWatchlist, setShowWatchlist] = useState(true);
  const [insertAtLiveRank, setInsertAtLiveRank] = useState(1);

  useEffect(() => {
    if (liveList?.config) {
      setLiveTier1Name(liveList.config.tier1Name);
      setLiveTier2Name(liveList.config.tier2Name);
      setLiveTier3Name(liveList.config.tier3Name);
      setLiveTier4Name(liveList.config.tier4Name ?? 'Do Not Pick');
    }
  }, [liveList?.config]);

  const liveSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: canEdit ? 8 : 999999 } })
  );

  const handleLiveDragStart = (event: DragStartEvent) => {
    setLiveActiveId(event.active.id.toString());
    // Snapshot current teams into local drag state for optimistic updates
    if (liveList) setDragItems([...liveList.teams]);
  };

  // Fires each time the active droppable changes — update local drag state for live feedback
  const handleLiveDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !canEdit) return;
    setDragItems(prev => {
      const items = prev;
      if (!items) return prev;
      const activeNum = parseInt(active.id.toString().replace('team-', ''));
      const overId = over.id.toString();
      if (overId.startsWith('team-')) {
        const overNum = parseInt(overId.replace('team-', ''));
        if (activeNum === overNum) return prev;
        const activeTeam = items.find(t => t.teamNumber === activeNum);
        const overTeam = items.find(t => t.teamNumber === overNum);
        if (!activeTeam || !overTeam) return prev;
        if (activeTeam.tier === overTeam.tier) {
          return applyLiveSameTierMove(items, activeNum, activeTeam.tier, overTeam.rank);
        } else {
          return applyLiveCrossTierMove(items, activeNum, overTeam.tier, overTeam.rank);
        }
      }
      let targetTier: PickListTeam['tier'] | null = null;
      if (overId === 'live-tier1-column') targetTier = 'tier1';
      else if (overId === 'live-tier2-column') targetTier = 'tier2';
      else if (overId === 'live-tier3-column') targetTier = 'tier3';
      else if (overId === 'live-tier4-column') targetTier = 'tier4';
      if (!targetTier) return prev;
      const activeTeam = items.find(t => t.teamNumber === activeNum);
      if (!activeTeam || activeTeam.tier === targetTier) return prev;
      const tierTeams = items.filter(t => t.tier === targetTier);
      const maxRank = tierTeams.length > 0 ? Math.max(...tierTeams.map(t => t.rank)) : 0;
      return applyLiveCrossTierMove(items, activeNum, targetTier, maxRank + 1);
    });
  };

  // On drop: commit local drag state to Firestore in one write
  const handleLiveDragEnd = (_event: DragEndEvent) => {
    setLiveActiveId(null);
    if (!canEdit) { setDragItems(null); return; }
    if (dragItems) pushTeams(dragItems);
    setDragItems(null);
  };

  const handleLiveMoveTier = (teamNumber: number, newTier: PickListTeam['tier']) => {
    if (!liveList || !canEdit) return;
    const tierTeams = liveList.teams.filter(t => t.tier === newTier);
    const maxRank = tierTeams.length > 0 ? Math.max(...tierTeams.map(t => t.rank)) : 0;
    pushTeams(applyLiveCrossTierMove(liveList.teams, teamNumber, newTier, maxRank + 1));
  };

  const handleSaveLiveTierNames = async () => {
    if (!liveList) return;
    await pushConfig({ ...liveList.config, tier1Name: liveTier1Name, tier2Name: liveTier2Name, tier3Name: liveTier3Name, tier4Name: liveTier4Name });
    setShowLiveSettings(false);
  };

  const countLivePassingTeams = (filter: FilterConfig): number => {
    if (!liveList) return 0;
    return countTeamsPassingFilter(filter, liveList.teams, teamStatistics);
  };

  // Use Firestore-synced filter configs when available; fall back to local defaults
  const effectiveFilterConfigs = liveFilterConfigs ?? filterConfigs;
  const liveHasActiveFilters = effectiveFilterConfigs.some(f => f.active);

  const liveTeamPassesFilters = (teamNumber: number): boolean =>
    doesTeamPassAllFilters(teamNumber, effectiveFilterConfigs, teamStatistics);

  // When admin toggles a filter, update locally AND push to Firestore
  const handleLiveToggleFilter = (id: string) => {
    const updated = effectiveFilterConfigs.map(f => f.id === id ? { ...f, active: !f.active } : f);
    toggleFilter(id); // updates local state in parent (keeps button UI reactive)
    if (canEdit) pushLiveFilterConfigs(updated);
  };

  const handleLiveUpdateFilter = (id: string, updates: Partial<FilterConfig>) => {
    const updated = effectiveFilterConfigs.map(f => f.id === id ? { ...f, ...updates } : f);
    updateFilter(id, updates);
    if (canEdit) pushLiveFilterConfigs(updated);
  };

  const handleLiveAddFilter = () => {
    const newId = `custom-${Date.now()}`;
    const newFilter: FilterConfig = { id: newId, label: 'New Filter', icon: 'target', field: 'avgTotalPoints', operator: '>=', threshold: 0, active: false };
    addFilter();
    if (canEdit) pushLiveFilterConfigs([...effectiveFilterConfigs, newFilter]);
  };

  const handleLiveRemoveFilter = (id: string) => {
    const updated = effectiveFilterConfigs.filter(f => f.id !== id);
    removeFilter(id);
    if (canEdit) pushLiveFilterConfigs(updated);
  };

  const handleLiveClearAllFilters = () => {
    const updated = effectiveFilterConfigs.map(f => ({ ...f, active: false }));
    effectiveFilterConfigs.filter(f => f.active).forEach(f => toggleFilter(f.id));
    if (canEdit) pushLiveFilterConfigs(updated);
  };

  const handleInitialize = async () => {
    if (!personalPickList) return;
    setInitializing(true);
    try {
      await initializeLiveList(
        personalPickList,
        tbaData?.rankings ?? null,
        tbaData?.teams.map(t => ({ teamNumber: t.team_number })) ?? [],
      );
    } finally {
      setInitializing(false);
    }
  };

  if (syncing && !exists) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size={24} className="animate-spin text-textMuted mr-3" />
        <span className="text-textSecondary">Connecting to live list…</span>
      </div>
    );
  }

  if (!exists || !liveList) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        {isAdmin ? (
          <>
            <p className="text-textSecondary text-center">No live pick list exists for this event yet.</p>
            <p className="text-xs text-textMuted text-center max-w-sm">
              This will snapshot current TBA rankings and initialize from your personal pick list.
              Rankings will be frozen at this moment.
            </p>
            <button
              onClick={handleInitialize}
              disabled={initializing || !personalPickList}
              className="flex items-center gap-2 px-5 py-2.5 bg-success text-background font-semibold rounded-lg hover:bg-success/90 disabled:opacity-50 transition-colors"
            >
              {initializing ? <Loader size={16} className="animate-spin" /> : <Lock size={16} />}
              {initializing ? 'Initializing…' : 'Fetch Latest Rankings & Initialize Live List'}
            </button>
          </>
        ) : (
          <p className="text-textSecondary text-center">No live pick list has been set up by an admin yet.</p>
        )}
      </div>
    );
  }

  const tierNames = {
    tier1: liveList.config.tier1Name,
    tier2: liveList.config.tier2Name,
    tier3: liveList.config.tier3Name,
    tier4: liveList.config.tier4Name ?? 'Do Not Pick',
  };

  // During drag, show optimistic local state; after drop, show Firestore-confirmed state
  const displayTeams = dragItems ?? liveList.teams;
  const tier1Teams = displayTeams.filter(t => t.tier === 'tier1').sort((a, b) => a.rank - b.rank);
  const tier2Teams = displayTeams.filter(t => t.tier === 'tier2').sort((a, b) => a.rank - b.rank);
  const tier3Teams = displayTeams.filter(t => t.tier === 'tier3').sort((a, b) => a.rank - b.rank);
  const tier4Teams = displayTeams.filter(t => t.tier === 'tier4').sort((a, b) => a.rank - b.rank);
  const liveTeamCount = tier1Teams.length + tier2Teams.length;

  const renderTeamExtra = (teamNumber: number) => (
    <LiveTeamExtras
      teamNumber={teamNumber}
      tierNames={tierNames}
      canEdit={canEdit}
      uid={uid}
      teamComments={comments.filter(c => c.teamNumber === teamNumber)}
      teamSuggestions={suggestions.filter(s => s.teamNumber === teamNumber)}
      onAddComment={text => addComment(teamNumber, text)}
      onDeleteComment={deleteComment}
      onAddSuggestion={(tier, reason) => addSuggestion(teamNumber, tier, reason)}
      onVoteSuggestion={voteSuggestion}
      onAcceptSuggestion={id => {
        const s = suggestions.find(su => su.id === id);
        if (s) acceptSuggestion(id, applyLiveCrossTierMove(liveList!.teams, teamNumber, s.suggestedTier, 999));
      }}
      onDismissSuggestion={dismissSuggestion}
    />
  );

  return (
    <div className="space-y-4">
      {/* Pending control claim banner */}
      {pendingControlFor && pendingControlFor === userEmail?.toLowerCase() && (
        <div className="flex items-center gap-3 px-4 py-3 bg-success/10 border border-success/40 rounded-lg">
          <UserCheck size={18} className="text-success flex-shrink-0" />
          <span className="text-sm text-success font-medium flex-1">
            Control has been passed to you. Click to take it.
          </span>
          <button
            onClick={claimPendingControl}
            className="px-3 py-1.5 bg-success text-background text-xs font-semibold rounded-lg hover:bg-success/90 transition-colors"
          >
            Claim Control
          </button>
        </div>
      )}

      {/* Snapshot header */}
      {snapshotTakenAt && (
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-textSecondary">
          <Lock size={12} className="flex-shrink-0" />
          <span>
            Rankings locked as of {new Date(snapshotTakenAt).toLocaleString()}
            {snapshotTakenBy && <> by {snapshotTakenBy}</>}
          </span>
        </div>
      )}

      {/* Admin lock bar */}
      {isAdmin && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${isLockHolder ? 'bg-success/10 border-success/40' : 'bg-surface border-border'}`}>
          {isLockHolder ? (
            <>
              <UserCheck size={16} className="text-success flex-shrink-0" />
              <span className="text-sm font-medium text-success flex-1">You have control</span>
              <div className="flex items-center gap-2">
                {allowedUsers.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowPassControl(!showPassControl)}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs text-textSecondary hover:text-textPrimary border border-border rounded transition-colors"
                    >
                      <Handshake size={12} />
                      Pass Control
                    </button>
                    {showPassControl && (
                      <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-lg min-w-[200px] max-h-48 overflow-y-auto">
                        {allowedUsers.filter(u => u.email !== userEmail?.toLowerCase()).map(u => (
                          <button
                            key={u.email}
                            onClick={() => { passControl(u.email, u.displayName); setShowPassControl(false); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-interactive transition-colors"
                          >
                            <div className="font-medium">{u.displayName}</div>
                            <div className="text-textMuted">{u.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={releaseControl}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs text-textSecondary hover:text-danger border border-border hover:border-danger rounded transition-colors"
                >
                  <Unlock size={12} />
                  Release
                </button>
              </div>
            </>
          ) : lockStatus ? (
            <>
              <Lock size={16} className="text-textMuted flex-shrink-0" />
              <span className="text-sm text-textSecondary flex-1">
                Controlled by <span className="font-medium text-textPrimary">{lockStatus.displayName || lockStatus.email}</span>
                {isLockStale && <span className="text-warning ml-2">(lock expired)</span>}
              </span>
              <button
                onClick={takeControl}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-interactive hover:bg-interactive/80 border border-border rounded transition-colors"
              >
                <UserCheck size={12} />
                Take Control
              </button>
            </>
          ) : (
            <>
              <Unlock size={16} className="text-textMuted flex-shrink-0" />
              <span className="text-sm text-textSecondary flex-1">No one has control</span>
              <button
                onClick={takeControl}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-success/20 text-success hover:bg-success/30 border border-success/40 rounded transition-colors"
              >
                <UserCheck size={12} />
                Take Control
              </button>
            </>
          )}
        </div>
      )}

      {/* Admin toolbar */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowLiveSettings(!showLiveSettings)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border ${showLiveSettings ? 'bg-interactive border-interactive text-textPrimary' : 'bg-surface hover:bg-interactive border-border'}`}
          >
            <Settings size={15} />
            Settings
          </button>
          <button
            onClick={() => {
              if (confirm('⚠️ Delete the live pick list?\n\nThis will clear all teams, tiers, and comments for everyone. This CANNOT be undone.')) {
                deleteLiveList();
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-danger/10 text-danger border border-danger/40 hover:bg-danger hover:text-white rounded-lg text-sm transition-colors font-medium"
          >
            <Trash2 size={15} />
            Reset Live List
          </button>
        </div>
      )}

      {/* Live Settings Panel */}
      {showLiveSettings && isAdmin && (
        <div className="bg-surface p-4 rounded-lg border border-border space-y-4">
          <h2 className="text-base font-bold">Live Pick List Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 1 Name</label>
              <input type="text" value={liveTier1Name} onChange={e => setLiveTier1Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 2 Name</label>
              <input type="text" value={liveTier2Name} onChange={e => setLiveTier2Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 3 Name</label>
              <input type="text" value={liveTier3Name} onChange={e => setLiveTier3Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 4 Name</label>
              <input type="text" value={liveTier4Name} onChange={e => setLiveTier4Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
            </div>
          </div>
          <button
            onClick={handleSaveLiveTierNames}
            className="px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors text-sm"
          >
            Save Tier Names
          </button>
        </div>
      )}

      {/* Pending suggestion summary (admin only) */}
      {isAdmin && suggestions.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSuggestionSummary(!showSuggestionSummary)}
            className="w-full flex items-center justify-between px-4 py-2.5"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning" />
              <span className="text-sm font-medium text-warning">
                {suggestions.length} pending suggestion{suggestions.length !== 1 ? 's' : ''}
              </span>
            </div>
            {showSuggestionSummary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showSuggestionSummary && (
            <div className="px-4 pb-3 space-y-1 border-t border-warning/20">
              {suggestions.map(s => (
                <div key={s.id} className="flex items-center gap-2 py-1 text-xs">
                  <span className="font-medium text-warning">{s.displayName}</span>
                  <span className="text-textSecondary">Team {s.teamNumber} → {tierNames[s.suggestedTier]}:</span>
                  <span className="text-textPrimary flex-1 truncate">{s.reason}</span>
                  <span className="text-textMuted">👍 {s.votes.length}</span>
                  {canEdit && (
                    <>
                      <button onClick={() => {
                        const updatedTeams = applyLiveCrossTierMove(liveList.teams, s.teamNumber, s.suggestedTier, 999);
                        acceptSuggestion(s.id, updatedTeams);
                      }} className="p-0.5 text-success hover:bg-success/20 rounded" title="Accept">
                        <Check size={12} />
                      </button>
                      <button onClick={() => dismissSuggestion(s.id)} className="p-0.5 text-danger hover:bg-danger/20 rounded" title="Dismiss">
                        <X size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pick list tracker + Filters */}
      <div className="bg-surface p-4 rounded-lg border border-border space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-warning" />
            <span className="font-semibold">Live List:</span>
            <span className="text-2xl font-bold text-success">{liveTeamCount}</span>
            <span className="text-textSecondary">teams</span>
          </div>
          {!canEdit && (
            <span className="text-xs text-textMuted bg-surfaceElevated border border-border px-2 py-1 rounded">
              View only — edits locked
            </span>
          )}
          <span className="text-xs text-textMuted hidden md:inline">
            Tip: click any two teams to compare
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Filter size={16} className="text-textSecondary" />
            <span className="text-sm text-textSecondary">Highlight:</span>
            <button
              onClick={() => setShowFilterSettings(!showFilterSettings)}
              className={`p-1 rounded transition-colors ${showFilterSettings ? 'text-success' : 'text-textMuted hover:text-textPrimary'}`}
              title="Edit filter settings"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
          {effectiveFilterConfigs.map(filter => {
            const IconComponent = FILTER_ICONS[filter.icon] || Target;
            const count = filter.active ? countLivePassingTeams(filter) : null;
            return (
              <button
                key={filter.id}
                onClick={() => canEdit ? handleLiveToggleFilter(filter.id) : undefined}
                disabled={!canEdit}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${filter.active ? 'bg-success text-background' : 'bg-surfaceElevated hover:bg-interactive'} ${!canEdit ? 'cursor-default opacity-90' : ''}`}
                title={!canEdit ? 'Filters set by the editor · view only' : undefined}
              >
                <IconComponent size={14} />
                {filter.label}
                {count !== null && <span className="ml-1 font-bold">({count})</span>}
              </button>
            );
          })}
          {liveHasActiveFilters && (
            <button
              onClick={canEdit ? handleLiveClearAllFilters : undefined}
              disabled={!canEdit}
              className="text-xs text-textMuted hover:text-danger ml-2"
            >
              Clear all
            </button>
          )}
          {!canEdit && liveHasActiveFilters && (
            <span className="text-xs text-textMuted italic">Filters shared by editor</span>
          )}
        </div>
        {showFilterSettings && canEdit && (
          <div className="bg-surfaceElevated rounded-lg border border-border p-4 space-y-3">
            <h3 className="text-sm font-bold text-textSecondary uppercase tracking-wider">Filter Settings</h3>
            {effectiveFilterConfigs.map(filter => (
              <div key={filter.id} className="flex flex-wrap items-center gap-2">
                <select value={filter.icon} onChange={e => handleLiveUpdateFilter(filter.id, { icon: e.target.value })}
                  className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm">
                  {Object.keys(FILTER_ICONS).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <input type="text" value={filter.label} onChange={e => handleLiveUpdateFilter(filter.id, { label: e.target.value })}
                  className="w-28 px-2 py-1.5 bg-background border border-border rounded text-sm" placeholder="Filter name" />
                <select value={filter.field} onChange={e => handleLiveUpdateFilter(filter.id, { field: e.target.value })}
                  className="flex-1 min-w-[140px] px-2 py-1.5 bg-background border border-border rounded text-sm">
                  {STAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={filter.operator} onChange={e => handleLiveUpdateFilter(filter.id, { operator: e.target.value as FilterConfig['operator'] })}
                  className="w-16 px-2 py-1.5 bg-background border border-border rounded text-sm">
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                </select>
                <input type="number" value={filter.threshold} onChange={e => handleLiveUpdateFilter(filter.id, { threshold: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm" />
                <button onClick={() => handleLiveRemoveFilter(filter.id)} className="p-1.5 text-textMuted hover:text-danger rounded transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={handleLiveAddFilter} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-success hover:bg-interactive rounded transition-colors">
              <Plus size={14} />
              Add Filter
            </button>
          </div>
        )}
      </div>

      {/* Compare indicator */}
      {compareTeams.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blueAlliance/10 border border-blueAlliance/30 rounded-lg">
          <span className="text-sm text-blueAlliance font-medium">
            Click teams to compare ({compareTeams.length}/2)
          </span>
        </div>
      )}

      {/* Watchlist Panel - live mode */}
      {(() => {
        if (!liveList) return null;
        const watchlistTeams = liveList.teams
          .filter(t => t.onWatchlist)
          .sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
        if (watchlistTeams.length === 0) return null;
        const tier2NonWatchlist = liveList.teams
          .filter(t => t.tier === 'tier2' && !t.onWatchlist)
          .sort((a, b) => a.rank - b.rank);
        return (
          <div className="bg-warning/10 border-2 border-warning rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between p-4 bg-warning/20 cursor-pointer"
              onClick={() => setShowWatchlist(!showWatchlist)}
            >
              <div className="flex items-center gap-3">
                <Eye size={20} className="text-warning" />
                <h2 className="text-lg font-bold">Final Morning Watchlist ({watchlistTeams.length})</h2>
                <span className="text-sm text-textSecondary">Rank these teams, then finalize into {tierNames.tier2}</span>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Clear all teams from watchlist?')) {
                        pushTeams(clearLiveWatchlist(liveList.teams));
                      }
                    }}
                    className="p-2 text-textMuted hover:text-danger transition-colors"
                    title="Clear watchlist"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                {showWatchlist ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            {showWatchlist && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {watchlistTeams.map((team, index) => {
                    const stats = teamStatistics.find(s => s.teamNumber === team.teamNumber);
                    return (
                      <div key={team.teamNumber} className="bg-surface border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-warning">#{index + 1}</span>
                            <span className="text-lg font-bold">{team.teamNumber}</span>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1">
                              {index > 0 && (
                                <button
                                  onClick={() => pushTeams(reorderLiveWatchlist(liveList.teams, team.teamNumber, index))}
                                  className="p-1 hover:bg-interactive rounded"
                                  title="Move up"
                                >
                                  <ArrowUp size={16} />
                                </button>
                              )}
                              {index < watchlistTeams.length - 1 && (
                                <button
                                  onClick={() => pushTeams(reorderLiveWatchlist(liveList.teams, team.teamNumber, index + 2))}
                                  className="p-1 hover:bg-interactive rounded"
                                  title="Move down"
                                >
                                  <ArrowDown size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => pushTeams(toggleLiveWatchlist(liveList.teams, team.teamNumber))}
                                className="p-1 hover:bg-danger/20 text-danger rounded"
                                title="Remove from watchlist"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                        {stats && (
                          <div className="text-xs text-textSecondary mb-2">
                            {stats.avgTotalPoints.toFixed(1)} pts • L3: {stats.level3ClimbRate.toFixed(0)}%
                          </div>
                        )}
                        {canEdit ? (
                          <textarea
                            value={team.watchlistNotes || ''}
                            onChange={(e) => pushTeams(updateLiveWatchlistNotes(liveList.teams, team.teamNumber, e.target.value))}
                            placeholder="Notes from final matches..."
                            className="w-full px-2 py-1 text-sm bg-background border border-border rounded resize-none"
                            rows={2}
                          />
                        ) : (
                          team.watchlistNotes
                            ? <p className="text-xs text-textSecondary">{team.watchlistNotes}</p>
                            : null
                        )}
                      </div>
                    );
                  })}
                </div>

                {canEdit && (
                  <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-warning/30">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Insert at position:</span>
                      <select
                        value={insertAtLiveRank}
                        onChange={(e) => setInsertAtLiveRank(Number(e.target.value))}
                        className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                      >
                        <option value={1}>Top of {tierNames.tier2}</option>
                        {tier2NonWatchlist.map((team, index) => (
                          <option key={team.teamNumber} value={index + 2}>
                            After #{index + 1} ({team.teamNumber})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`This will move ${watchlistTeams.length} teams into ${tierNames.tier2} at position ${insertAtLiveRank}. Continue?`)) {
                          pushTeams(finalizeLiveWatchlist(liveList.teams, insertAtLiveRank));
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
                    >
                      <Check size={18} />
                      Finalize to {tierNames.tier2}
                    </button>
                    <p className="text-xs text-textSecondary">Teams will be inserted in watchlist order (#1 first)</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Tier columns with full DnD */}
      <DndContext
        sensors={liveSensors}
        collisionDetection={multiColumnCollision}
        onDragStart={handleLiveDragStart}
        onDragOver={handleLiveDragOver}
        onDragEnd={handleLiveDragEnd}
      >
        <div className={`grid grid-cols-1 ${tier4Teams.length > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 md:gap-4`}>
          <DroppableColumn
            id="live-tier1-column"
            title={`${tierNames.tier1} (${tier1Teams.length})`}
            teams={tier1Teams}
            tier="tier1"
            tierNames={tierNames}
            onMoveTier={canEdit ? handleLiveMoveTier : undefined}
            onUpdateNotes={canEdit ? (num, notes) => { if (liveList && canEdit) pushTeams(updateLiveNotes(liveList.teams, num, notes)); } : undefined}
            onToggleFlag={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveFlag(liveList.teams, num)); } : undefined}
            onToggleWatchlist={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveWatchlist(liveList.teams, num)); } : undefined}
            disableInteraction={!canEdit}
            compareTeams={compareTeams}
            onToggleCompare={onToggleCompare}
            teamPassesFilters={liveTeamPassesFilters}
            hasActiveFilters={liveHasActiveFilters}
            renderTeamExtra={renderTeamExtra}
          />
          <DroppableColumn
            id="live-tier2-column"
            title={`${tierNames.tier2} (${tier2Teams.length})`}
            teams={tier2Teams}
            tier="tier2"
            tierNames={tierNames}
            onMoveTier={canEdit ? handleLiveMoveTier : undefined}
            onUpdateNotes={canEdit ? (num, notes) => { if (liveList && canEdit) pushTeams(updateLiveNotes(liveList.teams, num, notes)); } : undefined}
            onToggleFlag={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveFlag(liveList.teams, num)); } : undefined}
            onToggleWatchlist={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveWatchlist(liveList.teams, num)); } : undefined}
            disableInteraction={!canEdit}
            compareTeams={compareTeams}
            onToggleCompare={onToggleCompare}
            teamPassesFilters={liveTeamPassesFilters}
            hasActiveFilters={liveHasActiveFilters}
            renderTeamExtra={renderTeamExtra}
          />
          <DroppableColumn
            id="live-tier3-column"
            title={`${tierNames.tier3} (${tier3Teams.length})`}
            teams={tier3Teams}
            tier="tier3"
            tierNames={tierNames}
            onMoveTier={canEdit ? handleLiveMoveTier : undefined}
            onUpdateNotes={canEdit ? (num, notes) => { if (liveList && canEdit) pushTeams(updateLiveNotes(liveList.teams, num, notes)); } : undefined}
            onToggleFlag={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveFlag(liveList.teams, num)); } : undefined}
            onToggleWatchlist={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveWatchlist(liveList.teams, num)); } : undefined}
            disableInteraction={!canEdit}
            compareTeams={compareTeams}
            onToggleCompare={onToggleCompare}
            teamPassesFilters={liveTeamPassesFilters}
            hasActiveFilters={liveHasActiveFilters}
            renderTeamExtra={renderTeamExtra}
          />
          {tier4Teams.length > 0 && (
            <DroppableColumn
              id="live-tier4-column"
              title={`${tierNames.tier4} (${tier4Teams.length})`}
              teams={tier4Teams}
              tier="tier4"
              tierNames={tierNames}
              onMoveTier={canEdit ? handleLiveMoveTier : undefined}
              onUpdateNotes={canEdit ? (num, notes) => { if (liveList && canEdit) pushTeams(updateLiveNotes(liveList.teams, num, notes)); } : undefined}
              onToggleFlag={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveFlag(liveList.teams, num)); } : undefined}
              onToggleWatchlist={canEdit ? (num) => { if (liveList && canEdit) pushTeams(toggleLiveWatchlist(liveList.teams, num)); } : undefined}
              disableInteraction={!canEdit}
              compareTeams={compareTeams}
              onToggleCompare={onToggleCompare}
              teamPassesFilters={liveTeamPassesFilters}
              hasActiveFilters={liveHasActiveFilters}
              renderTeamExtra={renderTeamExtra}
            />
          )}
        </div>
        <DragOverlay>
          {liveActiveId ? (
            <div className="bg-surface border border-border rounded-lg p-3 opacity-90 shadow-lg">
              <div className="flex items-center gap-2">
                <GripVertical size={16} className="text-textMuted" />
                <span className="font-bold">Team {liveActiveId.replace('team-', '')}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}


// Sortable team card component
function TeamCard({ team, currentTier, tierNames, onMoveTier, onUpdateNotes, onToggleFlag, onToggleWatchlist, isSelectedForCompare, onToggleCompare, passesFilters, hasActiveFilters, disableInteraction }: {
  team: PickListTeam | { teamNumber: number; teamName?: string; avgTotalPoints: number; level3ClimbRate: number; avgAutoPoints: number };
  currentTier?: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  tierNames?: { tier1: string; tier2: string; tier3: string; tier4: string };
  onMoveTier?: (tier: 'tier1' | 'tier2' | 'tier3' | 'tier4') => void;
  onUpdateNotes?: (notes: string) => void;
  onToggleFlag?: () => void;
  onToggleWatchlist?: () => void;
  isSelectedForCompare?: boolean;
  onToggleCompare?: () => void;
  passesFilters?: boolean;
  hasActiveFilters?: boolean;
  disableInteraction?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `team-${team.teamNumber}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isPickListTeam = 'tier' in team;
  const teamStats = useAnalyticsStore(state =>
    state.teamStatistics.find(t => t.teamNumber === team.teamNumber)
  );

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(isPickListTeam ? (team as PickListTeam).notes : '');

  // Sync notes when team data changes externally (e.g. live mode Firestore push)
  useEffect(() => {
    if (isPickListTeam && !isEditingNotes) {
      setNotes((team as PickListTeam).notes);
    }
  }, [isPickListTeam ? (team as PickListTeam).notes : '']); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg p-2 mb-2 transition-all cursor-pointer ${
        isSelectedForCompare
          ? 'border-blueAlliance bg-blueAlliance/10 ring-2 ring-blueAlliance'
          : isPickListTeam && team.onWatchlist
          ? 'bg-warning/10 border-warning ring-1 ring-warning'
          : isPickListTeam && team.flagged
          ? 'bg-surface border-danger'
          : hasActiveFilters && passesFilters !== false
          ? 'bg-success/10 border-success'
          : 'bg-surface border-border'
      } ${passesFilters === false ? 'opacity-20' : ''}`}
      onClick={() => onToggleCompare?.()}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div
          {...(disableInteraction ? {} : listeners)}
          {...(disableInteraction ? {} : attributes)}
          className={`mt-1 touch-none ${disableInteraction ? 'text-textMuted/20 cursor-default' : 'cursor-grab active:cursor-grabbing text-textMuted hover:text-textPrimary'}`}
          onClick={e => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </div>

        {/* Team info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              to={`/teams/${team.teamNumber}`}
              className="font-bold text-sm text-textPrimary hover:text-blueAlliance transition-colors"
              title="View team details"
              onClick={e => e.stopPropagation()}
            >
              {team.teamNumber}
            </Link>
            {teamStats?.teamName && (
              <span className="text-xs text-textSecondary truncate">{teamStats.teamName}</span>
            )}
          </div>

          {/* Quick stats */}
          <div className="flex gap-2 text-xs text-textSecondary">
            <span>{teamStats?.avgTotalPoints?.toFixed(0) ?? '0'} pts</span>
            <span>L3: {teamStats?.level3ClimbRate?.toFixed(0) ?? '0'}%</span>
            <span>A: {teamStats?.avgAutoPoints?.toFixed(0) ?? '0'}</span>
          </div>

          {/* Notes for teams in tiers */}
          {currentTier && isPickListTeam && isEditingNotes ? (
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={() => {
                setIsEditingNotes(false);
                onUpdateNotes?.(notes);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setIsEditingNotes(false);
                  onUpdateNotes?.(notes);
                }
              }}
              className="w-full mt-1 bg-background border border-border rounded px-2 py-1 text-xs"
              autoFocus
            />
          ) : (
            currentTier && isPickListTeam && (team as PickListTeam).notes && (
              <p
                className="text-xs text-textSecondary italic mt-1 truncate cursor-text hover:text-textPrimary transition-colors"
                title="Click to edit note"
                onClick={e => { e.stopPropagation(); if (!disableInteraction) setIsEditingNotes(true); }}
              >{(team as PickListTeam).notes}</p>
            )
          )}

          {/* Quick tier switcher - mobile friendly */}
          {currentTier && tierNames && onMoveTier && (
            <div className="flex gap-1 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
              {/* Tier 1 (Steak) - show demote buttons */}
              {currentTier === 'tier1' && (
                <>
                  <button
                    onClick={() => onMoveTier('tier2')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Demote to ${tierNames.tier2}`}
                  >
                    <ArrowDown size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier2}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier3')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Demote to ${tierNames.tier3}`}
                  >
                    <ChevronsDown size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier3}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier4')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-danger/20 text-danger hover:bg-danger/30 rounded transition-colors"
                    title={`Demote to ${tierNames.tier4}`}
                  >
                    <Ban size={14} />
                    <span>DNP</span>
                  </button>
                </>
              )}

              {/* Tier 2 (Potatoes) - show promote and demote buttons */}
              {currentTier === 'tier2' && (
                <>
                  <button
                    onClick={() => onMoveTier('tier1')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Promote to ${tierNames.tier1}`}
                  >
                    <ArrowUp size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier1}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier3')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Demote to ${tierNames.tier3}`}
                  >
                    <ArrowDown size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier3}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier4')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-danger/20 text-danger hover:bg-danger/30 rounded transition-colors"
                    title={`Demote to ${tierNames.tier4}`}
                  >
                    <Ban size={14} />
                    <span>DNP</span>
                  </button>
                </>
              )}

              {/* Tier 3 (Chicken Nuggets) - show promote and demote buttons */}
              {currentTier === 'tier3' && (
                <>
                  <button
                    onClick={() => onMoveTier('tier2')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Promote to ${tierNames.tier2}`}
                  >
                    <ArrowUp size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier2}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier1')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Promote to ${tierNames.tier1}`}
                  >
                    <ChevronsUp size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier1}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier4')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-danger/20 text-danger hover:bg-danger/30 rounded transition-colors"
                    title={`Demote to ${tierNames.tier4}`}
                  >
                    <Ban size={14} />
                    <span>DNP</span>
                  </button>
                </>
              )}

              {/* Tier 4 (All Teams) - show promote buttons only */}
              {currentTier === 'tier4' && (
                <>
                  <button
                    onClick={() => onMoveTier('tier3')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Promote to ${tierNames.tier3}`}
                  >
                    <ArrowUp size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier3}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier2')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Promote to ${tierNames.tier2}`}
                  >
                    <ArrowUp size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier2}</span>
                  </button>
                  <button
                    onClick={() => onMoveTier('tier1')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                    title={`Promote to ${tierNames.tier1}`}
                  >
                    <ChevronsUp size={14} />
                    <span className="truncate max-w-[60px]">{tierNames.tier1}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions - only show for teams in tiers and when editing is allowed */}
        {currentTier && !disableInteraction && (
          <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onToggleWatchlist?.()}
              className={`p-2 rounded transition-colors ${
                isPickListTeam && (team as PickListTeam).onWatchlist ? 'text-warning' : 'text-textMuted hover:text-warning'
              }`}
              title={isPickListTeam && (team as PickListTeam).onWatchlist ? "Remove from watchlist" : "Watch this team"}
            >
              <Bookmark size={16} />
            </button>
            <button
              onClick={() => onToggleFlag?.()}
              className={`p-2 rounded transition-colors ${
                isPickListTeam && (team as PickListTeam).flagged ? 'text-danger' : 'text-textMuted hover:text-danger'
              }`}
              title={isPickListTeam && (team as PickListTeam).flagged ? "Remove red flag" : "Red flag — reliability concern"}
            >
              <Flag size={16} />
            </button>
            <button
              onClick={() => setIsEditingNotes(true)}
              className="p-2 text-textMuted hover:text-textPrimary rounded transition-colors"
              title="Edit notes"
            >
              <StickyNote size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Droppable column component
function DroppableColumn({
  id, title, teams, tier, tierNames, onMoveTier,
  onUpdateNotes, onToggleFlag, onToggleWatchlist,
  disableInteraction,
  compareTeams, onToggleCompare, teamPassesFilters, hasActiveFilters,
  renderTeamExtra,
}: {
  id: string;
  title: string;
  teams: any[];
  tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  tierNames?: { tier1: string; tier2: string; tier3: string; tier4: string };
  onMoveTier?: (teamNumber: number, newTier: 'tier1' | 'tier2' | 'tier3' | 'tier4') => void;
  // Optional overrides: if provided, use these instead of the Zustand store
  onUpdateNotes?: (teamNumber: number, notes: string) => void;
  onToggleFlag?: (teamNumber: number) => void;
  onToggleWatchlist?: (teamNumber: number) => void;
  disableInteraction?: boolean;
  compareTeams?: number[];
  onToggleCompare?: (teamNumber: number) => void;
  teamPassesFilters?: (teamNumber: number) => boolean;
  hasActiveFilters?: boolean;
  renderTeamExtra?: (teamNumber: number) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const storeUpdateNotes = usePickListStore(state => state.updateNotes);
  const storeToggleFlag = usePickListStore(state => state.toggleFlag);
  const storeToggleWatchlist = usePickListStore(state => state.toggleWatchlist);

  const resolvedUpdateNotes = onUpdateNotes ?? ((num: number, notes: string) => storeUpdateNotes(num, notes));
  const resolvedToggleFlag = onToggleFlag ?? ((num: number) => storeToggleFlag(num));
  const resolvedToggleWatchlist = onToggleWatchlist ?? ((num: number) => storeToggleWatchlist(num));

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 bg-surfaceElevated rounded-lg p-3 md:p-4 min-h-[200px] lg:min-h-[600px] transition-colors ${
        isOver ? 'ring-2 ring-success bg-interactive' : ''
      }`}
    >
      <h2 className="text-base md:text-lg font-bold mb-3">{title}</h2>
      <SortableContext items={teams.map(t => `team-${t.teamNumber}`)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0 min-h-[100px] lg:min-h-[500px]">
          {teams.map((team) => (
            <div key={team.teamNumber}>
              <TeamCard
                team={team}
                currentTier={tier}
                tierNames={tierNames}
                onMoveTier={tier && onMoveTier && !disableInteraction ? (newTier) => onMoveTier(team.teamNumber, newTier) : undefined}
                onUpdateNotes={tier && !disableInteraction ? (notes) => resolvedUpdateNotes(team.teamNumber, notes) : undefined}
                onToggleFlag={tier && !disableInteraction ? () => resolvedToggleFlag(team.teamNumber) : undefined}
                onToggleWatchlist={tier && !disableInteraction ? () => resolvedToggleWatchlist(team.teamNumber) : undefined}
                isSelectedForCompare={compareTeams?.includes(team.teamNumber)}
                onToggleCompare={onToggleCompare ? () => onToggleCompare(team.teamNumber) : undefined}
                passesFilters={teamPassesFilters ? teamPassesFilters(team.teamNumber) : true}
                hasActiveFilters={hasActiveFilters}
                disableInteraction={disableInteraction}
              />
              {renderTeamExtra?.(team.teamNumber)}
            </div>
          ))}
          {teams.length === 0 && (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <p className="text-textMuted text-sm text-center">
                {tier ? 'Drag teams here or use buttons' : 'No teams available'}
              </p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function PickList() {
  const pickList = usePickListStore(state => state.pickList);
  const initializePickList = usePickListStore(state => state.initializePickList);
  const setTierNames = usePickListStore(state => state.setTierNames);
  const exportPickList = usePickListStore(state => state.exportPickList);
  const importPickList = usePickListStore(state => state.importPickList);
  const moveTeam = usePickListStore(state => state.moveTeam);
  const moveTeamAbove = usePickListStore(state => state.moveTeamAbove);
  const redFlagThresholds = usePickListStore(state => state.redFlagThresholds);
  const setRedFlagThresholds = usePickListStore(state => state.setRedFlagThresholds);
  const autoFlagTeams = usePickListStore(state => state.autoFlagTeams);
  const clearAllFlags = usePickListStore(state => state.clearAllFlags);

  // Watchlist functions
  const toggleWatchlist = usePickListStore(state => state.toggleWatchlist);
  const updateWatchlistNotes = usePickListStore(state => state.updateWatchlistNotes);
  const reorderWatchlist = usePickListStore(state => state.reorderWatchlist);
  const finalizeWatchlist = usePickListStore(state => state.finalizeWatchlist);
  const clearWatchlist = usePickListStore(state => state.clearWatchlist);
  const getWatchlistTeams = usePickListStore(state => state.getWatchlistTeams);

  const eventCode = useAnalyticsStore(state => state.eventCode);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const tbaData = useAnalyticsStore(state => state.tbaData);

  // Auth + live sync (always subscribed so badge count shows in personal mode too)
  const { user, isAdmin, userProfiles, accessConfig } = useAuth();
  const uid = user?.uid ?? null;
  const userEmail = user?.email ?? null;
  const displayName = user?.displayName ?? null;
  const liveSync = usePickListSync(eventCode, uid, userEmail, displayName, isAdmin);

  // Build list of all allowed users for pass-control dropdown
  const allAllowedUsers = [
    ...(accessConfig?.allowedEmails ?? []),
    ...(accessConfig?.adminEmails ?? []),
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(email => ({
      email,
      displayName: userProfiles[email]?.displayName ?? email,
    }));

  // Mode toggle persisted to localStorage
  const [mode, setMode] = useState<'personal' | 'live'>(() =>
    (localStorage.getItem('frc-picklist-mode') as 'personal' | 'live') ?? 'personal'
  );
  useEffect(() => { localStorage.setItem('frc-picklist-mode', mode); }, [mode]);

  const [showSettings, setShowSettings] = useState(false);
  const [tier1Name, setTier1Name] = useState('Steak');
  const [tier2Name, setTier2Name] = useState('Potatoes');
  const [tier3Name, setTier3Name] = useState('Chicken Nuggets');
  const [tier4Name, setTier4Name] = useState('Do Not Pick');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [personalDragItems, setPersonalDragItems] = useState<PickListTeam[] | null>(null);

  // Red flag thresholds state
  const [localThresholds, setLocalThresholds] = useState<RedFlagThresholds>(redFlagThresholds || DEFAULT_RED_FLAG_THRESHOLDS);
  const [autoFlagStatus, setAutoFlagStatus] = useState<string | null>(null);

  // Watchlist state
  const [showWatchlist, setShowWatchlist] = useState(true);
  const [insertAtRank, setInsertAtRank] = useState(1);

  // Customizable capability filters
  const [filterConfigs, setFilterConfigs] = useState<FilterConfig[]>(DEFAULT_FILTERS);
  const [showFilterSettings, setShowFilterSettings] = useState(false);

  // Toggle a filter's active state
  const toggleFilter = (id: string) => {
    setFilterConfigs(prev => prev.map(f => f.id === id ? { ...f, active: !f.active } : f));
  };

  // Update a filter's config
  const updateFilter = (id: string, updates: Partial<FilterConfig>) => {
    setFilterConfigs(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // Add a new custom filter
  const addFilter = () => {
    const newId = `custom-${Date.now()}`;
    setFilterConfigs(prev => [...prev, {
      id: newId,
      label: 'New Filter',
      icon: 'target',
      field: 'avgTotalPoints',
      operator: '>=',
      threshold: 0,
      active: false,
    }]);
  };

  // Remove a filter
  const removeFilter = (id: string) => {
    setFilterConfigs(prev => prev.filter(f => f.id !== id));
  };

  // Count teams passing a specific filter
  const countPassingTeams = (filter: FilterConfig): number => {
    if (!pickList) return 0;
    return countTeamsPassingFilter(filter, pickList.teams, teamStatistics);
  };

  // Check if a team passes all active filters
  const teamPassesFilters = (teamNumber: number): boolean =>
    doesTeamPassAllFilters(teamNumber, filterConfigs, teamStatistics);

  const hasActiveFilters = filterConfigs.some(f => f.active);

  // Count picked teams in tier1 + tier2
  const tier1And2Count = pickList?.teams.filter(t =>
    t.tier === 'tier1' || t.tier === 'tier2'
  ).length || 0;

  // Click-to-compare state (max 2 teams)
  const [compareTeams, setCompareTeams] = useState<number[]>([]);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  const toggleCompare = (teamNumber: number) => {
    setCompareTeams(prev => {
      if (prev.includes(teamNumber)) {
        return prev.filter(t => t !== teamNumber);
      }
      if (prev.length >= 2) return prev;
      return [...prev, teamNumber];
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    if (!pickList) {
      initializePickList(eventCode);
    } else {
      setTier1Name(pickList.config.tier1Name);
      setTier2Name(pickList.config.tier2Name);
      setTier3Name(pickList.config.tier3Name);
      setTier4Name(pickList.config.tier4Name || 'Do Not Pick');
    }
  }, [pickList, eventCode, initializePickList]);

  // Auto-open comparison modal when 2 teams selected
  useEffect(() => {
    if (compareTeams.length === 2) {
      setShowComparisonModal(true);
    }
  }, [compareTeams]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id.toString());
    if (pickList) setPersonalDragItems([...pickList.teams]);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setPersonalDragItems(prev => {
      if (!prev) return prev;
      const activeNum = parseInt(active.id.toString().replace('team-', ''));
      const overId = over.id.toString();
      if (overId.startsWith('team-')) {
        const overNum = parseInt(overId.replace('team-', ''));
        if (activeNum === overNum) return prev;
        const activeTeam = prev.find(t => t.teamNumber === activeNum);
        const overTeam = prev.find(t => t.teamNumber === overNum);
        if (!activeTeam || !overTeam) return prev;
        if (activeTeam.tier === overTeam.tier) {
          return applyLiveSameTierMove(prev, activeNum, activeTeam.tier, overTeam.rank);
        } else {
          return applyLiveCrossTierMove(prev, activeNum, overTeam.tier, overTeam.rank);
        }
      }
      let targetTier: PickListTeam['tier'] | null = null;
      if (overId === 'tier1-column') targetTier = 'tier1';
      else if (overId === 'tier2-column') targetTier = 'tier2';
      else if (overId === 'tier3-column') targetTier = 'tier3';
      else if (overId === 'tier4-column') targetTier = 'tier4';
      if (!targetTier) return prev;
      const activeTeam = prev.find(t => t.teamNumber === activeNum);
      if (!activeTeam || activeTeam.tier === targetTier) return prev;
      const tierTeams = prev.filter(t => t.tier === targetTier);
      const maxRank = tierTeams.length > 0 ? Math.max(...tierTeams.map(t => t.rank)) : 0;
      return applyLiveCrossTierMove(prev, activeNum, targetTier, maxRank + 1);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    setActiveId(null);
    const finalItems = personalDragItems;
    setPersonalDragItems(null);
    if (!finalItems || !pickList) return;
    const activeNum = parseInt(active.id.toString().replace('team-', ''));
    const finalTeam = finalItems.find(t => t.teamNumber === activeNum);
    const originalTeam = pickList.teams.find(t => t.teamNumber === activeNum);
    if (!finalTeam || !originalTeam) return;
    if (finalTeam.tier !== originalTeam.tier || finalTeam.rank !== originalTeam.rank) {
      moveTeam(activeNum, finalTeam.tier, finalTeam.rank);
    }
  };


  const handleMoveTier = (teamNumber: number, newTier: 'tier1' | 'tier2' | 'tier3' | 'tier4') => {
    if (!pickList) return;
    const tierTeams = pickList.teams.filter(t => t.tier === newTier);
    const maxRank = tierTeams.length > 0 ? Math.max(...tierTeams.map(t => t.rank)) : 0;
    const newRank = maxRank + 1;
    moveTeam(teamNumber, newTier, newRank);
  };

  const handleExport = () => {
    const json = exportPickList();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `picklist-${eventCode}-${new Date().toISOString()}.json`;
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          importPickList(content);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleSaveTierNames = () => {
    setTierNames(tier1Name, tier2Name, tier3Name, tier4Name);
    setShowSettings(false);
  };

  const handlePickWinner = (winnerTeamNumber: number) => {
    const loserTeamNumber = compareTeams.find(t => t !== winnerTeamNumber);
    if (loserTeamNumber) {
      if (mode === 'personal') {
        moveTeamAbove(winnerTeamNumber, loserTeamNumber);
      } else if (liveSync.liveList && liveSync.canEdit) {
        liveSync.pushTeams(applyLiveMoveAbove(liveSync.liveList.teams, winnerTeamNumber, loserTeamNumber));
      }
    }
    setShowComparisonModal(false);
    setCompareTeams([]);
  };

  if (!pickList && mode === 'personal') {
    return <div>Loading...</div>;
  }

  // Get teams in each tier (personal mode)
  const personalDisplayTeams = personalDragItems ?? pickList?.teams ?? [];
  const tier1Teams = personalDisplayTeams.filter(t => t.tier === 'tier1').sort((a, b) => a.rank - b.rank);
  const tier2Teams = personalDisplayTeams.filter(t => t.tier === 'tier2').sort((a, b) => a.rank - b.rank);
  const tier3Teams = personalDisplayTeams.filter(t => t.tier === 'tier3').sort((a, b) => a.rank - b.rank);
  const tier4Teams = personalDisplayTeams.filter(t => t.tier === 'tier4').sort((a, b) => a.rank - b.rank);

  // Live indicator dot color
  const liveConnected = liveSync.exists && !liveSync.syncing;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Pick List</h1>
          <p className="text-textSecondary text-sm md:text-base">
            {eventCode}
            {mode === 'personal' && pickList && (
              <> • Last updated: {new Date(pickList.config.lastUpdated).toLocaleString()}</>
            )}
            {mode === 'live' && liveSync.exists && (
              <> • Live</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            <button
              onClick={() => setMode('personal')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'personal' ? 'bg-interactive text-textPrimary' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              Personal
            </button>
            <button
              onClick={() => setMode('live')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'live' ? 'bg-interactive text-textPrimary' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${liveConnected ? 'bg-success' : 'bg-textMuted'}`} />
              Live
              {liveSync.suggestions.length > 0 && (
                <span className="bg-warning text-background text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
                  {liveSync.suggestions.length}
                </span>
              )}
            </button>
          </div>

          <Link
            to="/alliance-selection"
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-success/20 text-success hover:bg-success/30 rounded-lg transition-colors text-sm md:text-base font-semibold"
          >
            <Handshake size={18} />
            <span className="hidden sm:inline">Alliance Selection</span>
            <span className="sm:hidden">Alliance</span>
          </Link>
          {mode === 'personal' && (
            <>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors text-sm md:text-base"
              >
                <Settings size={18} />
                <span className="hidden sm:inline">Settings</span>
                <span className="sm:hidden">Config</span>
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors text-sm md:text-base"
              >
                <Download size={18} />
                <span>Export</span>
              </button>
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors text-sm md:text-base"
              >
                <Upload size={18} />
                <span>Import</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Live Mode ── */}
      {mode === 'live' && (
        <LivePickListView
          personalPickList={pickList}
          isAdmin={isAdmin}
          uid={uid}
          userEmail={userEmail}
          liveList={liveSync.liveList}
          lockStatus={liveSync.lockStatus}
          snapshotTakenAt={liveSync.snapshotTakenAt}
          snapshotTakenBy={liveSync.snapshotTakenBy}
          pendingControlFor={liveSync.pendingControlFor}
          comments={liveSync.comments}
          suggestions={liveSync.suggestions}
          syncing={liveSync.syncing}
          exists={liveSync.exists}
          isLockHolder={liveSync.isLockHolder}
          isLockStale={liveSync.isLockStale}
          canEdit={liveSync.canEdit}
          takeControl={liveSync.takeControl}
          releaseControl={liveSync.releaseControl}
          pushTeams={liveSync.pushTeams}
          pushConfig={liveSync.pushConfig}
          initializeLiveList={liveSync.initializeLiveList}
          acceptSuggestion={liveSync.acceptSuggestion}
          dismissSuggestion={liveSync.dismissSuggestion}
          deleteLiveList={liveSync.deleteLiveList}
          passControl={liveSync.passControl}
          claimPendingControl={liveSync.claimPendingControl}
          addComment={liveSync.addComment}
          deleteComment={liveSync.deleteComment}
          addSuggestion={liveSync.addSuggestion}
          voteSuggestion={liveSync.voteSuggestion}
          tbaData={tbaData}
          filterConfigs={filterConfigs}
          toggleFilter={toggleFilter}
          updateFilter={updateFilter}
          addFilter={addFilter}
          removeFilter={removeFilter}
          hasActiveFilters={hasActiveFilters}
          teamPassesFilters={teamPassesFilters}
          liveFilterConfigs={liveSync.liveFilterConfigs}
          pushLiveFilterConfigs={liveSync.pushLiveFilterConfigs}
          compareTeams={compareTeams}
          onToggleCompare={toggleCompare}
          allowedUsers={allAllowedUsers}
        />
      )}

      {/* Live mode comparison modal */}
      {mode === 'live' && showComparisonModal && compareTeams.length === 2 && (
        <ComparisonModal
          team1={teamStatistics.find(t => t.teamNumber === compareTeams[0])!}
          team2={teamStatistics.find(t => t.teamNumber === compareTeams[1])!}
          onPickTeam={handlePickWinner}
          onClose={() => {
            setShowComparisonModal(false);
            setCompareTeams([]);
          }}
        />
      )}

      {/* ── Personal Mode ── */}
      {mode === 'personal' && pickList && <>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-surface p-4 md:p-6 rounded-lg border border-border">
          <h2 className="text-lg md:text-xl font-bold mb-4">Pick List Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 1 Name</label>
              <input
                type="text"
                value={tier1Name}
                onChange={e => setTier1Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="e.g., Elite, God Tier"
              />
            </div>
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 2 Name</label>
              <input
                type="text"
                value={tier2Name}
                onChange={e => setTier2Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="e.g., Definitely Getting Picked"
              />
            </div>
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 3 Name</label>
              <input
                type="text"
                value={tier3Name}
                onChange={e => setTier3Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="e.g., Maybe Pick"
              />
            </div>
            <div>
              <label className="block text-sm text-textSecondary mb-2">Tier 4 Name</label>
              <input
                type="text"
                value={tier4Name}
                onChange={e => setTier4Name(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="e.g., All Teams"
              />
            </div>
          </div>
          <button
            onClick={handleSaveTierNames}
            className="px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
          >
            Save Tier Names
          </button>

          {/* Red Flag Auto-Detection */}
          <div className="border-t border-border mt-6 pt-6">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Flag size={20} className="text-danger" />
              Red Flag Auto-Detection
            </h3>
            <p className="text-sm text-textSecondary mb-4">
              Automatically flag teams that exceed reliability thresholds. Flagged teams have a red indicator.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm text-textSecondary mb-2">
                  Lost Connection (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localThresholds.lostConnectionRate}
                  onChange={e => setLocalThresholds(prev => ({ ...prev, lostConnectionRate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
                <p className="text-xs text-textMuted mt-1">Flag if lost connection {'>'}= this %</p>
              </div>
              <div>
                <label className="block text-sm text-textSecondary mb-2">
                  No Robot (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localThresholds.noRobotRate}
                  onChange={e => setLocalThresholds(prev => ({ ...prev, noRobotRate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
                <p className="text-xs text-textMuted mt-1">Flag if no robot on field {'>'}= this %</p>
              </div>
              <div>
                <label className="block text-sm text-textSecondary mb-2">
                  Climb Failed (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localThresholds.climbFailedRate}
                  onChange={e => setLocalThresholds(prev => ({ ...prev, climbFailedRate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
                <p className="text-xs text-textMuted mt-1">Flag if climb failed {'>'}= this %</p>
              </div>
              <div>
                <label className="block text-sm text-textSecondary mb-2">
                  Poor Accuracy (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localThresholds.poorAccuracyRate}
                  onChange={e => setLocalThresholds(prev => ({ ...prev, poorAccuracyRate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
                <p className="text-xs text-textMuted mt-1">Flag if poor accuracy {'>'}= this %</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setRedFlagThresholds(localThresholds);
                  const count = autoFlagTeams(teamStatistics);
                  setAutoFlagStatus(`Auto-flagged ${count} team${count !== 1 ? 's' : ''} based on reliability thresholds`);
                  setTimeout(() => setAutoFlagStatus(null), 4000);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-danger text-white font-semibold rounded-lg hover:bg-danger/90 transition-colors"
              >
                <Flag size={18} />
                Run Auto-Flag
              </button>
              <button
                onClick={() => {
                  clearAllFlags();
                  setAutoFlagStatus('Cleared all flags');
                  setTimeout(() => setAutoFlagStatus(null), 3000);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-textMuted text-background font-semibold rounded-lg hover:bg-textMuted/80 transition-colors"
              >
                <Trash2 size={18} />
                Clear All Flags
              </button>
              <button
                onClick={() => setLocalThresholds(DEFAULT_RED_FLAG_THRESHOLDS)}
                className="px-4 py-2 text-textSecondary hover:text-textPrimary transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
            {autoFlagStatus && (
              <div className="mt-3 p-3 bg-danger/20 border border-danger rounded-lg text-danger text-sm">
                {autoFlagStatus}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pick List Tracker & Filters */}
      <div className="bg-surface p-4 rounded-lg border border-border space-y-4">
        {/* Tracker Row */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-warning" />
            <span className="font-semibold">Pick List:</span>
            <span className="text-2xl font-bold text-success">{tier1And2Count}</span>
            <span className="text-textSecondary">teams</span>
          </div>
          <span className="text-xs text-textMuted hidden md:inline">
            Tip: click any two teams to compare them
          </span>
        </div>

        {/* Capability Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Filter size={16} className="text-textSecondary" />
            <span className="text-sm text-textSecondary">Highlight:</span>
            <button
              onClick={() => setShowFilterSettings(!showFilterSettings)}
              className={`p-1 rounded transition-colors ${showFilterSettings ? 'text-success' : 'text-textMuted hover:text-textPrimary'}`}
              title="Edit filter settings"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
          {filterConfigs.map(filter => {
            const IconComponent = FILTER_ICONS[filter.icon] || Target;
            const count = filter.active ? countPassingTeams(filter) : null;
            return (
              <button
                key={filter.id}
                onClick={() => toggleFilter(filter.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filter.active
                    ? 'bg-success text-background'
                    : 'bg-surfaceElevated hover:bg-interactive'
                }`}
              >
                <IconComponent size={14} />
                {filter.label}
                {count !== null && <span className="ml-1 font-bold">({count})</span>}
              </button>
            );
          })}
          {filterConfigs.some(f => f.active) && (
            <button
              onClick={() => setFilterConfigs(prev => prev.map(f => ({ ...f, active: false })))}
              className="text-xs text-textMuted hover:text-danger ml-2"
            >
              Clear all
            </button>
          )}
        </div>

        {/* No stats warning */}
        {filterConfigs.some(f => f.active) && teamStatistics.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg">
            <AlertTriangle size={16} className="text-warning" />
            <span className="text-sm text-warning">No scouting data loaded. Filters require team statistics to work.</span>
          </div>
        )}

        {/* Filter Settings Panel */}
        {showFilterSettings && (
          <div className="bg-surfaceElevated rounded-lg border border-border p-4 space-y-3">
            <h3 className="text-sm font-bold text-textSecondary uppercase tracking-wider">Filter Settings</h3>
            {filterConfigs.map(filter => (
              <div key={filter.id} className="flex flex-wrap items-center gap-2">
                <select
                  value={filter.icon}
                  onChange={e => updateFilter(filter.id, { icon: e.target.value })}
                  className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm"
                >
                  {Object.keys(FILTER_ICONS).map(iconKey => (
                    <option key={iconKey} value={iconKey}>{iconKey}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={filter.label}
                  onChange={e => updateFilter(filter.id, { label: e.target.value })}
                  className="w-28 px-2 py-1.5 bg-background border border-border rounded text-sm"
                  placeholder="Filter name"
                />
                <select
                  value={filter.field}
                  onChange={e => updateFilter(filter.id, { field: e.target.value as keyof TeamStatistics })}
                  className="flex-1 min-w-[140px] px-2 py-1.5 bg-background border border-border rounded text-sm"
                >
                  {STAT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={filter.operator}
                  onChange={e => updateFilter(filter.id, { operator: e.target.value as FilterConfig['operator'] })}
                  className="w-16 px-2 py-1.5 bg-background border border-border rounded text-sm"
                >
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                </select>
                <input
                  type="number"
                  value={filter.threshold}
                  onChange={e => updateFilter(filter.id, { threshold: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm"
                />
                <button
                  onClick={() => removeFilter(filter.id)}
                  className="p-1.5 text-textMuted hover:text-danger rounded transition-colors"
                  title="Remove filter"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={addFilter}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-success hover:bg-interactive rounded transition-colors"
            >
              <Plus size={14} />
              Add Filter
            </button>
          </div>
        )}
      </div>

      {/* Compare indicator */}
      {compareTeams.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blueAlliance/10 border border-blueAlliance/30 rounded-lg">
          <span className="text-sm text-blueAlliance font-medium">
            Click teams to compare ({compareTeams.length}/2)
          </span>
          <button
            onClick={() => setCompareTeams([])}
            className="text-xs text-textMuted hover:text-danger transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Watchlist Panel - for final morning tracking */}
      {(() => {
        const watchlistTeams = getWatchlistTeams();
        if (watchlistTeams.length === 0) return null;

        const tier2Teams = pickList?.teams.filter(t => t.tier === 'tier2' && !t.onWatchlist).sort((a, b) => a.rank - b.rank) || [];

        return (
          <div className="bg-warning/10 border-2 border-warning rounded-lg overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 bg-warning/20 cursor-pointer"
              onClick={() => setShowWatchlist(!showWatchlist)}
            >
              <div className="flex items-center gap-3">
                <Eye size={20} className="text-warning" />
                <h2 className="text-lg font-bold">
                  Final Morning Watchlist ({watchlistTeams.length})
                </h2>
                <span className="text-sm text-textSecondary">
                  Rank these teams, then finalize into {tier2Name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Clear all teams from watchlist?')) {
                      clearWatchlist();
                    }
                  }}
                  className="p-2 text-textMuted hover:text-danger transition-colors"
                  title="Clear watchlist"
                >
                  <Trash2 size={18} />
                </button>
                {showWatchlist ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            {/* Watchlist Content */}
            {showWatchlist && (
              <div className="p-4 space-y-4">
                {/* Watchlist Teams - Ranked */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {watchlistTeams.map((team, index) => {
                    const stats = teamStatistics.find(s => s.teamNumber === team.teamNumber);
                    return (
                      <div
                        key={team.teamNumber}
                        className="bg-surface border border-border rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-warning">#{index + 1}</span>
                            <span className="text-lg font-bold">{team.teamNumber}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {index > 0 && (
                              <button
                                onClick={() => reorderWatchlist(team.teamNumber, index)}
                                className="p-1 hover:bg-interactive rounded"
                                title="Move up"
                              >
                                <ArrowUp size={16} />
                              </button>
                            )}
                            {index < watchlistTeams.length - 1 && (
                              <button
                                onClick={() => reorderWatchlist(team.teamNumber, index + 2)}
                                className="p-1 hover:bg-interactive rounded"
                                title="Move down"
                              >
                                <ArrowDown size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => toggleWatchlist(team.teamNumber)}
                              className="p-1 hover:bg-danger/20 text-danger rounded"
                              title="Remove from watchlist"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        {stats && (
                          <div className="text-xs text-textSecondary mb-2">
                            {stats.avgTotalPoints.toFixed(1)} pts • L3: {stats.level3ClimbRate.toFixed(0)}%
                          </div>
                        )}
                        <textarea
                          value={team.watchlistNotes || ''}
                          onChange={(e) => updateWatchlistNotes(team.teamNumber, e.target.value)}
                          placeholder="Notes from final matches..."
                          className="w-full px-2 py-1 text-sm bg-background border border-border rounded resize-none"
                          rows={2}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Finalize Controls */}
                <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-warning/30">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Insert at position:</span>
                    <select
                      value={insertAtRank}
                      onChange={(e) => setInsertAtRank(Number(e.target.value))}
                      className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                    >
                      <option value={1}>Top of {tier2Name}</option>
                      {tier2Teams.map((team, index) => (
                        <option key={team.teamNumber} value={index + 2}>
                          After #{index + 1} ({team.teamNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`This will move ${watchlistTeams.length} teams into ${tier2Name} at position ${insertAtRank}. Continue?`)) {
                        finalizeWatchlist(insertAtRank);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
                  >
                    <Check size={18} />
                    Finalize to {tier2Name}
                  </button>
                  <p className="text-xs text-textSecondary">
                    Teams will be inserted in watchlist order (#{1} first)
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Drag-and-drop layout - 3 columns by default, 4 when DNP has teams */}
      <DndContext
        sensors={sensors}
        collisionDetection={multiColumnCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={`grid grid-cols-1 ${tier4Teams.length > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 md:gap-4`}>
          <DroppableColumn
            id="tier1-column"
            title={`${pickList.config.tier1Name} (${tier1Teams.length})`}
            teams={tier1Teams}
            tier="tier1"
            tierNames={{
              tier1: pickList.config.tier1Name,
              tier2: pickList.config.tier2Name,
              tier3: pickList.config.tier3Name,
              tier4: pickList.config.tier4Name || 'Do Not Pick',
            }}
            onMoveTier={handleMoveTier}
            compareTeams={compareTeams}
            onToggleCompare={toggleCompare}
            teamPassesFilters={teamPassesFilters}
            hasActiveFilters={hasActiveFilters}
          />
          <DroppableColumn
            id="tier2-column"
            title={`${pickList.config.tier2Name} (${tier2Teams.length})`}
            teams={tier2Teams}
            tier="tier2"
            tierNames={{
              tier1: pickList.config.tier1Name,
              tier2: pickList.config.tier2Name,
              tier3: pickList.config.tier3Name,
              tier4: pickList.config.tier4Name || 'Do Not Pick',
            }}
            onMoveTier={handleMoveTier}
            compareTeams={compareTeams}
            onToggleCompare={toggleCompare}
            teamPassesFilters={teamPassesFilters}
            hasActiveFilters={hasActiveFilters}
          />
          <DroppableColumn
            id="tier3-column"
            title={`${pickList.config.tier3Name} (${tier3Teams.length})`}
            teams={tier3Teams}
            tier="tier3"
            tierNames={{
              tier1: pickList.config.tier1Name,
              tier2: pickList.config.tier2Name,
              tier3: pickList.config.tier3Name,
              tier4: pickList.config.tier4Name || 'Do Not Pick',
            }}
            onMoveTier={handleMoveTier}
            compareTeams={compareTeams}
            onToggleCompare={toggleCompare}
            teamPassesFilters={teamPassesFilters}
            hasActiveFilters={hasActiveFilters}
          />
          {/* Tier 4: Do Not Pick (only visible when teams have been added to it) */}
          {tier4Teams.length > 0 && (
            <DroppableColumn
              id="tier4-column"
              title={`${pickList.config.tier4Name || 'Do Not Pick'} (${tier4Teams.length})`}
              teams={tier4Teams}
              tier="tier4"
              tierNames={{
                tier1: pickList.config.tier1Name,
                tier2: pickList.config.tier2Name,
                tier3: pickList.config.tier3Name,
                tier4: pickList.config.tier4Name || 'Do Not Pick',
              }}
              onMoveTier={handleMoveTier}
              compareTeams={compareTeams}
              onToggleCompare={toggleCompare}
              teamPassesFilters={teamPassesFilters}
              hasActiveFilters={hasActiveFilters}
            />
          )}
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="bg-surface border border-border rounded-lg p-3 opacity-90 shadow-lg">
              <div className="flex items-center gap-2">
                <GripVertical size={16} className="text-textMuted" />
                <span className="font-bold">Team {activeId.replace('team-', '')}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Comparison Modal */}
      {showComparisonModal && compareTeams.length === 2 && (
        <ComparisonModal
          team1={teamStatistics.find(t => t.teamNumber === compareTeams[0])!}
          team2={teamStatistics.find(t => t.teamNumber === compareTeams[1])!}
          onPickTeam={handlePickWinner}
          onClose={() => {
            setShowComparisonModal(false);
            setCompareTeams([]);
          }}
        />
      )}

      </>}
    </div>
  );
}

export default PickList;
