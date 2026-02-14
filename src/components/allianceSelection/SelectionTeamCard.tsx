import { useState } from 'react';
import { Flag, Undo2, Ban, ChevronDown } from 'lucide-react';
import type { SelectionTeam } from '../../types/allianceSelection';
import type { TeamStatistics } from '../../types/scouting';
import type { Alliance } from '../../types/allianceSelection';
import PickAlliancePopover from './PickAlliancePopover';

interface SelectionTeamCardProps {
  team: SelectionTeam;
  teamStats: TeamStatistics | undefined;
  isEditor: boolean;
  isSelectedForCompare: boolean;
  alliances: Alliance[];
  onMarkPicked: (teamNumber: number, allianceNumber: number) => void;
  onMarkDeclined: (teamNumber: number) => void;
  onUndoStatus: (teamNumber: number) => void;
  onToggleCompare: (teamNumber: number) => void;
}

function SelectionTeamCard({
  team,
  teamStats,
  isEditor,
  isSelectedForCompare,
  alliances,
  onMarkPicked,
  onMarkDeclined,
  onUndoStatus,
  onToggleCompare,
}: SelectionTeamCardProps) {
  const [showAlliancePicker, setShowAlliancePicker] = useState(false);

  const isUnavailable = team.status !== 'available';
  const isPicked = team.status === 'picked';
  const isDeclined = team.status === 'declined';

  const tierLabel = team.originalTier === 'tier1' ? 'T1'
    : team.originalTier === 'tier2' ? 'T2'
    : team.originalTier === 'tier3' ? 'T3'
    : team.originalTier === 'tier4' ? 'T4'
    : '—';
  const tierColor = team.originalTier === 'tier1'
    ? 'bg-success/20 text-success'
    : team.originalTier === 'tier2'
    ? 'bg-warning/20 text-warning'
    : team.originalTier === 'tier3'
    ? 'bg-blueAlliance/20 text-blueAlliance'
    : team.originalTier === 'tier4'
    ? 'bg-danger/20 text-danger'
    : 'bg-surfaceElevated text-textMuted';

  return (
    <div
      className={`relative flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
        isSelectedForCompare
          ? 'border-blueAlliance bg-blueAlliance/10'
          : isPicked
          ? 'border-success/30 bg-success/5 opacity-40'
          : isDeclined
          ? 'border-danger/30 bg-danger/5 opacity-30'
          : 'border-border bg-card hover:bg-interactive'
      }`}
      onClick={() => {
        if (!isUnavailable) {
          onToggleCompare(team.teamNumber);
        }
      }}
    >
      {/* Global rank */}
      <div className={`flex-shrink-0 w-8 text-center text-sm font-bold ${
        isUnavailable ? 'text-textMuted line-through' : 'text-textSecondary'
      }`}>
        #{team.globalRank}
      </div>

      {/* Tier badge */}
      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${tierColor}`}>
        {tierLabel}
      </span>

      {/* Team info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-bold ${isDeclined ? 'line-through text-textMuted' : ''}`}>
            {team.teamNumber}
          </span>
          {teamStats?.teamName && (
            <span className="text-sm text-textSecondary truncate">{teamStats.teamName}</span>
          )}
          {team.flagged && <Flag size={12} className="text-danger flex-shrink-0" />}
        </div>

        {/* Quick stats */}
        {teamStats && !isUnavailable && (
          <div className="flex gap-3 text-xs text-textSecondary mt-0.5">
            <span>{teamStats.avgTotalPoints.toFixed(1)} pts</span>
            <span>L3: {teamStats.level3ClimbRate.toFixed(0)}%</span>
            <span>Auto: {teamStats.avgAutoPoints.toFixed(1)}</span>
          </div>
        )}

        {/* Picked status */}
        {isPicked && team.pickedByAlliance && (
          <div className="text-xs text-success mt-0.5">
            Picked by Alliance {team.pickedByAlliance}
          </div>
        )}
        {isDeclined && (
          <div className="text-xs text-danger mt-0.5">Declined</div>
        )}
      </div>

      {/* Actions (editor only) */}
      {isEditor && (
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {isUnavailable ? (
            <button
              onClick={() => onUndoStatus(team.teamNumber)}
              className="p-1.5 rounded bg-surfaceElevated hover:bg-interactive text-textSecondary hover:text-textPrimary transition-colors"
              title="Undo"
            >
              <Undo2 size={14} />
            </button>
          ) : (
            <>
              {/* Pick button with alliance dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowAlliancePicker(!showAlliancePicker)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-success/20 text-success hover:bg-success/30 text-xs font-semibold transition-colors"
                >
                  Pick
                  <ChevronDown size={12} />
                </button>
                {showAlliancePicker && (
                  <PickAlliancePopover
                    alliances={alliances}
                    onSelect={(allianceNum) => onMarkPicked(team.teamNumber, allianceNum)}
                    onClose={() => setShowAlliancePicker(false)}
                  />
                )}
              </div>

              {/* Decline button */}
              <button
                onClick={() => onMarkDeclined(team.teamNumber)}
                className="p-1.5 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                title="Mark as declined"
              >
                <Ban size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SelectionTeamCard;
