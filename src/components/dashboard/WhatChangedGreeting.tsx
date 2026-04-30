import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { VisitDiff } from '../../utils/lastVisit';

interface WhatChangedGreetingProps {
  diff: VisitDiff | null;
  homeTeam: number;
  pinnedTeams: number[];
  /** Optional team-name lookup. */
  nicknameOf?: (teamNumber: number) => string | undefined;
}

const HIDE_BELOW_MINUTES = 5;

export function WhatChangedGreeting({
  diff,
  homeTeam,
  pinnedTeams,
  nicknameOf,
}: WhatChangedGreetingProps) {
  const sentence = useMemo(() => {
    if (!diff) return null;
    if (diff.minutesSinceLastVisit < HIDE_BELOW_MINUTES) return null;

    const parts: string[] = [];

    if (diff.matchesPlayed > 0) {
      parts.push(`${diff.matchesPlayed} match${diff.matchesPlayed === 1 ? '' : 'es'} played`);
    }

    if (diff.homeRankDelta !== 0) {
      const direction = diff.homeRankDelta < 0 ? 'up' : 'down';
      const nickname = nicknameOf?.(homeTeam);
      const teamLabel = nickname ? `${homeTeam} (${nickname})` : String(homeTeam);
      parts.push(
        `${teamLabel} moved ${direction} ${Math.abs(diff.homeRankDelta)} rank${Math.abs(diff.homeRankDelta) === 1 ? '' : 's'}`,
      );
    }

    if (diff.newTopTeams.length > 0) {
      const labels = diff.newTopTeams.slice(0, 3).map(n => `${n}${nicknameOf?.(n) ? ` (${nicknameOf(n)})` : ''}`);
      parts.push(`New in top 5: ${labels.join(', ')}`);
    }

    const watchlistMatches = diff.notableMatches.filter(m => {
      const homeKey = `frc${homeTeam}`;
      return (
        m.alliances.red.team_keys.includes(homeKey) ||
        m.alliances.blue.team_keys.includes(homeKey)
      );
    });
    if (watchlistMatches.length > 0) {
      parts.push(`${watchlistMatches.length} home match${watchlistMatches.length === 1 ? '' : 'es'} since you were here`);
    }

    if (parts.length === 0) return null;

    let prefix = 'Welcome back.';
    if (diff.minutesSinceLastVisit > 60 * 24) {
      const days = Math.round(diff.minutesSinceLastVisit / (60 * 24));
      prefix = `Welcome back after ${days} day${days === 1 ? '' : 's'}.`;
    } else if (diff.minutesSinceLastVisit > 60) {
      const hours = Math.round(diff.minutesSinceLastVisit / 60);
      prefix = `Welcome back after ${hours}h.`;
    }

    return `${prefix} ${parts.join(' · ')}.`;
  }, [diff, homeTeam, nicknameOf]);

  // Reference unused prop so TS doesn't flag it; pinnedTeams is reserved for
  // future "your watchlist" callouts in the greeting.
  void pinnedTeams;

  if (!sentence) return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-3 md:p-4 flex items-start gap-3">
      <Sparkles className="text-warning flex-shrink-0 mt-0.5" size={16} />
      <p className="text-sm text-textSecondary leading-relaxed">{sentence}</p>
    </div>
  );
}

export default WhatChangedGreeting;
