interface RankBadgeProps {
  rank: number;
  total: number;
  /** 0-1 percentile in the "good" direction (1 = best). Drives the color. */
  percentile?: number;
  size?: 'sm' | 'md';
}

function rankColorClass(percentile: number): string {
  if (percentile >= 0.75) return 'bg-success/20 text-success';
  if (percentile <= 0.25) return 'bg-warning/20 text-warning';
  return 'bg-surfaceElevated text-textSecondary';
}

export function RankBadge({ rank, total, percentile, size = 'sm' }: RankBadgeProps) {
  const cls = rankColorClass(percentile ?? 0.5);
  const padding = size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-0.5';
  const text = size === 'md' ? 'text-xs' : 'text-[10px]';
  return (
    <span
      className={`inline-flex items-center rounded font-semibold ${padding} ${text} ${cls}`}
      title={`Rank ${rank} of ${total}`}
    >
      #{rank}/{total}
    </span>
  );
}

export default RankBadge;
