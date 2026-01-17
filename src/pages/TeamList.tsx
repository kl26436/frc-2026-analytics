import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { useMetricsStore } from '../store/useMetricsStore';
import { ArrowUpDown, Search, CheckSquare, Square, Plus, Sliders } from 'lucide-react';
import type { TeamStatistics } from '../types/scouting';

type SortDirection = 'asc' | 'desc';

function TeamList() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const selectedTeams = useAnalyticsStore(state => state.selectedTeams);
  const toggleTeamSelection = useAnalyticsStore(state => state.toggleTeamSelection);
  const addTeamToTier = usePickListStore(state => state.addTeamToTier);
  const getEnabledColumns = useMetricsStore(state => state.getEnabledColumns);

  const enabledColumns = getEnabledColumns();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('avgTotalPoints');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showAddMenu, setShowAddMenu] = useState<number | null>(null);

  // Sort and filter teams
  const filteredAndSortedTeams = useMemo(() => {
    let teams = [...teamStatistics];

    // Filter by search query
    if (searchQuery) {
      teams = teams.filter(
        team =>
          team.teamNumber.toString().includes(searchQuery) ||
          team.teamName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    teams.sort((a, b) => {
      let aValue = (a as any)[sortField];
      let bValue = (b as any)[sortField];

      // Handle undefined values
      if (aValue === undefined) aValue = 0;
      if (bValue === undefined) bValue = 0;

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return teams;
  }, [teamStatistics, searchQuery, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortButton = ({ field, label }: { field: string; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-textPrimary transition-colors"
    >
      {label}
      {sortField === field && (
        <ArrowUpDown size={14} className={sortDirection === 'desc' ? 'rotate-180' : ''} />
      )}
    </button>
  );

  // Helper to format metric values
  const formatMetricValue = (value: number, format: 'number' | 'percentage' | 'time', decimals: number) => {
    const formatted = value.toFixed(decimals);
    switch (format) {
      case 'percentage':
        return `${formatted}%`;
      case 'time':
        return `${formatted}s`;
      default:
        return formatted;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Team Rankings</h1>
        <div className="flex items-center gap-4">
          <span className="text-textSecondary">
            {selectedTeams.length} team{selectedTeams.length !== 1 ? 's' : ''} selected
          </span>
          <Link
            to="/metrics"
            className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors text-sm border border-border"
          >
            <Sliders size={16} />
            Customize Columns
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-textMuted" size={20} />
        <input
          type="text"
          placeholder="Search by team number or name..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-white"
        />
      </div>

      {/* Team Table */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surfaceElevated border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-textSecondary text-sm font-semibold">
                  Select
                </th>
                <th className="px-4 py-3 text-left text-textSecondary text-sm font-semibold">
                  <SortButton field="teamNumber" label="Team" />
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  Matches
                </th>
                {enabledColumns.map(column => (
                  <th key={column.id} className="px-4 py-3 text-right text-textSecondary text-sm font-semibold">
                    <SortButton field={column.field} label={column.label} />
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSortedTeams.map((team, index) => (
                <tr
                  key={team.teamNumber}
                  className={`hover:bg-interactive transition-colors ${
                    selectedTeams.includes(team.teamNumber) ? 'bg-surfaceElevated' : ''
                  }`}
                >
                  <td className="px-4 py-4">
                    <button
                      onClick={() => toggleTeamSelection(team.teamNumber)}
                      className="text-textPrimary hover:text-success transition-colors"
                    >
                      {selectedTeams.includes(team.teamNumber) ? (
                        <CheckSquare size={20} className="text-success" />
                      ) : (
                        <Square size={20} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <Link to={`/teams/${team.teamNumber}`} className="block hover:text-blueAlliance transition-colors">
                      <p className="font-bold">{team.teamNumber}</p>
                      {team.teamName && (
                        <p className="text-sm text-textSecondary">{team.teamName}</p>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-center text-textSecondary">
                    {team.matchesPlayed}
                  </td>
                  {enabledColumns.map(column => {
                    const value = (team as any)[column.field];
                    return (
                      <td key={column.id} className="px-4 py-4 text-right">
                        {formatMetricValue(value || 0, column.format, column.decimals)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-4 text-center relative">
                    <button
                      onClick={() => setShowAddMenu(showAddMenu === team.teamNumber ? null : team.teamNumber)}
                      className="p-2 text-textMuted hover:text-success rounded transition-colors"
                      title="Add to Pick List"
                    >
                      <Plus size={20} />
                    </button>
                    {showAddMenu === team.teamNumber && (
                      <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-lg z-10">
                        <button
                          onClick={() => {
                            addTeamToTier(team.teamNumber, 'tier1');
                            setShowAddMenu(null);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors"
                        >
                          Add to Steak
                        </button>
                        <button
                          onClick={() => {
                            addTeamToTier(team.teamNumber, 'tier2');
                            setShowAddMenu(null);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors"
                        >
                          Add to Potatoes
                        </button>
                        <button
                          onClick={() => {
                            addTeamToTier(team.teamNumber, 'tier3');
                            setShowAddMenu(null);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors"
                        >
                          Add to Chicken Nuggets
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results count */}
      <div className="text-center text-textSecondary">
        Showing {filteredAndSortedTeams.length} of {teamStatistics.length} teams
      </div>
    </div>
  );
}

export default TeamList;
