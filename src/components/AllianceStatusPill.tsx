import { Trophy } from 'lucide-react';
import type { AllianceStatus } from '../utils/computeAlliancePath';

const STATUS_LABEL: Record<AllianceStatus, string> = {
  'in-upper': 'In upper bracket',
  'in-lower': 'In lower bracket',
  'in-finals': 'In finals',
  'champion': 'Event champion',
  'eliminated': 'Eliminated',
  'awaiting': 'Awaiting first match',
};

const STATUS_CLASSES: Record<AllianceStatus, string> = {
  'in-upper':   'bg-success/15 text-success border-success/30',
  'in-lower':   'bg-warning/15 text-warning border-warning/30',
  'in-finals':  'bg-warning/20 text-warning border-warning/40',
  'champion':   'bg-warning text-background border-warning',
  'eliminated': 'bg-danger/15 text-danger border-danger/30',
  'awaiting':   'bg-surfaceElevated text-textMuted border-border',
};

interface Props {
  status: AllianceStatus;
  className?: string;
}

export default function AllianceStatusPill({ status, className = '' }: Props) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_CLASSES[status]} ${className}`}>
      {status === 'champion' && <Trophy size={10} className="inline mr-1 -mt-0.5" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
