import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { SourceDelta } from '../utils/strategicInsights';
import EventName from './EventName';

interface PreScoutNewtonDeltaProps {
  delta: SourceDelta;
  liveEventLabel?: string;
}

export function PreScoutNewtonDelta({ delta, liveEventLabel }: PreScoutNewtonDeltaProps) {
  const positive = delta.deltaPct > 10;
  const negative = delta.deltaPct < -10;
  const headlineClass = positive
    ? 'text-success'
    : negative
      ? 'text-warning'
      : 'text-textSecondary';
  const bandClass = positive
    ? 'border-l-success'
    : negative
      ? 'border-l-warning'
      : 'border-l-border';
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  const direction = positive
    ? `Performing ${delta.deltaPct.toFixed(0)}% above pre-scout`
    : negative
      ? `Performing ${Math.abs(delta.deltaPct).toFixed(0)}% below pre-scout`
      : `On par with pre-scout (${delta.deltaPct.toFixed(0)}%)`;

  const eventList = delta.preScoutEvents.length === 1
    ? <EventName eventKey={delta.preScoutEvents[0]} />
    : `${delta.preScoutEvents.length} events`;

  return (
    <div className={`bg-surface rounded-lg border border-border border-l-4 ${bandClass} p-4 md:p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} className={headlineClass} />
        <h3 className={`text-base md:text-lg font-bold ${headlineClass}`}>{direction}</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-textSecondary">Pre-scout</span>{' '}
          <span className="text-textMuted">({eventList}, {delta.preScoutMatches}m)</span>:
        </div>
        <div className="font-semibold text-right">{delta.preScoutAvg.toFixed(1)} pts/match</div>
        <div>
          <span className="text-textSecondary">
            {liveEventLabel ? <EventName eventKey={liveEventLabel} /> : 'Live'}
          </span>{' '}
          <span className="text-textMuted">({delta.liveMatches}m)</span>:
        </div>
        <div className="font-semibold text-right">{delta.liveAvg.toFixed(1)} pts/match</div>
      </div>
    </div>
  );
}

export default PreScoutNewtonDelta;
