import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AllianceSelectionUIState {
  // Persisted
  lastSessionCode: string | null;
  lastDisplayName: string;
  lastTeamNumber: string;
  activeSessionId: string | null; // Firestore doc ID for auto-reconnect

  // Transient UI state
  searchQuery: string;
  selectedTeamsForCompare: number[];
  showComparisonModal: boolean;
  highlightedAlliance: number | null;
  showParticipants: boolean;

  // Actions
  setLastSessionCode: (code: string | null) => void;
  setLastDisplayName: (name: string) => void;
  setLastTeamNumber: (num: string) => void;
  setActiveSessionId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleTeamForCompare: (teamNumber: number) => void;
  clearCompareSelection: () => void;
  setShowComparisonModal: (show: boolean) => void;
  setHighlightedAlliance: (alliance: number | null) => void;
  setShowParticipants: (show: boolean) => void;
}

export const useAllianceSelectionStore = create<AllianceSelectionUIState>()(
  persist(
    (set, get) => ({
      lastSessionCode: null,
      lastDisplayName: '',
      lastTeamNumber: '',
      activeSessionId: null,
      searchQuery: '',
      selectedTeamsForCompare: [],
      showComparisonModal: false,
      highlightedAlliance: null,
      showParticipants: false,

      setLastSessionCode: (code) => set({ lastSessionCode: code }),
      setLastDisplayName: (name) => set({ lastDisplayName: name }),
      setLastTeamNumber: (num) => set({ lastTeamNumber: num }),
      setActiveSessionId: (id) => set({ activeSessionId: id }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      toggleTeamForCompare: (teamNumber) => {
        const { selectedTeamsForCompare } = get();
        if (selectedTeamsForCompare.includes(teamNumber)) {
          set({ selectedTeamsForCompare: selectedTeamsForCompare.filter(t => t !== teamNumber) });
        } else if (selectedTeamsForCompare.length < 2) {
          const updated = [...selectedTeamsForCompare, teamNumber];
          set({
            selectedTeamsForCompare: updated,
            showComparisonModal: updated.length === 2,
          });
        }
      },

      clearCompareSelection: () => set({
        selectedTeamsForCompare: [],
        showComparisonModal: false,
      }),

      setShowComparisonModal: (show) => set({ showComparisonModal: show }),
      setHighlightedAlliance: (alliance) => set({ highlightedAlliance: alliance }),
      setShowParticipants: (show) => set({ showParticipants: show }),
    }),
    {
      name: 'frc-alliance-selection-ui',
      partialize: (state) => ({
        lastSessionCode: state.lastSessionCode,
        lastDisplayName: state.lastDisplayName,
        lastTeamNumber: state.lastTeamNumber,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);
