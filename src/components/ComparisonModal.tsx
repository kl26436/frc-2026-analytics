import { useEffect } from 'react';
import { X, ArrowUp } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';

interface ComparisonModalProps {
  team1: TeamStatistics;
  team2: TeamStatistics;
  onPickTeam: (teamNumber: number) => void;
  onClose: () => void;
}

function ComparisonModal({ team1, team2, onPickTeam, onClose }: ComparisonModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Stat row component for comparison
  const StatRow = ({
    label,
    getValue,
    format = 'number',
    higherIsBetter = true,
    decimals = 1
  }: {
    label: string;
    getValue: (team: TeamStatistics) => number;
    format?: 'number' | 'percentage' | 'time' | 'level';
    higherIsBetter?: boolean;
    decimals?: number;
  }) => {
    const value1 = getValue(team1);
    const value2 = getValue(team2);
    const maxValue = Math.max(value1, value2);
    const minValue = Math.min(value1, value2);

    const formatValue = (value: number) => {
      switch (format) {
        case 'percentage':
          return `${value.toFixed(decimals)}%`;
        case 'time':
          return `${value.toFixed(decimals)}s`;
        case 'level':
          return value === 0 ? 'None' : `Level ${value}`;
        default:
          return value.toFixed(decimals);
      }
    };

    const getColorClass = (value: number) => {
      if (maxValue === minValue) return 'text-textPrimary';

      const isBest = higherIsBetter ? value === maxValue : value === minValue;
      const isWorst = higherIsBetter ? value === minValue : value === maxValue;

      if (isBest) return 'text-success font-bold';
      if (isWorst) return 'text-danger';
      return 'text-textPrimary';
    };

    return (
      <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_100px_100px] gap-2 py-2 border-b border-border">
        <div className="text-sm text-textSecondary">{label}</div>
        <div className={`text-sm text-center ${getColorClass(value1)}`}>
          {formatValue(value1)}
        </div>
        <div className={`text-sm text-center ${getColorClass(value2)}`}>
          {formatValue(value2)}
        </div>
      </div>
    );
  };

  const CategoryHeader = ({ title }: { title: string }) => (
    <div className="bg-surfaceElevated px-3 py-2 font-bold text-sm mt-4 first:mt-0">
      {title}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-[900px] max-h-[90vh] relative flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Header - fixed at top */}
        <div className="flex-shrink-0 bg-surfaceElevated p-4 border-b border-border flex justify-between items-center rounded-t-lg">
          <h2 className="text-xl font-bold">Team Comparison</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-interactive rounded transition-colors"
            title="Close (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Team Headers - fixed below header */}
        <div className="flex-shrink-0 grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_100px_100px] gap-2 p-4 border-b border-border bg-surface">
          <div className="text-sm font-semibold text-textSecondary">Metric</div>
          <div className="text-center">
            <div className="text-lg font-bold">{team1.teamNumber}</div>
            {team1.teamName && (
              <div className="text-xs text-textSecondary truncate">{team1.teamName}</div>
            )}
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{team2.teamNumber}</div>
            {team2.teamName && (
              <div className="text-xs text-textSecondary truncate">{team2.teamName}</div>
            )}
          </div>
        </div>

        {/* Scrollable Content - takes remaining space */}
        <div
          className="flex-1 overflow-y-auto p-4 min-h-0"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Overall Scoring */}
          <CategoryHeader title="Overall Scoring" />
          <StatRow label="Avg Total Points" getValue={t => t.avgTotalPoints} />
          <StatRow label="Avg Auto Points" getValue={t => t.avgAutoPoints} />
          <StatRow label="Avg Teleop Points" getValue={t => t.avgTeleopPoints} />
          <StatRow label="Avg Endgame Points" getValue={t => t.avgEndgamePoints} />

          {/* Climbing Performance */}
          <CategoryHeader title="Climbing Performance" />
          <StatRow
            label="Max Endgame Level"
            getValue={t => {
              // Calculate max level from match data if available
              // For now, use level3ClimbRate as proxy (highest level achieved)
              if (t.level3ClimbRate > 0) return 3;
              if (t.level2ClimbRate > 0) return 2;
              if (t.level1ClimbRate > 0) return 1;
              return 0;
            }}
            format="level"
          />
          <StatRow
            label="Level 3 Climb Rate"
            getValue={t => t.level3ClimbRate}
            format="percentage"
          />
          <StatRow
            label="Avg Climb Time"
            getValue={t => t.avgClimbTime}
            format="time"
            higherIsBetter={false}
          />
          <StatRow
            label="Climb Attempt Rate"
            getValue={t => t.climbAttemptRate}
            format="percentage"
          />

          {/* Autonomous Breakdown */}
          <CategoryHeader title="Autonomous Performance" />
          <StatRow
            label="Avg Auto FUEL Scored"
            getValue={t => t.avgAutoFuelScored}
            decimals={1}
          />
          <StatRow
            label="Auto Accuracy"
            getValue={t => t.autoAccuracy}
            format="percentage"
          />
          <StatRow
            label="Mobility Rate"
            getValue={t => t.autoMobilityRate}
            format="percentage"
          />
          <StatRow
            label="Auto Climb Success Rate"
            getValue={t => t.autoClimbRate}
            format="percentage"
          />

          {/* Reliability */}
          <CategoryHeader title="Reliability" />
          <StatRow
            label="No Show Rate"
            getValue={t => t.noShowRate}
            format="percentage"
            higherIsBetter={false}
          />
          <StatRow
            label="Robot Died Rate"
            getValue={t => t.diedRate}
            format="percentage"
            higherIsBetter={false}
          />
          <StatRow
            label="Mechanical Issues Rate"
            getValue={t => t.mechanicalIssuesRate}
            format="percentage"
            higherIsBetter={false}
          />
        </div>

        {/* Footer with action buttons - fixed at bottom */}
        <div className="flex-shrink-0 bg-surfaceElevated p-4 border-t border-border rounded-b-lg">
          <p className="text-center text-sm text-textSecondary mb-3">Which team should rank higher?</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => onPickTeam(team1.teamNumber)}
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors min-h-[48px] text-sm sm:text-base"
            >
              <ArrowUp size={18} />
              {team1.teamNumber}
            </button>
            <button
              onClick={() => onPickTeam(team2.teamNumber)}
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors min-h-[48px] text-sm sm:text-base"
            >
              <ArrowUp size={18} />
              {team2.teamNumber}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComparisonModal;
