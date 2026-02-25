// ── Pure helper functions for PickList live mode ─────────────────────────────
// Extracted from PickList.tsx for maintainability. All functions are pure
// data transforms with no React dependencies.

import type { PickListTeam } from '../types/pickList';

export function updateLiveNotes(teams: PickListTeam[], teamNumber: number, notes: string): PickListTeam[] {
  return teams.map(t => t.teamNumber === teamNumber ? { ...t, notes } : t);
}

export function toggleLiveFlag(teams: PickListTeam[], teamNumber: number): PickListTeam[] {
  return teams.map(t => t.teamNumber === teamNumber ? { ...t, flagged: !t.flagged } : t);
}

export function toggleLiveWatchlist(teams: PickListTeam[], teamNumber: number): PickListTeam[] {
  const team = teams.find(t => t.teamNumber === teamNumber);
  if (!team) return teams;
  if (team.onWatchlist) {
    // Removing — clear rank/notes then re-number remaining
    const removed = teams.map(t => t.teamNumber === teamNumber
      ? { ...t, onWatchlist: false, watchlistRank: null, watchlistNotes: null }
      : t,
    );
    const remaining = removed.filter(t => t.onWatchlist).sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
    const ranks: Record<number, number> = {};
    remaining.forEach((t, i) => { ranks[t.teamNumber] = i + 1; });
    return removed.map(t => t.onWatchlist ? { ...t, watchlistRank: ranks[t.teamNumber] } : t);
  } else {
    // Adding — assign next rank
    const nextRank = teams.filter(t => t.onWatchlist).length + 1;
    return teams.map(t => t.teamNumber === teamNumber
      ? { ...t, onWatchlist: true, watchlistRank: nextRank, watchlistNotes: '' }
      : t,
    );
  }
}

export function updateLiveWatchlistNotes(teams: PickListTeam[], teamNumber: number, notes: string): PickListTeam[] {
  return teams.map(t => t.teamNumber === teamNumber ? { ...t, watchlistNotes: notes } : t);
}

export function reorderLiveWatchlist(teams: PickListTeam[], teamNumber: number, newRank: number): PickListTeam[] {
  const watchlistTeams = teams.filter(t => t.onWatchlist).sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
  const teamIndex = watchlistTeams.findIndex(t => t.teamNumber === teamNumber);
  if (teamIndex === -1) return teams;
  const [moved] = watchlistTeams.splice(teamIndex, 1);
  watchlistTeams.splice(newRank - 1, 0, moved);
  const ranks: Record<number, number> = {};
  watchlistTeams.forEach((t, i) => { ranks[t.teamNumber] = i + 1; });
  return teams.map(t => t.onWatchlist ? { ...t, watchlistRank: ranks[t.teamNumber] } : t);
}

export function clearLiveWatchlist(teams: PickListTeam[]): PickListTeam[] {
  return teams.map(t => ({ ...t, onWatchlist: false, watchlistRank: null, watchlistNotes: null }));
}

export function finalizeLiveWatchlist(teams: PickListTeam[], insertAtRank: number): PickListTeam[] {
  const watchlistTeams = teams.filter(t => t.onWatchlist).sort((a, b) => (a.watchlistRank || 0) - (b.watchlistRank || 0));
  if (watchlistTeams.length === 0) return teams;
  const tier2Teams = teams.filter(t => t.tier === 'tier2' && !t.onWatchlist).sort((a, b) => a.rank - b.rank);
  const newTier2Order = [
    ...tier2Teams.slice(0, insertAtRank - 1),
    ...watchlistTeams,
    ...tier2Teams.slice(insertAtRank - 1),
  ];
  return teams.map(team => {
    if (team.onWatchlist) {
      const newRank = newTier2Order.findIndex(t => t.teamNumber === team.teamNumber) + 1;
      return {
        ...team,
        tier: 'tier2' as const,
        rank: newRank,
        onWatchlist: false,
        watchlistRank: null,
        notes: team.watchlistNotes ? `${team.notes}\n[Watchlist] ${team.watchlistNotes}`.trim() : team.notes,
        watchlistNotes: null,
      };
    }
    if (team.tier === 'tier2') {
      const newRank = newTier2Order.findIndex(t => t.teamNumber === team.teamNumber) + 1;
      if (newRank > 0) return { ...team, rank: newRank };
    }
    return team;
  });
}

// Same-tier reorder: slide teamNumber to position where overTeam was
export function applyLiveSameTierMove(
  teams: PickListTeam[],
  teamNumber: number,
  tier: PickListTeam['tier'],
  targetRank: number,
): PickListTeam[] {
  const tierTeams = teams.filter(t => t.tier === tier).sort((a, b) => a.rank - b.rank);
  const fromIdx = tierTeams.findIndex(t => t.teamNumber === teamNumber);
  const toIdx = tierTeams.findIndex(t => t.rank === targetRank);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return teams;
  const [moved] = tierTeams.splice(fromIdx, 1);
  tierTeams.splice(toIdx, 0, moved);
  const updated = tierTeams.map((t, i) => ({ ...t, rank: i + 1 }));
  return teams.map(t => t.tier !== tier ? t : (updated.find(u => u.teamNumber === t.teamNumber) ?? t));
}

// Cross-tier move: move teamNumber into newTier at targetRank
export function applyLiveCrossTierMove(
  teams: PickListTeam[],
  teamNumber: number,
  newTier: PickListTeam['tier'],
  targetRank: number,
): PickListTeam[] {
  const team = teams.find(t => t.teamNumber === teamNumber);
  if (!team) return teams;
  const oldTier = team.tier;
  const oldTierUpdated = teams
    .filter(t => t.tier === oldTier && t.teamNumber !== teamNumber)
    .sort((a, b) => a.rank - b.rank)
    .map((t, i) => ({ ...t, rank: i + 1 }));
  const newTierTeams = teams.filter(t => t.tier === newTier).sort((a, b) => a.rank - b.rank);
  const insertIdx = newTierTeams.findIndex(t => t.rank >= targetRank);
  const movedTeam = { ...team, tier: newTier, rank: targetRank };
  if (insertIdx === -1) newTierTeams.push(movedTeam);
  else newTierTeams.splice(insertIdx, 0, movedTeam);
  const newTierUpdated = newTierTeams.map((t, i) => ({ ...t, rank: i + 1 }));
  return teams.map(t => {
    if (t.teamNumber === teamNumber) return newTierUpdated.find(u => u.teamNumber === teamNumber)!;
    if (t.tier === newTier) return newTierUpdated.find(u => u.teamNumber === t.teamNumber) ?? t;
    if (t.tier === oldTier) return oldTierUpdated.find(u => u.teamNumber === t.teamNumber) ?? t;
    return t;
  });
}

// Move winner immediately above loser (comparison result)
export function applyLiveMoveAbove(
  teams: PickListTeam[],
  winnerNumber: number,
  loserNumber: number,
): PickListTeam[] {
  const winner = teams.find(t => t.teamNumber === winnerNumber);
  const loser = teams.find(t => t.teamNumber === loserNumber);
  if (!winner || !loser) return teams;
  if (winner.tier === loser.tier) {
    return applyLiveSameTierMove(teams, winnerNumber, winner.tier, loser.rank);
  }
  return applyLiveCrossTierMove(teams, winnerNumber, loser.tier, loser.rank);
}
