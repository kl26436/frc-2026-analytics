import type { Alliance } from '../../types/allianceSelection';
import AllianceCard from './AllianceCard';

interface AllianceTrackerProps {
  alliances: Alliance[];
  highlightedAlliance: number | null;
  onHighlightAlliance: (n: number | null) => void;
}

function AllianceTracker({ alliances, highlightedAlliance, onHighlightAlliance }: AllianceTrackerProps) {
  return (
    <div className="bg-surface rounded-lg border border-border p-3 sm:p-4">
      <h3 className="text-sm font-bold text-textSecondary mb-3 uppercase tracking-wide">Alliances</h3>

      {/* Desktop: 2x4 grid */}
      <div className="hidden sm:grid grid-cols-2 gap-2">
        {alliances.map(a => (
          <AllianceCard
            key={a.number}
            alliance={a}
            isHighlighted={highlightedAlliance === a.number}
            onHighlight={() =>
              onHighlightAlliance(highlightedAlliance === a.number ? null : a.number)
            }
          />
        ))}
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="sm:hidden flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {alliances.map(a => (
          <div key={a.number} className="flex-shrink-0 w-[140px]">
            <AllianceCard
              alliance={a}
              isHighlighted={highlightedAlliance === a.number}
              onHighlight={() =>
                onHighlightAlliance(highlightedAlliance === a.number ? null : a.number)
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AllianceTracker;
