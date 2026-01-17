import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PickList, PickListTeam, PickListConfig } from '../types/pickList';
import type { TBAEventRankings } from '../types/tba';
import { teamKeyToNumber } from '../utils/tbaApi';

interface PickListState {
  pickList: PickList | null;
  tbaApiKey: string;

  // Actions
  initializePickList: (eventKey: string, tier1Name?: string, tier2Name?: string, tier3Name?: string) => void;
  setTierNames: (tier1: string, tier2: string, tier3: string) => void;
  setTBAApiKey: (key: string) => void;

  // Team management
  addTeamToTier: (teamNumber: number, tier: 'tier1' | 'tier2' | 'tier3') => void;
  moveTeam: (teamNumber: number, newTier: 'tier1' | 'tier2' | 'tier3', newRank: number) => void;
  removeTeam: (teamNumber: number) => void;

  // Team metadata
  updateNotes: (teamNumber: number, notes: string) => void;
  togglePicked: (teamNumber: number, pickedBy?: number) => void;
  addTag: (teamNumber: number, tag: string) => void;
  removeTag: (teamNumber: number, tag: string) => void;
  toggleFlag: (teamNumber: number) => void;

  // TBA integration
  importFromTBARankings: (rankings: TBAEventRankings) => void;

  // Sorting
  sortTier: (tier: 'tier1' | 'tier2' | 'tier3', sortBy: 'rank' | 'teamNumber' | 'points' | 'climb' | 'auto') => void;

  // Bulk operations
  clearPickList: () => void;
  exportPickList: () => string; // Returns JSON string
  importPickList: (jsonString: string) => void;
}

export const usePickListStore = create<PickListState>()(
  persist(
    (set, get) => ({
      pickList: null,
      tbaApiKey: '',

      // Initialize a new pick list
      initializePickList: (eventKey, tier1Name = 'Steak', tier2Name = 'Potatoes', tier3Name = 'Chicken Nuggets') => {
        const config: PickListConfig = {
          eventKey,
          tier1Name,
          tier2Name,
          tier3Name,
          lastUpdated: new Date().toISOString(),
        };

        set({
          pickList: {
            config,
            teams: [],
          },
        });
      },

      // Set custom tier names
      setTierNames: (tier1, tier2, tier3) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            config: {
              ...pickList.config,
              tier1Name: tier1,
              tier2Name: tier2,
              tier3Name: tier3,
              lastUpdated: new Date().toISOString(),
            },
          },
        });
      },

      // Set TBA API key
      setTBAApiKey: (key) => {
        set({ tbaApiKey: key });
      },

      // Add team to a tier
      addTeamToTier: (teamNumber, tier) => {
        const { pickList } = get();
        if (!pickList) return;

        // Check if team already exists
        if (pickList.teams.find(t => t.teamNumber === teamNumber)) {
          return;
        }

        // Get highest rank in tier
        const tierTeams = pickList.teams.filter(t => t.tier === tier);
        const maxRank = tierTeams.length > 0 ? Math.max(...tierTeams.map(t => t.rank)) : 0;

        const newTeam: PickListTeam = {
          teamNumber,
          tier,
          rank: maxRank + 1,
          notes: '',
          isPicked: false,
          tags: [],
          flagged: false,
        };

        set({
          pickList: {
            ...pickList,
            teams: [...pickList.teams, newTeam],
            config: {
              ...pickList.config,
              lastUpdated: new Date().toISOString(),
            },
          },
        });
      },

      // Move team to new tier/rank
      moveTeam: (teamNumber, newTier, newRank) => {
        const { pickList } = get();
        if (!pickList) return;

        const updatedTeams = pickList.teams.map(team => {
          if (team.teamNumber === teamNumber) {
            return { ...team, tier: newTier, rank: newRank };
          }
          // Adjust ranks of other teams in the same tier
          if (team.tier === newTier && team.rank >= newRank) {
            return { ...team, rank: team.rank + 1 };
          }
          return team;
        });

        set({
          pickList: {
            ...pickList,
            teams: updatedTeams,
            config: {
              ...pickList.config,
              lastUpdated: new Date().toISOString(),
            },
          },
        });
      },

      // Remove team from pick list
      removeTeam: (teamNumber) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.filter(t => t.teamNumber !== teamNumber),
          },
        });
      },

      // Update team notes
      updateNotes: (teamNumber, notes) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t =>
              t.teamNumber === teamNumber ? { ...t, notes } : t
            ),
          },
        });
      },

      // Toggle picked status
      togglePicked: (teamNumber, pickedBy) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t =>
              t.teamNumber === teamNumber
                ? { ...t, isPicked: !t.isPicked, pickedBy: !t.isPicked ? pickedBy : undefined }
                : t
            ),
          },
        });
      },

      // Add tag
      addTag: (teamNumber, tag) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t =>
              t.teamNumber === teamNumber && !t.tags.includes(tag)
                ? { ...t, tags: [...t.tags, tag] }
                : t
            ),
          },
        });
      },

      // Remove tag
      removeTag: (teamNumber, tag) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t =>
              t.teamNumber === teamNumber
                ? { ...t, tags: t.tags.filter(tg => tg !== tag) }
                : t
            ),
          },
        });
      },

      // Toggle red flag
      toggleFlag: (teamNumber) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t =>
              t.teamNumber === teamNumber ? { ...t, flagged: !t.flagged } : t
            ),
          },
        });
      },

      // Import teams from TBA rankings (top 12 to tier 2)
      importFromTBARankings: (rankings) => {
        const { pickList } = get();
        if (!pickList) return;

        const top12 = rankings.rankings
          .slice(0, 12)
          .map((ranking, index) => {
            const teamNumber = teamKeyToNumber(ranking.team_key);

            // Check if team already in pick list
            if (pickList.teams.find(t => t.teamNumber === teamNumber)) {
              return null;
            }

            const team: PickListTeam = {
              teamNumber,
              tier: 'tier2',
              rank: index + 1,
              notes: `Rank ${ranking.rank} - ${ranking.wins}W/${ranking.losses}L`,
              isPicked: false,
              tags: [],
              flagged: false,
            };
            return team;
          })
          .filter(t => t !== null) as PickListTeam[];

        set({
          pickList: {
            ...pickList,
            teams: [...pickList.teams, ...top12],
            config: {
              ...pickList.config,
              lastUpdated: new Date().toISOString(),
            },
          },
        });
      },

      // Sort a tier
      sortTier: (tier, sortBy) => {
        const { pickList } = get();
        if (!pickList) return;

        // This is a placeholder - actual sorting would need access to team statistics
        // For now, just re-rank by team number
        const tierTeams = pickList.teams.filter(t => t.tier === tier);
        const otherTeams = pickList.teams.filter(t => t.tier !== tier);

        tierTeams.sort((a, b) => {
          if (sortBy === 'teamNumber') {
            return a.teamNumber - b.teamNumber;
          }
          return a.rank - b.rank;
        });

        // Re-assign ranks
        tierTeams.forEach((team, index) => {
          team.rank = index + 1;
        });

        set({
          pickList: {
            ...pickList,
            teams: [...otherTeams, ...tierTeams],
          },
        });
      },

      // Clear entire pick list
      clearPickList: () => {
        set({ pickList: null });
      },

      // Export pick list as JSON
      exportPickList: () => {
        const { pickList } = get();
        return JSON.stringify(pickList, null, 2);
      },

      // Import pick list from JSON
      importPickList: (jsonString) => {
        try {
          const pickList = JSON.parse(jsonString) as PickList;
          set({ pickList });
        } catch (error) {
          console.error('Failed to import pick list:', error);
        }
      },
    }),
    {
      name: 'frc-picklist-storage',
      partialize: (state) => ({
        pickList: state.pickList,
        tbaApiKey: state.tbaApiKey,
      }),
    }
  )
);
