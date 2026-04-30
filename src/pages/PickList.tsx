import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  TouchSensor,
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
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Settings,
  Download,
  Upload,
  Flag,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ChevronsUp,

  Ban,
  Filter,
  Mountain,
  Zap,
  Shield,
  Trophy,
  Crown,
  Target,
  Wrench,
  SlidersHorizontal,
  Trash2,
  Plus,
  AlertTriangle,
  Handshake,
  Eye,
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
  TrendingUp,
  Square,
  SquareCheckBig,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PickListTeam, PickListConfig, FilterConfig } from '../types/pickList';
import type { LiveComment, LiveSuggestion, LiveLockStatus } from '../types/pickList';
import type { TeamStatistics } from '../types/scouting';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { doesTeamPassAllFilters, countTeamsPassingFilter } from '../utils/filterUtils';
import { formatRelativeTime } from '../utils/formatting';
import {
  updateLiveNotes,
  toggleLiveFlag,
  toggleLiveWatchlist,
  updateLiveWatchlistNotes,
  reorderLiveWatchlist,
  clearLiveWatchlist,
  finalizeLiveWatchlist,
  applyLiveSameTierMove,
  applyLiveCrossTierMove,
  applyLiveMoveAbove,
} from '../utils/pickListHelpers';

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
  arrowDown: ArrowDown,
  wrench: Wrench,
};

const STAT_OPTIONS: { value: keyof TeamStatistics; label: string }[] = [
  { value: 'avgTotalPoints', label: 'Avg Total Points' },
  { value: 'avgAutoPoints', label: 'Avg Auto Points' },
  { value: 'avgTeleopPoints', label: 'Avg Teleop Points' },
  { value: 'avgEndgamePoints', label: 'Avg Endgame Points' },
  { value: 'avgTotalFuelEstimate', label: 'Avg Balls Moved' },
  { value: 'avgAutoFuelEstimate', label: 'Avg Auto Fuel' },
  { value: 'avgTeleopFuelEstimate', label: 'Avg Teleop Fuel' },
  { value: 'avgEndgamePoints', label: 'Avg Endgame Points' },
  { value: 'autoClimbRate', label: 'Auto Climb Rate (%)' },
  { value: 'centerFieldAutoRate', label: 'Mid Field Auto (%)' },
  { value: 'autoDidNothingRate', label: 'Auto Did Nothing (%)' },
  { value: 'avgTotalPass', label: 'Avg Passes Per Match' },
  { value: 'passerRatio', label: 'Pass Ratio (passes/total moved)' },
  { value: 'dedicatedPasserRate', label: 'Dedicated Passer (%)' },
  { value: 'overallUnreliabilityRate', label: 'Unreliability (%)' },
  { value: 'lostConnectionRate', label: 'Lost Connection (%)' },
  { value: 'noRobotRate', label: 'No Robot (%)' },
];

const DEFAULT_FILTERS: FilterConfig[] = [
  { id: 'autoClimber', label: 'Auto Climber', icon: 'zap', field: 'autoClimbRate', operator: '>=', threshold: 50, active: false },
  { id: 'strongAuto', label: 'Strong Auto', icon: 'zap', field: 'avgAutoPoints', operator: '>=', threshold: 10, active: false },
  { id: 'reliable', label: 'Reliable', icon: 'shield', field: 'overallUnreliabilityRate', operator: '<=', threshold: 15, active: false },
  { id: 'highScorer', label: 'High Scorer', icon: 'trophy', field: 'avgTotalPoints', operator: '>=', threshold: 35, active: false },
  { id: 'goodPasser', label: 'Good Passer', icon: 'zap', field: 'avgTotalPass', operator: '>=', threshold: 5, active: false },
  { id: 'pitTrench', label: 'Trench', icon: 'arrowDown', field: 'canGoUnderTrench', operator: '>=', threshold: 0, active: false, filterType: 'pit-boolean', pitField: 'canGoUnderTrench' },
  { id: 'pitDriveType', label: 'Drive Type', icon: 'wrench', field: '', operator: '>=', threshold: 0, active: false, filterType: 'pit-select', pitField: 'driveType', pitValues: [] },
];

// All pit scouting fields in one list — UI adapts based on `kind`
const PIT_FIELDS: { value: string; label: string; kind: 'boolean' | 'select' | 'number'; options?: string[] }[] = [
  { value: 'canGoUnderTrench', label: 'Can Go Under Trench', kind: 'boolean' },
  { value: 'driveType', label: 'Drive Type', kind: 'select', options: ['swerve', 'tank', 'mecanum', 'other'] },
  { value: 'climbLevel', label: 'Climb Level', kind: 'select', options: ['level1', 'level2', 'level3', 'none'] },
  { value: 'programmingLanguage', label: 'Language', kind: 'select', options: ['java', 'cpp', 'python', 'labview', 'other'] },
  { value: 'driverExperience', label: 'Driver Experience', kind: 'select', options: ['1stYear', '2ndYear', '3plusYears'] },
  { value: 'vibeCheck', label: 'Vibe Check', kind: 'select', options: ['good', 'bad'] },
  { value: 'buildQuality', label: 'Build Quality (1-5)', kind: 'number' },
  { value: 'wiringQuality', label: 'Wiring Quality (1-5)', kind: 'number' },
  { value: 'robotComplexity', label: 'Robot Complexity (1-5)', kind: 'number' },
  { value: 'batteryCount', label: 'Battery Count', kind: 'number' },
  { value: 'batteryStrappedDown', label: 'Battery Strapped Down', kind: 'boolean' },
  { value: 'mainBreakerProtected', label: 'Main Breaker Protected', kind: 'boolean' },
  { value: 'functionChecksBetweenMatches', label: 'Function Checks', kind: 'boolean' },
  { value: 'unusedPortsCovered', label: 'Unused Ports Covered', kind: 'boolean' },
  { value: 'ferrulesAndHotGlue', label: 'Ferrules & Hot Glue', kind: 'boolean' },
];

/** Look up the pit field definition and return the filterType it maps to. */
function pitFieldToFilterType(pitFieldValue: string): 'pit-boolean' | 'pit-select' | 'pit-number' {
  const def = PIT_FIELDS.find(f => f.value === pitFieldValue);
  if (!def) return 'pit-boolean';
  return def.kind === 'select' ? 'pit-select' : def.kind === 'number' ? 'pit-number' : 'pit-boolean';
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
  pushTeamsIfUnchanged: (teams: PickListTeam[], expectedUpdatedAt: string | null) => Promise<boolean>;
  lastUpdatedAt: string | null;
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
  addFilter: (source?: 'stats' | 'pit') => void;
  removeFilter: (id: string) => void;
  hasActiveFilters: boolean;
  teamPassesFilters: (teamNumber: number) => boolean;
  liveFilterConfigs: FilterConfig[] | null;
  pushLiveFilterConfigs: (configs: FilterConfig[]) => Promise<void>;
  liveFilterPassingTeams: number[] | null;
  pushLiveFilterPassingTeams: (teamNumbers: number[]) => Promise<void>;
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
  takeControl, releaseControl, pushTeams, pushTeamsIfUnchanged, lastUpdatedAt, pushConfig,
  initializeLiveList, acceptSuggestion, dismissSuggestion, deleteLiveList,
  passControl, claimPendingControl,
  addComment, deleteComment, addSuggestion, voteSuggestion,
  tbaData,
  filterConfigs, toggleFilter, updateFilter, addFilter, removeFilter,
  liveFilterConfigs, pushLiveFilterConfigs,
  liveFilterPassingTeams, pushLiveFilterPassingTeams,
  compareTeams, onToggleCompare,
  allowedUsers,
}: LivePickListViewProps) {
  // Picklist must not be influenced by pre-scout — every viewer sees the same
  // numbers regardless of personal data-source toggles. Pre-scout is only for
  // predictions, team list, and team detail pages.
  const teamStatistics = useAnalyticsStore(s => s.liveOnlyTeamStatistics);
  const teamTrends = useAnalyticsStore(s => s.teamTrends);
  const [showSuggestionSummary, setShowSuggestionSummary] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [showLiveSettings, setShowLiveSettings] = useState(false);
  const [showFilterSettings, setShowFilterSettings] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [liveTier1Name, setLiveTier1Name] = useState('');
  const [liveTier2Name, setLiveTier2Name] = useState('');
  const [liveTier3Name, setLiveTier3Name] = useState('');
  const [liveTier4Name, setLiveTier4Name] = useState('Do Not Pick');
  const [showPassControl, setShowPassControl] = useState(false);
  const [liveActiveId, setLiveActiveId] = useState<string | null>(null);
  const [dragItems, setDragItems] = useState<PickListTeam[] | null>(null);
  const dragStartUpdatedAt = useRef<string | null>(null);
  const [showWatchlist, setShowWatchlist] = useState(true);
  const [insertAtLiveRank, setInsertAtLiveRank] = useState(1);
  const [showTrendGlow, setShowTrendGlow] = useState(false);
  const [liveExpandedTeam, setLiveExpandedTeam] = useState<number | null>(null);

  useEffect(() => {
    if (liveList?.config) {
      setLiveTier1Name(liveList.config.tier1Name);
      setLiveTier2Name(liveList.config.tier2Name);
      setLiveTier3Name(liveList.config.tier3Name);
      setLiveTier4Name(liveList.config.tier4Name ?? 'Do Not Pick');
    }
  }, [liveList?.config]);

  const liveSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: canEdit ? 8 : 999999 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleLiveDragStart = (event: DragStartEvent) => {
    setLiveActiveId(event.active.id.toString());
    dragStartUpdatedAt.current = lastUpdatedAt;
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

  // On drop: commit local drag state to Firestore in one write (with conflict check)
  const handleLiveDragEnd = async (_event: DragEndEvent) => {
    setLiveActiveId(null);
    if (!canEdit) { setDragItems(null); return; }
    if (dragItems) {
      const success = await pushTeamsIfUnchanged(dragItems, dragStartUpdatedAt.current);
      if (!success) {
        alert('The live list was updated by another admin while you were dragging. Your changes were not saved. The list has been refreshed.');
      }
    }
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

  // Pit scouting data for pit-type filters
  const livePitEntries = usePitScoutStore(state => state.entries);

  const countLivePassingTeams = (filter: FilterConfig): number => {
    if (!liveList) return 0;
    return countTeamsPassingFilter(filter, liveList.teams, teamStatistics, livePitEntries);
  };

  // Use Firestore-synced filter configs when available; fall back to local defaults
  const effectiveFilterConfigs = liveFilterConfigs ?? filterConfigs;
  const liveHasActiveFilters = effectiveFilterConfigs.some(f => f.active);

  // Highlights are sourced from the synced pass set so every viewer sees identical
  // highlights regardless of their personal data-source mode (live vs pre-scout).
  // Editor's machine is canonical; viewers read the set written by the lock holder.
  // Fallback (no synced set yet, or rare race after add/remove) computes locally.
  const livePassingSet = useMemo(
    () => (liveFilterPassingTeams ? new Set(liveFilterPassingTeams) : null),
    [liveFilterPassingTeams]
  );

  const liveTeamPassesFilters = (teamNumber: number): boolean => {
    if (!liveHasActiveFilters) return true;
    if (livePassingSet) return livePassingSet.has(teamNumber);
    return doesTeamPassAllFilters(teamNumber, effectiveFilterConfigs, teamStatistics, livePitEntries);
  };

  // Compute the passing-teams set from a candidate filter list using the editor's
  // local data. Returns team numbers passing ALL active filters.
  const computePassingTeams = useCallback((configs: FilterConfig[]): number[] => {
    if (!liveList) return [];
    const anyActive = configs.some(f => f.active);
    if (!anyActive) return [];
    return liveList.teams
      .filter(t => doesTeamPassAllFilters(t.teamNumber, configs, teamStatistics, livePitEntries))
      .map(t => t.teamNumber);
  }, [liveList, teamStatistics, livePitEntries]);

  // Editor: keep the synced pass set in sync as their local stats/pit data update,
  // so highlights stay accurate as new scout data lands during a live session.
  useEffect(() => {
    if (!canEdit || !liveList) return;
    const passing = computePassingTeams(effectiveFilterConfigs);
    pushLiveFilterPassingTeams(passing).catch(() => {});
  }, [canEdit, liveList, effectiveFilterConfigs, teamStatistics, livePitEntries, computePassingTeams, pushLiveFilterPassingTeams]);

  // When admin toggles a filter, update locally AND push to Firestore
  const handleLiveToggleFilter = (id: string) => {
    const updated = effectiveFilterConfigs.map(f => f.id === id ? { ...f, active: !f.active } : f);
    toggleFilter(id); // updates local state in parent (keeps button UI reactive)
    if (canEdit) {
      pushLiveFilterConfigs(updated);
      pushLiveFilterPassingTeams(computePassingTeams(updated)).catch(() => {});
    }
  };

  const handleLiveUpdateFilter = (id: string, updates: Partial<FilterConfig>) => {
    const updated = effectiveFilterConfigs.map(f => f.id === id ? { ...f, ...updates } : f);
    updateFilter(id, updates);
    if (canEdit) {
      pushLiveFilterConfigs(updated);
      pushLiveFilterPassingTeams(computePassingTeams(updated)).catch(() => {});
    }
  };

  const handleLiveAddFilter = (source: 'stats' | 'pit' = 'stats') => {
    const newId = `custom-${Date.now()}`;
    let newFilter: FilterConfig;
    if (source === 'pit') {
      const firstPit = PIT_FIELDS[0];
      newFilter = { id: newId, label: firstPit.label, icon: 'wrench', field: '', operator: '>=', threshold: 0, active: false, filterType: pitFieldToFilterType(firstPit.value), pitField: firstPit.value, pitValues: [] };
    } else {
      newFilter = { id: newId, label: 'New Filter', icon: 'target', field: 'avgTotalPoints', operator: '>=', threshold: 0, active: false };
    }
    addFilter(source);
    if (canEdit) {
      const updated = [...effectiveFilterConfigs, newFilter];
      pushLiveFilterConfigs(updated);
      pushLiveFilterPassingTeams(computePassingTeams(updated)).catch(() => {});
    }
  };

  const handleLiveRemoveFilter = (id: string) => {
    const updated = effectiveFilterConfigs.filter(f => f.id !== id);
    removeFilter(id);
    if (canEdit) {
      pushLiveFilterConfigs(updated);
      pushLiveFilterPassingTeams(computePassingTeams(updated)).catch(() => {});
    }
  };

  const handleLiveClearAllFilters = () => {
    const updated = effectiveFilterConfigs.map(f => ({ ...f, active: false }));
    effectiveFilterConfigs.filter(f => f.active).forEach(f => toggleFilter(f.id));
    if (canEdit) {
      pushLiveFilterConfigs(updated);
      pushLiveFilterPassingTeams([]).catch(() => {});
    }
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

      {/* Combined status bar: snapshot + control + admin actions */}
      {(snapshotTakenAt || isAdmin) && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg border ${isLockHolder ? 'bg-success/10 border-success/40' : 'bg-surface border-border'}`}>
          {/* Snapshot info */}
          {snapshotTakenAt && (
            <span className="flex items-center gap-1.5 text-xs text-textSecondary">
              <Lock size={11} className="flex-shrink-0" />
              Locked {new Date(snapshotTakenAt).toLocaleDateString()}{snapshotTakenBy && <> by {snapshotTakenBy.split('@')[0]}</>}
            </span>
          )}
          {snapshotTakenAt && isAdmin && <span className="text-border">|</span>}
          {/* Control status */}
          {isAdmin && (
            <>
              {isLockHolder ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <UserCheck size={12} />
                  You have control
                </span>
              ) : lockStatus ? (
                <span className="flex items-center gap-1.5 text-xs text-textSecondary">
                  <Lock size={11} />
                  Controlled by <span className="font-medium text-textPrimary">{lockStatus.displayName || lockStatus.email}</span>
                  {isLockStale && <span className="text-warning ml-1">(expired)</span>}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-textMuted">
                  <Unlock size={11} />
                  No one has control
                </span>
              )}
            </>
          )}
          {/* Action buttons — pushed to right */}
          <div className="flex items-center gap-2 ml-auto">
            {isAdmin && isLockHolder && allowedUsers.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowPassControl(!showPassControl)}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs text-textSecondary hover:text-textPrimary border border-border rounded transition-colors"
                >
                  <Handshake size={11} />
                  Pass
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
            {isAdmin && isLockHolder && (
              <button
                onClick={releaseControl}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-textSecondary hover:text-danger border border-border hover:border-danger rounded transition-colors"
              >
                <Unlock size={11} />
                Release
              </button>
            )}
            {isAdmin && !isLockHolder && (
              <button
                onClick={takeControl}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded transition-colors ${lockStatus ? 'bg-interactive hover:bg-interactive/80 border border-border' : 'bg-success/20 text-success hover:bg-success/30 border border-success/40'}`}
              >
                <UserCheck size={11} />
                Take Control
              </button>
            )}
            {isAdmin && (
              <>
                <span className="text-border">|</span>
                <button
                  onClick={() => setShowLiveSettings(!showLiveSettings)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors border ${showLiveSettings ? 'bg-interactive border-interactive text-textPrimary' : 'text-textSecondary hover:text-textPrimary border-border'}`}
                >
                  <Settings size={11} />
                  Settings
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete the live pick list? This CANNOT be undone.')) deleteLiveList();
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs text-danger border border-danger/40 hover:bg-danger hover:text-white rounded transition-colors"
                >
                  <Trash2 size={11} />
                  Reset
                </button>
              </>
            )}
          </div>
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
      <div className="bg-surface rounded-lg border border-border">
        {/* Collapsed bar */}
        <div className={`flex flex-wrap items-center gap-3 px-4 ${filtersCollapsed ? 'py-2' : 'pt-3 px-4'}`}>
          <button
            onClick={() => setFiltersCollapsed(!filtersCollapsed)}
            className="p-1 rounded transition-colors text-textMuted hover:text-textPrimary"
            title={filtersCollapsed ? 'Show filters' : 'Hide filters'}
          >
            {filtersCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <Trophy size={18} className="text-warning" />
          <span className="font-semibold text-sm">Live List:</span>
          <span className="text-xl font-bold text-success">{liveTeamCount}</span>
          <span className="text-textSecondary text-sm">teams</span>
          {!canEdit && (
            <span className="text-xs text-textMuted bg-surfaceElevated border border-border px-2 py-0.5 rounded">
              View only
            </span>
          )}
          {filtersCollapsed && liveHasActiveFilters && (
            <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">
              {effectiveFilterConfigs.filter(f => f.active).length} filter{effectiveFilterConfigs.filter(f => f.active).length !== 1 ? 's' : ''} active
            </span>
          )}
          {filtersCollapsed && (
            <button
              onClick={() => setShowTrendGlow(!showTrendGlow)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ml-auto ${showTrendGlow ? 'bg-success text-background' : 'bg-surfaceElevated hover:bg-interactive'}`}
            >
              <TrendingUp size={12} />
              Trends
            </button>
          )}
        </div>

        {/* Expanded content */}
        {!filtersCollapsed && (
          <div className="px-4 pb-3 pt-2 space-y-3">
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
              onClick={() => {
                if (canEdit) handleLiveClearAllFilters();
              }}
              className="text-xs text-textMuted hover:text-danger ml-2"
            >
              Clear all
            </button>
          )}
          {!canEdit && liveHasActiveFilters && (
            <span className="text-xs text-textMuted italic">Filters shared by editor</span>
          )}
          <button
            onClick={() => setShowTrendGlow(!showTrendGlow)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ml-auto ${showTrendGlow ? 'bg-success text-background' : 'bg-surfaceElevated hover:bg-interactive'}`}
            title="Highlight teams trending up or down based on last 3 matches"
          >
            <TrendingUp size={14} />
            Trends
          </button>
        </div>
        {showFilterSettings && canEdit && (
          <div className="bg-surfaceElevated rounded-lg border border-border p-4 space-y-3">
            <h3 className="text-sm font-bold text-textSecondary uppercase tracking-wider">Filter Settings</h3>
            {effectiveFilterConfigs.map(filter => {
              const isPit = filter.filterType?.startsWith('pit');
              const pitDef = isPit ? PIT_FIELDS.find(f => f.value === filter.pitField) : null;
              return (
                <div key={filter.id} className="flex flex-wrap items-center gap-2">
                  <select value={filter.icon} onChange={e => handleLiveUpdateFilter(filter.id, { icon: e.target.value })}
                    className="w-20 px-1.5 py-1.5 bg-background border border-border rounded text-sm">
                    {Object.keys(FILTER_ICONS).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input type="text" value={filter.label} onChange={e => handleLiveUpdateFilter(filter.id, { label: e.target.value })}
                    className="w-28 px-2 py-1.5 bg-background border border-border rounded text-sm" placeholder="Name" />
                  {isPit ? (
                    <>
                      <select value={filter.pitField || ''} onChange={e => {
                        const newPitField = e.target.value;
                        const newDef = PIT_FIELDS.find(f => f.value === newPitField);
                        handleLiveUpdateFilter(filter.id, {
                          pitField: newPitField, label: newDef?.label || newPitField,
                          filterType: pitFieldToFilterType(newPitField), pitValues: [],
                        });
                      }} className="min-w-[140px] px-2 py-1.5 bg-background border border-border rounded text-sm">
                        {PIT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      {pitDef?.kind === 'select' && (
                        <div className="flex flex-wrap gap-1">
                          {pitDef.options!.map(opt => {
                            const selected = filter.pitValues?.includes(opt);
                            return (
                              <button key={opt} onClick={() => {
                                const current = filter.pitValues || [];
                                const updated = selected ? current.filter(v => v !== opt) : [...current, opt];
                                handleLiveUpdateFilter(filter.id, { pitValues: updated });
                              }} className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                selected ? 'bg-blueAlliance text-white' : 'bg-background border border-border hover:bg-interactive'
                              }`}>{opt}</button>
                            );
                          })}
                        </div>
                      )}
                      {pitDef?.kind === 'number' && (
                        <>
                          <select value={filter.operator} onChange={e => handleLiveUpdateFilter(filter.id, { operator: e.target.value as FilterConfig['operator'] })}
                            className="w-16 px-2 py-1.5 bg-background border border-border rounded text-sm">
                            <option value=">=">&gt;=</option><option value="<=">&lt;=</option>
                            <option value=">">&gt;</option><option value="<">&lt;</option>
                          </select>
                          <input type="number" value={filter.threshold} onChange={e => handleLiveUpdateFilter(filter.id, { threshold: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm" />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <select value={filter.field} onChange={e => handleLiveUpdateFilter(filter.id, { field: e.target.value })}
                        className="flex-1 min-w-[140px] px-2 py-1.5 bg-background border border-border rounded text-sm">
                        {STAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select value={filter.operator} onChange={e => handleLiveUpdateFilter(filter.id, { operator: e.target.value as FilterConfig['operator'] })}
                        className="w-16 px-2 py-1.5 bg-background border border-border rounded text-sm">
                        <option value=">=">&gt;=</option><option value="<=">&lt;=</option>
                        <option value=">">&gt;</option><option value="<">&lt;</option>
                      </select>
                      <input type="number" value={filter.threshold} onChange={e => handleLiveUpdateFilter(filter.id, { threshold: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm" />
                    </>
                  )}
                  <button onClick={() => handleLiveRemoveFilter(filter.id)} className="p-1.5 text-textMuted hover:text-danger rounded transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-textMuted">Add:</span>
              <button onClick={() => handleLiveAddFilter('stats')} className="flex items-center gap-1 px-2.5 py-1 text-xs text-success bg-background border border-border rounded hover:bg-interactive transition-colors">
                <Plus size={12} /> Stats
              </button>
              <button onClick={() => handleLiveAddFilter('pit')} className="flex items-center gap-1 px-2.5 py-1 text-xs text-success bg-background border border-border rounded hover:bg-interactive transition-colors">
                <Plus size={12} /> Pit Data
              </button>
            </div>
          </div>
        )}
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
                <DndContext
                  sensors={liveSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    if (!over || active.id === over.id || !liveList) return;
                    const activeNum = Number(String(active.id).replace('wl-', ''));
                    const overNum = Number(String(over.id).replace('wl-', ''));
                    const overTeam = watchlistTeams.find(t => t.teamNumber === overNum);
                    if (!overTeam) return;
                    pushTeams(reorderLiveWatchlist(liveList.teams, activeNum, overTeam.watchlistRank || 1));
                  }}
                >
                  <SortableContext items={watchlistTeams.map(t => `wl-${t.teamNumber}`)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      {watchlistTeams.map((team, index) => {
                        const stats = teamStatistics.find(s => s.teamNumber === team.teamNumber);
                        const trend = teamTrends.find(t => t.teamNumber === team.teamNumber);
                        return (
                          <SortableWatchlistCard key={team.teamNumber} id={`wl-${team.teamNumber}`} disabled={!canEdit}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {canEdit && <GripVertical size={14} className="text-textMuted cursor-grab flex-shrink-0" />}
                                <span className="text-xl font-bold text-warning">#{index + 1}</span>
                                <Link to={`/teams/${team.teamNumber}`} className="text-lg font-bold hover:text-success transition-colors">
                                  {team.teamNumber}
                                </Link>
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => pushTeams(toggleLiveWatchlist(liveList.teams, team.teamNumber))}
                                  className="p-1 hover:bg-danger/20 text-danger rounded"
                                  title="Remove from watchlist"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                            {stats && (
                              <div className="text-xs mb-2">
                                <table className="w-full">
                                  <thead>
                                    <tr className="text-textMuted">
                                      <th className="text-left font-normal pr-1"></th>
                                      <th className="text-right font-normal px-1">Avg</th>
                                      <th className="text-right font-normal pl-1">Last 3</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td className="text-textSecondary pr-1">Pts</td>
                                      <td className="text-right px-1">{stats.avgTotalPoints.toFixed(1)}</td>
                                      <td className={`text-right pl-1 font-semibold ${
                                        trend && trend.last3Avg.total > stats.avgTotalPoints * 1.05 ? 'text-success'
                                        : trend && trend.last3Avg.total < stats.avgTotalPoints * 0.95 ? 'text-danger'
                                        : 'text-textPrimary'
                                      }`}>{trend ? trend.last3Avg.total.toFixed(1) : '-'}</td>
                                    </tr>
                                    <tr>
                                      <td className="text-textSecondary pr-1">Endgame</td>
                                      <td className="text-right px-1">{stats.avgEndgamePoints.toFixed(1)}</td>
                                      <td className={`text-right pl-1 font-semibold ${
                                        trend && trend.last3Avg.endgame > stats.avgEndgamePoints * 1.05 ? 'text-success'
                                        : trend && trend.last3Avg.endgame < stats.avgEndgamePoints * 0.95 ? 'text-danger'
                                        : 'text-textPrimary'
                                      }`}>{trend ? trend.last3Avg.endgame.toFixed(1) : '-'}</td>
                                    </tr>
                                    <tr>
                                      <td className="text-textSecondary pr-1">Auto</td>
                                      <td className="text-right px-1">{stats.avgAutoPoints.toFixed(1)}</td>
                                      <td className={`text-right pl-1 font-semibold ${
                                        trend && trend.last3Avg.auto > stats.avgAutoPoints * 1.05 ? 'text-success'
                                        : trend && trend.last3Avg.auto < stats.avgAutoPoints * 0.95 ? 'text-danger'
                                        : 'text-textPrimary'
                                      }`}>{trend ? trend.last3Avg.auto.toFixed(1) : '-'}</td>
                                    </tr>
                                  </tbody>
                                </table>
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
                          </SortableWatchlistCard>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>

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
            showTrendGlow={showTrendGlow}
            expandedTeam={liveExpandedTeam}
            onToggleExpand={(num) => setLiveExpandedTeam(prev => prev === num ? null : num)}
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
            showTrendGlow={showTrendGlow}
            expandedTeam={liveExpandedTeam}
            onToggleExpand={(num) => setLiveExpandedTeam(prev => prev === num ? null : num)}
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
            showTrendGlow={showTrendGlow}
            expandedTeam={liveExpandedTeam}
            onToggleExpand={(num) => setLiveExpandedTeam(prev => prev === num ? null : num)}
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
              showTrendGlow={showTrendGlow}
              expandedTeam={liveExpandedTeam}
              onToggleExpand={(num) => setLiveExpandedTeam(prev => prev === num ? null : num)}
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


// Sortable watchlist card wrapper
function SortableWatchlistCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="bg-surface border border-border rounded-lg p-3 select-none touch-none">
      {children}
    </div>
  );
}

// Sortable team card component
function TeamCard({ team, currentTier, tierNames, onMoveTier, onToggleWatchlist, isSelectedForCompare, onToggleCompare, passesFilters, hasActiveFilters, disableInteraction, showTrendGlow, isExpanded, onToggleExpand }: {
  team: PickListTeam | { teamNumber: number; teamName?: string; avgTotalPoints: number; avgAutoPoints: number };
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
  showTrendGlow?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
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
  const isReviewed = isPickListTeam ? (team as PickListTeam).reviewed !== false : true;
  const teamStats = useAnalyticsStore(state =>
    state.liveOnlyTeamStatistics.find(t => t.teamNumber === team.teamNumber)
  );
  const teamTrend = useAnalyticsStore(state =>
    state.teamTrends.find(t => t.teamNumber === team.teamNumber)
  );


  const pit = usePitScoutStore.getState().getEntryByTeam(team.teamNumber);
  const tbaRankings = useAnalyticsStore(state => state.tbaData?.rankings);
  const tbaRanking = tbaRankings?.rankings?.find(
    r => r.team_key === `frc${team.teamNumber}`
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg transition-all cursor-pointer select-none ${
        !isReviewed && isPickListTeam ? 'border-l-4 border-l-blueAlliance/40' : ''
      } ${
        isSelectedForCompare
          ? 'border-blueAlliance bg-blueAlliance/10 ring-2 ring-blueAlliance'
          : isPickListTeam && team.onWatchlist
          ? 'bg-warning/10 border-warning ring-1 ring-warning'
          : isPickListTeam && team.flagged
          ? 'bg-surface border-danger'
          : hasActiveFilters && passesFilters !== false
          ? 'bg-success/10 border-success'
          : 'bg-surface border-border'
      } ${passesFilters === false ? 'opacity-20' : ''} ${
        showTrendGlow && teamTrend?.trend === 'improving' ? 'shadow-[0_0_8px_rgba(34,197,94,0.4)] border-success/50' :
        showTrendGlow && teamTrend?.trend === 'declining' ? 'shadow-[0_0_8px_rgba(239,68,68,0.4)] border-danger/50' : ''
      }`}
    >
      {/* Compact row — always visible */}
      <div
        className="flex items-center gap-2 px-2 py-1.5"
        onClick={e => {
          // If clicking the row (not a button), toggle expand
          if (!(e.target as HTMLElement).closest('button, a, input')) {
            onToggleExpand?.();
          }
        }}
      >
        {/* Drag handle */}
        <div
          {...(disableInteraction ? {} : listeners)}
          {...(disableInteraction ? {} : attributes)}
          className={`touch-none flex-shrink-0 ${disableInteraction ? 'text-textMuted/20 cursor-default' : 'cursor-grab active:cursor-grabbing text-textMuted hover:text-textPrimary'}`}
          onClick={e => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </div>

        {/* Team number */}
        <Link
          to={`/teams/${team.teamNumber}`}
          className="font-bold text-sm text-textPrimary hover:text-blueAlliance transition-colors flex-shrink-0"
          title="View team details"
          onClick={e => e.stopPropagation()}
        >
          {team.teamNumber}
        </Link>

        {/* TBA rank badge — top 8 are alliance captains (not available); 9–12 are likely first picks */}
        {tbaRanking && tbaRanking.rank <= 8 && (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warning text-background font-bold flex-shrink-0"
            title={`Rank #${tbaRanking.rank} — alliance captain (top 8, not available)`}
          >
            <Crown size={10} />
            #{tbaRanking.rank}
          </span>
        )}
        {tbaRanking && tbaRanking.rank > 8 && tbaRanking.rank <= 12 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-bold flex-shrink-0"
            title={`Rank #${tbaRanking.rank} — top 12 (likely first pick)`}
          >
            #{tbaRanking.rank}
          </span>
        )}

        {/* Total points */}
        <span className="text-xs text-textSecondary flex-shrink-0">{teamStats?.avgTotalPoints?.toFixed(0) ?? '0'} pts</span>

        {/* Drive type badge */}
        {pit?.driveType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blueAlliance/20 text-blueAlliance font-medium flex-shrink-0">{pit.driveType}</span>
        )}

        <span className="flex-1" />

        {/* Watchlist indicator / toggle */}
        {isPickListTeam && !disableInteraction && (
          <button
            onClick={e => { e.stopPropagation(); onToggleWatchlist?.(); }}
            className={`p-0.5 flex-shrink-0 transition-colors ${(team as PickListTeam).onWatchlist ? 'text-warning' : 'text-textMuted/30 hover:text-warning'}`}
            title={(team as PickListTeam).onWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Eye size={13} />
          </button>
        )}

        {/* Trend arrow */}
        {teamTrend && teamTrend.trend !== 'stable' && (
          <span className={`text-xs font-bold flex-shrink-0 ${teamTrend.trend === 'improving' ? 'text-success' : 'text-danger'}`}>
            {teamTrend.trend === 'improving' ? '\u2191' : '\u2193'}
          </span>
        )}

        {/* Compare checkbox */}
        <button
          onClick={e => { e.stopPropagation(); onToggleCompare?.(); }}
          className={`p-0.5 flex-shrink-0 ${isSelectedForCompare ? 'text-blueAlliance' : 'text-textMuted hover:text-textSecondary'}`}
          title="Compare"
        >
          {isSelectedForCompare ? <SquareCheckBig size={14} /> : <Square size={14} />}
        </button>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-3 pb-2 pt-1 border-t border-border/50 space-y-1.5">
          {/* Stats — vertical list, label: value */}
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-textMuted">Rank</span>
              <span className="font-semibold text-textPrimary">
                {tbaRanking ? `#${tbaRanking.rank}` : '?'}
                {tbaRanking?.sort_orders?.[0] != null && <span className="font-normal text-textMuted"> ({tbaRanking.sort_orders[0].toFixed(1)} RP)</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Total Points</span>
              <span className="font-semibold text-textPrimary">{teamStats?.avgTotalPoints?.toFixed(1) ?? '?'}</span>
            </div>
            {teamTrend && teamTrend.trend !== 'stable' && (
              <div className={`flex justify-between ${teamTrend.trend === 'improving' ? 'text-success' : 'text-danger'}`}>
                <span>Last 3 Avg</span>
                <span className="font-semibold">{teamTrend.last3Avg.total.toFixed(0)} pts {teamTrend.trend === 'improving' ? '\u2191' : '\u2193'}</span>
              </div>
            )}
            <div className="h-px bg-border/50 my-1" />
            <div className="text-[10px] font-semibold text-textSecondary uppercase tracking-wider">Auto</div>
            <div className="flex justify-between">
              <span className="text-textMuted">Auto Points</span>
              <span className="font-medium text-textPrimary">{teamStats?.avgAutoPoints?.toFixed(1) ?? '?'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Auto Fuel</span>
              <span className="font-medium text-textPrimary">{teamStats?.avgAutoFuelEstimate?.toFixed(1) ?? '?'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Auto Climb</span>
              <span className="font-medium text-textPrimary">{teamStats?.autoClimbCount ? 'Yes' : 'No'}</span>
            </div>
            <div className="h-px bg-border/50 my-1" />
            <div className="text-[10px] font-semibold text-textSecondary uppercase tracking-wider">Teleop</div>
            <div className="flex justify-between">
              <span className="text-textMuted">Teleop Points</span>
              <span className="font-medium text-textPrimary">{teamStats?.avgTeleopPoints?.toFixed(1) ?? '?'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Teleop Fuel</span>
              <span className="font-medium text-textPrimary">{teamStats?.avgTeleopFuelEstimate?.toFixed(1) ?? '?'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Endgame Climb</span>
              <span className="font-medium text-textPrimary">
                {teamStats?.level3ClimbCount ? 'Level 3' : teamStats?.level2ClimbCount ? 'Level 2' : teamStats?.level1ClimbCount ? 'Level 1' : 'None'}
              </span>
            </div>
            <div className="h-px bg-border/50 my-1" />
            <div className="text-[10px] font-semibold text-textSecondary uppercase tracking-wider">Other</div>
            <div className="flex justify-between">
              <span className="text-textMuted">Dedicated Passer</span>
              <span className="font-medium text-textPrimary">{teamStats?.dedicatedPasserRate?.toFixed(0) ?? '?'}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Bulldozed Fuel</span>
              <span className="font-medium text-textPrimary">{teamStats?.bulldozedFuelRate?.toFixed(0) ?? '?'}%</span>
            </div>
            {pit?.canGoUnderTrench && (
              <div className="flex justify-between">
                <span className="text-textMuted">Trench</span>
                <span className="font-medium text-textPrimary">Yes</span>
              </div>
            )}
          </div>

          {/* Tier move buttons */}
          <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
            {currentTier && tierNames && onMoveTier && (
              <>
                {currentTier !== 'tier1' && (
                  <button onClick={() => onMoveTier('tier1')} className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors" title={`Move to ${tierNames.tier1}`}>
                    <ChevronsUp size={12} /> {tierNames.tier1}
                  </button>
                )}
                {currentTier !== 'tier2' && currentTier !== 'tier1' && (
                  <button onClick={() => onMoveTier('tier2')} className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors" title={`Move to ${tierNames.tier2}`}>
                    <ArrowUp size={12} /> {tierNames.tier2}
                  </button>
                )}
                {currentTier === 'tier1' && (
                  <button onClick={() => onMoveTier('tier2')} className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors" title={`Move to ${tierNames.tier2}`}>
                    <ArrowDown size={12} /> {tierNames.tier2}
                  </button>
                )}
                {currentTier !== 'tier3' && currentTier !== 'tier4' && (
                  <button onClick={() => onMoveTier('tier3')} className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors" title={`Move to ${tierNames.tier3}`}>
                    <ArrowDown size={12} /> {tierNames.tier3}
                  </button>
                )}
                {currentTier === 'tier4' && (
                  <button onClick={() => onMoveTier('tier3')} className="flex items-center gap-1 px-2 py-1 text-xs bg-surfaceElevated hover:bg-interactive rounded transition-colors" title={`Move to ${tierNames.tier3}`}>
                    <ArrowUp size={12} /> {tierNames.tier3}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Watch / Do Not Pick */}
          {currentTier && !disableInteraction && onMoveTier && (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onToggleWatchlist?.()}
                className={`flex items-center gap-1.5 flex-1 justify-center px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                  isPickListTeam && (team as PickListTeam).onWatchlist
                    ? 'bg-warning/20 text-warning border border-warning/40'
                    : 'bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20'
                }`}
              >
                <Eye size={13} />
                {isPickListTeam && (team as PickListTeam).onWatchlist ? 'Watching' : 'Watch'}
              </button>
              {currentTier !== 'tier4' ? (
                <button
                  onClick={() => onMoveTier('tier4')}
                  className="flex items-center gap-1.5 flex-1 justify-center px-2 py-1.5 text-xs font-medium rounded transition-colors bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20"
                >
                  <Ban size={13} />
                  Do Not Pick
                </button>
              ) : (
                <button
                  onClick={() => onMoveTier('tier3')}
                  className="flex items-center gap-1.5 flex-1 justify-center px-2 py-1.5 text-xs font-medium rounded transition-colors bg-success/10 text-success border border-success/40 hover:bg-success/20"
                >
                  <ArrowUp size={13} />
                  Restore
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Droppable column component
function DroppableColumn({
  id, title, teams, tier, tierNames, onMoveTier,
  onUpdateNotes, onToggleFlag, onToggleWatchlist,
  disableInteraction,
  compareTeams, onToggleCompare, teamPassesFilters, hasActiveFilters,
  renderTeamExtra, showTrendGlow,
  expandedTeam, onToggleExpand,
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
  showTrendGlow?: boolean;
  expandedTeam?: number | null;
  onToggleExpand?: (teamNumber: number) => void;
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
                showTrendGlow={showTrendGlow}
                isExpanded={expandedTeam === team.teamNumber}
                onToggleExpand={onToggleExpand ? () => onToggleExpand(team.teamNumber) : undefined}
              />
              {expandedTeam === team.teamNumber && renderTeamExtra?.(team.teamNumber)}
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
  const setTeams = usePickListStore(state => state.setTeams);
  const moveTeamAbove = usePickListStore(state => state.moveTeamAbove);
  const redFlagThresholds = usePickListStore(state => state.redFlagThresholds);
  const setRedFlagThresholds = usePickListStore(state => state.setRedFlagThresholds);
  const autoFlagTeams = usePickListStore(state => state.autoFlagTeams);
  const clearAllFlags = usePickListStore(state => state.clearAllFlags);
  const importFromTBARankings = usePickListStore(state => state.importFromTBARankings);
  const locallyDiverged = usePickListStore(state => state.locallyDiverged);
  const shadowFromLive = usePickListStore(state => state.shadowFromLive);
  const publishToLive = usePickListStore(state => state.publishToLive);
  const pullFromLive = usePickListStore(state => state.pullFromLive);

  // Watchlist functions
  const toggleWatchlist = usePickListStore(state => state.toggleWatchlist);
  const updateWatchlistNotes = usePickListStore(state => state.updateWatchlistNotes);
  const reorderWatchlist = usePickListStore(state => state.reorderWatchlist);
  const finalizeWatchlist = usePickListStore(state => state.finalizeWatchlist);
  const clearWatchlist = usePickListStore(state => state.clearWatchlist);
  const getWatchlistTeams = usePickListStore(state => state.getWatchlistTeams);

  const eventCode = useAnalyticsStore(state => state.eventCode);
  // Personal picklist must also be live-only — no pre-scout in the picklist period.
  const teamStatistics = useAnalyticsStore(state => state.liveOnlyTeamStatistics);
  const teamTrends = useAnalyticsStore(state => state.teamTrends);
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

  // Customizable capability filters (unified: stats + pit scouting)
  const [filterConfigs, setFilterConfigs] = useState<FilterConfig[]>(DEFAULT_FILTERS);
  const [showFilterSettings, setShowFilterSettings] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  // Pit scouting data for pit-type filters
  const pitEntries = usePitScoutStore(state => state.entries);

  // Expanded card state
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [showTrendGlow, setShowTrendGlow] = useState(false);

  // Toggle a filter's active state
  const toggleFilter = (id: string) => {
    setFilterConfigs(prev => prev.map(f => f.id === id ? { ...f, active: !f.active } : f));
  };

  // Update a filter's config
  const updateFilter = (id: string, updates: Partial<FilterConfig>) => {
    setFilterConfigs(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // Add a new filter (stats or pit)
  const addFilter = (source: 'stats' | 'pit' = 'stats') => {
    const newId = `custom-${Date.now()}`;
    if (source === 'pit') {
      const firstPit = PIT_FIELDS[0];
      setFilterConfigs(prev => [...prev, {
        id: newId, label: firstPit.label, icon: 'wrench', field: '',
        operator: '>=', threshold: 0, active: false,
        filterType: pitFieldToFilterType(firstPit.value), pitField: firstPit.value, pitValues: [],
      }]);
    } else {
      setFilterConfigs(prev => [...prev, {
        id: newId, label: 'New Filter', icon: 'target', field: 'avgTotalPoints',
        operator: '>=', threshold: 0, active: false,
      }]);
    }
  };

  // Remove a filter
  const removeFilter = (id: string) => {
    setFilterConfigs(prev => prev.filter(f => f.id !== id));
  };

  // Count teams passing a specific filter
  const countPassingTeams = (filter: FilterConfig): number => {
    if (!pickList) return 0;
    return countTeamsPassingFilter(filter, pickList.teams, teamStatistics, pitEntries);
  };

  // Check if a team passes all active filters (unified stats + pit)
  const teamPassesFilters = (teamNumber: number): boolean => {
    return doesTeamPassAllFilters(teamNumber, filterConfigs, teamStatistics, pitEntries);
  };

  const hasActiveFilters = filterConfigs.some(f => f.active);

  // Auto-sync live filters to personal so switching modes preserves filter state
  useEffect(() => {
    if (mode === 'live' && liveSync.liveFilterConfigs) {
      setFilterConfigs(liveSync.liveFilterConfigs);
    }
  }, [mode, liveSync.liveFilterConfigs]);

  // Auto-shadow: when live list changes and personal hasn't diverged, sync personal from live
  useEffect(() => {
    if (liveSync.liveList && !locallyDiverged) {
      shadowFromLive(liveSync.liveList.teams, liveSync.liveList.config);
    }
  }, [liveSync.liveList, locallyDiverged, shadowFromLive]);

  // Publish personal list to live
  const handlePublishToLive = async () => {
    if (!confirm('This will overwrite the shared live list with your personal list. Continue?')) return;
    const list = publishToLive();
    if (list && liveSync.canEdit) {
      try {
        await liveSync.pushTeams(list.teams);
        await liveSync.pushConfig(list.config);
        // Only clear diverged flag after successful write
        usePickListStore.getState().pullFromLive(list.teams, list.config);
      } catch {
        // Write failed — keep diverged so user knows it didn't sync
        usePickListStore.getState().markDiverged();
      }
    }
  };

  // Pull from live to personal
  const handlePullFromLive = () => {
    if (!liveSync.liveList) return;
    pullFromLive(liveSync.liveList.teams, liveSync.liveList.config);
  };

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
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
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

  const handleDragEnd = (_event: DragEndEvent) => {
    setActiveId(null);
    const finalItems = personalDragItems;
    setPersonalDragItems(null);
    if (!finalItems || !pickList) return;
    // Commit the pre-computed ranks directly (applyLiveSameTierMove/CrossTierMove
    // already recalculated all ranks correctly during drag)
    setTeams(finalItems);
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
          {(() => {
            const source = mode === 'live' ? liveSync.liveList?.teams : pickList?.teams;
            if (!source) return null;
            const t1 = source.filter(t => t.tier === 'tier1').length;
            const t2 = source.filter(t => t.tier === 'tier2').length;
            const t3 = source.filter(t => t.tier === 'tier3').length;
            const total = t1 + t2 + t3;
            return (
              <p className="text-xs text-textMuted mt-0.5">
                <span className="text-success font-semibold">{t1}</span> {tier1Name}
                {' + '}
                <span className="text-warning font-semibold">{t2}</span> {tier2Name}
                {' + '}
                <span className="text-blueAlliance font-semibold">{t3}</span> {tier3Name}
                {' = '}
                <span className="text-textPrimary font-semibold">{total}</span> ranked
              </p>
            );
          })()}
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

          {/* Auto-shadow controls */}
          {locallyDiverged && liveSync.exists && (
            <span className="px-2 py-1 bg-warning/20 text-warning text-xs font-semibold rounded-md">
              Diverged from live
            </span>
          )}
          {locallyDiverged && liveSync.canEdit && (
            <button
              onClick={handlePublishToLive}
              className="px-3 py-1.5 bg-success/20 text-success hover:bg-success/30 rounded-lg text-sm font-medium transition-colors"
            >
              Publish to Live
            </button>
          )}
          {liveSync.liveList && (
            <button
              onClick={handlePullFromLive}
              className="px-3 py-1.5 bg-blueAlliance/20 text-blueAlliance hover:bg-blueAlliance/30 rounded-lg text-sm font-medium transition-colors"
            >
              Pull from Live
            </button>
          )}

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
              <button
                onClick={() => {
                  if (!tbaData?.rankings) return;
                  const hasTeams = (pickList?.teams.filter(t => t.tier !== 'tier1').length ?? 0) > 0;
                  if (hasTeams && !confirm('This will replace Potatoes and Chicken Nuggets with current TBA rankings (top 12 → Potatoes, rest → Chicken Nuggets). Your Steak teams are preserved. Continue?')) return;
                  importFromTBARankings(tbaData.rankings);
                }}
                disabled={!tbaData?.rankings}
                title={tbaData?.rankings ? 'Auto-populate tiers from TBA event rankings' : 'No TBA rankings available — fetch TBA data first'}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-success/20 text-success hover:bg-success/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors text-sm md:text-base"
              >
                <TrendingUp size={18} />
                <span className="hidden sm:inline">Import TBA Rankings</span>
                <span className="sm:hidden">TBA</span>
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
          pushTeamsIfUnchanged={liveSync.pushTeamsIfUnchanged}
          lastUpdatedAt={liveSync.lastUpdatedAt}
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
          liveFilterPassingTeams={liveSync.liveFilterPassingTeams}
          pushLiveFilterPassingTeams={liveSync.pushLiveFilterPassingTeams}
          compareTeams={compareTeams}
          onToggleCompare={toggleCompare}
          allowedUsers={allAllowedUsers}
        />
      )}

      {/* Live mode comparison modal */}
      {mode === 'live' && showComparisonModal && compareTeams.length === 2 && (
        <ComparisonModal
          teams={teamStatistics.filter(t => compareTeams.includes(t.teamNumber))}
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
      <div className="bg-surface rounded-lg border border-border">
        {/* Collapsed bar */}
        <div className={`flex flex-wrap items-center gap-3 px-4 ${filtersCollapsed ? 'py-2' : 'pt-4 px-4'}`}>
          <button
            onClick={() => setFiltersCollapsed(!filtersCollapsed)}
            className="p-1 rounded transition-colors text-textMuted hover:text-textPrimary"
            title={filtersCollapsed ? 'Show filters' : 'Hide filters'}
          >
            {filtersCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <Trophy size={18} className="text-warning" />
          <span className="font-semibold text-sm">Pick List:</span>
          <span className="text-xl font-bold text-success">{tier1And2Count}</span>
          <span className="text-textSecondary text-sm">teams</span>
          {filtersCollapsed && hasActiveFilters && (
            <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">
              {filterConfigs.filter(f => f.active).length} filter{filterConfigs.filter(f => f.active).length !== 1 ? 's' : ''} active
            </span>
          )}
          {filtersCollapsed && (
            <button
              onClick={() => setShowTrendGlow(!showTrendGlow)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ml-auto ${showTrendGlow ? 'bg-success text-background' : 'bg-surfaceElevated hover:bg-interactive'}`}
            >
              <TrendingUp size={12} />
              Trends
            </button>
          )}
        </div>

        {/* Expanded content */}
        {!filtersCollapsed && (
          <div className="px-4 pb-4 pt-2 space-y-3">

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
          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilterConfigs(prev => prev.map(f => ({ ...f, active: false })));
              }}
              className="text-xs text-textMuted hover:text-danger ml-2"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setShowTrendGlow(!showTrendGlow)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ml-auto ${showTrendGlow ? 'bg-success text-background' : 'bg-surfaceElevated hover:bg-interactive'}`}
            title="Highlight teams trending up or down based on last 3 matches"
          >
            <TrendingUp size={14} />
            Trends
          </button>
        </div>

        {/* No stats warning */}
        {filterConfigs.some(f => f.active && (!f.filterType || f.filterType === 'stats')) && teamStatistics.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg">
            <AlertTriangle size={16} className="text-warning" />
            <span className="text-sm text-warning">No scouting data loaded. Filters require team statistics to work.</span>
          </div>
        )}

        {/* Filter Settings Panel */}
        {showFilterSettings && (
          <div className="bg-surfaceElevated rounded-lg border border-border p-4 space-y-3">
            <h3 className="text-sm font-bold text-textSecondary uppercase tracking-wider">Filter Settings</h3>
            {filterConfigs.map(filter => {
              const isPit = filter.filterType?.startsWith('pit');
              const pitDef = isPit ? PIT_FIELDS.find(f => f.value === filter.pitField) : null;
              return (
                <div key={filter.id} className="flex flex-wrap items-center gap-2">
                  <select value={filter.icon} onChange={e => updateFilter(filter.id, { icon: e.target.value })}
                    className="w-20 px-1.5 py-1.5 bg-background border border-border rounded text-sm">
                    {Object.keys(FILTER_ICONS).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input type="text" value={filter.label} onChange={e => updateFilter(filter.id, { label: e.target.value })}
                    className="w-28 px-2 py-1.5 bg-background border border-border rounded text-sm" placeholder="Name" />
                  {isPit ? (
                    <>
                      <select
                        value={filter.pitField || ''}
                        onChange={e => {
                          const newPitField = e.target.value;
                          const newDef = PIT_FIELDS.find(f => f.value === newPitField);
                          const newLabel = newDef?.label || newPitField;
                          updateFilter(filter.id, {
                            pitField: newPitField,
                            label: newLabel,
                            filterType: pitFieldToFilterType(newPitField),
                            pitValues: [],
                          });
                        }}
                        className="min-w-[140px] px-2 py-1.5 bg-background border border-border rounded text-sm"
                      >
                        {PIT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      {pitDef?.kind === 'select' && (
                        <div className="flex flex-wrap gap-1">
                          {pitDef.options!.map(opt => {
                            const selected = filter.pitValues?.includes(opt);
                            return (
                              <button key={opt} onClick={() => {
                                const current = filter.pitValues || [];
                                const updated = selected ? current.filter(v => v !== opt) : [...current, opt];
                                updateFilter(filter.id, { pitValues: updated });
                              }} className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                selected ? 'bg-blueAlliance text-white' : 'bg-background border border-border hover:bg-interactive'
                              }`}>{opt}</button>
                            );
                          })}
                        </div>
                      )}
                      {pitDef?.kind === 'number' && (
                        <>
                          <select value={filter.operator} onChange={e => updateFilter(filter.id, { operator: e.target.value as FilterConfig['operator'] })}
                            className="w-16 px-2 py-1.5 bg-background border border-border rounded text-sm">
                            <option value=">=">&gt;=</option><option value="<=">&lt;=</option>
                            <option value=">">&gt;</option><option value="<">&lt;</option>
                          </select>
                          <input type="number" value={filter.threshold} onChange={e => updateFilter(filter.id, { threshold: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm" />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <select value={filter.field} onChange={e => updateFilter(filter.id, { field: e.target.value })}
                        className="flex-1 min-w-[140px] px-2 py-1.5 bg-background border border-border rounded text-sm">
                        {STAT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      <select value={filter.operator} onChange={e => updateFilter(filter.id, { operator: e.target.value as FilterConfig['operator'] })}
                        className="w-16 px-2 py-1.5 bg-background border border-border rounded text-sm">
                        <option value=">=">&gt;=</option><option value="<=">&lt;=</option>
                        <option value=">">&gt;</option><option value="<">&lt;</option>
                      </select>
                      <input type="number" value={filter.threshold} onChange={e => updateFilter(filter.id, { threshold: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1.5 bg-background border border-border rounded text-sm" />
                    </>
                  )}
                  <button onClick={() => removeFilter(filter.id)} className="p-1.5 text-textMuted hover:text-danger rounded transition-colors" title="Remove filter">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-textMuted">Add:</span>
              <button onClick={() => addFilter('stats')} className="flex items-center gap-1 px-2.5 py-1 text-xs text-success bg-background border border-border rounded hover:bg-interactive transition-colors">
                <Plus size={12} /> Stats
              </button>
              <button onClick={() => addFilter('pit')} className="flex items-center gap-1 px-2.5 py-1 text-xs text-success bg-background border border-border rounded hover:bg-interactive transition-colors">
                <Plus size={12} /> Pit Data
              </button>
            </div>
          </div>
        )}
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
                            <Link to={`/teams/${team.teamNumber}`} className="text-lg font-bold hover:text-success transition-colors">
                              {team.teamNumber}
                            </Link>
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
                        {stats && (() => {
                          const trend = teamTrends.find(t => t.teamNumber === team.teamNumber);
                          return (
                            <div className="text-xs mb-2">
                              <table className="w-full">
                                <thead>
                                  <tr className="text-textMuted">
                                    <th className="text-left font-normal pr-1"></th>
                                    <th className="text-right font-normal px-1">Avg</th>
                                    <th className="text-right font-normal pl-1">Last 3</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="text-textSecondary pr-1">Pts</td>
                                    <td className="text-right px-1">{stats.avgTotalPoints.toFixed(1)}</td>
                                    <td className={`text-right pl-1 font-semibold ${
                                      trend && trend.last3Avg.total > stats.avgTotalPoints * 1.05 ? 'text-success'
                                      : trend && trend.last3Avg.total < stats.avgTotalPoints * 0.95 ? 'text-danger'
                                      : 'text-textPrimary'
                                    }`}>{trend ? trend.last3Avg.total.toFixed(1) : '-'}</td>
                                  </tr>
                                  <tr>
                                    <td className="text-textSecondary pr-1">Endgame</td>
                                    <td className="text-right px-1">{stats.avgEndgamePoints.toFixed(1)}</td>
                                    <td className={`text-right pl-1 font-semibold ${
                                      trend && trend.last3Avg.endgame > stats.avgEndgamePoints * 1.05 ? 'text-success'
                                      : trend && trend.last3Avg.endgame < stats.avgEndgamePoints * 0.95 ? 'text-danger'
                                      : 'text-textPrimary'
                                    }`}>{trend ? trend.last3Avg.endgame.toFixed(1) : '-'}</td>
                                  </tr>
                                  <tr>
                                    <td className="text-textSecondary pr-1">Auto</td>
                                    <td className="text-right px-1">{stats.avgAutoPoints.toFixed(1)}</td>
                                    <td className={`text-right pl-1 font-semibold ${
                                      trend && trend.last3Avg.auto > stats.avgAutoPoints * 1.05 ? 'text-success'
                                      : trend && trend.last3Avg.auto < stats.avgAutoPoints * 0.95 ? 'text-danger'
                                      : 'text-textPrimary'
                                    }`}>{trend ? trend.last3Avg.auto.toFixed(1) : '-'}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
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
            expandedTeam={expandedTeam}
            onToggleExpand={(num) => setExpandedTeam(prev => prev === num ? null : num)}
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
            expandedTeam={expandedTeam}
            onToggleExpand={(num) => setExpandedTeam(prev => prev === num ? null : num)}
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
            expandedTeam={expandedTeam}
            onToggleExpand={(num) => setExpandedTeam(prev => prev === num ? null : num)}
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
              expandedTeam={expandedTeam}
              onToggleExpand={(num) => setExpandedTeam(prev => prev === num ? null : num)}
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
          teams={teamStatistics.filter(t => compareTeams.includes(t.teamNumber))}
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
