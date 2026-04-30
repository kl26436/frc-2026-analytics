interface ClimbMatrixProps {
  /** Per-match climb level (0-3) and whether climb failed, ordered chronologically. */
  perMatchClimb: Array<{ matchNumber: number; climbLevel: number; failed?: boolean }>;
}

const CELL = 22;
const GAP = 3;
const ROW_H = 28;
const LABEL_W = 36;
const ROWS = [
  { level: 3, label: 'L3', color: 'hsl(142 71% 45% / 0.85)' },
  { level: 2, label: 'L2', color: 'hsl(142 71% 45% / 0.55)' },
  { level: 1, label: 'L1', color: 'hsl(48 96% 47% / 0.7)' },
  { level: 0, label: 'None', color: 'hsl(0 0% 55% / 0.45)' },
];

export function ClimbMatrix({ perMatchClimb }: ClimbMatrixProps) {
  if (perMatchClimb.length === 0) return null;

  // Drop entirely if there are no climbs anywhere
  const anyClimb = perMatchClimb.some(p => p.climbLevel > 0 || p.failed);
  if (!anyClimb) return null;

  // Only render rows that have data (don't show empty L3 row when no team climbed L3)
  const activeRows = ROWS.filter(row =>
    perMatchClimb.some(p => p.climbLevel === row.level || (row.level === 0 && p.failed))
  );

  const innerW = perMatchClimb.length * (CELL + GAP) - GAP;
  const width = LABEL_W + innerW;
  const height = activeRows.length * (ROW_H + 2) + 16;

  return (
    <div className="bg-surface rounded-lg border border-border p-4 md:p-5">
      <h3 className="text-sm font-bold text-textSecondary mb-3">Climb history</h3>
      <div className="overflow-x-auto pb-1">
        <svg width={width} height={height} role="img" aria-label="Climb success matrix">
          {activeRows.map((row, ri) => {
            const y = ri * (ROW_H + 2);
            return (
              <g key={row.level}>
                <text
                  x={0}
                  y={y + ROW_H / 2 + 4}
                  className="fill-textMuted"
                  style={{ fontSize: 11 }}
                >
                  {row.label}
                </text>
                {perMatchClimb.map((p, i) => {
                  const x = LABEL_W + i * (CELL + GAP);
                  const matched = p.climbLevel === row.level;
                  const showFailureMark = matched && p.climbLevel === 0 && p.failed;
                  return (
                    <g key={p.matchNumber}>
                      <rect
                        x={x}
                        y={y}
                        width={CELL}
                        height={ROW_H}
                        rx={3}
                        fill={matched ? row.color : 'transparent'}
                        stroke={matched ? 'transparent' : 'hsl(0 0% 100% / 0.05)'}
                        strokeWidth={1}
                      >
                        <title>{`Q${p.matchNumber}: ${row.label}${p.failed ? ' (failed)' : ''}`}</title>
                      </rect>
                      {showFailureMark && (
                        <line
                          x1={x + 4}
                          y1={y + 4}
                          x2={x + CELL - 4}
                          y2={y + ROW_H - 4}
                          stroke="hsl(0 84% 60%)"
                          strokeWidth={1.5}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {/* Bottom labels: match numbers, every Nth to avoid overlap */}
          {perMatchClimb.map((p, i) => {
            const labelStride = perMatchClimb.length > 18 ? 4 : perMatchClimb.length > 10 ? 2 : 1;
            if (i % labelStride !== 0 && i !== perMatchClimb.length - 1) return null;
            const x = LABEL_W + i * (CELL + GAP) + CELL / 2;
            const y = activeRows.length * (ROW_H + 2) + 10;
            return (
              <text
                key={`label-${p.matchNumber}`}
                x={x}
                y={y}
                textAnchor="middle"
                className="fill-textMuted"
                style={{ fontSize: 9 }}
              >
                {p.matchNumber}
              </text>
            );
          })}
        </svg>
      </div>
      <p className="text-[10px] text-textMuted mt-1">Diagonal mark = attempted but failed</p>
    </div>
  );
}

export default ClimbMatrix;
