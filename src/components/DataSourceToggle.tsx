import { Database, FileSpreadsheet, GitMerge } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';

interface Props {
  className?: string;
}

/**
 * Three-state segmented control: Live ↔ Pre-Scout ↔ Blend. Lives in page
 * headers so the user can always see and change which data is feeding stats
 * and predictions.
 *
 * - Live  → predictionMode='live-only' (tablet-scouted entries only)
 * - Pre   → predictionMode='pre-scout-only' (video hand-counts only, FMS
 *            attribution explicitly skipped so live data doesn't bleed in)
 * - Blend → predictionMode='blended' (all live + all pre-scout)
 *
 * Hidden when there's no pre-scout data loaded (no decision to make).
 *
 * Note: Admin Settings has a fourth mode, "smart-fallback". If that's set, the
 * toggle highlights nothing and shows an "AUTO" tag so the user knows the
 * choice came from a different control.
 */
export default function DataSourceToggle({ className = '' }: Props) {
  const predictionMode = useAnalyticsStore(s => s.predictionMode);
  const setPredictionMode = useAnalyticsStore(s => s.setPredictionMode);
  const usePreScout = useAnalyticsStore(s => s.usePreScout);
  const setUsePreScout = useAnalyticsStore(s => s.setUsePreScout);
  const preScoutCount = useAnalyticsStore(s => s.preScoutEntries.length);

  if (preScoutCount === 0) return null;

  const showingLive = !usePreScout || predictionMode === 'live-only';
  const showingPreScout = usePreScout && predictionMode === 'pre-scout-only';
  const showingBlend = usePreScout && predictionMode === 'blended';
  const isSmartFallback = usePreScout && predictionMode === 'smart-fallback';

  const flipTo = (mode: 'live-only' | 'pre-scout-only' | 'blended') => {
    if (!usePreScout) setUsePreScout(true);
    setPredictionMode(mode);
  };

  return (
    <div className={`inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-surface ${className}`}>
      <button
        onClick={() => flipTo('live-only')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
          showingLive
            ? 'bg-success/15 text-success'
            : 'text-textSecondary hover:bg-interactive'
        }`}
        title="Use only live (tablet-scouted) data"
      >
        <Database size={12} />
        Live
      </button>
      <button
        onClick={() => flipTo('pre-scout-only')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
          showingPreScout
            ? 'bg-warning/15 text-warning'
            : 'text-textSecondary hover:bg-interactive'
        }`}
        title="Use only pre-scout (hand-counted video) data"
      >
        <FileSpreadsheet size={12} />
        Pre-Scout
      </button>
      <button
        onClick={() => flipTo('blended')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
          showingBlend
            ? 'bg-blueAlliance/15 text-blueAlliance'
            : 'text-textSecondary hover:bg-interactive'
        }`}
        title="Combine live + pre-scout matches with equal weight"
      >
        <GitMerge size={12} />
        Blend
      </button>
      {isSmartFallback && (
        <span className="px-2 text-[10px] text-textMuted uppercase tracking-wider" title="Smart-fallback mode set in Admin Settings">
          auto
        </span>
      )}
    </div>
  );
}
