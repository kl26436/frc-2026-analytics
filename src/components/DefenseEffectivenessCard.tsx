import { Shield } from 'lucide-react';
import type { DefenseImpact } from '../utils/strategicInsights';

interface DefenseEffectivenessCardProps {
  teamNumber: number;
  impact: DefenseImpact;
  defenseRate: number; // 0-1, share of matches where played_defense was true
}

export function DefenseEffectivenessCard({
  teamNumber,
  impact,
  defenseRate,
}: DefenseEffectivenessCardProps) {
  // Hide for non-defenders
  if (defenseRate <= 0.2 || impact.defendedMatches === 0) return null;

  const delta = impact.avgOpponentDeltaPct;
  const effective = delta < -5;
  const counterproductive = delta > 5;
  const bandClass = effective
    ? 'border-l-success'
    : counterproductive
      ? 'border-l-danger'
      : 'border-l-warning';
  const headlineClass = effective
    ? 'text-success'
    : counterproductive
      ? 'text-danger'
      : 'text-warning';
  const verdict = effective
    ? `${Math.abs(delta).toFixed(0)}% below their average`
    : counterproductive
      ? `${delta.toFixed(0)}% above their average`
      : 'no clear impact';

  return (
    <div className={`bg-surface rounded-lg border border-border border-l-4 ${bandClass} p-4 md:p-6`}>
      <div className="flex items-center gap-2 mb-2">
        <Shield size={18} className="text-textSecondary" />
        <h3 className="text-base font-bold">Defense effectiveness</h3>
      </div>
      <p className="text-sm text-textSecondary leading-relaxed">
        When <span className="font-semibold text-textPrimary">{teamNumber}</span> played defense,
        opposing teams scored <span className={`font-bold ${headlineClass}`}>{verdict}</span>
        {' '}(n={impact.defendedMatches} match{impact.defendedMatches === 1 ? '' : 'es'}, {impact.observations} opponent observation{impact.observations === 1 ? '' : 's'}).
      </p>
      <p className="text-xs text-textMuted mt-2">
        Played defense in {Math.round(defenseRate * 100)}% of pre-scouted matches.
      </p>
    </div>
  );
}

export default DefenseEffectivenessCard;
