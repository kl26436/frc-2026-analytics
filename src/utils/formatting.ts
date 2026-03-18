// ── Shared formatting utilities ──────────────────────────────────────────────

import type { MetricColumn } from '../types/metrics';

/** Format a metric value by its column definition (number, percentage, time, count). */
export function formatMetricValue(
  value: number,
  format: MetricColumn['format'],
  decimals: number,
  matchesPlayed?: number,
): string {
  if (format === 'count') {
    return `${Math.round(value)}/${matchesPlayed ?? '?'}`;
  }
  if (format === 'climbLevel') {
    const level = Math.round(value);
    const labels: Record<number, string> = { 0: 'None', 1: 'L1', 2: 'L2', 3: 'L3' };
    return labels[level] ?? `L${level}`;
  }
  const formatted = value.toFixed(decimals);
  switch (format) {
    case 'percentage': return `${formatted}%`;
    case 'time': return `${formatted}s`;
    default: return formatted;
  }
}

/** Format a timestamp string as a relative time (e.g. "5m ago", "2h ago"). */
export function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Format a timestamp string as locale time (e.g. "3:45 PM"). */
export function formatTimestamp(ts: string | null): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Format seconds as m:ss duration (e.g. 125 → "2:05"). */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Format a probability (0–1) as a percentage string (e.g. 0.85 → "85%"). */
export function formatProb(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

// ── Match utilities ─────────────────────────────────────────────────────────────

export const COMP_ORDER: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };

/** Format a TBA match as a human-readable label (e.g. "Q5", "M3", "F2"). */
export function matchLabel(m: { comp_level: string; set_number: number; match_number: number }): string {
  if (m.comp_level === 'qm') return `Q${m.match_number}`;
  // FRC double-elim: TBA uses sf with set_number 1-13 for bracket matches → show as M#
  if (m.comp_level === 'sf') return `M${m.set_number}`;
  // Finals: show as F1, F2, F3 (match_number is the game within best-of-3)
  if (m.comp_level === 'f') return `F${m.match_number}`;
  // Fallback for ef/qf (older formats)
  const pfx: Record<string, string> = { ef: 'E', qf: 'QF' };
  return `${pfx[m.comp_level] ?? m.comp_level.toUpperCase()}${m.set_number}-${m.match_number}`;
}

/** Numeric sort key for ordering matches by comp level, set, then match number. */
export function matchSortKey(m: { comp_level: string; set_number: number; match_number: number }): number {
  return (COMP_ORDER[m.comp_level] ?? 0) * 100000 + m.set_number * 100 + m.match_number;
}
