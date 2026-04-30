import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, ChevronRight } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { resolveBracketSlots } from '../utils/bracketTopology';
import { computeAlliancePath } from '../utils/computeAlliancePath';

// Slot positions in a 360 × 100 SVG canvas. We arrange the alliance's journey
// chronologically left-to-right with ample spacing — visually a compressed
// horizontal bracket, not a full 2D bracket.
const NODE_W = 56;
const NODE_H = 26;
const NODE_GAP_X = 14;

interface Props {
  homeTeam: number;
}

export default function MiniBracketWidget({ homeTeam }: Props) {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const alliances = tbaData?.alliances ?? [];
  const playoffMatches = (tbaData?.matches ?? []).filter(m => m.comp_level !== 'qm');
  const homeKey = `frc${homeTeam}`;

  const homeAllianceNum = useMemo(() => {
    for (let i = 0; i < alliances.length; i++) {
      if (alliances[i].picks.includes(homeKey)) return i + 1;
    }
    return null;
  }, [alliances, homeKey]);

  const path = useMemo(() => {
    const resolvedSlots = resolveBracketSlots(playoffMatches, alliances);
    const finalsMatches = playoffMatches.filter(m => m.comp_level === 'f').sort((a, b) => a.match_number - b.match_number);
    return computeAlliancePath(homeAllianceNum, alliances, resolvedSlots, finalsMatches);
  }, [playoffMatches, alliances, homeAllianceNum]);

  if (!homeAllianceNum) return null;

  // Layout: place each step left-to-right
  const totalSteps = path.steps.length;
  const canvasW = Math.max(360, totalSteps * (NODE_W + NODE_GAP_X) + NODE_GAP_X);
  const canvasH = 100;

  // Center vertically; differentiate upper/lower by tilt
  const centerY = 38;
  const positions = path.steps.map((step, i) => {
    const x = NODE_GAP_X + i * (NODE_W + NODE_GAP_X);
    let y = centerY;
    if (step.bracket === 'lower') y = centerY + 18;
    if (step.bracket === 'final') y = centerY - 6;
    return { x, y };
  });

  return (
    <div className="bg-surface rounded-xl border border-border p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <GitBranch size={16} className="text-textSecondary" />
          Your Path
        </h3>
        <Link to="/bracket" className="flex items-center gap-1 text-xs text-textSecondary hover:text-textPrimary transition-colors">
          Full bracket
          <ChevronRight size={12} />
        </Link>
      </div>

      {path.steps.length === 0 ? (
        <p className="text-xs text-textMuted">Awaiting first playoff match.</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          <svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`}>
            {/* Connector lines between consecutive steps */}
            {positions.slice(0, -1).map((pos, i) => {
              const next = positions[i + 1];
              const x1 = pos.x + NODE_W;
              const y1 = pos.y + NODE_H / 2;
              const x2 = next.x;
              const y2 = next.y + NODE_H / 2;
              return (
                <path
                  key={`c-${i}`}
                  d={`M ${x1} ${y1} L ${x2} ${y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-textMuted/60"
                />
              );
            })}

            {/* Nodes */}
            {path.steps.map((step, i) => {
              const pos = positions[i];
              let bgClass = 'fill-surfaceElevated';
              let strokeClass = 'stroke-border';
              let textClass = 'fill-textMuted';
              let extraProps = {};
              if (step.state === 'won') {
                bgClass = 'fill-success/20';
                strokeClass = 'stroke-success/50';
                textClass = 'fill-success';
              } else if (step.state === 'lost') {
                bgClass = 'fill-danger/20';
                strokeClass = 'stroke-danger/50';
                textClass = 'fill-danger';
              } else if (step.state === 'current') {
                bgClass = 'fill-warning/20';
                strokeClass = 'stroke-warning';
                textClass = 'fill-warning';
                extraProps = { strokeWidth: 1.5 };
              }
              return (
                <g key={`n-${i}`}>
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={4}
                    className={`${bgClass} ${strokeClass}`}
                    {...extraProps}
                  />
                  <text
                    x={pos.x + NODE_W / 2}
                    y={pos.y + NODE_H / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`${textClass} font-bold`}
                    style={{ fontSize: 10 }}
                  >
                    {step.label}
                  </text>
                  {step.ourScore != null && step.theirScore != null && (
                    <text
                      x={pos.x + NODE_W / 2}
                      y={pos.y + NODE_H + 10}
                      textAnchor="middle"
                      className="fill-textMuted font-mono"
                      style={{ fontSize: 9 }}
                    >
                      {step.ourScore}-{step.theirScore}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
