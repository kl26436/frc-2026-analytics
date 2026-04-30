import type { TeamStatistics } from '../types/scouting';
import type { TeamFuelStats } from './fuelAttribution';
import type { TBAEventRanking } from '../types/tba';
import type { PredictionTeamInput } from './predictions';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DraftTeam {
  teamNumber: number;
  tbaRank: number;          // TBA qualification ranking (1 = top seed)
  /** Scouting-based strength score (avgTotalPoints from DW) */
  scoutStrength: number;
  /** Fuel scoring avg from attribution model */
  avgFuelScored: number;
  /** Climb points avg */
  avgEndgamePoints: number;
  /** Reliability (0–1) — from prediction inputs */
  reliability: number;
  /** Unreliability rate from scout data */
  unreliabilityRate: number;
  /** Passer ratio */
  passerRatio: number;
}

export interface DraftPick {
  round: 1 | 2 | 3;
  pickNumber: number;       // overall pick number in this round
  allianceNumber: number;   // which alliance is picking (1-8)
  teamPicked: number;       // team number picked
  declined: boolean;        // did the team decline?
  declineReason?: string;   // why they declined
  /** If declined, the replacement pick */
  replacementPick?: number;
}

export interface DraftAlliance {
  allianceNumber: number;
  captain: number;
  firstPick: number;
  secondPick: number;
  backup?: number;
  /** Combined strength estimate */
  estimatedStrength: number;
}

export interface DraftResult {
  alliances: DraftAlliance[];
  picks: DraftPick[];
  backupPool: number[];
  declines: DraftPick[];
  teamCount: number;
  allianceCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function teamKeyToNumber(key: string): number {
  return parseInt(key.replace('frc', ''), 10);
}

/**
 * Compute a composite "draft value" score for ranking pick desirability.
 * Weights: 60% total points, 25% fuel scoring, 15% endgame/climbing.
 * Penalizes unreliability.
 */
function computeDraftValue(team: DraftTeam): number {
  const reliabilityMultiplier = 1.0 - (team.unreliabilityRate * 0.5);
  return (
    team.scoutStrength * 0.60 +
    team.avgFuelScored * 0.25 +
    team.avgEndgamePoints * 0.15
  ) * reliabilityMultiplier;
}

/**
 * Should this team decline being picked by this alliance?
 *
 * Heuristic: A team will decline if they are highly ranked enough to
 * captain their own alliance AND the picking alliance is low enough
 * that captaining would be a better strategic position.
 *
 * Key scenarios where declines happen:
 * 1. Team ranked 9-12 declines Alliance 5-8 because they'd rather
 *    captain a lower alliance (if one becomes available from another decline)
 * 2. Teams decline only if their TBA rank is <= the number of alliances
 *    that would exist after cascading promotions
 *
 * In practice, declines are most common when:
 * - The picking alliance is seed 4-8
 * - The picked team is ranked 9-12 in TBA standings
 * - The picked team has strong scouting data (they know they're good)
 */
function shouldDecline(
  pickedTeam: DraftTeam,
  allianceNumber: number,
  round: number,
  remainingCaptainSlots: number,
  allianceCount: number,
): { decline: boolean; reason?: string } {
  // Teams never decline in round 2 — they already missed their chance
  // (In FRC, declining in round 2 is extremely rare and usually not strategic)
  if (round === 2) return { decline: false };

  // If a team's TBA rank is 9-12 and a lower alliance picks them,
  // they might prefer to captain their own alliance
  const couldCaptain = pickedTeam.tbaRank <= allianceCount + remainingCaptainSlots;

  // Higher-ranked teams are more likely to decline lower alliances
  // A team ranked #9 declines Alliance 6-8 but accepts Alliance 1-5
  // A team ranked #10 might only decline Alliance 7-8
  if (couldCaptain && pickedTeam.tbaRank <= allianceCount) {
    // The decline threshold: would they rather captain than be a 1st pick?
    // Teams with TBA rank within the alliance count could become captains
    // if enough teams above them decline/get picked
    const declineThreshold = Math.ceil(allianceCount * 0.6); // decline Alliance 5+ for 8 alliances

    if (allianceNumber >= declineThreshold && pickedTeam.tbaRank <= allianceCount + 2) {
      // Strong team declining a weaker alliance — realistic scenario
      return {
        decline: true,
        reason: `Team ${pickedTeam.teamNumber} (TBA rank #${pickedTeam.tbaRank}) declines Alliance ${allianceNumber} — prefers to captain or get picked by a higher seed`,
      };
    }
  }

  return { decline: false };
}

/**
 * Compute synergy bonus for a pick with existing alliance members.
 * Rewards complementary teams (e.g., scorer + passer, mixed climb levels).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function _synergy(candidate: DraftTeam, existingTeams: DraftTeam[]): number {
  if (existingTeams.length === 0) return 0;

  let bonus = 0;

  // Passer-scorer complementarity: if alliance has a scorer, bonus for passer and vice versa
  const alliancePasserRatio = existingTeams.reduce((s, t) => s + t.passerRatio, 0) / existingTeams.length;
  if (alliancePasserRatio < 0.2 && candidate.passerRatio > 0.3) {
    bonus += 5; // Alliance needs a passer
  }
  if (alliancePasserRatio > 0.4 && candidate.passerRatio < 0.15) {
    bonus += 3; // Alliance needs a scorer, not another passer
  }

  return bonus;
}

// ── Main Simulator ───────────────────────────────────────────────────────────

/**
 * Run a deterministic snake draft simulation.
 *
 * Seeding: TBA qualification rankings (top N become captains).
 * Pick logic: Best available by scouting data (DW avgTotalPoints composite).
 * Decline logic: Heuristic based on TBA rank vs alliance position.
 *
 * @param tbaRankings - TBA event rankings (used for seeding captains)
 * @param teamStats - DW scouting statistics (used for pick ordering)
 * @param fuelStats - Fuel attribution stats
 * @param predictionInputs - Prediction engine inputs (reliability)
 * @param totalTeams - Total number of teams at event
 */
export function simulateSnakeDraft(
  tbaRankings: TBAEventRanking[],
  teamStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
  predictionInputs: PredictionTeamInput[],
  totalTeams?: number,
): DraftResult {
  const teamCount = totalTeams ?? tbaRankings.length;

  // ── Determine alliance count (Section 10.6.6 small event exception) ──
  const BACKUP_SLOTS = 8; // up to 8 backup teams
  let allianceCount = 8;
  if (teamCount <= 24) {
    allianceCount = Math.floor((teamCount - 1 - BACKUP_SLOTS) / 3);
    allianceCount = Math.max(2, Math.min(8, allianceCount)); // clamp 2-8
  }

  // ── Build DraftTeam lookup ──
  const statMap = new Map(teamStats.map(t => [t.teamNumber, t]));
  const fuelMap = new Map(fuelStats.map(f => [f.teamNumber, f]));
  const predMap = new Map(predictionInputs.map(p => [p.teamNumber, p]));

  // Sort TBA rankings by rank ascending
  const sortedRankings = [...tbaRankings].sort((a, b) => a.rank - b.rank);

  const draftTeams: Map<number, DraftTeam> = new Map();
  for (const ranking of sortedRankings) {
    const num = teamKeyToNumber(ranking.team_key);
    const stat = statMap.get(num);
    const fuel = fuelMap.get(num);
    const pred = predMap.get(num);

    draftTeams.set(num, {
      teamNumber: num,
      tbaRank: ranking.rank,
      scoutStrength: stat?.avgTotalPoints ?? 0,
      avgFuelScored: fuel?.avgShotsScored ?? 0,
      avgEndgamePoints: stat?.avgEndgamePoints ?? 0,
      reliability: pred?.reliability ?? 0.8,
      unreliabilityRate: stat?.overallUnreliabilityRate ?? 0,
      passerRatio: stat?.passerRatio ?? 0,
    });
  }

  // ── Captains = top N by TBA rank ──
  const captainNumbers = sortedRankings
    .slice(0, allianceCount)
    .map(r => teamKeyToNumber(r.team_key));

  // ── Pick pool = everyone else, sorted by scouting draft value ──
  const pickedSet = new Set(captainNumbers);
  const availablePool: number[] = sortedRankings
    .map(r => teamKeyToNumber(r.team_key))
    .filter(num => !pickedSet.has(num));

  // Sort by draft value (scouting-based)
  availablePool.sort((a, b) => {
    const da = draftTeams.get(a)!;
    const db = draftTeams.get(b)!;
    return computeDraftValue(db) - computeDraftValue(da);
  });

  // ── Initialize alliances ──
  const alliances: Map<number, { captain: number; picks: number[] }> = new Map();
  for (let i = 0; i < allianceCount; i++) {
    alliances.set(i + 1, { captain: captainNumbers[i], picks: [] });
  }

  const allPicks: DraftPick[] = [];
  const declines: DraftPick[] = [];
  let declinedTeams = new Set<number>(); // T606: declined teams can't be picked by anyone else
  let remainingCaptainSlots = 0; // how many captain slots could open from declines

  // ── Helper: pick best available for an alliance ──
  function pickBestAvailable(
    allianceNum: number,
    round: 1 | 2 | 3,
    pickNum: number,
    _allianceTeams: DraftTeam[],
  ): DraftPick {
    // Find best available team not already picked or declined
    for (let i = 0; i < availablePool.length; i++) {
      const candidateNum = availablePool[i];
      if (pickedSet.has(candidateNum) || declinedTeams.has(candidateNum)) continue;

      const candidate = draftTeams.get(candidateNum)!;

      // Check if team would decline
      const declineCheck = shouldDecline(
        candidate, allianceNum, round, remainingCaptainSlots, allianceCount,
      );

      if (declineCheck.decline) {
        // Record the decline
        const declinePick: DraftPick = {
          round,
          pickNumber: pickNum,
          allianceNumber: allianceNum,
          teamPicked: candidateNum,
          declined: true,
          declineReason: declineCheck.reason,
        };
        declines.push(declinePick);
        allPicks.push(declinePick);
        declinedTeams.add(candidateNum); // T606: can't be picked by anyone else
        remainingCaptainSlots++;

        // Continue looking for next best available
        continue;
      }

      // Team accepts — remove from pool
      pickedSet.add(candidateNum);
      const pick: DraftPick = {
        round,
        pickNumber: pickNum,
        allianceNumber: allianceNum,
        teamPicked: candidateNum,
        declined: false,
      };
      allPicks.push(pick);
      return pick;
    }

    // Shouldn't happen at a real event, but safety fallback
    return {
      round,
      pickNumber: pickNum,
      allianceNumber: allianceNum,
      teamPicked: 0,
      declined: false,
    };
  }

  // ── Round 1: Descending (Alliance 1 → Alliance N) ──
  let overallPick = 0;
  for (let a = 1; a <= allianceCount; a++) {
    overallPick++;
    const allianceData = alliances.get(a)!;
    const captainDraft = draftTeams.get(allianceData.captain)!;
    const pick = pickBestAvailable(a, 1, overallPick, [captainDraft]);
    if (pick.teamPicked > 0 && !pick.declined) {
      allianceData.picks.push(pick.teamPicked);
    }
  }

  // ── Round 2: Ascending (Alliance N → Alliance 1) — the snake ──
  for (let a = allianceCount; a >= 1; a--) {
    overallPick++;
    const allianceData = alliances.get(a)!;
    const existingTeams = [allianceData.captain, ...allianceData.picks]
      .map(n => draftTeams.get(n)!)
      .filter(Boolean);
    const pick = pickBestAvailable(a, 2, overallPick, existingTeams);
    if (pick.teamPicked > 0 && !pick.declined) {
      allianceData.picks.push(pick.teamPicked);
    }
  }

  // ── Build backup pool (highest ranked unselected, up to 8) ──
  const backupPool: number[] = sortedRankings
    .map(r => teamKeyToNumber(r.team_key))
    .filter(num => !pickedSet.has(num) && !declinedTeams.has(num))
    .slice(0, BACKUP_SLOTS);

  // ── Round 3: Backups (Alliance 1 → Alliance N) — optional ──
  for (let a = 1; a <= allianceCount; a++) {
    if (backupPool.length === 0) break;
    overallPick++;
    const allianceData = alliances.get(a)!;

    // Alliance selects the highest-ranked backup available
    if (backupPool.length > 0) {
      const backupTeam = backupPool.shift()!;
      pickedSet.add(backupTeam);
      const pick: DraftPick = {
        round: 3,
        pickNumber: overallPick,
        allianceNumber: a,
        teamPicked: backupTeam,
        declined: false,
      };
      allPicks.push(pick);
      allianceData.picks.push(backupTeam);
    }
  }

  // ── Compute alliance strengths ──
  const resultAlliances: DraftAlliance[] = [];
  for (let a = 1; a <= allianceCount; a++) {
    const data = alliances.get(a)!;
    const members = [data.captain, ...data.picks];
    const strength = members.reduce((sum, num) => {
      const dt = draftTeams.get(num);
      return sum + (dt ? computeDraftValue(dt) : 0);
    }, 0);

    resultAlliances.push({
      allianceNumber: a,
      captain: data.captain,
      firstPick: data.picks[0] ?? 0,
      secondPick: data.picks[1] ?? 0,
      backup: data.picks[2],
      estimatedStrength: Math.round(strength * 10) / 10,
    });
  }

  return {
    alliances: resultAlliances,
    picks: allPicks,
    backupPool,
    declines,
    teamCount,
    allianceCount,
  };
}

// ── Format for AI Prompt ─────────────────────────────────────────────────────

/**
 * Format the draft simulation result into a readable table for the AI prompt.
 */
export function formatDraftResultForPrompt(result: DraftResult): string {
  const lines: string[] = [];

  lines.push(`## Algorithmic Draft Simulation Result`);
  lines.push(`${result.teamCount} teams → ${result.allianceCount} alliances\n`);

  // Alliance table
  lines.push(`| Alliance | Captain | 1st Pick (R1) | 2nd Pick (R2) | Backup (R3) | Est. Strength |`);
  lines.push(`|----------|---------|---------------|---------------|-------------|---------------|`);
  for (const a of result.alliances) {
    lines.push(
      `| ${a.allianceNumber} | ${a.captain} | ${a.firstPick || '—'} | ${a.secondPick || '—'} | ${a.backup || '—'} | ${a.estimatedStrength} |`
    );
  }

  // Declines
  if (result.declines.length > 0) {
    lines.push(`\n### Predicted Declines`);
    for (const d of result.declines) {
      lines.push(`- **Round ${d.round}, Alliance ${d.allianceNumber}**: ${d.declineReason}`);
    }
  }

  // Pick-by-pick log
  lines.push(`\n### Pick-by-Pick Log`);
  const round1 = result.picks.filter(p => p.round === 1);
  const round2 = result.picks.filter(p => p.round === 2);

  lines.push(`\n**Round 1 (1→${result.allianceCount}):**`);
  for (const p of round1) {
    if (p.declined) {
      lines.push(`- Alliance ${p.allianceNumber} invites ${p.teamPicked} → **DECLINED**`);
    } else {
      lines.push(`- Alliance ${p.allianceNumber} picks **${p.teamPicked}**`);
    }
  }

  lines.push(`\n**Round 2 (${result.allianceCount}→1) — Snake:**`);
  for (const p of round2) {
    if (p.declined) {
      lines.push(`- Alliance ${p.allianceNumber} invites ${p.teamPicked} → **DECLINED**`);
    } else {
      lines.push(`- Alliance ${p.allianceNumber} picks **${p.teamPicked}**`);
    }
  }

  if (result.backupPool.length > 0) {
    lines.push(`\n### Backup Pool`);
    lines.push(result.backupPool.map(t => `${t}`).join(', '));
  }

  return lines.join('\n');
}
