import { useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { MatchScoutingEntry } from '../types/scouting';

interface MatchDetailModalProps {
  match: MatchScoutingEntry;
  onClose: () => void;
}

function MatchDetailModal({ match, onClose }: MatchDetailModalProps) {
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

  const BooleanBadge = ({ value, label }: { value: boolean; label: string }) => (
    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
      value ? 'bg-success/20 text-success' : 'bg-surface text-textMuted'
    }`}>
      {value ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {label}
    </div>
  );

  const StatItem = ({ label, value, suffix = '' }: { label: string; value: string | number; suffix?: string }) => (
    <div>
      <p className="text-textSecondary text-xs">{label}</p>
      <p className="font-semibold">{value}{suffix}</p>
    </div>
  );

  const RatingBar = ({ label, value, max = 5 }: { label: string; value: number; max?: number }) => (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-textSecondary">{label}</span>
        <span className="font-semibold">{value}/{max}</span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-success rounded-full transition-all"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <h3 className="text-sm font-bold text-textSecondary uppercase tracking-wide border-b border-border pb-2 mb-3">
      {title}
    </h3>
  );

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-[700px] max-h-[90vh] relative flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-surfaceElevated p-4 border-b border-border flex justify-between items-center rounded-t-lg">
          <div>
            <h2 className="text-xl font-bold">
              {match.matchType === 'qualification' ? 'Qual' : match.matchType === 'playoff' ? 'Playoff' : 'Practice'} {match.matchNumber}
            </h2>
            <p className="text-sm text-textSecondary">
              Team {match.teamNumber} • {match.alliance.toUpperCase()} Alliance • Station {match.driverStation}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-interactive rounded transition-colors"
            title="Close (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 overflow-y-auto p-4 min-h-0 space-y-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Issues Banner */}
          {(match.noShow || match.robotDied || match.robotTipped || match.mechanicalIssues || match.cardReceived !== 'none') && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-danger font-semibold mb-2">
                <AlertTriangle size={16} />
                Issues Reported
              </div>
              <div className="flex flex-wrap gap-2">
                {match.noShow && <span className="px-2 py-1 bg-danger/20 text-danger text-xs rounded font-medium">NO SHOW</span>}
                {match.robotDied && <span className="px-2 py-1 bg-danger/20 text-danger text-xs rounded font-medium">ROBOT DIED</span>}
                {match.robotTipped && <span className="px-2 py-1 bg-warning/20 text-warning text-xs rounded font-medium">ROBOT TIPPED</span>}
                {match.mechanicalIssues && <span className="px-2 py-1 bg-warning/20 text-warning text-xs rounded font-medium">MECHANICAL ISSUES</span>}
                {match.cardReceived === 'yellow' && <span className="px-2 py-1 bg-warning/20 text-warning text-xs rounded font-medium">YELLOW CARD</span>}
                {match.cardReceived === 'red' && <span className="px-2 py-1 bg-danger/20 text-danger text-xs rounded font-medium">RED CARD</span>}
              </div>
            </div>
          )}

          {/* Pre-Match */}
          <div>
            <SectionHeader title="Pre-Match" />
            <div className="grid grid-cols-3 gap-4">
              <StatItem label="Starting Position" value={match.startingPosition.toUpperCase()} />
              <StatItem label="Preloaded FUEL" value={match.preloadedFuel} />
              <StatItem label="No Show" value={match.noShow ? 'Yes' : 'No'} />
            </div>
          </div>

          {/* Autonomous */}
          <div>
            <SectionHeader title="Autonomous" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <StatItem label="FUEL Scored" value={match.autoFuelScored} />
              <StatItem label="FUEL Missed" value={match.autoFuelMissed} />
              <StatItem
                label="Accuracy"
                value={match.autoFuelScored + match.autoFuelMissed > 0
                  ? Math.round((match.autoFuelScored / (match.autoFuelScored + match.autoFuelMissed)) * 100)
                  : 0}
                suffix="%"
              />
              <StatItem label="Climb Success" value={match.autoClimbSuccess ? 'Yes' : 'No'} />
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <BooleanBadge value={match.autoMobility} label="Mobility" />
              <BooleanBadge value={match.autoClimbAttempted} label="Climb Attempted" />
              <BooleanBadge value={match.autoCrossedBump} label="Crossed Bump" />
              <BooleanBadge value={match.autoUsedTrench} label="Used Trench" />
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <StatItem label="From Depot" value={match.autoFuelFromDepot} />
              <StatItem label="From Neutral" value={match.autoFuelFromNeutral} />
              <StatItem label="From Human" value={match.autoFuelFromHuman} />
            </div>
            {match.commentsAuto && (
              <div className="mt-3 p-3 bg-surfaceElevated rounded text-sm">
                <p className="text-textSecondary text-xs mb-1">Auto Comments</p>
                <p>{match.commentsAuto}</p>
              </div>
            )}
          </div>

          {/* Teleop */}
          <div>
            <SectionHeader title="Teleop" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <StatItem label="FUEL Scored" value={match.teleopTotalScored} />
              <StatItem label="FUEL Missed" value={match.teleopTotalMissed} />
              <StatItem
                label="Accuracy"
                value={match.teleopTotalScored + match.teleopTotalMissed > 0
                  ? Math.round((match.teleopTotalScored / (match.teleopTotalScored + match.teleopTotalMissed)) * 100)
                  : 0}
                suffix="%"
              />
              <StatItem label="Cycles" value={match.cycleCount} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3 text-sm">
              <StatItem label="Active Hub" value={match.teleopScoresDuringActive} />
              <StatItem label="Inactive Hub" value={match.teleopScoresDuringInactive} />
              <StatItem label="To Human Player" value={match.teleopFuelToHuman} />
              <div></div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
              <StatItem label="From Depot" value={match.teleopFuelFromDepot} />
              <StatItem label="From Neutral" value={match.teleopFuelFromNeutral} />
              <StatItem label="From Human" value={match.teleopFuelFromHuman} />
            </div>
            <div className="flex flex-wrap gap-2">
              <BooleanBadge value={match.playedDefense} label="Played Defense" />
              <BooleanBadge value={match.wasDefended} label="Was Defended" />
            </div>
            {match.playedDefense && (
              <div className="mt-2">
                <StatItem label="Defense Effectiveness" value={match.defenseEffectiveness.toUpperCase()} />
              </div>
            )}
            {match.wasDefended && (
              <div className="mt-2">
                <StatItem label="Defense Evasion" value={match.defenseEvasion.toUpperCase()} />
              </div>
            )}
            {match.commentsTeleop && (
              <div className="mt-3 p-3 bg-surfaceElevated rounded text-sm">
                <p className="text-textSecondary text-xs mb-1">Teleop Comments</p>
                <p>{match.commentsTeleop}</p>
              </div>
            )}
          </div>

          {/* Endgame */}
          <div>
            <SectionHeader title="Endgame" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <StatItem label="Climb Level" value={match.climbLevel === 'none' ? 'None' : match.climbLevel.replace('level', 'Level ')} />
              <StatItem label="Climb Time" value={match.climbTime > 0 ? match.climbTime : '-'} suffix={match.climbTime > 0 ? 's' : ''} />
              <StatItem label="Endgame FUEL" value={match.endgameFuelScored} />
              <StatItem label="Parked" value={match.parked ? 'Yes' : 'No'} />
            </div>
            <div className="flex flex-wrap gap-2">
              <BooleanBadge value={match.climbAttempted} label="Climb Attempted" />
              <BooleanBadge value={match.climbAssisted} label="Was Assisted" />
              <BooleanBadge value={match.climbAssistedOther} label="Assisted Others" />
            </div>
          </div>

          {/* Performance Ratings */}
          <div>
            <SectionHeader title="Performance Ratings" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RatingBar label="Driver Skill" value={match.driverSkill} />
              <RatingBar label="Intake Speed" value={match.intakeSpeed} />
              <RatingBar label="Shooting Accuracy" value={match.shootingAccuracy} />
              <RatingBar label="Shooting Speed" value={match.shootingSpeed} />
            </div>
            <div className="mt-3">
              <StatItem label="Human Player Rating" value={match.humanPlayerRating.toUpperCase()} />
            </div>
          </div>

          {/* Overall Comments */}
          {match.commentsOverall && (
            <div>
              <SectionHeader title="Overall Comments" />
              <div className="p-3 bg-surfaceElevated rounded">
                <p>{match.commentsOverall}</p>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-textMuted border-t border-border pt-4">
            <p>Scouted by: {match.scoutName}</p>
            <p>Recorded: {new Date(match.timestamp).toLocaleString()}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-surfaceElevated p-4 border-t border-border rounded-b-lg">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default MatchDetailModal;
