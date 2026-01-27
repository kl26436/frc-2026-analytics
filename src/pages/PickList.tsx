import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePickListStore } from '../store/usePickListStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useComparisonMode } from '../hooks/useComparisonMode';
import ComparisonModal from '../components/ComparisonModal';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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
  GitCompare,
  Ban,
  CheckSquare,
  Square,
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PickListTeam } from '../types/pickList';
import type { TeamStatistics } from '../types/scouting';

// Filter configuration
interface FilterConfig {
  id: string;
  label: string;
  icon: string;
  field: keyof TeamStatistics;
  operator: '>=' | '<=' | '>' | '<';
  threshold: number;
  active: boolean;
}

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
  { value: 'level3ClimbRate', label: 'L3 Climb Rate (%)' },
  { value: 'level2ClimbRate', label: 'L2 Climb Rate (%)' },
  { value: 'climbAttemptRate', label: 'Climb Attempt Rate (%)' },
  { value: 'avgClimbTime', label: 'Avg Climb Time (s)' },
  { value: 'autoMobilityRate', label: 'Auto Mobility Rate (%)' },
  { value: 'autoAccuracy', label: 'Auto Accuracy (%)' },
  { value: 'avgAutoFuelScored', label: 'Avg Auto Fuel Scored' },
  { value: 'diedRate', label: 'Died Rate (%)' },
  { value: 'noShowRate', label: 'No Show Rate (%)' },
  { value: 'mechanicalIssuesRate', label: 'Mech Issues Rate (%)' },
  { value: 'tippedRate', label: 'Tipped Rate (%)' },
  { value: 'avgDriverSkill', label: 'Avg Driver Skill (1-5)' },
  { value: 'avgDefenseEffectiveness', label: 'Avg Defense (0-4)' },
];

const DEFAULT_FILTERS: FilterConfig[] = [
  { id: 'l3Climber', label: 'L3 Climber', icon: 'mountain', field: 'level3ClimbRate', operator: '>=', threshold: 20, active: false },
  { id: 'strongAuto', label: 'Strong Auto', icon: 'zap', field: 'avgAutoPoints', operator: '>=', threshold: 10, active: false },
  { id: 'reliable', label: 'Reliable', icon: 'shield', field: 'diedRate', operator: '<=', threshold: 15, active: false },
  { id: 'highScorer', label: 'High Scorer', icon: 'trophy', field: 'avgTotalPoints', operator: '>=', threshold: 35, active: false },
];

// Sortable team card component
function TeamCard({ team, currentTier, tierNames, onMoveTier, onUpdateNotes, onToggleFlag, isCompareMode, isSelected, onToggleSelection, passesFilters, hasActiveFilters }: {
  team: PickListTeam | { teamNumber: number; teamName?: string; avgTotalPoints: number; level3ClimbRate: number; avgAutoPoints: number };
  currentTier?: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  tierNames?: { tier1: string; tier2: string; tier3: string; tier4: string };
  onMoveTier?: (tier: 'tier1' | 'tier2' | 'tier3' | 'tier4') => void;
  onUpdateNotes?: (notes: string) => void;
  onToggleFlag?: () => void;
  isCompareMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  passesFilters?: boolean;
  hasActiveFilters?: boolean;
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
  const [notes, setNotes] = useState(isPickListTeam ? team.notes : '');

  const displayStats = teamStats || team;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg p-2 mb-2 transition-all ${
        isPickListTeam && team.flagged
          ? 'bg-surface border-danger'
          : isSelected
          ? 'bg-surface border-success ring-2 ring-success'
          : hasActiveFilters && passesFilters !== false
          ? 'bg-success/10 border-success'
          : 'bg-surface border-border'
      } ${passesFilters === false ? 'opacity-20' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox for compare mode or drag handle for normal mode */}
        {isCompareMode ? (
          <button
            onClick={onToggleSelection}
            className="p-1 mt-1 text-textPrimary hover:text-success transition-colors"
            title="Select for comparison"
          >
            {isSelected ? <CheckSquare size={20} className="text-success" /> : <Square size={20} />}
          </button>
        ) : (
          <div
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing text-textMuted hover:text-textPrimary mt-1 touch-none"
          >
            <GripVertical size={16} />
          </div>
        )}

        {/* Team info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              to={`/teams/${team.teamNumber}`}
              className="font-bold text-sm text-textPrimary hover:text-blueAlliance transition-colors"
              title="View team details"
            >
              {team.teamNumber}
            </Link>
            {teamStats?.teamName && (
              <span className="text-xs text-textSecondary truncate">{teamStats.teamName}</span>
            )}
          </div>

          {/* Quick stats */}
          <div className="flex gap-2 text-xs text-textSecondary">
            <span>{(displayStats as any).avgTotalPoints?.toFixed(0) ?? '0'} pts</span>
            <span>L3: {(displayStats as any).level3ClimbRate?.toFixed(0) ?? '0'}%</span>
            <span>A: {(displayStats as any).avgAutoPoints?.toFixed(0) ?? '0'}</span>
          </div>

          {/* Notes for teams in tiers */}
          {currentTier && isPickListTeam && isEditingNotes ? (
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
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
            currentTier && isPickListTeam && team.notes && (
              <p className="text-xs text-textSecondary italic mt-1 truncate">{team.notes}</p>
            )
          )}

          {/* Quick tier switcher - mobile friendly */}
          {currentTier && tierNames && onMoveTier && (
            <div className="flex gap-1 mt-2 flex-wrap">
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

              {/* Tier 4 (Do Not Pick) - show promote buttons only */}
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

        {/* Actions - only show for teams in tiers */}
        {currentTier && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onToggleFlag?.()}
              className={`p-1 rounded transition-colors ${
                isPickListTeam && team.flagged ? 'text-danger' : 'text-textMuted hover:text-warning'
              }`}
              title="Flag team"
            >
              <Flag size={14} />
            </button>
            <button
              onClick={() => setIsEditingNotes(true)}
              className="p-1 text-textMuted hover:text-textPrimary rounded transition-colors"
              title="Add note"
            >
              <StickyNote size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Droppable column component
function DroppableColumn({ id, title, teams, tier, tierNames, onMoveTier, isCompareMode, selectedTeams, onToggleTeamSelection, teamPassesFilters, hasActiveFilters }: {
  id: string;
  title: string;
  teams: any[];
  tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  tierNames?: { tier1: string; tier2: string; tier3: string; tier4: string };
  onMoveTier?: (teamNumber: number, newTier: 'tier1' | 'tier2' | 'tier3' | 'tier4') => void;
  isCompareMode?: boolean;
  selectedTeams?: number[];
  onToggleTeamSelection?: (teamNumber: number) => void;
  teamPassesFilters?: (teamNumber: number) => boolean;
  hasActiveFilters?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const updateNotes = usePickListStore(state => state.updateNotes);
  const toggleFlag = usePickListStore(state => state.toggleFlag);

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 bg-surfaceElevated rounded-lg p-3 md:p-4 min-h-[600px] transition-colors ${
        isOver ? 'ring-2 ring-success bg-interactive' : ''
      }`}
    >
      <h2 className="text-base md:text-lg font-bold mb-3">{title}</h2>
      <SortableContext items={teams.map(t => `team-${t.teamNumber}`)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0 min-h-[500px]">
          {teams.map((team) => (
            <TeamCard
              key={team.teamNumber}
              team={team}
              currentTier={tier}
              tierNames={tierNames}
              onMoveTier={tier && onMoveTier ? (newTier) => onMoveTier(team.teamNumber, newTier) : undefined}
              onUpdateNotes={tier ? (notes) => updateNotes(team.teamNumber, notes) : undefined}
              onToggleFlag={tier ? () => toggleFlag(team.teamNumber) : undefined}
              isCompareMode={isCompareMode}
              isSelected={selectedTeams?.includes(team.teamNumber)}
              onToggleSelection={onToggleTeamSelection ? () => onToggleTeamSelection(team.teamNumber) : undefined}
              passesFilters={teamPassesFilters ? teamPassesFilters(team.teamNumber) : true}
              hasActiveFilters={hasActiveFilters}
            />
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
  const addTeamToTier = usePickListStore(state => state.addTeamToTier);
  const moveTeam = usePickListStore(state => state.moveTeam);
  const moveTeamAbove = usePickListStore(state => state.moveTeamAbove);

  const eventCode = useAnalyticsStore(state => state.eventCode);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);

  const [showSettings, setShowSettings] = useState(false);
  const [tier1Name, setTier1Name] = useState('Steak');
  const [tier2Name, setTier2Name] = useState('Potatoes');
  const [tier3Name, setTier3Name] = useState('Chicken Nuggets');
  const [tier4Name, setTier4Name] = useState('Do Not Pick');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

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
    return pickList.teams.filter(t => {
      const stats = teamStatistics.find(s => s.teamNumber === t.teamNumber);
      if (!stats) return false;
      const value = stats[filter.field] as number;
      switch (filter.operator) {
        case '>=': return value >= filter.threshold;
        case '<=': return value <= filter.threshold;
        case '>': return value > filter.threshold;
        case '<': return value < filter.threshold;
      }
    }).length;
  };

  // Check if a team passes all active filters
  const teamPassesFilters = (teamNumber: number): boolean => {
    const activeFilters = filterConfigs.filter(f => f.active);
    if (activeFilters.length === 0) return true;

    const stats = teamStatistics.find(t => t.teamNumber === teamNumber);
    if (!stats) return false;

    return activeFilters.every(filter => {
      const value = stats[filter.field] as number;
      switch (filter.operator) {
        case '>=': return value >= filter.threshold;
        case '<=': return value <= filter.threshold;
        case '>': return value > filter.threshold;
        case '<': return value < filter.threshold;
      }
    });
  };

  const hasActiveFilters = filterConfigs.some(f => f.active);

  // Count picked teams in tier1 + tier2
  const tier1And2Count = pickList?.teams.filter(t =>
    t.tier === 'tier1' || t.tier === 'tier2'
  ).length || 0;

  // Comparison mode
  const {
    isCompareMode,
    selectedTeams,
    toggleCompareMode,
    toggleTeamSelection,
    clearSelection,
    canCompare
  } = useComparisonMode();
  const [showComparisonModal, setShowComparisonModal] = useState(false);

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
      setTier4Name(pickList.config.tier4Name || 'Do Not Pick'); // Fallback for older pick lists

      // Auto-populate tiers on first load (only if TBA rankings weren't imported)
      // Skip if teams already have "Event Rank" notes (from TBA import)
      const hasEventRankings = pickList.teams.some(t => t.notes?.includes('Event Rank'));

      if (!initialized && teamStatistics.length > 0 && !hasEventRankings) {
        const existingTeamNumbers = new Set(pickList.teams.map(t => t.teamNumber));

        // If pick list is empty (no TBA rankings imported), add top 12 to tier2 as fallback
        if (pickList.teams.length === 0) {
          const sortedByPoints = [...teamStatistics]
            .sort((a, b) => b.avgTotalPoints - a.avgTotalPoints);

          sortedByPoints.slice(0, 12).forEach((team) => {
            addTeamToTier(team.teamNumber, 'tier2');
            existingTeamNumbers.add(team.teamNumber);
          });
        }

        // Sort remaining teams by: points -> level3ClimbRate -> autoPoints
        const sortedTeams = [...teamStatistics]
          .filter(team => !existingTeamNumbers.has(team.teamNumber))
          .sort((a, b) => {
            // Primary: Total points
            if (b.avgTotalPoints !== a.avgTotalPoints) {
              return b.avgTotalPoints - a.avgTotalPoints;
            }
            // Secondary: Level 3 climb rate
            if (b.level3ClimbRate !== a.level3ClimbRate) {
              return b.level3ClimbRate - a.level3ClimbRate;
            }
            // Tertiary: Auto points
            return b.avgAutoPoints - a.avgAutoPoints;
          });

        // Add all remaining teams to tier3 (no notes - only TBA rankings get notes)
        sortedTeams.forEach((team) => {
          addTeamToTier(team.teamNumber, 'tier3');
        });

        setInitialized(true);
      } else if (!initialized && hasEventRankings) {
        // TBA rankings were imported, just mark as initialized
        setInitialized(true);
      }
    }
  }, [pickList, eventCode, initializePickList, teamStatistics, addTeamToTier, initialized]);

  // Auto-open comparison modal when 2 teams are selected
  useEffect(() => {
    if (canCompare && isCompareMode) {
      setShowComparisonModal(true);
    }
  }, [canCompare, isCompareMode]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id.toString());
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !pickList) return;

    const activeTeamNumber = parseInt(active.id.toString().replace('team-', ''));
    const overId = over.id.toString();

    // Check if dragging over another team (for within-tier reordering)
    if (overId.startsWith('team-')) {
      const overTeamNumber = parseInt(overId.replace('team-', ''));

      // Don't do anything if dropped on itself
      if (activeTeamNumber === overTeamNumber) return;

      const activeTeam = pickList.teams.find(t => t.teamNumber === activeTeamNumber);
      const overTeam = pickList.teams.find(t => t.teamNumber === overTeamNumber);

      if (!activeTeam || !overTeam) return;

      // If same tier, reorder within tier
      if (activeTeam.tier === overTeam.tier) {
        const tierTeams = pickList.teams
          .filter(t => t.tier === activeTeam.tier)
          .sort((a, b) => a.rank - b.rank);

        const oldIndex = tierTeams.findIndex(t => t.teamNumber === activeTeamNumber);
        const newIndex = tierTeams.findIndex(t => t.teamNumber === overTeamNumber);

        if (oldIndex === newIndex) return;

        // Move the team to the new position in the tier
        moveTeam(activeTeamNumber, activeTeam.tier, overTeam.rank);
        return;
      }

      // Different tier - move to that tier at the target position
      moveTeam(activeTeamNumber, overTeam.tier, overTeam.rank);
      return;
    }

    // Dropped on a column (tier container)
    let targetTier: 'tier1' | 'tier2' | 'tier3' | 'tier4' | null = null;

    if (overId === 'tier1-column') {
      targetTier = 'tier1';
    } else if (overId === 'tier2-column') {
      targetTier = 'tier2';
    } else if (overId === 'tier3-column') {
      targetTier = 'tier3';
    } else if (overId === 'tier4-column') {
      targetTier = 'tier4';
    }

    if (!targetTier) return;

    const existingTeam = pickList.teams.find(t => t.teamNumber === activeTeamNumber);
    if (!existingTeam) return;

    // Only move if it's a different tier
    if (existingTeam.tier !== targetTier) {
      const tierTeams = pickList.teams.filter(t => t.tier === targetTier);
      const maxRank = tierTeams.length > 0 ? Math.max(...tierTeams.map(t => t.rank)) : 0;
      const newRank = maxRank + 1;
      moveTeam(activeTeamNumber, targetTier, newRank);
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
    const loserTeamNumber = selectedTeams.find(t => t !== winnerTeamNumber);
    if (loserTeamNumber) {
      moveTeamAbove(winnerTeamNumber, loserTeamNumber);
    }
    setShowComparisonModal(false);
    clearSelection();
    toggleCompareMode(); // Exit compare mode
  };

  if (!pickList) {
    return <div>Loading...</div>;
  }

  // Get teams in each tier
  const tier1Teams = pickList.teams.filter(t => t.tier === 'tier1').sort((a, b) => a.rank - b.rank);
  const tier2Teams = pickList.teams.filter(t => t.tier === 'tier2').sort((a, b) => a.rank - b.rank);
  const tier3Teams = pickList.teams.filter(t => t.tier === 'tier3').sort((a, b) => a.rank - b.rank);
  const tier4Teams = pickList.teams.filter(t => t.tier === 'tier4').sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Pick List</h1>
          <p className="text-textSecondary text-sm md:text-base">
            {eventCode} • Last updated: {new Date(pickList.config.lastUpdated).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/alliance-selection"
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-success/20 text-success hover:bg-success/30 rounded-lg transition-colors text-sm md:text-base font-semibold"
          >
            <Handshake size={18} />
            <span className="hidden sm:inline">Alliance Selection</span>
            <span className="sm:hidden">Alliance</span>
          </Link>
          <button
            onClick={toggleCompareMode}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg transition-colors text-sm md:text-base ${
              isCompareMode
                ? 'bg-success text-background hover:bg-success/90'
                : 'bg-surface hover:bg-interactive'
            }`}
          >
            <GitCompare size={18} />
            <span className="hidden sm:inline">Compare Mode</span>
            <span className="sm:hidden">Compare</span>
          </button>
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
        </div>
      </div>

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
                placeholder="e.g., Do Not Pick"
              />
            </div>
          </div>
          <button
            onClick={handleSaveTierNames}
            className="px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
          >
            Save Changes
          </button>
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

      {/* Compare Mode Status */}
      {isCompareMode && (
        <div className="bg-surfaceElevated p-4 rounded-lg border border-success">
          <div className="flex items-center gap-3">
            <GitCompare size={24} className="text-success" />
            <div>
              <p className="font-semibold text-success">Compare Mode Active</p>
              <p className="text-sm text-textSecondary">
                {selectedTeams.length === 0
                  ? 'Click on any 2 teams to compare them'
                  : selectedTeams.length === 1
                  ? '1 team selected - click 1 more to compare'
                  : `Comparing Team ${selectedTeams[0]} vs Team ${selectedTeams[1]}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Drag-and-drop layout - conditionally show 3 or 4 columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
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
            isCompareMode={isCompareMode}
            selectedTeams={selectedTeams}
            onToggleTeamSelection={toggleTeamSelection}
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
            isCompareMode={isCompareMode}
            selectedTeams={selectedTeams}
            onToggleTeamSelection={toggleTeamSelection}
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
            isCompareMode={isCompareMode}
            selectedTeams={selectedTeams}
            onToggleTeamSelection={toggleTeamSelection}
            teamPassesFilters={teamPassesFilters}
            hasActiveFilters={hasActiveFilters}

          />
          {/* Only show tier4 if it has teams */}
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
              isCompareMode={isCompareMode}
              selectedTeams={selectedTeams}
              onToggleTeamSelection={toggleTeamSelection}
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
      {showComparisonModal && selectedTeams.length === 2 && (
        <ComparisonModal
          team1={teamStatistics.find(t => t.teamNumber === selectedTeams[0])!}
          team2={teamStatistics.find(t => t.teamNumber === selectedTeams[1])!}
          onPickTeam={handlePickWinner}
          onClose={() => setShowComparisonModal(false)}
        />
      )}
    </div>
  );
}

export default PickList;
