import type { TBAMatch, TBAAlliance } from '../types/tba';

export interface PathStep {
  slotNumber: number;             // 1–13 for bracket slots, 100/101/102 for Finals G1/G2/G3
  label: string;                  // 'M1', 'M7', 'UF', 'LF', 'F1', 'F2', 'F3'
  state: 'won' | 'lost' | 'current' | 'future';
  bracket: 'upper' | 'lower' | 'final';
  ourScore?: number;
  theirScore?: number;
  opponentAlliance?: number | null;
}

export type AllianceStatus =
  | 'in-upper'         // active in upper bracket
  | 'in-lower'         // active in lower bracket
  | 'in-finals'        // playing the BO3
  | 'champion'         // won finals (2 wins)
  | 'eliminated'       // lost out
  | 'awaiting';        // alliance selected but no matches yet

export interface AlliancePath {
  status: AllianceStatus;
  steps: PathStep[];
  wins: number;
  losses: number;
}

interface ResolvedSlot {
  setNumber: number;
  bracket: 'upper' | 'lower';
  match: TBAMatch | undefined;
  redTeams: number[];
  blueTeams: number[];
  redAllianceNum: number | null;
  blueAllianceNum: number | null;
}

const SLOT_LABEL: Record<number, string> = {
  1: 'M1', 2: 'M2', 3: 'M3', 4: 'M4',
  5: 'M5', 6: 'M6',
  7: 'M7', 8: 'M8',
  9: 'M9', 10: 'M10',
  11: 'UF',
  12: 'M12',
  13: 'LF',
};

export function computeAlliancePath(
  allianceNum: number | null,
  alliances: TBAAlliance[],
  resolvedSlots: ResolvedSlot[],
  finalsMatches: TBAMatch[],
): AlliancePath {
  if (!allianceNum || !alliances[allianceNum - 1]) {
    return { status: 'awaiting', steps: [], wins: 0, losses: 0 };
  }

  const allianceTeams = new Set(alliances[allianceNum - 1].picks.map(k => parseInt(k.replace('frc', ''), 10)));

  const steps: PathStep[] = [];
  let wins = 0;
  let losses = 0;

  // Walk bracket slots in match-number order
  const orderedSlots = [...resolvedSlots].sort((a, b) => a.setNumber - b.setNumber);
  for (const slot of orderedSlots) {
    const inRed = slot.redTeams.length > 0 && slot.redTeams.some(t => allianceTeams.has(t));
    const inBlue = slot.blueTeams.length > 0 && slot.blueTeams.some(t => allianceTeams.has(t));
    if (!inRed && !inBlue) continue;

    const m = slot.match;
    const isPlayed = !!m && m.alliances.red.score >= 0;
    const opponentNum = inRed ? slot.blueAllianceNum : slot.redAllianceNum;

    if (isPlayed && m) {
      const ourScore = inRed ? m.alliances.red.score : m.alliances.blue.score;
      const theirScore = inRed ? m.alliances.blue.score : m.alliances.red.score;
      const won = ourScore > theirScore;
      if (won) wins++; else losses++;
      steps.push({
        slotNumber: slot.setNumber,
        label: SLOT_LABEL[slot.setNumber] ?? `M${slot.setNumber}`,
        state: won ? 'won' : 'lost',
        bracket: slot.bracket,
        ourScore,
        theirScore,
        opponentAlliance: opponentNum,
      });
    } else {
      steps.push({
        slotNumber: slot.setNumber,
        label: SLOT_LABEL[slot.setNumber] ?? `M${slot.setNumber}`,
        state: 'future',
        bracket: slot.bracket,
        opponentAlliance: opponentNum,
      });
    }
  }

  // Finals (BO3) — slotNumber 100/101/102 to keep ordering after slot 13
  const sortedFinals = [...finalsMatches].sort((a, b) => a.match_number - b.match_number);
  let finalsWins = 0;
  let finalsLosses = 0;
  for (let i = 0; i < sortedFinals.length; i++) {
    const m = sortedFinals[i];
    const inRed = m.alliances.red.team_keys.some(k => allianceTeams.has(parseInt(k.replace('frc', ''), 10)));
    const inBlue = m.alliances.blue.team_keys.some(k => allianceTeams.has(parseInt(k.replace('frc', ''), 10)));
    if (!inRed && !inBlue) continue;
    const isPlayed = m.alliances.red.score >= 0;
    if (isPlayed) {
      const ourScore = inRed ? m.alliances.red.score : m.alliances.blue.score;
      const theirScore = inRed ? m.alliances.blue.score : m.alliances.red.score;
      const won = ourScore > theirScore;
      if (won) { wins++; finalsWins++; } else { losses++; finalsLosses++; }
      steps.push({
        slotNumber: 100 + i,
        label: `F${i + 1}`,
        state: won ? 'won' : 'lost',
        bracket: 'final',
        ourScore,
        theirScore,
      });
    } else {
      steps.push({
        slotNumber: 100 + i,
        label: `F${i + 1}`,
        state: 'future',
        bracket: 'final',
      });
    }
  }

  // Promote the first 'future' step to 'current' (next playable for this alliance)
  const firstFutureIdx = steps.findIndex(s => s.state === 'future');
  if (firstFutureIdx >= 0) steps[firstFutureIdx].state = 'current';

  // Determine status
  let status: AllianceStatus;
  if (steps.length === 0) {
    status = 'awaiting';
  } else if (finalsWins >= 2) {
    status = 'champion';
  } else if (steps.some(s => s.bracket === 'final')) {
    status = 'in-finals';
  } else {
    // Check if eliminated: lost in lower bracket OR lost in upper bracket final without going to finals
    const lowerLoss = steps.some(s => s.bracket === 'lower' && s.state === 'lost');
    const ufLoss = steps.some(s => s.slotNumber === 11 && s.state === 'lost');
    const lfLoss = steps.some(s => s.slotNumber === 13 && s.state === 'lost');
    const inLower = steps.some(s => s.bracket === 'lower') || ufLoss;

    if (lfLoss) {
      status = 'eliminated';
    } else if (lowerLoss && !steps.some(s => s.bracket === 'lower' && s.state === 'won' && s.slotNumber > Math.max(...steps.filter(x => x.bracket === 'lower' && x.state === 'lost').map(x => x.slotNumber)))) {
      // Lost in lower without subsequent recovery — shouldn't happen in single-elim lower, but guard
      status = 'eliminated';
    } else if (inLower) {
      status = 'in-lower';
    } else {
      status = 'in-upper';
    }
  }

  return { status, steps, wins, losses };
}
