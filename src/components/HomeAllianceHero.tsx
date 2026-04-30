import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, ChevronRight } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { resolveBracketSlots } from '../utils/bracketTopology';
import { computeAlliancePath, type PathStep } from '../utils/computeAlliancePath';
import AllianceStatusPill from './AllianceStatusPill';

function PathChip({ step }: { step: PathStep }) {
  const base = 'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-semibold border whitespace-nowrap';
  const cls =
    step.state === 'won'      ? `${base} bg-success/15 text-success border-success/30`
    : step.state === 'lost'   ? `${base} bg-danger/15 text-danger border-danger/30`
    : step.state === 'current' ? `${base} bg-warning/20 text-warning border-warning/50 ring-1 ring-warning/40 animate-pulse`
    :                            `${base} bg-surfaceElevated text-textMuted border-border`;

  return (
    <span className={cls} title={step.opponentAlliance ? `vs A${step.opponentAlliance}` : undefined}>
      <span>{step.label}</span>
      {step.state === 'won' && step.ourScore != null && step.theirScore != null && (
        <span className="font-mono opacity-90">{step.ourScore}-{step.theirScore}</span>
      )}
      {step.state === 'lost' && step.ourScore != null && step.theirScore != null && (
        <span className="font-mono opacity-90">{step.ourScore}-{step.theirScore}</span>
      )}
      {step.state === 'current' && <span className="text-[8px] uppercase tracking-wider">on deck</span>}
    </span>
  );
}

function HomeAllianceHero({ homeTeam }: { homeTeam: number }) {
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

  const resolvedSlots = useMemo(
    () => resolveBracketSlots(playoffMatches, alliances),
    [playoffMatches, alliances],
  );

  const finalsMatches = useMemo(
    () => playoffMatches.filter(m => m.comp_level === 'f').sort((a, b) => a.match_number - b.match_number),
    [playoffMatches],
  );

  const path = useMemo(
    () => computeAlliancePath(homeAllianceNum, alliances, resolvedSlots, finalsMatches),
    [homeAllianceNum, alliances, resolvedSlots, finalsMatches],
  );

  if (!homeAllianceNum) return null;

  const allianceTeams = alliances[homeAllianceNum - 1].picks.map(teamKeyToNumber);

  return (
    <div className="bg-gradient-to-r from-warning/15 to-transparent rounded-xl border border-warning/20 p-4 md:p-6 shadow-card">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left — alliance identity */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="text-3xl md:text-4xl font-black text-warning flex-shrink-0">A{homeAllianceNum}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base md:text-lg font-bold">Alliance {homeAllianceNum}</h2>
              <AllianceStatusPill status={path.status} />
              {(path.wins > 0 || path.losses > 0) && (
                <span className="text-xs text-textSecondary font-mono">
                  <span className="text-success">{path.wins}</span>
                  <span className="text-textMuted">-</span>
                  <span className="text-danger">{path.losses}</span>
                </span>
              )}
            </div>
            <p className="text-sm text-textSecondary mt-0.5 truncate">
              {allianceTeams.map((n, i) => (
                <span key={n}>
                  <Link to={`/teams/${n}`} className={`hover:underline ${n === homeTeam ? 'text-warning font-bold' : ''}`}>
                    {n}
                  </Link>
                  {i < allianceTeams.length - 1 && <span className="text-textMuted">, </span>}
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* Right — bracket link */}
        <Link
          to="/bracket"
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surfaceElevated hover:bg-interactive rounded-lg border border-border transition-colors flex-shrink-0 self-start"
        >
          <GitBranch size={12} />
          Full bracket
          <ChevronRight size={12} />
        </Link>
      </div>

      {/* Path strip */}
      {path.steps.length > 0 && (
        <div className="mt-4 -mx-1 px-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex items-center gap-1.5 min-w-max">
            {path.steps.map((step, i) => (
              <span key={`${step.slotNumber}-${i}`} className="flex items-center gap-1.5">
                <PathChip step={step} />
                {i < path.steps.length - 1 && <ChevronRight size={12} className="text-textMuted flex-shrink-0" />}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mobile bracket link */}
      <Link
        to="/bracket"
        className="md:hidden mt-3 flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-surfaceElevated hover:bg-interactive rounded-lg border border-border transition-colors"
      >
        <GitBranch size={12} />
        Full bracket
        <ChevronRight size={12} />
      </Link>
    </div>
  );
}

export default HomeAllianceHero;
