import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MatchScoutingEntry, PitScoutingEntry, TeamStatistics } from '../types/scouting';
import type { TBAEventData } from '../types/tba';
import { generateMockData } from '../data/mockData';
import { calculateAllTeamStatistics } from '../utils/statistics';
import { getAllEventData } from '../utils/tbaApi';

interface AnalyticsState {
  // Raw data
  matchEntries: MatchScoutingEntry[];
  pitEntries: PitScoutingEntry[];

  // TBA data
  tbaData: TBAEventData | null;
  tbaLoading: boolean;
  tbaError: string | null;
  autoRefreshEnabled: boolean;

  // Calculated stats
  teamStatistics: TeamStatistics[];

  // UI state
  selectedTeams: number[];
  eventCode: string;

  // Actions
  loadMockData: () => Promise<void>;
  calculateStats: () => void;
  toggleTeamSelection: (teamNumber: number) => void;
  clearTeamSelection: () => void;
  setEventCode: (code: string) => void;
  fetchTBAData: (eventCode?: string) => Promise<TBAEventData | null>;
  setAutoRefresh: (enabled: boolean) => void;
  clearTBAData: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      // Initial state
      matchEntries: [],
      pitEntries: [],
      teamStatistics: [],
      selectedTeams: [],
      eventCode: '2025txcmp1',
      tbaData: null,
      tbaLoading: false,
      tbaError: null,
      autoRefreshEnabled: false,

      // Load mock data
      loadMockData: async () => {
        const { eventCode } = get();
        const { matchEntries, pitEntries } = await generateMockData(eventCode);
        set({ matchEntries, pitEntries });
        get().calculateStats();
      },

      // Calculate team statistics
      calculateStats: () => {
        const { matchEntries, pitEntries } = get();
        const teamStatistics = calculateAllTeamStatistics(matchEntries, pitEntries);
        set({ teamStatistics });
      },

      // Toggle team selection
      toggleTeamSelection: (teamNumber: number) => {
        const { selectedTeams } = get();
        if (selectedTeams.includes(teamNumber)) {
          set({ selectedTeams: selectedTeams.filter(t => t !== teamNumber) });
        } else {
          set({ selectedTeams: [...selectedTeams, teamNumber] });
        }
      },

      // Clear team selection
      clearTeamSelection: () => {
        set({ selectedTeams: [] });
      },

      // Set event code
      setEventCode: (code: string) => {
        set({ eventCode: code });
      },

      // Fetch TBA data for current or specified event
      fetchTBAData: async (eventCodeOverride?: string) => {
        const code = eventCodeOverride || get().eventCode;
        set({ tbaLoading: true, tbaError: null });

        try {
          const data = await getAllEventData(code);
          set({ tbaData: data, tbaLoading: false });
          return data;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch TBA data';
          set({ tbaError: message, tbaLoading: false });
          return null;
        }
      },

      // Toggle auto-refresh
      setAutoRefresh: (enabled: boolean) => {
        set({ autoRefreshEnabled: enabled });
      },

      // Clear TBA data
      clearTBAData: () => {
        set({ tbaData: null, tbaError: null });
      },
    }),
    {
      name: 'frc-analytics-storage',
      partialize: (state) => ({
        eventCode: state.eventCode,
        selectedTeams: state.selectedTeams,
        tbaData: state.tbaData,
        autoRefreshEnabled: state.autoRefreshEnabled,
      }),
    }
  )
);
