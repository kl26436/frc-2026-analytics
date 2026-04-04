import { useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { ScoutEntry, TeamStatistics, RobotActions } from '../types/scouting';
import { estimateMatchFuel, estimateMatchPoints, parseClimbLevel, getAlliance, getStation, computeRobotFuelFromActions } from '../types/scouting';

interface MatchDetailModalProps {
  match: ScoutEntry;
  teamStats?: TeamStatistics;
  robotActions?: RobotActions;
  onClose: () => void;
}

function MatchDetailModal({ match, teamStats, robotActions, onClose }: MatchDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const fuel = estimateMatchFuel(match);
  const points = estimateMatchPoints(match);
  const climbLevel = parseClimbLevel(match.climb_level);
  const alliance = getAlliance(match.configured_team);
  const station = getStation(match.configured_team);
  const n = teamStats?.matchesPlayed;

  const climbLabel = ['None', 'Level 1', 'Level 2', 'Level 3'][climbLevel] ?? 'None';
  const actionFuel = robotActions ? computeRobotFuelFromActions(robotActions) : null;

  // Determine start zone
  const startZones = [
    match.prematch_AUTON_START_ZONE_1,
    match.prematch_AUTON_START_ZONE_2,
    match.prematch_AUTON_START_ZONE_3,
    match.prematch_AUTON_START_ZONE_4,
    match.prematch_AUTON_START_ZONE_5,
    match.prematch_AUTON_START_ZONE_6,
  ];
  const activeZone = startZones.findIndex(z => z > 0);
  const startZoneLabel = activeZone >= 0 ? `Zone ${activeZone + 1}` : '-';

  const hasIssues = match.lost_connection || match.no_robot_on_field || match.teleop_climb_failed ||
    match.poor_fuel_scoring_accuracy;

  const BooleanBadge = ({ value, label, teamContext }: { value: boolean; label: string; teamContext?: string }) => (
    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
      value ? 'bg-success/20 text-success' : 'bg-surface text-textMuted'
    }`}>
      {value ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {label}
      {teamContext && <span className="text-textMuted ml-1">({teamContext})</span>}
    </div>
  );

  const StatItem = ({ label, value, suffix = '', teamContext }: { label: string; value: string | number; suffix?: string; teamContext?: string }) => (
    <div>
      <p className="text-textSecondary text-xs">{label}</p>
      <p className="font-semibold">{value}{suffix}</p>
      {teamContext && <p className="text-xs text-textMuted">{teamContext}</p>}
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
            <h2 className="text-xl font-bold">Qual {match.match_number}</h2>
            <p className="text-sm text-textSecondary">
              Team {match.team_number} •{' '}
              <span className={alliance === 'red' ? 'text-redAlliance' : 'text-blueAlliance'}>
                {alliance.toUpperCase()}
              </span>{' '}
              Alliance • Station {station}
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
          {hasIssues && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-danger font-semibold mb-2">
                <AlertTriangle size={16} />
                Issues Reported
              </div>
              <div className="flex flex-wrap gap-2">
                {match.lost_connection && <span className="px-2 py-1 bg-danger/20 text-danger text-xs rounded font-medium">LOST CONNECTION</span>}
                {match.no_robot_on_field && <span className="px-2 py-1 bg-danger/20 text-danger text-xs rounded font-medium">NO ROBOT</span>}
                {match.teleop_climb_failed && <span className="px-2 py-1 bg-warning/20 text-warning text-xs rounded font-medium">CLIMB FAILED</span>}
                {match.poor_fuel_scoring_accuracy && <span className="px-2 py-1 bg-warning/20 text-warning text-xs rounded font-medium">POOR ACCURACY</span>}
              </div>
            </div>
          )}

          {/* Pre-Match */}
          <div>
            <SectionHeader title="Pre-Match" />
            <div className="grid grid-cols-3 gap-4">
              <StatItem label="Start Zone" value={startZoneLabel} />
              <StatItem label="Dedicated Passer" value={match.dedicated_passer ? 'Yes' : 'No'}
                teamContext={teamStats ? `${teamStats.dedicatedPasserCount}/${n} matches` : undefined} />
              <StatItem label="Second Review" value={match.second_review ? 'Yes' : 'No'}
                teamContext={teamStats ? `${teamStats.secondReviewCount}/${n} matches` : undefined} />
            </div>
          </div>

          {/* Autonomous */}
          <div>
            <SectionHeader title="Autonomous" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <StatItem label="Fuel Scored" value={match.auton_FUEL_SCORE} />
              <StatItem label="Fuel Passed" value={match.auton_FUEL_PASS} />
              <StatItem label="Fuel Estimate" value={fuel.auto}
                teamContext={teamStats ? `avg: ${teamStats.avgAutoFuelEstimate.toFixed(1)}` : undefined} />
              <StatItem label="Auto Climbed" value={match.auton_AUTON_CLIMBED > 0 ? 'Yes' : 'No'}
                teamContext={teamStats ? `${teamStats.autoClimbCount}/${n}` : undefined} />
            </div>

            {/* SCORE_PLUS breakdown */}
            <div className="bg-surfaceElevated rounded p-3 mb-3">
              <p className="text-xs text-textSecondary mb-2">Bonus Buckets</p>
              <div className="grid grid-cols-6 gap-2 text-center">
                <div>
                  <p className="text-xs text-textMuted">+1</p>
                  <p className="font-bold">{match.auton_SCORE_PLUS_1}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+2</p>
                  <p className="font-bold">{match.auton_SCORE_PLUS_2}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+3</p>
                  <p className="font-bold">{match.auton_SCORE_PLUS_3}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+5</p>
                  <p className="font-bold">{match.auton_SCORE_PLUS_5}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+10</p>
                  <p className="font-bold">{match.auton_SCORE_PLUS_10}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+20</p>
                  <p className="font-bold">{match.auton_SCORE_PLUS_20}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <BooleanBadge value={match.auton_AUTON_CLIMBED > 0} label="Auto Climb"
                teamContext={teamStats ? `${teamStats.autoClimbCount}/${n}` : undefined} />
              <BooleanBadge value={!match.auton_did_nothing} label="Active Auto"
                teamContext={teamStats ? `${teamStats.matchesPlayed - teamStats.autoDidNothingCount}/${teamStats.matchesPlayed}` : undefined} />
            </div>
          </div>

          {/* Teleop */}
          <div>
            <SectionHeader title="Teleop" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3">
              <StatItem label="Fuel Scored" value={match.teleop_FUEL_SCORE} />
              <StatItem label="Fuel Passed" value={match.teleop_FUEL_PASS} />
              <StatItem label="Fuel Estimate" value={fuel.teleop}
                teamContext={teamStats ? `avg: ${teamStats.avgTeleopFuelEstimate.toFixed(1)}` : undefined} />
            </div>

            {/* SCORE_PLUS breakdown */}
            <div className="bg-surfaceElevated rounded p-3 mb-3">
              <p className="text-xs text-textSecondary mb-2">Bonus Buckets</p>
              <div className="grid grid-cols-6 gap-2 text-center">
                <div>
                  <p className="text-xs text-textMuted">+1</p>
                  <p className="font-bold">{match.teleop_SCORE_PLUS_1}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+2</p>
                  <p className="font-bold">{match.teleop_SCORE_PLUS_2}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+3</p>
                  <p className="font-bold">{match.teleop_SCORE_PLUS_3}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+5</p>
                  <p className="font-bold">{match.teleop_SCORE_PLUS_5}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+10</p>
                  <p className="font-bold">{match.teleop_SCORE_PLUS_10}</p>
                </div>
                <div>
                  <p className="text-xs text-textMuted">+20</p>
                  <p className="font-bold">{match.teleop_SCORE_PLUS_20}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <BooleanBadge value={match.dedicated_passer} label="Dedicated Passer"
                teamContext={teamStats ? `${teamStats.dedicatedPasserCount}/${n}` : undefined} />
            </div>
          </div>

          {/* Scored vs Passed Breakdown (from action data) */}
          {actionFuel && (
            <div>
              <SectionHeader title="Fuel Attribution (Derived)" />
              <p className="text-xs text-textMuted mb-3">Scored vs passed breakdown from timestamped action data</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surfaceElevated rounded-lg p-3">
                  <p className="text-xs text-textSecondary mb-2">Auto</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-textMuted">Scored</p>
                      <p className="font-bold text-success">{actionFuel.autoShots}</p>
                    </div>
                    <div>
                      <p className="text-xs text-textMuted">Passed</p>
                      <p className="font-bold text-blueAlliance">{actionFuel.autoPasses}</p>
                    </div>
                    <div>
                      <p className="text-xs text-textMuted">Total</p>
                      <p className="font-bold">{actionFuel.autoTotal}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-surfaceElevated rounded-lg p-3">
                  <p className="text-xs text-textSecondary mb-2">Teleop</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-textMuted">Scored</p>
                      <p className="font-bold text-success">{actionFuel.teleopShots}</p>
                    </div>
                    <div>
                      <p className="text-xs text-textMuted">Passed</p>
                      <p className="font-bold text-blueAlliance">{actionFuel.teleopPasses}</p>
                    </div>
                    <div>
                      <p className="text-xs text-textMuted">Total</p>
                      <p className="font-bold">{actionFuel.teleopTotal}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 bg-success/10 border border-success/30 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-textSecondary">Total Scored</p>
                    <p className="text-xl font-bold text-success">{actionFuel.totalShots}</p>
                  </div>
                  <div>
                    <p className="text-xs text-textSecondary">Total Passed</p>
                    <p className="text-xl font-bold text-blueAlliance">{actionFuel.totalPasses}</p>
                  </div>
                  <div>
                    <p className="text-xs text-textSecondary">Total Moved</p>
                    <p className="text-xl font-bold">{actionFuel.totalMoved}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Endgame */}
          <div>
            <SectionHeader title="Endgame" />
            <div className="grid grid-cols-3 gap-4 mb-3">
              <StatItem label="Climb Level" value={climbLabel}
                teamContext={teamStats ? `L3: ${teamStats.level3ClimbCount}/${n}` : undefined} />
              <StatItem label="Climb Points" value={points.endgamePoints} />
              <StatItem label="Climb Failed" value={match.teleop_climb_failed ? 'Yes' : 'No'}
                teamContext={teamStats ? `${teamStats.climbFailedCount}/${n}` : undefined} />
            </div>
          </div>

          {/* Points Summary */}
          <div>
            <SectionHeader title="Estimated Points" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-surfaceElevated rounded-lg p-3 text-center">
                <p className="text-xs text-textSecondary">Auto</p>
                <p className="text-xl font-bold">{points.autoPoints}</p>
                {teamStats && <p className="text-xs text-textMuted">avg: {teamStats.avgAutoPoints.toFixed(1)}</p>}
              </div>
              <div className="bg-surfaceElevated rounded-lg p-3 text-center">
                <p className="text-xs text-textSecondary">Teleop</p>
                <p className="text-xl font-bold">{points.teleopPoints}</p>
                {teamStats && <p className="text-xs text-textMuted">avg: {teamStats.avgTeleopPoints.toFixed(1)}</p>}
              </div>
              <div className="bg-surfaceElevated rounded-lg p-3 text-center">
                <p className="text-xs text-textSecondary">Endgame</p>
                <p className="text-xl font-bold">{points.endgamePoints}</p>
                {teamStats && <p className="text-xs text-textMuted">avg: {teamStats.avgEndgamePoints.toFixed(1)}</p>}
              </div>
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-center">
                <p className="text-xs text-success">Total</p>
                <p className="text-xl font-bold text-success">{points.total}</p>
                {teamStats && <p className="text-xs text-textMuted">avg: {teamStats.avgTotalPoints.toFixed(1)}</p>}
              </div>
            </div>
          </div>

          {/* Passing */}
          <div>
            <SectionHeader title="Passing" />
            <div className="flex flex-wrap gap-2 mb-3">
              <BooleanBadge value={match.eff_rep_bulldozed_fuel} label="Bulldozed Fuel"
                teamContext={teamStats ? `${teamStats.bulldozedFuelCount}/${n}` : undefined} />
            </div>
          </div>

          {/* Quality Flags */}
          <div>
            <SectionHeader title="Quality Flags" />
            <div className="flex flex-wrap gap-2 mb-3">
              <BooleanBadge value={match.poor_fuel_scoring_accuracy} label="Poor Accuracy"
                teamContext={teamStats ? `${teamStats.poorAccuracyCount}/${n}` : undefined} />
              <BooleanBadge value={match.lost_connection} label="Lost Connection"
                teamContext={teamStats ? `${teamStats.lostConnectionCount}/${n}` : undefined} />
              <BooleanBadge value={match.no_robot_on_field} label="No Robot"
                teamContext={teamStats ? `${teamStats.noRobotCount}/${n}` : undefined} />
            </div>
            {match.relative_driver_performance && (
              <StatItem label="Relative Driver Performance" value={match.relative_driver_performance} />
            )}
          </div>

          {/* Notes */}
          {match.notes && (
            <div>
              <SectionHeader title="Scout Notes" />
              <div className="p-3 bg-surfaceElevated rounded">
                <p>{match.notes}</p>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-textMuted border-t border-border pt-4">
            <p>Scouter: {match.scouter_id}</p>
            <p>Match Key: {match.match_key}</p>
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
