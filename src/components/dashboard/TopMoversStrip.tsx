import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { TeamTrend } from '../../utils/trendAnalysis';
import { topMovers } from '../../utils/strategicInsights';

interface TopMoversStripProps {
  trends: TeamTrend[];
  windowMatches?: number;
  perSide?: number;
}

export function TopMoversStrip({ trends, windowMatches = 4, perSide = 4 }: TopMoversStripProps) {
  const movers = useMemo(() => {
    const { climbing, falling } = topMovers(trends, windowMatches);
    return {
      climbing: climbing.slice(0, perSide),
      falling: falling.slice(0, perSide).filter(t => t.delta < 0),
    };
  }, [trends, windowMatches, perSide]);

  if (movers.climbing.length === 0 && movers.falling.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl border border-border p-4 md:p-5 shadow-card">
      <h2 className="text-sm md:text-base font-bold flex items-center gap-2 mb-3">
        Top movers
        <span className="text-xs text-textMuted font-normal">last {windowMatches} matches</span>
      </h2>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {movers.climbing.map(t => (
          <Link
            key={`up-${t.teamNumber}`}
            to={`/teams/${t.teamNumber}`}
            className="flex items-center gap-1 text-success hover:underline"
          >
            <TrendingUp size={14} />
            <span className="font-bold">{t.teamNumber}</span>
            <span className="text-xs">+{t.delta.toFixed(0)}%</span>
          </Link>
        ))}
        {movers.climbing.length > 0 && movers.falling.length > 0 && (
          <span className="text-textMuted">·</span>
        )}
        {movers.falling.map(t => (
          <Link
            key={`down-${t.teamNumber}`}
            to={`/teams/${t.teamNumber}`}
            className="flex items-center gap-1 text-danger hover:underline"
          >
            <TrendingDown size={14} />
            <span className="font-bold">{t.teamNumber}</span>
            <span className="text-xs">{t.delta.toFixed(0)}%</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default TopMoversStrip;
