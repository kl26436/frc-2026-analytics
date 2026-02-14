import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PickList, PickListTeam, PickListConfig } from '../types/pickList';
import type { TBAEventRankings } from '../types/tba';
import type { TeamStatistics } from '../types/scouting';
import { teamKeyToNumber } from '../utils/tbaApi';

// Red flag auto-detection thresholds
export interface RedFlagThresholds {
  diedRate: number; // Flag if >= this percentage
  mechanicalIssuesRate: number;
  tippedRate: number;
  noShowRate: number;
}

export const DEFAULT_RED_FLAG_THRESHOLDS: RedFlagThresholds = {
  diedRate: 20, // Flag if died 20% or more of matches
  mechanicalIssuesRate: 25, // Flag if mechanical issues 25% or more
  tippedRate: 15, // Flag if tipped 15% or more
  noShowRate: 10, // Flag if no-showed 10% or more
};

interface PickListState {
  pickList: PickList | null;
  tbaApiKey: string;
  redFlagThresholds: RedFlagThresholds;

  // Actions
  initializePickList: (eventKey: string, tier1Name?: string, tier2Name?: string, tier3Name?: string, tier4Name?: string) => void;
  setTierNames: (tier1: string, tier2: string, tier3: string, tier4: string) => void;
  setTBAApiKey: (key: string) => void;

  // Team management
  addTeamToTier: (teamNumber: number, tier: 'tier1' | 'tier2' | 'tier3' | 'tier4', notes?: string) => void;
  moveTeam: (teamNumber: number, newTier: 'tier1' | 'tier2' | 'tier3' | 'tier4', newRank: number) => void;
  removeTeam: (teamNumber: number) => void;
  swapTeamRanks: (teamNumber1: number, teamNumber2: number) => void;
  moveTeamAbove: (winnerTeamNumber: number, loserTeamNumber: number) => void;

  // Team metadata
  updateNotes: (teamNumber: number, notes: string) => void;
  togglePicked: (teamNumber: number, pickedBy?: number) => void;
  addTag: (teamNumber: number, tag: string) => void;
  removeTag: (teamNumber: number, tag: string) => void;
  toggleFlag: (teamNumber: number) => void;

  // Red flag auto-detection
  setRedFlagThresholds: (thresholds: RedFlagThresholds) => void;
  autoFlagTeams: (teamStatistics: TeamStatistics[]) => number; // Returns count of newly flagged teams

  // TBA integration
  importFromTBARankings: (rankings: TBAEventRankings) => void;

  // Sorting
  sortTier: (tier: 'tier1' | 'tier2' | 'tier3' | 'tier4', sortBy: 'rank' | 'teamNumber' | 'points' | 'climb' | 'auto') => void;

  // Watchlist - for tracking final morning teams
  toggleWatchlist: (teamNumber: number) => void;
  updateWatchlistNotes: (teamNumber: number, notes: string) => void;
  reorderWatchlist: (teamNumber: number, newRank: number) => void;
  finalizeWatchlist: (insertAtRank: number) => void; // Insert watchlist teams into Potatoes at position
  clearWatchlist: () => void;
  getWatchlistTeams: () => PickListTeam[];

  // Bulk operations
  clearPickList: () => void;
  clearAllFlags: () => void;
  exportPickList: () => string; // Returns JSON string
  importPickList: (jsonString: string) => void;
}

export const usePickListStore = create<PickListState>()(
  persist(
    (set, get) => ({
      pickList: null,
      tbaApiKey: '',
      redFlagThresholds: DEFAULT_RED_FLAG_THRESHOLDS,

      // Initialize a new pick list
      initializePickList: (eventKey, tier1Name = 'Steak', tier2Name = 'Potatoes', tier3Name = 'Chicken Nuggets', tier4Name = 'All Teams') => {
        const config: PickListConfig = {
          eventKey,
          tier1Name,
          tier2Name,
          tier3Name,
          tier4Name,
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
      setTierNames: (tier1, tier2, tier3, tier4) => {
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
              tier4Name: tier4,
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
      addTeamToTier: (teamNumber, tier, notes = '') => {
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
          notes,
          isPicked: false,
          tags: [],
          flagged: false,
          onWatchlist: false,
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

      // Swap ranks between two teams (must be in same tier)
      swapTeamRanks: (teamNumber1, teamNumber2) => {
        const { pickList } = get();
        if (!pickList) return;

        const team1 = pickList.teams.find(t => t.teamNumber === teamNumber1);
        const team2 = pickList.teams.find(t => t.teamNumber === teamNumber2);

        if (!team1 || !team2 || team1.tier !== team2.tier) return;

        const updatedTeams = pickList.teams.map(team => {
          if (team.teamNumber === teamNumber1) {
            return { ...team, rank: team2.rank };
          }
          if (team.teamNumber === teamNumber2) {
            return { ...team, rank: team1.rank };
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

      // Move winner team above loser team (for comparison feature)
      moveTeamAbove: (winnerTeamNumber, loserTeamNumber) => {
        const { pickList, moveTeam } = get();
        if (!pickList) return;

        const winner = pickList.teams.find(t => t.teamNumber === winnerTeamNumber);
        const loser = pickList.teams.find(t => t.teamNumber === loserTeamNumber);

        if (!winner || !loser) return;

        const tierHierarchy = { tier1: 1, tier2: 2, tier3: 3, tier4: 4 };

        // Same tier: winner moves to loser's rank, loser shifts down
        if (winner.tier === loser.tier) {
          const tierTeams = pickList.teams
            .filter(t => t.tier === winner.tier)
            .sort((a, b) => a.rank - b.rank);

          const winnerIdx = tierTeams.findIndex(t => t.teamNumber === winnerTeamNumber);
          const loserIdx = tierTeams.findIndex(t => t.teamNumber === loserTeamNumber);

          // Only move if winner is currently ranked lower (higher rank number)
          if (winnerIdx > loserIdx) {
            moveTeam(winnerTeamNumber, winner.tier, loser.rank);
          }
        }
        // Cross-tier: promote winner if from lower tier
        else if (tierHierarchy[winner.tier] > tierHierarchy[loser.tier]) {
          // Winner in lower tier, promote to loser's tier at loser's rank
          moveTeam(winnerTeamNumber, loser.tier, loser.rank);
        }
        // Winner already in higher tier, no change needed
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

      // Set red flag auto-detection thresholds
      setRedFlagThresholds: (thresholds) => {
        set({ redFlagThresholds: thresholds });
      },

      // Auto-flag teams based on reliability thresholds
      autoFlagTeams: (teamStatistics) => {
        const { pickList, redFlagThresholds } = get();
        if (!pickList) return 0;

        let newlyFlaggedCount = 0;

        const updatedTeams = pickList.teams.map(team => {
          const stats = teamStatistics.find(s => s.teamNumber === team.teamNumber);
          if (!stats) return team;

          // Check if team exceeds any threshold
          const shouldFlag =
            stats.diedRate >= redFlagThresholds.diedRate ||
            stats.mechanicalIssuesRate >= redFlagThresholds.mechanicalIssuesRate ||
            stats.tippedRate >= redFlagThresholds.tippedRate ||
            stats.noShowRate >= redFlagThresholds.noShowRate;

          // Only count as newly flagged if it wasn't already flagged
          if (shouldFlag && !team.flagged) {
            newlyFlaggedCount++;
          }

          return shouldFlag ? { ...team, flagged: true } : team;
        });

        set({
          pickList: {
            ...pickList,
            teams: updatedTeams,
          },
        });

        return newlyFlaggedCount;
      },

      // Clear all flags
      clearAllFlags: () => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t => ({ ...t, flagged: false })),
          },
        });
      },

      // ========== WATCHLIST FUNCTIONS ==========

      // Toggle team on/off watchlist
      toggleWatchlist: (teamNumber) => {
        const { pickList } = get();
        if (!pickList) return;

        const team = pickList.teams.find(t => t.teamNumber === teamNumber);
        if (!team) return;

        const isCurrentlyOnWatchlist = team.onWatchlist;

        if (isCurrentlyOnWatchlist) {
          // Remove from watchlist
          set({
            pickList: {
              ...pickList,
              teams: pickList.teams.map(t =>
                t.teamNumber === teamNumber
                  ? { ...t, onWatchlist: false, watchlistRank: undefined, watchlistNotes: undefined }
                  : t
              ),
            },
          });
        } else {
          // Add to watchlist - assign next rank
          const watchlistTeams = pickList.teams.filter(t => t.onWatchlist);
          const nextRank = watchlistTeams.length + 1;

          set({
            pickList: {
              ...pickList,
              teams: pickList.teams.map(t =>
                t.teamNumber === teamNumber
                  ? { ...t, onWatchlist: true, watchlistRank: nextRank, watchlistNotes: '' }
                  : t
              ),
            },
          });
        }
      },

      // Update watchlist notes for a team
      updateWatchlistNotes: (teamNumber, notes) => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t =>
              t.teamNumber === teamNumber ? { ...t, watchlistNotes: notes } : t
            ),
          },
        });
      },

      // Reorder watchlist team to new rank
      reorderWatchlist: (teamNumber, newRank) => {
        const { pickList } = get();
        if (!pickList) return;

        const watchlistTeams = pickList.teams
          .filter(t => t.onWatchlist)
          .sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));

        const teamIndex = watchlistTeams.findIndex(t => t.teamNumber === teamNumber);
        if (teamIndex === -1) return;

        // Remove team from current position
        const [movedTeam] = watchlistTeams.splice(teamIndex, 1);
        // Insert at new position (newRank is 1-indexed)
        watchlistTeams.splice(newRank - 1, 0, movedTeam);

        // Update all watchlist ranks
        const watchlistRanks: Record<number, number> = {};
        watchlistTeams.forEach((team, index) => {
          watchlistRanks[team.teamNumber] = index + 1;
        });

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t =>
              t.onWatchlist ? { ...t, watchlistRank: watchlistRanks[t.teamNumber] } : t
            ),
          },
        });
      },

      // Finalize watchlist - insert teams into Potatoes (tier2) at specified position
      finalizeWatchlist: (insertAtRank) => {
        const { pickList } = get();
        if (!pickList) return;

        // Get watchlist teams sorted by rank
        const watchlistTeams = pickList.teams
          .filter(t => t.onWatchlist)
          .sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));

        if (watchlistTeams.length === 0) return;

        // Get current tier2 teams
        const tier2Teams = pickList.teams
          .filter(t => t.tier === 'tier2' && !t.onWatchlist)
          .sort((a, b) => a.rank - b.rank);

        // Split tier2 at insertion point
        const beforeInsertion = tier2Teams.slice(0, insertAtRank - 1);
        const afterInsertion = tier2Teams.slice(insertAtRank - 1);

        // Create new tier2 order: before + watchlist + after
        const newTier2Order = [...beforeInsertion, ...watchlistTeams, ...afterInsertion];

        // Build updated teams array
        const updatedTeams = pickList.teams.map(team => {
          // If team is on watchlist, move to tier2 and clear watchlist status
          if (team.onWatchlist) {
            const newRank = newTier2Order.findIndex(t => t.teamNumber === team.teamNumber) + 1;
            return {
              ...team,
              tier: 'tier2' as const,
              rank: newRank,
              onWatchlist: false,
              watchlistRank: undefined,
              // Keep watchlist notes as regular notes if they had any
              notes: team.watchlistNotes ? `${team.notes}\n[Watchlist] ${team.watchlistNotes}`.trim() : team.notes,
              watchlistNotes: undefined,
            };
          }

          // If team is in tier2 (not watchlist), update rank
          if (team.tier === 'tier2') {
            const newRank = newTier2Order.findIndex(t => t.teamNumber === team.teamNumber) + 1;
            return { ...team, rank: newRank };
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

      // Clear all teams from watchlist
      clearWatchlist: () => {
        const { pickList } = get();
        if (!pickList) return;

        set({
          pickList: {
            ...pickList,
            teams: pickList.teams.map(t => ({
              ...t,
              onWatchlist: false,
              watchlistRank: undefined,
              watchlistNotes: undefined,
            })),
          },
        });
      },

      // Get watchlist teams sorted by rank
      getWatchlistTeams: () => {
        const { pickList } = get();
        if (!pickList) return [];

        return pickList.teams
          .filter(t => t.onWatchlist)
          .sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
      },

      // Import teams from TBA rankings (all teams with ranking info)
      importFromTBARankings: (rankings) => {
        const { pickList } = get();
        if (!pickList) return;

        // Clear tier2, tier3, and tier4 before importing
        const teamsInTier1 = pickList.teams.filter(t => t.tier === 'tier1');

        // Ensure rankings are sorted by event rank (ascending)
        const sortedRankings = [...rankings.rankings].sort((a, b) => a.rank - b.rank);

        // Helper to build notes
        const buildNotes = (ranking: any) => {
          let notes = `Event Rank ${ranking.rank}`;
          if (ranking.record && typeof ranking.record.wins === 'number' && typeof ranking.record.losses === 'number') {
            notes += ` - ${ranking.record.wins}W/${ranking.record.losses}L`;
            if (ranking.record.ties > 0) {
              notes += `/${ranking.record.ties}T`;
            }
          }
          return notes;
        };

        // Top 12 go to tier2 (Potatoes) - preserve event ranking order
        const top12 = sortedRankings
          .slice(0, 12)
          .map((ranking, index) => {
            const teamNumber = teamKeyToNumber(ranking.team_key);
            const team: PickListTeam = {
              teamNumber,
              tier: 'tier2',
              rank: index + 1,
              notes: buildNotes(ranking),
              isPicked: false,
              tags: [],
              flagged: false,
              onWatchlist: false,
            };
            return team;
          });

        // Remaining teams go to tier3 (Chicken Nuggets) - preserve event ranking order
        const remaining = sortedRankings
          .slice(12)
          .map((ranking, index) => {
            const teamNumber = teamKeyToNumber(ranking.team_key);
            const team: PickListTeam = {
              teamNumber,
              tier: 'tier3',
              rank: index + 1,
              notes: buildNotes(ranking),
              isPicked: false,
              tags: [],
              flagged: false,
              onWatchlist: false,
            };
            return team;
          });

        set({
          pickList: {
            ...pickList,
            teams: [...teamsInTier1, ...top12, ...remaining],
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
