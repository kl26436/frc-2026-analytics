import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MatchScoutingEntry, PitScoutingEntry, TeamStatistics } from '../types/scouting';
import { generateMockData } from '../data/mockData';
import { calculateAllTeamStatistics } from '../utils/statistics';

interface AnalyticsState {
  // Raw data
  matchEntries: MatchScoutingEntry[];
  pitEntries: PitScoutingEntry[];

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

      // Load mock data
      loadMockData: async () => {
        const { matchEntries, pitEntries } = await generateMockData();
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
    }),
    {
      name: 'frc-analytics-storage',
      partialize: (state) => ({
        eventCode: state.eventCode,
        selectedTeams: state.selectedTeams,
      }),
    }
  )
);
