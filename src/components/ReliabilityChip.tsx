import { useState, useRef, useEffect } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';

interface ReliabilityChipProps {
  stats: TeamStatistics;
}

type Level = 'reliable' | 'minor' | 'unreliable';

interface Assessment {
  level: Level;
  label: string;
  totalIssues: number;
}

function assess(stats: TeamStatistics): Assessment {
  const matches = stats.matchesPlayed;
  if (matches === 0) {
    return { level: 'reliable', label: 'No data', totalIssues: 0 };
  }

  const lostConn = stats.lostConnectionCount;
  const noShow = stats.noRobotCount;
  const didNothing = stats.autoDidNothingCount;
  const totalIssues = lostConn + noShow + didNothing;

  // > 20% catastrophic flags → unreliable
  if (totalIssues > matches * 0.2) {
    return { level: 'unreliable', label: 'Unreliable', totalIssues };
  }
  if (totalIssues === 0) {
    return { level: 'reliable', label: 'Reliable', totalIssues: 0 };
  }
  // Build short label like "1 conn loss" or "2 no-shows"
  const parts: string[] = [];
  if (lostConn > 0) parts.push(`${lostConn} conn loss${lostConn === 1 ? '' : 'es'}`);
  if (noShow > 0) parts.push(`${noShow} no-show${noShow === 1 ? '' : 's'}`);
  if (didNothing > 0) parts.push(`${didNothing} did-nothing`);
  return { level: 'minor', label: parts.join(' · '), totalIssues };
}

export function ReliabilityChip({ stats }: ReliabilityChipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { level, label } = assess(stats);

  const cls =
    level === 'reliable' ? 'bg-success/15 text-success'
    : level === 'minor' ? 'bg-warning/15 text-warning'
    : 'bg-danger/15 text-danger';

  const Icon = level === 'reliable' ? Check : AlertTriangle;

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}
        aria-expanded={open}
      >
        <Icon size={12} />
        {label}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-surface border border-border rounded-lg shadow-lg p-3 min-w-[220px] text-sm">
          <p className="text-textSecondary mb-2 text-xs">
            {stats.matchesPlayed} match{stats.matchesPlayed === 1 ? '' : 'es'} scouted
          </p>
          <ul className="space-y-1 text-xs">
            <li className="flex justify-between">
              <span className="text-textSecondary">Lost connection</span>
              <span className={`font-semibold ${stats.lostConnectionCount > 0 ? 'text-danger' : ''}`}>
                {stats.lostConnectionCount}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-textSecondary">No robot on field</span>
              <span className={`font-semibold ${stats.noRobotCount > 0 ? 'text-danger' : ''}`}>
                {stats.noRobotCount}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-textSecondary">Did nothing in auto</span>
              <span className={`font-semibold ${stats.autoDidNothingCount > 0 ? 'text-warning' : ''}`}>
                {stats.autoDidNothingCount}
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default ReliabilityChip;
