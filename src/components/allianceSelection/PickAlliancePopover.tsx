import { useEffect, useRef } from 'react';
import type { Alliance } from '../../types/allianceSelection';

interface PickAlliancePopoverProps {
  alliances: Alliance[];
  onSelect: (allianceNumber: number) => void;
  onClose: () => void;
}

function PickAlliancePopover({ alliances, onSelect, onClose }: PickAlliancePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside or ESC
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const getSlotCount = (a: Alliance) => {
    let count = 0;
    if (a.captain) count++;
    if (a.firstPick) count++;
    if (a.secondPick) count++;
    if (a.backupPick) count++;
    return count;
  };

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-30 bg-surfaceElevated border border-border rounded-lg shadow-xl p-2 min-w-[200px]">
      <p className="text-xs text-textMuted px-2 py-1 mb-1">Pick for alliance:</p>
      <div className="grid grid-cols-2 gap-1">
        {alliances.map(a => {
          const slots = getSlotCount(a);
          const full = slots >= 4;
          return (
            <button
              key={a.number}
              onClick={() => {
                if (!full) {
                  onSelect(a.number);
                  onClose();
                }
              }}
              disabled={full}
              className={`px-3 py-2 rounded text-sm font-semibold transition-colors text-left ${
                full
                  ? 'bg-card text-textMuted cursor-not-allowed'
                  : 'bg-card hover:bg-interactive text-textPrimary'
              }`}
            >
              <div>A{a.number}</div>
              <div className="text-xs text-textSecondary">{slots}/4 filled</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PickAlliancePopover;
