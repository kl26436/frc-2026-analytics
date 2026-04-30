import type { TeamStatistics, ScoutEntry } from '../../types/scouting';
import type { MetricRank, SourceDelta } from '../../utils/strategicInsights';
import RankBadge from '../RankBadge';
import MatchHeatmapStrip from '../MatchHeatmapStrip';
import ScoringBreakdownPanel from '../ScoringBreakdownPanel';
import PreScoutNewtonDelta from '../PreScoutNewtonDelta';
import DataSourceToggle from '../DataSourceToggle';

interface OverviewTabProps {
  teamStats: TeamStatistics;
  teamStatistics: TeamStatistics[];
  teamEntries: ScoutEntry[];
  totalPointsRank: MetricRank;
  autoPointsRank: MetricRank;
  passesRank: MetricRank;
  sourceDelta: SourceDelta | null;
  liveEventLabel?: string;
}

export function OverviewTab({
  teamStats,
  teamStatistics,
  teamEntries,
  totalPointsRank,
  autoPointsRank,
  passesRank,
  sourceDelta,
  liveEventLabel,
}: OverviewTabProps) {
  const compactHeatmap = teamEntries.length < 5;
  const n = teamStats.matchesPlayed;
  const climbCounts = [
    { label: 'None', count: teamStats.climbNoneCount, color: 'text-textMuted' },
    { label: 'L1', count: teamStats.level1ClimbCount, color: '' },
    { label: 'L2', count: teamStats.level2ClimbCount, color: 'text-blueAlliance' },
    { label: 'L3', count: teamStats.level3ClimbCount, color: 'text-success' },
    { label: 'Failed', count: teamStats.climbFailedCount, color: 'text-danger' },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Data-source toggle — first thing on the team's overview so flipping
          live ↔ pre-scout doesn't require leaving the page. Hidden when no
          pre-scout data is loaded (DataSourceToggle handles that internally). */}
      <div className="flex justify-end">
        <DataSourceToggle />
      </div>

      {sourceDelta && (
        <PreScoutNewtonDelta delta={sourceDelta} liveEventLabel={liveEventLabel} />
      )}

      {/* Hero block: 3 unified summary cards (Score / Auto / Passes) + heatmap strip */}
      <div className="bg-surfaceElevated rounded-xl p-4 md:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <HeroStat
            label="Avg Score"
            value={teamStats.avgTotalPoints.toFixed(1)}
            rank={totalPointsRank}
          />
          <HeroStat
            label="Avg Auto"
            value={teamStats.avgAutoPoints.toFixed(1)}
            rank={autoPointsRank}
          />
          <HeroStat
            label="Avg Passes"
            value={teamStats.avgTotalPass.toFixed(1)}
            rank={passesRank}
          />
        </div>

        {teamEntries.length > 0 && (
          <MatchHeatmapStrip entries={teamEntries} compact={compactHeatmap} />
        )}
      </div>

      <ScoringBreakdownPanel teamStats={teamStats} allStats={teamStatistics} />

      {/* Climb summary strip — only renders if the team has actually climbed */}
      {(teamStats.level1ClimbCount + teamStats.level2ClimbCount + teamStats.level3ClimbCount) > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h3 className="text-sm font-bold text-textSecondary mb-2">Climb summary</h3>
          <div className="flex flex-wrap gap-3">
            {climbCounts
              .filter(({ count }) => count > 0)
              .map(({ label, count, color }) => (
                <div key={label} className="bg-surfaceElevated rounded-lg px-4 py-2 text-center min-w-[60px]">
                  <p className="text-xs text-textSecondary">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{count}<span className="text-xs text-textMuted font-normal">/{n}</span></p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroStat({
  label,
  value,
  rank,
}: {
  label: string;
  value: string;
  rank: MetricRank;
}) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <p className="text-textSecondary text-xs md:text-sm mb-1">{label}</p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-2xl md:text-3xl font-bold">{value}</p>
        <RankBadge rank={rank.rank} total={rank.total} percentile={rank.percentile} />
      </div>
    </div>
  );
}

export default OverviewTab;
