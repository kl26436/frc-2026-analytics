import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { TeamStatistics, ScoutEntry } from '../../types/scouting';
import type { TBAMatch } from '../../types/tba';
import type { TeamTrend } from '../../utils/trendAnalysis';
import { matchLabel } from '../../utils/formatting';
import { analyzeTrend, characterizeTeam } from '../../utils/strategicInsights';
import TrendChip from '../TrendChip';

interface WatchlistCardsProps {
  pinnedTeams: number[];
  allStats: TeamStatistics[];
  allTrends: TeamTrend[];
  allMatches: TBAMatch[];
  scoutEntries: ScoutEntry[];
  nicknameOf?: (teamNumber: number) => string | undefined;
}

export function WatchlistCards({
  pinnedTeams,
  allStats,
  allTrends,
  allMatches,
  scoutEntries,
  nicknameOf,
}: WatchlistCardsProps) {
  if (pinnedTeams.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-4 md:p-5 shadow-card">
        <h2 className="text-sm md:text-base font-bold flex items-center gap-2 mb-2">
          <Star size={16} className="text-warning" />
          Watchlist
        </h2>
        <p className="text-sm text-textMuted">
          Pin teams from the{' '}
          <Link to="/teams" className="text-blueAlliance hover:underline">Teams page</Link>{' '}
          to track them here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-4 md:p-5 shadow-card">
      <h2 className="text-sm md:text-base font-bold flex items-center gap-2 mb-3">
        <Star size={16} className="text-warning" />
        Watchlist
        <span className="text-xs text-textMuted font-normal ml-1">{pinnedTeams.length} pinned</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pinnedTeams.map(teamNum => {
          const stats = allStats.find(s => s.teamNumber === teamNum);
          const trend = allTrends.find(t => t.teamNumber === teamNum);
          const trendAnalysis = stats && trend ? analyzeTrend(stats, trend, scoutEntries) : null;
          const characterization = stats ? characterizeTeam(stats, trend, { allStats }) : '';

          // Find most recent completed match for this team
          const teamKey = `frc${teamNum}`;
          const lastMatch = [...allMatches]
            .filter(m =>
              m.alliances.red.score >= 0 &&
              (m.alliances.red.team_keys.includes(teamKey) ||
                m.alliances.blue.team_keys.includes(teamKey))
            )
            .sort((a, b) => (b.actual_time ?? 0) - (a.actual_time ?? 0))[0];

          let resultLabel = '—';
          let resultClass = 'text-textMuted';
          if (lastMatch) {
            const onRed = lastMatch.alliances.red.team_keys.includes(teamKey);
            const ourScore = onRed ? lastMatch.alliances.red.score : lastMatch.alliances.blue.score;
            const theirScore = onRed ? lastMatch.alliances.blue.score : lastMatch.alliances.red.score;
            if (ourScore > theirScore) { resultLabel = `W ${ourScore}-${theirScore}`; resultClass = 'text-success'; }
            else if (ourScore < theirScore) { resultLabel = `L ${ourScore}-${theirScore}`; resultClass = 'text-danger'; }
            else { resultLabel = `T ${ourScore}-${theirScore}`; resultClass = 'text-textSecondary'; }
          }

          const nickname = nicknameOf?.(teamNum) ?? stats?.teamName;

          return (
            <Link
              key={teamNum}
              to={`/teams/${teamNum}`}
              className="bg-surfaceElevated rounded-lg p-3 hover:ring-1 hover:ring-warning/40 transition-all"
            >
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-bold text-base">{teamNum}</span>
                {nickname && (
                  <span className="text-xs text-textMuted truncate">{nickname}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                {lastMatch ? (
                  <>
                    <span className="text-textSecondary">{matchLabel(lastMatch)}</span>
                    <span className={`font-semibold ${resultClass}`}>{resultLabel}</span>
                  </>
                ) : (
                  <span className="text-textMuted">No completed matches</span>
                )}
              </div>
              {trendAnalysis && (
                <div className="mb-2">
                  <TrendChip analysis={trendAnalysis} size="sm" />
                </div>
              )}
              {characterization && (
                <p className="text-xs text-textSecondary line-clamp-2">{characterization}</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default WatchlistCards;
