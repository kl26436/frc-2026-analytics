import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { TrendAnalysis } from '../utils/strategicInsights';

interface TrendChipProps {
  analysis: TrendAnalysis;
  size?: 'sm' | 'md';
}

export function TrendChip({ analysis, size = 'md' }: TrendChipProps) {
  const cls = colorClass(analysis.direction);
  const Icon = iconFor(analysis.direction);
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding} ${cls}`}
    >
      <Icon size={size === 'sm' ? 12 : 14} />
      <span className="capitalize">{analysis.direction}</span>
      <span className="opacity-70">·</span>
      <span className="opacity-90">{analysis.reasoning}</span>
    </span>
  );
}

function colorClass(direction: TrendAnalysis['direction']): string {
  if (direction === 'improving') return 'bg-success/15 text-success';
  if (direction === 'declining') return 'bg-danger/15 text-danger';
  if (direction === 'volatile') return 'bg-warning/15 text-warning';
  return 'bg-surfaceElevated text-textSecondary';
}

function iconFor(direction: TrendAnalysis['direction']) {
  if (direction === 'improving') return TrendingUp;
  if (direction === 'declining') return TrendingDown;
  if (direction === 'volatile') return AlertTriangle;
  return Minus;
}

export default TrendChip;
