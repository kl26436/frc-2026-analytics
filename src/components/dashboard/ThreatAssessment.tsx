import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { TeamStatistics } from '../../types/scouting';
import { assessThreat, type DangerLevel } from '../../utils/strategicInsights';

interface ThreatAssessmentProps {
  homeStats: TeamStatistics | null | undefined;
  candidateStats: TeamStatistics[];
  nicknameOf?: (n: number) => string | undefined;
  count?: number;
}

const DANGER_CLASS: Record<DangerLevel, string> = {
  high: 'text-danger',
  medium: 'text-warning',
  low: 'text-textSecondary',
};

const DANGER_PILL: Record<DangerLevel, string> = {
  high: 'bg-danger/15 text-danger',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-surfaceElevated text-textSecondary',
};

export function ThreatAssessment({
  homeStats,
  candidateStats,
  nicknameOf,
  count = 4,
}: ThreatAssessmentProps) {
  const threats = useMemo(() => {
    if (!homeStats) return [];
    return assessThreat(homeStats, candidateStats).slice(0, count);
  }, [homeStats, candidateStats, count]);

  if (!homeStats || threats.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl border border-border p-4 md:p-5 shadow-card">
      <h2 className="text-sm md:text-base font-bold flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-danger" />
        Top threats
      </h2>
      <ul className="space-y-2">
        {threats.map(threat => {
          const nickname = nicknameOf?.(threat.team);
          return (
            <li key={`${threat.team}-${threat.metric}`}>
              <Link
                to={`/teams/${threat.team}`}
                className="flex items-center justify-between gap-3 px-2 py-2 rounded hover:bg-surfaceElevated transition-colors"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-bold text-textPrimary">{threat.team}</span>
                  {nickname && (
                    <span className="text-xs text-textMuted truncate">{nickname}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-semibold ${DANGER_CLASS[threat.danger]}`}>
                    +{threat.delta.toFixed(0)}%
                  </span>
                  <span className="text-xs text-textSecondary hidden sm:inline">{threat.metric}</span>
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${DANGER_PILL[threat.danger]}`}>
                    {threat.danger}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ThreatAssessment;
