import { Database, FileSpreadsheet } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';

interface Props {
  className?: string;
}

/**
 * Two-state segmented control to flip team statistics between live-only and
 * pre-scout-only data. Lives in page headers so it's always visible —
 * the same setting also drives Monte Carlo predictions.
 *
 * Hidden when there's no pre-scout data loaded (no decision to make).
 *
 * Wired to the same `predictionMode` field used by Admin Settings, so the
 * advanced "blended" / "smart-fallback" modes set there will be replaced if
 * the user clicks here. That's intentional — most users want a simple flip.
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
  // If they're in a blended mode (smart-fallback / blended), show neither pill as fully active
  // and label it so they know.
  const isBlended = usePreScout && (predictionMode === 'smart-fallback' || predictionMode === 'blended');

  const flipTo = (mode: 'live-only' | 'pre-scout-only') => {
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
      {isBlended && (
        <span className="px-2 text-[10px] text-textMuted uppercase tracking-wider" title={`Currently blending — ${predictionMode}`}>
          {predictionMode === 'smart-fallback' ? 'auto' : 'blend'}
        </span>
      )}
    </div>
  );
}
