import { Flag } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { matchLabel } from '../utils/formatting';
import type { TBAAlliance } from '../types/tba';

function allianceNumberForTeams(teamKeys: string[], alliances: TBAAlliance[]): number | null {
  for (let i = 0; i < alliances.length; i++) {
    if (alliances[i].picks.some(pk => teamKeys.includes(pk))) return i + 1;
  }
  return null;
}

interface Props {
  homeTeam: number;
  homeAllianceNum: number | null;
  limit?: number;
}

export default function RecentPlayoffResults({ homeTeam, homeAllianceNum, limit = 4 }: Props) {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const playoffMatches = (tbaData?.matches ?? []).filter(m => m.comp_level !== 'qm');
  const alliances = tbaData?.alliances ?? [];

  const recent = playoffMatches
    .filter(m => m.alliances.red.score >= 0)
    .sort((a, b) => {
      // Order: finals last, then by match number desc
      if (a.comp_level === 'f' && b.comp_level !== 'f') return -1;
      if (a.comp_level !== 'f' && b.comp_level === 'f') return 1;
      const setDiff = (b.set_number ?? 0) - (a.set_number ?? 0);
      if (setDiff !== 0) return setDiff;
      return b.match_number - a.match_number;
    })
    .slice(0, limit);

  if (recent.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-4 shadow-card">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
          <Flag size={16} className="text-textSecondary" />
          Recent Results
        </h3>
        <p className="text-xs text-textMuted">No playoff matches played yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-4 shadow-card">
      <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
        <Flag size={16} className="text-textSecondary" />
        Recent Results
      </h3>
      <div className="space-y-1.5">
        {recent.map(m => {
          const redA = allianceNumberForTeams(m.alliances.red.team_keys, alliances);
          const blueA = allianceNumberForTeams(m.alliances.blue.team_keys, alliances);
          const redWon = m.alliances.red.score > m.alliances.blue.score;
          const blueWon = m.alliances.blue.score > m.alliances.red.score;
          const winnerNum = redWon ? redA : blueA;
          const loserNum = redWon ? blueA : redA;
          const winnerScore = redWon ? m.alliances.red.score : m.alliances.blue.score;
          const loserScore = redWon ? m.alliances.blue.score : m.alliances.red.score;

          const homeOnRed = m.alliances.red.team_keys.includes(`frc${homeTeam}`);
          const homeOnBlue = m.alliances.blue.team_keys.includes(`frc${homeTeam}`);
          const homeInvolved = homeOnRed || homeOnBlue;
          const homeWon = (homeOnRed && redWon) || (homeOnBlue && blueWon);

          return (
            <div
              key={m.key}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                homeInvolved ? 'bg-warning/10 border border-warning/20 font-semibold' : 'bg-surfaceElevated/50'
              }`}
            >
              <span className="font-mono text-textMuted w-10 flex-shrink-0">{matchLabel(m)}</span>
              <span className="flex-1 truncate">
                {winnerNum ? <span className={homeAllianceNum === winnerNum ? 'text-success font-bold' : 'text-textPrimary'}>A{winnerNum}</span> : '?'}
                <span className="text-textMuted mx-1">def</span>
                {loserNum ? <span className={homeAllianceNum === loserNum ? 'text-danger' : 'text-textSecondary'}>A{loserNum}</span> : '?'}
              </span>
              <span className="font-mono whitespace-nowrap">
                <span className="text-success font-bold">{winnerScore}</span>
                <span className="text-textMuted">-</span>
                <span className="text-textMuted">{loserScore}</span>
              </span>
              {homeInvolved && (
                <span className={`text-[9px] uppercase tracking-wider font-bold flex-shrink-0 ${homeWon ? 'text-success' : 'text-danger'}`}>
                  {homeWon ? 'W' : 'L'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
