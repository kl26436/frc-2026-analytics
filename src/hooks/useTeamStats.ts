import { useAnalyticsStore } from '../store/useAnalyticsStore';
import type { RealTeamStatistics } from '../types/scoutingReal';

/**
 * Hook that returns real team statistics from Firestore scout data.
 * Consumer pages can use this hook instead of reaching into the store directly.
 */
export function useTeamStats(): {
  stats: RealTeamStatistics[];
  loading: boolean;
} {
  const realStats = useAnalyticsStore(s => s.realTeamStatistics);
  const realDataLoading = useAnalyticsStore(s => s.realDataLoading);

  return { stats: realStats, loading: realDataLoading };
}

/**
 * Get a single team's stats.
 */
export function useTeamStat(teamNumber: number): RealTeamStatistics | undefined {
  const { stats } = useTeamStats();
  return stats.find(s => s.teamNumber === teamNumber);
}
