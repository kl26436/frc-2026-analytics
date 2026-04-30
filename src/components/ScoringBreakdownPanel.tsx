import type { TeamStatistics } from '../types/scouting';
import { computeMetricRank } from '../utils/strategicInsights';
import RankBadge from './RankBadge';

interface ScoringBreakdownPanelProps {
  teamStats: TeamStatistics;
  allStats: TeamStatistics[];
}

export function ScoringBreakdownPanel({ teamStats, allStats }: ScoringBreakdownPanelProps) {
  const n = teamStats.matchesPlayed;

  // Auto column metrics
  const autoFuelScored = teamStats.avgAutoFuelScore;
  const autoFuelPassed = teamStats.avgAutoFuelPass;
  const midFieldCount = teamStats.centerFieldAutoCount;
  const midFieldRate = n > 0 ? (midFieldCount / n) * 100 : 0;
  const avgAutoPlus20 = teamStats.avgAutoPlus20;

  // Teleop column metrics
  const teleopFuelScored = teamStats.avgTeleopFuelScore;
  const teleopFuelPassed = teamStats.avgTeleopFuelPass;
  const avgTeleopPlus20 = teamStats.avgTeleopPlus20;

  // Endgame summary (demoted)
  const climbCount = teamStats.level1ClimbCount + teamStats.level2ClimbCount + teamStats.level3ClimbCount;

  // Pre-compute ranks across the field
  const autoFuelScoredRank = computeMetricRank(autoFuelScored, allStats.map(s => s.avgAutoFuelScore));
  const autoFuelPassedRank = computeMetricRank(autoFuelPassed, allStats.map(s => s.avgAutoFuelPass));
  const teleopFuelScoredRank = computeMetricRank(teleopFuelScored, allStats.map(s => s.avgTeleopFuelScore));
  const teleopFuelPassedRank = computeMetricRank(teleopFuelPassed, allStats.map(s => s.avgTeleopFuelPass));

  return (
    <div className="bg-surface rounded-lg border border-border p-4 md:p-5">
      <h3 className="text-base font-bold mb-3">Scoring breakdown</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <p className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Auto</p>
          <ul className="space-y-1.5 text-sm">
            <BreakdownRow label="Fuel scored" value={autoFuelScored.toFixed(1)} rank={autoFuelScoredRank} />
            <BreakdownRow label="Fuel passed" value={autoFuelPassed.toFixed(1)} rank={autoFuelPassedRank} />
            <li className="flex items-center gap-2">
              <span className="text-textSecondary flex-1">Mid-field</span>
              <span className="font-semibold">
                {midFieldCount}/{n}
                <span className="text-textMuted text-xs ml-1">({midFieldRate.toFixed(0)}%)</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-textSecondary flex-1">Bonus +20</span>
              <span className="font-semibold">{avgAutoPlus20.toFixed(1)}<span className="text-textMuted text-xs ml-0.5">/m</span></span>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Teleop</p>
          <ul className="space-y-1.5 text-sm">
            <BreakdownRow label="Fuel scored" value={teleopFuelScored.toFixed(1)} rank={teleopFuelScoredRank} />
            <BreakdownRow label="Fuel passed" value={teleopFuelPassed.toFixed(1)} rank={teleopFuelPassedRank} />
            <li className="flex items-center gap-2">
              <span className="text-textSecondary flex-1">Bonus +20</span>
              <span className="font-semibold">{avgTeleopPlus20.toFixed(1)}<span className="text-textMuted text-xs ml-0.5">/m</span></span>
            </li>
          </ul>
        </div>
      </div>

      <p className="text-xs text-textMuted mt-4 pt-3 border-t border-border">
        Endgame · climbs in {climbCount}/{n} match{n === 1 ? '' : 'es'} · {teamStats.avgEndgamePoints.toFixed(1)} pts avg
      </p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  rank,
}: {
  label: string;
  value: string;
  rank: ReturnType<typeof computeMetricRank>;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-textSecondary flex-1">{label}</span>
      <span className="font-semibold">{value}</span>
      <RankBadge rank={rank.rank} total={rank.total} percentile={rank.percentile} />
    </li>
  );
}

export default ScoringBreakdownPanel;
