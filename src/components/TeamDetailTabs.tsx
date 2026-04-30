export type TeamDetailTabId = 'overview' | 'performance' | 'history' | 'notes';

const TABS: { id: TeamDetailTabId; label: string; shortLabel: string }[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview' },
  { id: 'performance', label: 'Performance', shortLabel: 'Perf' },
  { id: 'history', label: 'Match History', shortLabel: 'History' },
  { id: 'notes', label: 'Notes', shortLabel: 'Notes' },
];

interface TeamDetailTabsProps {
  active: TeamDetailTabId;
  onChange: (id: TeamDetailTabId) => void;
}

export function TeamDetailTabs({ active, onChange }: TeamDetailTabsProps) {
  return (
    <div
      className="flex border-b border-border overflow-x-auto"
      role="tablist"
      aria-label="Team detail sections"
    >
      {TABS.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`team-detail-panel-${tab.id}`}
            id={`team-detail-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`px-4 md:px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              isActive
                ? 'border-success text-success'
                : 'border-transparent text-textSecondary hover:text-textPrimary'
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export default TeamDetailTabs;
