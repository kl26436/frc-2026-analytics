import { teamKeyToNumber } from './tbaApi';
import type { TBAMatch, TBAAlliance } from '../types/tba';

// FRC double-elimination for 8 alliances. TBA encodes all bracket matches as
// comp_level='sf' with set_number 1-13. Finals are comp_level='f'.
export interface BracketSlotDef {
  setNumber: number;
  bracket: 'upper' | 'lower';
  redSeed?: number;
  blueSeed?: number;
  redFrom?: { set: number; result: 'winner' | 'loser' };
  blueFrom?: { set: number; result: 'winner' | 'loser' };
}

export const BRACKET_SLOTS: BracketSlotDef[] = [
  { setNumber: 1, bracket: 'upper', redSeed: 1, blueSeed: 8 },
  { setNumber: 2, bracket: 'upper', redSeed: 4, blueSeed: 5 },
  { setNumber: 3, bracket: 'upper', redSeed: 2, blueSeed: 7 },
  { setNumber: 4, bracket: 'upper', redSeed: 3, blueSeed: 6 },
  { setNumber: 7, bracket: 'upper', redFrom: { set: 1, result: 'winner' }, blueFrom: { set: 2, result: 'winner' } },
  { setNumber: 8, bracket: 'upper', redFrom: { set: 3, result: 'winner' }, blueFrom: { set: 4, result: 'winner' } },
  { setNumber: 11, bracket: 'upper', redFrom: { set: 7, result: 'winner' }, blueFrom: { set: 8, result: 'winner' } },
  { setNumber: 5, bracket: 'lower', redFrom: { set: 1, result: 'loser' }, blueFrom: { set: 2, result: 'loser' } },
  { setNumber: 6, bracket: 'lower', redFrom: { set: 3, result: 'loser' }, blueFrom: { set: 4, result: 'loser' } },
  { setNumber: 9, bracket: 'lower', redFrom: { set: 7, result: 'loser' }, blueFrom: { set: 6, result: 'winner' } },
  { setNumber: 10, bracket: 'lower', redFrom: { set: 8, result: 'loser' }, blueFrom: { set: 5, result: 'winner' } },
  { setNumber: 12, bracket: 'lower', redFrom: { set: 10, result: 'winner' }, blueFrom: { set: 9, result: 'winner' } },
  { setNumber: 13, bracket: 'lower', redFrom: { set: 11, result: 'loser' }, blueFrom: { set: 12, result: 'winner' } },
];

export interface ResolvedSlot {
  setNumber: number;
  bracket: 'upper' | 'lower';
  match: TBAMatch | undefined;
  redTeams: number[];
  blueTeams: number[];
  redAllianceNum: number | null;
  blueAllianceNum: number | null;
}

function findMatch(matches: TBAMatch[], compLevel: string, setNumber: number): TBAMatch | undefined {
  return matches.find(m => m.comp_level === compLevel && m.set_number === setNumber);
}

function getWinner(match: TBAMatch): 'red' | 'blue' | null {
  if (match.alliances.red.score < 0) return null;
  if (match.alliances.red.score > match.alliances.blue.score) return 'red';
  if (match.alliances.blue.score > match.alliances.red.score) return 'blue';
  return null;
}

function allianceNumberForTeams(teamKeys: string[], alliances: TBAAlliance[]): number | null {
  for (let i = 0; i < alliances.length; i++) {
    if (alliances[i].picks.some(pk => teamKeys.includes(pk))) return i + 1;
  }
  return null;
}

export function resolveBracketSlots(playoffMatches: TBAMatch[], alliances: TBAAlliance[]): ResolvedSlot[] {
  if (!playoffMatches.length && !alliances.length) return [];

  const resultMap = new Map<number, { winner: string[]; loser: string[] }>();
  for (const slot of BRACKET_SLOTS) {
    const m = findMatch(playoffMatches, 'sf', slot.setNumber);
    if (m && m.alliances.red.score >= 0) {
      const w = getWinner(m);
      if (w) {
        resultMap.set(slot.setNumber, {
          winner: w === 'red' ? m.alliances.red.team_keys : m.alliances.blue.team_keys,
          loser: w === 'red' ? m.alliances.blue.team_keys : m.alliances.red.team_keys,
        });
      }
    }
  }

  const resolveTeams = (slot: BracketSlotDef, side: 'red' | 'blue'): string[] => {
    const seed = side === 'red' ? slot.redSeed : slot.blueSeed;
    const from = side === 'red' ? slot.redFrom : slot.blueFrom;
    if (seed && alliances[seed - 1]) return alliances[seed - 1].picks;
    if (from) {
      const prev = resultMap.get(from.set);
      if (prev) return from.result === 'winner' ? prev.winner : prev.loser;
    }
    const m = findMatch(playoffMatches, 'sf', slot.setNumber);
    if (m) return side === 'red' ? m.alliances.red.team_keys : m.alliances.blue.team_keys;
    return [];
  };

  return BRACKET_SLOTS.map(slot => {
    const m = findMatch(playoffMatches, 'sf', slot.setNumber);
    const redTeamKeys = m ? m.alliances.red.team_keys : resolveTeams(slot, 'red');
    const blueTeamKeys = m ? m.alliances.blue.team_keys : resolveTeams(slot, 'blue');
    return {
      setNumber: slot.setNumber,
      bracket: slot.bracket,
      match: m,
      redTeams: redTeamKeys.map(teamKeyToNumber),
      blueTeams: blueTeamKeys.map(teamKeyToNumber),
      redAllianceNum: allianceNumberForTeams(redTeamKeys, alliances),
      blueAllianceNum: allianceNumberForTeams(blueTeamKeys, alliances),
    };
  });
}
