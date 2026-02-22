import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { useMetricsStore } from '../store/useMetricsStore';
import { ArrowUp, ArrowDown, Search, Plus, Sliders, LayoutGrid, Table2, X } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import ComparisonModal from '../components/ComparisonModal';

type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';
type SortCriteria = { field: string; direction: SortDirection };

function TeamList() {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const addTeamToTier = usePickListStore(state => state.addTeamToTier);
  const pickList = usePickListStore(state => state.pickList);

  const tierNames = {
    tier1: pickList?.config?.tier1Name || 'Steak',
    tier2: pickList?.config?.tier2Name || 'Potatoes',
    tier3: pickList?.config?.tier3Name || 'Chicken Nuggets',
  };
  const getEnabledColumns = useMetricsStore(state => state.getEnabledColumns);

  const teamRankMap = useMemo(() => {
    const map = new Map<number, number>();
    if (tbaData?.rankings?.rankings) {
      tbaData.rankings.rankings.forEach(r => {
        map.set(teamKeyToNumber(r.team_key), r.rank);
      });
    }
    return map;
  }, [tbaData]);

  const enabledColumns = getEnabledColumns();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortCriteria, setSortCriteria] = useState<SortCriteria[]>([
    { field: 'avgTotalPoints', direction: 'desc' }
  ]);
  const [showAddMenu, setShowAddMenu] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Click-to-compare state (max 2 teams)
  const [compareTeams, setCompareTeams] = useState<number[]>([]);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  const toggleCompare = (teamNumber: number) => {
    setCompareTeams(prev => {
      if (prev.includes(teamNumber)) {
        return prev.filter(t => t !== teamNumber);
      }
      if (prev.length >= 2) return prev;
      return [...prev, teamNumber];
    });
  };

  // Auto-open modal when 2 teams selected
  useEffect(() => {
    if (compareTeams.length === 2) {
      setShowComparisonModal(true);
    }
  }, [compareTeams]);

  // Sort and filter teams
  const filteredAndSortedTeams = useMemo(() => {
    let teams = [...teamStatistics];

    if (searchQuery) {
      teams = teams.filter(
        team =>
          team.teamNumber.toString().includes(searchQuery) ||
          team.teamName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    teams.sort((a, b) => {
      for (const criteria of sortCriteria) {
        let aValue: number;
        let bValue: number;

        if (criteria.field === 'eventRank') {
          aValue = teamRankMap.get(a.teamNumber) ?? 999;
          bValue = teamRankMap.get(b.teamNumber) ?? 999;
        } else {
          aValue = (a as any)[criteria.field];
          bValue = (b as any)[criteria.field];
        }

        if (aValue === undefined) aValue = 0;
        if (bValue === undefined) bValue = 0;

        if (aValue !== bValue) {
          if (criteria.direction === 'asc') {
            return aValue > bValue ? 1 : -1;
          } else {
            return aValue < bValue ? 1 : -1;
          }
        }
      }
      return 0;
    });

    return teams;
  }, [teamStatistics, searchQuery, sortCriteria, teamRankMap]);

  const handleSort = (field: string, shiftKey: boolean) => {
    setSortCriteria(prev => {
      const existingIndex = prev.findIndex(c => c.field === field);

      if (existingIndex !== -1) {
        const newCriteria = [...prev];
        newCriteria[existingIndex] = {
          ...newCriteria[existingIndex],
          direction: newCriteria[existingIndex].direction === 'asc' ? 'desc' : 'asc'
        };
        return newCriteria;
      }

      if (shiftKey && prev.length < 3) {
        return [...prev, { field, direction: 'desc' }];
      }

      return [{ field, direction: 'desc' }];
    });
  };

  const removeSortCriteria = (field: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSortCriteria(prev => {
      const filtered = prev.filter(c => c.field !== field);
      return filtered.length > 0 ? filtered : [{ field: 'avgTotalPoints', direction: 'desc' }];
    });
  };

  const SortButton = ({ field, label }: { field: string; label: string }) => {
    const criteriaIndex = sortCriteria.findIndex(c => c.field === field);
    const isActive = criteriaIndex !== -1;
    const criteria = isActive ? sortCriteria[criteriaIndex] : null;
    const sortNumber = criteriaIndex + 1;

    return (
      <button
        onClick={(e) => handleSort(field, e.shiftKey)}
        className="flex items-center gap-1 hover:text-textPrimary transition-colors group"
        title={isActive ? "Click to toggle direction, Shift+click to add secondary sort" : "Click to sort, Shift+click to add as secondary sort"}
      >
        {label}
        {isActive && (
          <span className="flex items-center gap-0.5">
            {sortCriteria.length > 1 && (
              <span className="text-xs text-warning font-bold">{sortNumber}</span>
            )}
            {criteria?.direction === 'desc' ? (
              <ArrowDown size={14} className="text-warning" />
            ) : (
              <ArrowUp size={14} className="text-warning" />
            )}
            {sortCriteria.length > 1 && (
              <button
                onClick={(e) => removeSortCriteria(field, e)}
                className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity"
                title="Remove this sort"
              >
                <X size={12} />
              </button>
            )}
          </span>
        )}
      </button>
    );
  };

  const formatMetricValue = (value: number, format: 'number' | 'percentage' | 'time', decimals: number) => {
    const formatted = value.toFixed(decimals);
    switch (format) {
      case 'percentage': return `${formatted}%`;
      case 'time': return `${formatted}s`;
      default: return formatted;
    }
  };

  const compareTeam1 = teamStatistics.find(t => t.teamNumber === compareTeams[0]);
  const compareTeam2 = teamStatistics.find(t => t.teamNumber === compareTeams[1]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Team List</h1>
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          {/* Compare indicator */}
          {compareTeams.length > 0 ? (
            <span className="text-blueAlliance text-sm font-medium">
              Click teams to compare ({compareTeams.length}/2)
              <button
                onClick={() => setCompareTeams([])}
                className="ml-2 text-textMuted hover:text-danger transition-colors"
                title="Clear selection"
              >
                <X size={14} className="inline" />
              </button>
            </span>
          ) : (
            <span className="text-textSecondary text-sm">
              Click any team to compare
            </span>
          )}

          {/* View Toggle */}
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'cards' ? 'bg-interactive' : 'hover:bg-surfaceElevated'
              }`}
              title="Card view"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'table' ? 'bg-interactive' : 'hover:bg-surfaceElevated'
              }`}
              title="Table view"
            >
              <Table2 size={18} />
            </button>
          </div>

          <Link
            to="/metrics"
            className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-interactive rounded-lg transition-colors text-sm border border-border"
          >
            <Sliders size={16} />
            <span className="hidden sm:inline">Customize Columns</span>
            <span className="sm:hidden">Columns</span>
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

      {/* Active Sort Indicators */}
      {sortCriteria.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-textSecondary">Sorting by:</span>
          {sortCriteria.map((criteria, index) => (
            <span
              key={criteria.field}
              className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded"
            >
              <span className="text-warning font-bold">{index + 1}.</span>
              <span>{criteria.field === 'eventRank' ? 'Rank' :
                     criteria.field === 'teamNumber' ? 'Team' :
                     criteria.field === 'matchesPlayed' ? 'Matches' :
                     enabledColumns.find(c => c.field === criteria.field)?.label || criteria.field}</span>
              {criteria.direction === 'desc' ? (
                <ArrowDown size={12} className="text-textSecondary" />
              ) : (
                <ArrowUp size={12} className="text-textSecondary" />
              )}
              <button
                onClick={(e) => removeSortCriteria(criteria.field, e)}
                className="ml-1 hover:text-danger transition-colors"
                title="Remove this sort"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {sortCriteria.length < 3 && (
            <span className="text-textMuted text-xs">(Shift+click column to add)</span>
          )}
        </div>
      )}

      {/* Team Display - Table or Cards */}
      {viewMode === 'table' ? (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-surfaceElevated border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-textSecondary text-sm font-semibold">
                  <SortButton field="teamNumber" label="Team" />
                </th>
                <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">
                  <SortButton field="eventRank" label="Rank" />
                </th>
                <th className="px-4 py-3 text-center text-textSecondary text-sm font-semibold">
                  <SortButton field="matchesPlayed" label="Matches" />
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
              {filteredAndSortedTeams.map((team) => {
                const isSelected = compareTeams.includes(team.teamNumber);
                return (
                  <tr
                    key={team.teamNumber}
                    onClick={() => toggleCompare(team.teamNumber)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blueAlliance/10 border-l-2 border-l-blueAlliance'
                        : 'hover:bg-interactive'
                    }`}
                  >
                    <td className="px-4 py-4">
                      <Link
                        to={`/teams/${team.teamNumber}`}
                        className="block hover:text-blueAlliance transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <p className="font-bold">{team.teamNumber}</p>
                        {team.teamName && (
                          <p className="text-sm text-textSecondary">{team.teamName}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-4 text-center">
                      {teamRankMap.get(team.teamNumber) ? (
                        <span className="font-bold text-warning">#{teamRankMap.get(team.teamNumber)}</span>
                      ) : (
                        <span className="text-textMuted">-</span>
                      )}
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
                    <td className="px-4 py-4 text-center relative" onClick={e => e.stopPropagation()}>
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
                            Add to {tierNames.tier1}
                          </button>
                          <button
                            onClick={() => {
                              addTeamToTier(team.teamNumber, 'tier2');
                              setShowAddMenu(null);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors"
                          >
                            Add to {tierNames.tier2}
                          </button>
                          <button
                            onClick={() => {
                              addTeamToTier(team.teamNumber, 'tier3');
                              setShowAddMenu(null);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors"
                          >
                            Add to {tierNames.tier3}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedTeams.map((team) => {
            const isSelected = compareTeams.includes(team.teamNumber);
            return (
              <div
                key={team.teamNumber}
                onClick={() => toggleCompare(team.teamNumber)}
                className={`bg-surface rounded-lg border p-4 space-y-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blueAlliance ring-2 ring-blueAlliance bg-blueAlliance/10'
                    : 'border-border hover:bg-interactive'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between">
                  <Link
                    to={`/teams/${team.teamNumber}`}
                    className="flex-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold hover:text-blueAlliance transition-colors">
                        {team.teamNumber}
                      </h3>
                      {teamRankMap.get(team.teamNumber) && (
                        <span className="text-sm font-bold text-warning">#{teamRankMap.get(team.teamNumber)}</span>
                      )}
                    </div>
                    {team.teamName && (
                      <p className="text-sm text-textSecondary line-clamp-1">{team.teamName}</p>
                    )}
                  </Link>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-blueAlliance/20 text-blueAlliance">
                      Compare
                    </span>
                  )}
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-surfaceElevated rounded p-2">
                    <p className="text-textSecondary text-xs">Matches</p>
                    <p className="font-semibold">{team.matchesPlayed}</p>
                  </div>
                  {enabledColumns.slice(0, 3).map(column => {
                    const value = (team as any)[column.field];
                    return (
                      <div key={column.id} className="bg-surfaceElevated rounded p-2">
                        <p className="text-textSecondary text-xs truncate">{column.label}</p>
                        <p className="font-semibold">
                          {formatMetricValue(value || 0, column.format, column.decimals)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setShowAddMenu(showAddMenu === team.teamNumber ? null : team.teamNumber)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surfaceElevated hover:bg-interactive rounded transition-colors text-sm"
                  >
                    <Plus size={16} />
                    Add to Pick List
                  </button>
                  {showAddMenu === team.teamNumber && (
                    <div className="absolute bottom-full mb-2 w-full bg-surface border border-border rounded-lg shadow-lg z-10">
                      <button
                        onClick={() => {
                          addTeamToTier(team.teamNumber, 'tier1');
                          setShowAddMenu(null);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors rounded-t-lg"
                      >
                        Add to {tierNames.tier1}
                      </button>
                      <button
                        onClick={() => {
                          addTeamToTier(team.teamNumber, 'tier2');
                          setShowAddMenu(null);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors"
                      >
                        Add to {tierNames.tier2}
                      </button>
                      <button
                        onClick={() => {
                          addTeamToTier(team.teamNumber, 'tier3');
                          setShowAddMenu(null);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-interactive transition-colors rounded-b-lg"
                      >
                        Add to {tierNames.tier3}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Results count */}
      <div className="text-center text-textSecondary">
        Showing {filteredAndSortedTeams.length} of {teamStatistics.length} teams
      </div>

      {/* Comparison Modal */}
      {showComparisonModal && compareTeam1 && compareTeam2 && (
        <ComparisonModal
          team1={compareTeam1}
          team2={compareTeam2}
          onClose={() => {
            setShowComparisonModal(false);
            setCompareTeams([]);
          }}
        />
      )}
    </div>
  );
}

export default TeamList;
