import { useMemo } from 'react';
import { Eye } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';
import type { TeamTrend } from '../utils/trendAnalysis';
import { buildWatchForList } from '../utils/strategicInsights';

interface WatchForBulletsProps {
  redTeams: number[];
  blueTeams: number[];
  allStats: TeamStatistics[];
  allTrends: TeamTrend[];
}

export function WatchForBullets({ redTeams, blueTeams, allStats, allTrends }: WatchForBulletsProps) {
  const bullets = useMemo(
    () => buildWatchForList(redTeams, blueTeams, allStats, allTrends),
    [redTeams, blueTeams, allStats, allTrends],
  );

  if (bullets.length === 0) return null;

  return (
    <div className="bg-surfaceElevated rounded-lg p-3 md:p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-textSecondary uppercase tracking-wider mb-2">
        <Eye size={12} />
        Watch for
      </p>
      <ul className="space-y-1 text-sm">
        {bullets.map((b, i) => (
          <li key={i} className="text-textSecondary flex gap-2">
            <span className="text-warning flex-shrink-0">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default WatchForBullets;
