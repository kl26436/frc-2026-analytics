import { useAnalyticsStore } from '../store/useAnalyticsStore';

interface Props {
  /** Team numbers in the alliance */
  teamNumbers: number[];
  /** Alliance accent color — red, blue, or neutral */
  color?: 'red' | 'blue' | 'neutral';
  /** Optional class for layout */
  className?: string;
}

/**
 * Renders a one-line footer summarizing how many live + pre-scout match entries
 * back the prediction for the given alliance. Reads from the analytics store —
 * counts reflect the entries actually in scope (filtered by Newton roster + exclusions).
 */
export default function SourceMixFooter({ teamNumbers, color = 'neutral', className = '' }: Props) {
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const preScoutEntries = useAnalyticsStore(s => s.preScoutEntries);
  const usePreScout = useAnalyticsStore(s => s.usePreScout);

  if (teamNumbers.length === 0) return null;

  const teamSet = new Set(teamNumbers);
  let liveCount = 0;
  let preScoutCount = 0;
  for (const e of scoutEntries) if (teamSet.has(e.team_number)) liveCount++;
  for (const e of preScoutEntries) if (teamSet.has(e.team_number)) preScoutCount++;

  const colorClass =
    color === 'red'
      ? 'text-redAlliance/70'
      : color === 'blue'
      ? 'text-blueAlliance/70'
      : 'text-textMuted';

  if (!usePreScout) {
    return (
      <p className={`text-xs ${colorClass} ${className}`}>
        Based on: {liveCount} live match{liveCount === 1 ? '' : 'es'} across {teamNumbers.length} team{teamNumbers.length === 1 ? '' : 's'}
      </p>
    );
  }

  return (
    <p className={`text-xs ${colorClass} ${className}`}>
      Based on: {liveCount} live + {preScoutCount} pre-scout match{liveCount + preScoutCount === 1 ? '' : 'es'} across {teamNumbers.length} team{teamNumbers.length === 1 ? '' : 's'}
    </p>
  );
}
