import { useMemo } from 'react';
import type { FailureSlice } from '../utils/strategicInsights';

interface FailureModeChartProps {
  slices: FailureSlice[];
  matchesPlayed: number;
}

// Donut geometry
const SIZE = 140;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const COLOR_FOR: Record<FailureSlice['color'], string> = {
  danger: 'hsl(0 84% 60%)',
  warning: 'hsl(48 96% 47%)',
  muted: 'hsl(0 0% 55%)',
};

export function FailureModeChart({ slices, matchesPlayed }: FailureModeChartProps) {
  const totalFailures = slices.reduce((s, x) => s + x.count, 0);

  // Build dasharray segments for the donut. Slices share the failure-share of
  // the circle; the rest is "clean".
  const segments = useMemo(() => {
    if (matchesPlayed === 0) return [];
    let offset = 0;
    return slices.map(s => {
      const share = s.count / matchesPlayed;
      const length = share * CIRCUMFERENCE;
      const seg = { color: COLOR_FOR[s.color], length, offset };
      offset += length;
      return seg;
    });
  }, [slices, matchesPlayed]);

  if (totalFailures === 0 || matchesPlayed === 0) return null;

  const cleanShare = Math.max(0, 1 - totalFailures / matchesPlayed);
  const cleanLength = cleanShare * CIRCUMFERENCE;
  const cleanOffset = totalFailures / matchesPlayed * CIRCUMFERENCE;

  return (
    <div className="bg-surface rounded-lg border border-border p-4 md:p-5">
      <h3 className="text-sm font-bold text-textSecondary mb-3">Failure modes</h3>
      <div className="flex items-center gap-4 flex-wrap">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-shrink-0">
          {/* Clean (success) ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="hsl(142 71% 45% / 0.5)"
            strokeWidth={STROKE}
            strokeDasharray={`${cleanLength} ${CIRCUMFERENCE - cleanLength}`}
            strokeDashoffset={-cleanOffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
          {/* Failure slices */}
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${seg.length} ${CIRCUMFERENCE - seg.length}`}
              strokeDashoffset={-seg.offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          ))}
          <text
            x={SIZE / 2}
            y={SIZE / 2 - 4}
            textAnchor="middle"
            className="fill-textPrimary"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            {totalFailures}
          </text>
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 14}
            textAnchor="middle"
            className="fill-textMuted"
            style={{ fontSize: 10 }}
          >
            of {matchesPlayed}
          </text>
        </svg>

        <ul className="space-y-1.5 text-sm flex-1 min-w-[160px]">
          {slices.map(s => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: COLOR_FOR[s.color] }}
              />
              <span className="text-textSecondary">{s.label}</span>
              <span className="ml-auto font-semibold">
                {s.count} <span className="text-textMuted text-xs">({s.pct.toFixed(0)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default FailureModeChart;
