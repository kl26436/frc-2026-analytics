import type { FilterConfig } from '../types/pickList';
import type { TeamStatistics } from '../types/scouting';
import type { PitScoutEntry } from '../types/pitScouting';

/** Evaluate a single filter comparison. */
export function evaluateFilter(
  value: number,
  operator: FilterConfig['operator'],
  threshold: number,
): boolean {
  switch (operator) {
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '>':  return value > threshold;
    case '<':  return value < threshold;
  }
}

/** Check if a team's stats pass a single stats-type filter. */
export function doesTeamPassStatsFilter(
  stats: TeamStatistics,
  filter: FilterConfig,
): boolean {
  const value = (stats as unknown as Record<string, number>)[filter.field];
  if (!evaluateFilter(value, filter.operator, filter.threshold)) return false;
  if (filter.additionalConditions) {
    for (const cond of filter.additionalConditions) {
      const v = (stats as unknown as Record<string, number>)[cond.field];
      if (!evaluateFilter(v, cond.operator, cond.threshold)) return false;
    }
  }
  return true;
}

/** Check if a team passes a single filter (any type). */
export function doesTeamPassFilter(
  teamNumber: number,
  filter: FilterConfig,
  allStats: TeamStatistics[],
  pitEntries: PitScoutEntry[],
): boolean {
  const filterType = filter.filterType || 'stats';

  if (filterType === 'pit-boolean') {
    const pit = pitEntries.find(e => e.teamNumber === teamNumber);
    if (!pit) return false;
    const field = filter.pitField || filter.field;
    return !!(pit as unknown as Record<string, unknown>)[field];
  }

  if (filterType === 'pit-select') {
    const pit = pitEntries.find(e => e.teamNumber === teamNumber);
    const field = filter.pitField || 'driveType';
    const value = pit ? (pit as unknown as Record<string, unknown>)[field] : null;
    if (!value) return true; // Show teams with unknown/null values
    if (!filter.pitValues || filter.pitValues.length === 0) return true;
    return filter.pitValues.includes(String(value));
  }

  if (filterType === 'pit-number') {
    const pit = pitEntries.find(e => e.teamNumber === teamNumber);
    if (!pit) return false;
    const field = filter.pitField || filter.field;
    const value = (pit as unknown as Record<string, number>)[field];
    if (value == null) return false;
    return evaluateFilter(value, filter.operator, filter.threshold);
  }

  // Default: stats filter
  const stats = allStats.find(t => t.teamNumber === teamNumber);
  if (!stats) return false;
  return doesTeamPassStatsFilter(stats, filter);
}

/** Check if a team passes ALL active filters. Returns true if no filters are active. */
export function doesTeamPassAllFilters(
  teamNumber: number,
  filters: FilterConfig[],
  allStats: TeamStatistics[],
  pitEntries: PitScoutEntry[] = [],
): boolean {
  const activeFilters = filters.filter(f => f.active);
  if (activeFilters.length === 0) return true;
  return activeFilters.every(f => doesTeamPassFilter(teamNumber, f, allStats, pitEntries));
}

/** Count how many teams in the list pass a single filter. */
export function countTeamsPassingFilter(
  filter: FilterConfig,
  teams: { teamNumber: number }[],
  allStats: TeamStatistics[],
  pitEntries: PitScoutEntry[] = [],
): number {
  return teams.filter(t =>
    doesTeamPassFilter(t.teamNumber, filter, allStats, pitEntries)
  ).length;
}
