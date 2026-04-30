import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';

interface PartnerComparisonCardProps {
  /** The team this page is for. */
  homeTeam: number;
  /** Match label, e.g. "Q49". */
  matchLabel: string;
  /** Three team numbers including the home team. Order is preserved. */
  partners: number[];
  /** Stats lookup; rows missing a stats record render as "—". */
  allStats: TeamStatistics[];
}

const ROWS: Array<{
  label: string;
  format: (s: TeamStatistics) => string;
}> = [
  { label: 'Avg total', format: s => s.avgTotalPoints.toFixed(0) },
  {
    label: 'Climb success',
    format: s => `${(s.level1ClimbRate + s.level2ClimbRate + s.level3ClimbRate).toFixed(0)}%`,
  },
  { label: 'Auto avg', format: s => s.avgAutoPoints.toFixed(0) },
  { label: 'Endgame avg', format: s => s.avgEndgamePoints.toFixed(0) },
];

export function PartnerComparisonCard({
  homeTeam,
  matchLabel,
  partners,
  allStats,
}: PartnerComparisonCardProps) {
  const teamStatsByNumber = new Map(allStats.map(s => [s.teamNumber, s]));
  const partnerStats = partners.map(n => teamStatsByNumber.get(n));

  return (
    <div className="bg-surface rounded-lg border border-border p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-blueAlliance" />
        <h3 className="text-base font-bold">
          Next match {matchLabel} · partner comparison
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textMuted border-b border-border">
              <th className="py-2 pr-3 font-medium"></th>
              {partners.map((p) => {
                const isHome = p === homeTeam;
                return (
                  <th key={p} className="py-2 px-2 text-right font-medium">
                    <Link
                      to={`/teams/${p}`}
                      className={`inline-block ${isHome ? 'text-warning font-semibold' : 'hover:text-blueAlliance'}`}
                    >
                      {p}
                      {isHome && <span className="ml-1 text-[10px]">(you)</span>}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 text-textSecondary">{row.label}</td>
                {partnerStats.map((s, i) => (
                  <td
                    key={partners[i]}
                    className={`py-2 px-2 text-right ${partners[i] === homeTeam ? 'font-semibold text-warning' : ''}`}
                  >
                    {s ? row.format(s) : <span className="text-textMuted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-3 text-textSecondary">Reliability</td>
              {partnerStats.map((s, i) => (
                <td key={partners[i]} className="py-2 px-2 text-right text-xs">
                  {s ? <ReliabilityCell stats={s} /> : <span className="text-textMuted">—</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReliabilityCell({ stats }: { stats: TeamStatistics }) {
  const lostConn = stats.lostConnectionCount;
  const noShow = stats.noRobotCount;
  if (lostConn === 0 && noShow === 0) {
    return <span className="text-success">✓</span>;
  }
  const parts: string[] = [];
  if (lostConn > 0) parts.push(`${lostConn} conn`);
  if (noShow > 0) parts.push(`${noShow} no-show`);
  return <span className="text-warning">⚠ {parts.join(', ')}</span>;
}

export default PartnerComparisonCard;
