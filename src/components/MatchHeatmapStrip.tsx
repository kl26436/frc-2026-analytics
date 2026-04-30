import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScoutEntry } from '../types/scouting';
import { estimateMatchPoints, parseClimbLevel } from '../types/scouting';

interface MatchHeatmapStripProps {
  /** Scout entries for a single team, sorted ascending by match number. */
  entries: ScoutEntry[];
  /** When set, hovering a cell shows the match label. Click navigates to /replay/:matchNumber. */
  navigable?: boolean;
  /** Compact mode: drops the heading and legend. Used inline within the hero block. */
  compact?: boolean;
}

type Classification = 'good' | 'average' | 'below' | 'catastrophic';

function classify(
  score: number,
  avg: number,
  isCatastrophic: boolean,
): Classification {
  if (isCatastrophic) return 'catastrophic';
  if (avg <= 0) return 'average';
  const deltaPct = (score - avg) / avg;
  if (deltaPct > 0.15) return 'good';
  if (deltaPct < -0.15) return 'below';
  return 'average';
}

function fillForClass(c: Classification): string {
  // Use HSL with explicit values so SVG renders correctly without var() resolution
  if (c === 'good') return 'hsl(142 71% 45% / 0.85)';      // success
  if (c === 'average') return 'hsl(0 0% 55% / 0.45)';       // text-muted
  if (c === 'below') return 'hsl(48 96% 47% / 0.7)';        // warning
  return 'hsl(0 84% 60% / 0.85)';                           // danger
}

const CELL = 14;
const GAP = 3;
const HEIGHT = 24;

export function MatchHeatmapStrip({ entries, navigable = true, compact = false }: MatchHeatmapStripProps) {
  const navigate = useNavigate();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const cells = useMemo(() => {
    if (entries.length === 0) return [];
    const points = entries.map(e => estimateMatchPoints(e).total);
    const sum = points.reduce((s, v) => s + v, 0);
    const avg = sum / points.length;
    return entries.map((entry, i) => {
      const total = points[i];
      const isCatastrophic =
        entry.lost_connection ||
        entry.no_robot_on_field ||
        (avg > 0 && total < avg * 0.25);
      const c = classify(total, avg, isCatastrophic);
      return { entry, total, classification: c };
    });
  }, [entries]);

  if (cells.length === 0) {
    return null;
  }

  const width = cells.length * (CELL + GAP) - GAP;
  const hovered = hoverIdx != null ? cells[hoverIdx] : null;

  if (compact) {
    return (
      <div>
        <div className="overflow-x-auto pb-1">
          <svg width={width} height={HEIGHT} style={{ display: 'block' }} role="img" aria-label="Per-match heatmap">
            {cells.map((c, i) => {
              const x = i * (CELL + GAP);
              const isHovered = i === hoverIdx;
              return (
                <rect
                  key={c.entry.id}
                  x={x}
                  y={0}
                  width={CELL}
                  height={HEIGHT}
                  rx={2}
                  fill={fillForClass(c.classification)}
                  stroke={isHovered ? 'hsl(0 0% 100% / 0.9)' : 'transparent'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  style={{ cursor: navigable ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                  onClick={() => { if (navigable) navigate(`/replay/${c.entry.match_number}`); }}
                >
                  <title>
                    {`Q${c.entry.match_number} · ${Math.round(c.total)} pts · ${climbLabel(parseClimbLevel(c.entry.climb_level))}`}
                    {c.entry.notes ? `\n${c.entry.notes}` : ''}
                  </title>
                </rect>
              );
            })}
          </svg>
        </div>
        {hovered && (
          <div className="mt-2 text-xs text-textSecondary">
            <span className="font-semibold text-textPrimary">Q{hovered.entry.match_number}</span>
            {' · '}
            {Math.round(hovered.total)} pts
            {' · '}
            {climbLabel(parseClimbLevel(hovered.entry.climb_level))} climb
            {hovered.entry.lost_connection && <span className="text-danger"> · lost connection</span>}
            {hovered.entry.no_robot_on_field && <span className="text-danger"> · no-show</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-textSecondary">Season at a glance</h3>
        <div className="flex items-center gap-3 text-[10px] text-textMuted">
          <LegendDot color="hsl(142 71% 45% / 0.85)" label="above avg" />
          <LegendDot color="hsl(0 0% 55% / 0.45)" label="±15% avg" />
          <LegendDot color="hsl(48 96% 47% / 0.7)" label="below avg" />
          <LegendDot color="hsl(0 84% 60% / 0.85)" label="catastrophic" />
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <svg
          width={width}
          height={HEIGHT}
          style={{ display: 'block' }}
          role="img"
          aria-label="Per-match heatmap"
        >
          {cells.map((c, i) => {
            const x = i * (CELL + GAP);
            const isHovered = i === hoverIdx;
            return (
              <rect
                key={c.entry.id}
                x={x}
                y={0}
                width={CELL}
                height={HEIGHT}
                rx={2}
                fill={fillForClass(c.classification)}
                stroke={isHovered ? 'hsl(0 0% 100% / 0.9)' : 'transparent'}
                strokeWidth={isHovered ? 1.5 : 0}
                style={{ cursor: navigable ? 'pointer' : 'default' }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                onClick={() => {
                  if (navigable) navigate(`/replay/${c.entry.match_number}`);
                }}
              >
                <title>
                  {`Q${c.entry.match_number} · ${Math.round(c.total)} pts · ${climbLabel(parseClimbLevel(c.entry.climb_level))}`}
                  {c.entry.notes ? `\n${c.entry.notes}` : ''}
                </title>
              </rect>
            );
          })}
        </svg>
      </div>

      {hovered && (
        <div className="mt-2 text-xs text-textSecondary">
          <span className="font-semibold text-textPrimary">Q{hovered.entry.match_number}</span>
          {' · '}
          {Math.round(hovered.total)} pts
          {' · '}
          {climbLabel(parseClimbLevel(hovered.entry.climb_level))} climb
          {hovered.entry.lost_connection && <span className="text-danger"> · lost connection</span>}
          {hovered.entry.no_robot_on_field && <span className="text-danger"> · no-show</span>}
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        style={{ backgroundColor: color }}
        className="inline-block w-2.5 h-2.5 rounded-sm"
      />
      {label}
    </span>
  );
}

function climbLabel(level: number): string {
  return ['no', 'L1', 'L2', 'L3'][level] ?? 'no';
}

export default MatchHeatmapStrip;
