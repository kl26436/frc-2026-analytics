interface AutoConsistencyChartProps {
  /** Per-match auto points, ordered chronologically. */
  perMatchAuto: Array<{ matchNumber: number; autoPoints: number }>;
}

const BAR_W = 18;
const GAP = 4;
const HEIGHT = 80;
const TOP_PAD = 4;
const BOTTOM_PAD = 14;

export function AutoConsistencyChart({ perMatchAuto }: AutoConsistencyChartProps) {
  if (perMatchAuto.length === 0) return null;
  const max = Math.max(1, ...perMatchAuto.map(p => p.autoPoints));
  const avg = perMatchAuto.reduce((s, p) => s + p.autoPoints, 0) / perMatchAuto.length;
  const width = perMatchAuto.length * (BAR_W + GAP) - GAP;
  const innerH = HEIGHT - TOP_PAD - BOTTOM_PAD;
  const avgY = TOP_PAD + (1 - avg / max) * innerH;

  return (
    <div className="bg-surface rounded-lg border border-border p-4 md:p-5">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-textSecondary">Auto consistency</h3>
        <span className="text-xs text-textMuted">avg {avg.toFixed(1)} pts</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <svg width={width} height={HEIGHT} role="img" aria-label="Per-match auto points">
          {/* Average line */}
          <line
            x1={0}
            x2={width}
            y1={avgY}
            y2={avgY}
            stroke="hsl(0 0% 55% / 0.55)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {/* Bars */}
          {perMatchAuto.map((p, i) => {
            const x = i * (BAR_W + GAP);
            const h = max > 0 ? (p.autoPoints / max) * innerH : 0;
            const y = TOP_PAD + (innerH - h);
            const aboveAvg = p.autoPoints > avg + 1;
            const belowAvg = p.autoPoints < avg - 1;
            const fill = aboveAvg
              ? 'hsl(142 71% 45% / 0.85)'
              : belowAvg
                ? 'hsl(0 84% 60% / 0.7)'
                : 'hsl(0 0% 55% / 0.55)';
            return (
              <g key={p.matchNumber}>
                <rect x={x} y={y} width={BAR_W} height={Math.max(2, h)} rx={2} fill={fill}>
                  <title>{`Q${p.matchNumber}: ${p.autoPoints.toFixed(1)} auto pts`}</title>
                </rect>
                <text
                  x={x + BAR_W / 2}
                  y={HEIGHT - 2}
                  textAnchor="middle"
                  className="fill-textMuted"
                  style={{ fontSize: 9 }}
                >
                  {p.matchNumber}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default AutoConsistencyChart;
