import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import type { LiveComment } from '../../types/pickList';

interface PicklistActivityFeedProps {
  comments: LiveComment[];
  maxItems?: number;
  windowMs?: number;
}

const HOUR_MS = 60 * 60 * 1000;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PicklistActivityFeed({
  comments,
  maxItems = 5,
  windowMs = HOUR_MS,
}: PicklistActivityFeedProps) {
  const recent = useMemo(() => {
    const cutoff = Date.now() - windowMs;
    return [...comments]
      .filter(c => new Date(c.ts).getTime() >= cutoff)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, maxItems);
  }, [comments, windowMs, maxItems]);

  if (recent.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl border border-border p-4 md:p-5 shadow-card">
      <h2 className="text-sm md:text-base font-bold flex items-center gap-2 mb-3">
        <MessageSquare size={16} className="text-blueAlliance" />
        Picklist activity
        <span className="text-xs text-textMuted font-normal ml-1">last hour</span>
      </h2>
      <ul className="space-y-2 text-sm">
        {recent.map(c => (
          <li key={c.id} className="flex items-start gap-2">
            <span className="text-textMuted text-xs min-w-[60px]">{relativeTime(c.ts)}</span>
            <p className="text-textSecondary flex-1">
              <span className="text-textPrimary font-semibold">
                {c.displayName || c.email.split('@')[0]}
              </span>{' '}
              commented on{' '}
              <Link to={`/teams/${c.teamNumber}`} className="text-blueAlliance hover:underline font-medium">
                {c.teamNumber}
              </Link>
              {': '}
              <span className="text-textSecondary italic">"{c.text.length > 80 ? c.text.slice(0, 80) + '…' : c.text}"</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PicklistActivityFeed;
