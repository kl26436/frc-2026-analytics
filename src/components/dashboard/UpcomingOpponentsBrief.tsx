import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import type { TBAMatch } from '../../types/tba';
import type { TeamStatistics } from '../../types/scouting';
import type { TeamTrend } from '../../utils/trendAnalysis';
import { teamKeyToNumber } from '../../utils/tbaApi';
import { matchLabel } from '../../utils/formatting';
import { buildOpponentBriefing } from '../../utils/strategicInsights';

interface UpcomingOpponentsBriefProps {
  upcomingMatches: TBAMatch[];
  homeTeam: number;
  allStats: TeamStatistics[];
  allTrends: TeamTrend[];
  count?: number;
}

export function UpcomingOpponentsBrief({
  upcomingMatches,
  homeTeam,
  allStats,
  allTrends,
  count = 3,
}: UpcomingOpponentsBriefProps) {
  const briefings = useMemo(() => {
    const homeKey = `frc${homeTeam}`;
    return upcomingMatches.slice(0, count).map(m => {
      const onRed = m.alliances.red.team_keys.includes(homeKey);
      const oppKeys = onRed ? m.alliances.blue.team_keys : m.alliances.red.team_keys;
      const oppNums = oppKeys.map(teamKeyToNumber);
      const briefing = buildOpponentBriefing(oppNums, allStats, allTrends);
      return {
        match: m,
        oppNums,
        headline: briefing.headline,
        bullets: briefing.bullets,
      };
    });
  }, [upcomingMatches, homeTeam, allStats, allTrends, count]);

  if (briefings.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl border border-border p-4 md:p-5 shadow-card">
      <h2 className="text-sm md:text-base font-bold flex items-center gap-2 mb-3">
        <Calendar size={16} className="text-blueAlliance" />
        Upcoming opponents
      </h2>
      <ul className="space-y-3">
        {briefings.map(({ match, oppNums, headline, bullets }) => (
          <li key={match.key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
            <div className="flex items-center gap-2 sm:min-w-[140px]">
              <span className="font-semibold text-warning">{matchLabel(match)}</span>
              <span className="text-xs text-textMuted">vs</span>
              <span className="text-xs font-mono text-textSecondary">
                {oppNums.map((n, i) => (
                  <span key={n}>
                    <Link to={`/teams/${n}`} className="hover:text-blueAlliance">{n}</Link>
                    {i < oppNums.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-textSecondary">{headline}</p>
              {bullets.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {bullets.slice(0, 2).map((b, i) => (
                    <li key={i} className="text-xs text-textMuted truncate">· {b}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default UpcomingOpponentsBrief;
