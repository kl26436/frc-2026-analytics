import type { FilterConfig } from '../types/pickList';
import type { TeamStatistics } from '../types/scouting';

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

/** Check if a team's stats pass a single filter. */
export function doesTeamPassFilter(
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

/** Check if a team passes ALL active filters. Returns true if no filters are active. */
export function doesTeamPassAllFilters(
  teamNumber: number,
  filters: FilterConfig[],
  allStats: TeamStatistics[],
): boolean {
  const activeFilters = filters.filter(f => f.active);
  if (activeFilters.length === 0) return true;
  const stats = allStats.find(t => t.teamNumber === teamNumber);
  if (!stats) return false;
  return activeFilters.every(f => doesTeamPassFilter(stats, f));
}

/** Count how many teams in the list pass a single filter. */
export function countTeamsPassingFilter(
  filter: FilterConfig,
  teams: { teamNumber: number }[],
  allStats: TeamStatistics[],
): number {
  return teams.filter(t => {
    const stats = allStats.find(s => s.teamNumber === t.teamNumber);
    if (!stats) return false;
    return doesTeamPassFilter(stats, filter);
  }).length;
}
