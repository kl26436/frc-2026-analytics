import { useState, useEffect } from 'react';
import { usePickListStore } from '../store/usePickListStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
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
import { CSS } from '@dnd-kit/utilities';
import {
  Settings,
  Download,
  Upload,
  Flag,
  StickyNote,
  X,
  ArrowUpDown,
} from 'lucide-react';
import type { PickListTeam } from '../types/pickList';

// Sortable team card component
function TeamCard({ team, onUpdateNotes, onTogglePicked, onToggleFlag, onRemove }: {
  team: PickListTeam;
  onUpdateNotes: (notes: string) => void;
  onTogglePicked: () => void;
  onToggleFlag: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.teamNumber.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const teamStats = useAnalyticsStore(state =>
    state.teamStatistics.find(t => t.teamNumber === team.teamNumber)
  );

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(team.notes);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-surface border rounded-lg p-3 mb-2 ${
        team.isPicked
          ? 'border-textMuted opacity-50'
          : team.flagged
          ? 'border-danger'
          : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-textMuted hover:text-textPrimary mt-1"
        >
          <ArrowUpDown size={16} />
        </div>

        {/* Team info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg">{team.teamNumber}</span>
            {teamStats?.teamName && (
              <span className="text-sm text-textSecondary">{teamStats.teamName}</span>
            )}
            {team.isPicked && (
              <span className="text-xs bg-textMuted text-background px-2 py-0.5 rounded">
                PICKED{team.pickedBy ? ` by ${team.pickedBy}` : ''}
              </span>
            )}
          </div>

          {/* Quick stats */}
          {teamStats && (
            <div className="flex gap-3 text-xs text-textSecondary mb-2">
              <span>{teamStats.avgTotalPoints.toFixed(1)} pts</span>
              <span>L3: {teamStats.level3ClimbRate.toFixed(0)}%</span>
              <span>Auto: {teamStats.avgAutoPoints.toFixed(1)}</span>
            </div>
          )}

          {/* Tags */}
          {team.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {team.tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs bg-blueAlliance/20 text-blueAlliance px-2 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {isEditingNotes ? (
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => {
                setIsEditingNotes(false);
                onUpdateNotes(notes);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setIsEditingNotes(false);
                  onUpdateNotes(notes);
                }
              }}
              className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
              autoFocus
            />
          ) : (
            team.notes && (
              <p className="text-sm text-textSecondary italic">{team.notes}</p>
            )
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          <button
            onClick={onToggleFlag}
            className={`p-1 rounded transition-colors ${
              team.flagged ? 'text-danger' : 'text-textMuted hover:text-warning'
            }`}
            title="Flag team"
          >
            <Flag size={16} />
          </button>
          <button
            onClick={() => setIsEditingNotes(true)}
            className="p-1 text-textMuted hover:text-textPrimary rounded transition-colors"
            title="Add note"
          >
            <StickyNote size={16} />
          </button>
          <button
            onClick={onTogglePicked}
            className="p-1 text-textMuted hover:text-success rounded transition-colors"
            title={team.isPicked ? 'Mark as available' : 'Mark as picked'}
          >
            {team.isPicked ? '✓' : '○'}
          </button>
          <button
            onClick={onRemove}
            className="p-1 text-textMuted hover:text-danger rounded transition-colors"
            title="Remove from list"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Tier column component
function TierColumn({ tierName, teams, onSort }: {
  tier: 'tier1' | 'tier2' | 'tier3';
  tierName: string;
  teams: PickListTeam[];
  onSort: (sortBy: 'rank' | 'teamNumber' | 'points' | 'climb' | 'auto') => void;
}) {
  const updateNotes = usePickListStore(state => state.updateNotes);
  const togglePicked = usePickListStore(state => state.togglePicked);
  const toggleFlag = usePickListStore(state => state.toggleFlag);
  const removeTeam = usePickListStore(state => state.removeTeam);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const sortedTeams = [...teams].sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex-1 bg-surfaceElevated rounded-lg p-4 min-h-[500px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{tierName}</h2>
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="p-2 text-textMuted hover:text-textPrimary rounded transition-colors"
            title="Sort tier"
          >
            <ArrowUpDown size={16} />
          </button>
          {showSortMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-surface border border-border rounded-lg shadow-lg z-20">
              <button
                onClick={() => {
                  onSort('points');
                  setShowSortMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-interactive transition-colors"
              >
                Sort by Points
              </button>
              <button
                onClick={() => {
                  onSort('climb');
                  setShowSortMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-interactive transition-colors"
              >
                Sort by Climb
              </button>
              <button
                onClick={() => {
                  onSort('auto');
                  setShowSortMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-interactive transition-colors"
              >
                Sort by Auto
              </button>
              <button
                onClick={() => {
                  onSort('teamNumber');
                  setShowSortMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-interactive transition-colors"
              >
                Sort by Team #
              </button>
            </div>
          )}
        </div>
      </div>
      <SortableContext items={sortedTeams.map(t => t.teamNumber.toString())} strategy={verticalListSortingStrategy}>
        {sortedTeams.map(team => (
          <TeamCard
            key={team.teamNumber}
            team={team}
            onUpdateNotes={(notes) => updateNotes(team.teamNumber, notes)}
            onTogglePicked={() => togglePicked(team.teamNumber)}
            onToggleFlag={() => toggleFlag(team.teamNumber)}
            onRemove={() => removeTeam(team.teamNumber)}
          />
        ))}
      </SortableContext>
      {sortedTeams.length === 0 && (
        <p className="text-textMuted text-center py-8">No teams in this tier yet</p>
      )}
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
  const sortTier = usePickListStore(state => state.sortTier);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);

  const [showSettings, setShowSettings] = useState(false);
  const [tier1Name, setTier1Name] = useState('Steak');
  const [tier2Name, setTier2Name] = useState('Potatoes');
  const [tier3Name, setTier3Name] = useState('Chicken Nuggets');
  const [activeId, setActiveId] = useState<string | null>(null);

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
    }
  }, [pickList, eventCode, initializePickList]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id.toString());
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !pickList) return;

    const activeTeamNumber = parseInt(active.id.toString());
    const activeTeam = pickList.teams.find(t => t.teamNumber === activeTeamNumber);

    if (!activeTeam) return;

    // If dropped on another team, insert before that team
    const overTeamNumber = parseInt(over.id.toString());
    const overTeam = pickList.teams.find(t => t.teamNumber === overTeamNumber);

    if (overTeam && activeTeamNumber !== overTeamNumber) {
      // Move to the same tier and rank as the team we're hovering over
      moveTeam(activeTeamNumber, overTeam.tier, overTeam.rank);
    }
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
    setTierNames(tier1Name, tier2Name, tier3Name);
    setShowSettings(false);
  };

  if (!pickList) {
    return <div>Loading...</div>;
  }

  const tier1Teams = pickList.teams.filter(t => t.tier === 'tier1');
  const tier2Teams = pickList.teams.filter(t => t.tier === 'tier2');
  const tier3Teams = pickList.teams.filter(t => t.tier === 'tier3');

  const handleSort = (tier: 'tier1' | 'tier2' | 'tier3', sortBy: 'rank' | 'teamNumber' | 'points' | 'climb' | 'auto') => {
    if (!pickList) return;

    const tierTeams = pickList.teams.filter(t => t.tier === tier);

    // Sort teams based on criteria
    tierTeams.sort((a, b) => {
      const statsA = teamStatistics.find(t => t.teamNumber === a.teamNumber);
      const statsB = teamStatistics.find(t => t.teamNumber === b.teamNumber);

      switch (sortBy) {
        case 'points':
          return (statsB?.avgTotalPoints || 0) - (statsA?.avgTotalPoints || 0);
        case 'climb':
          return (statsB?.level3ClimbRate || 0) - (statsA?.level3ClimbRate || 0);
        case 'auto':
          return (statsB?.avgAutoPoints || 0) - (statsA?.avgAutoPoints || 0);
        case 'teamNumber':
          return a.teamNumber - b.teamNumber;
        default:
          return a.rank - b.rank;
      }
    });

    // Re-assign ranks
    tierTeams.forEach((team, index) => {
      team.rank = index + 1;
    });

    // This is a hack - we should have a proper updatePickList action
    // For now, manually triggering re-sort by calling sortTier
    sortTier(tier, sortBy);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pick List</h1>
          <p className="text-textSecondary">
            {eventCode} • Last updated: {new Date(pickList.config.lastUpdated).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors"
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors"
          >
            <Download size={20} />
            <span>Export</span>
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors"
          >
            <Upload size={20} />
            <span>Import</span>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4">Pick List Settings</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
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
                placeholder="e.g., Do Not Pick, Last Resort"
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

      {/* Three-column layout */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-3 gap-4">
          <TierColumn
            tier="tier1"
            tierName={pickList.config.tier1Name}
            teams={tier1Teams}
            onSort={(sortBy) => handleSort('tier1', sortBy)}
          />
          <TierColumn
            tier="tier2"
            tierName={pickList.config.tier2Name}
            teams={tier2Teams}
            onSort={(sortBy) => handleSort('tier2', sortBy)}
          />
          <TierColumn
            tier="tier3"
            tierName={pickList.config.tier3Name}
            teams={tier3Teams}
            onSort={(sortBy) => handleSort('tier3', sortBy)}
          />
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="bg-surface border border-border rounded-lg p-3 opacity-75">
              Team {activeId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default PickList;
