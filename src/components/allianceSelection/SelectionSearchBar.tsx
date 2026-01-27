import { Search, GitCompareArrows, X } from 'lucide-react';

interface SelectionSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  selectedCount: number;
  onClearCompare: () => void;
}

function SelectionSearchBar({ value, onChange, selectedCount, onClearCompare }: SelectionSearchBarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Search input */}
      <div className="flex-1 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search team # or name..."
          className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Compare indicator */}
      {selectedCount > 0 && (
        <button
          onClick={onClearCompare}
          className="flex items-center gap-1.5 px-3 py-2 bg-blueAlliance/20 border border-blueAlliance/30 text-blueAlliance rounded-lg text-sm font-semibold hover:bg-blueAlliance/30 transition-colors"
        >
          <GitCompareArrows size={14} />
          {selectedCount}/2
          <X size={12} />
        </button>
      )}

      {selectedCount === 0 && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-lg text-sm text-textMuted">
          <GitCompareArrows size={14} />
          Compare
        </div>
      )}
    </div>
  );
}

export default SelectionSearchBar;
