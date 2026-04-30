import { useMemo, useEffect } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { matchLabel } from '../utils/formatting';
import { computeMatchup } from '../utils/predictions';
import { formatProb } from '../utils/formatting';
import { RefreshCw, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TBAMatch, TBAAlliance } from '../types/tba';

// ─── Bracket Topology ────────────────────────────────────────────────────────
// FRC double-elimination for 8 alliances. TBA encodes all bracket matches as
// comp_level='sf' with set_number 1-13. Finals are comp_level='f', set_number=1.
//
// Verified against real TBA data (2025txfor).

interface BracketSlotDef {
  setNumber: number;
  round: string;
  bracket: 'upper' | 'lower' | 'final';
  // Initial seeding (R1 only) — alliance numbers (1-indexed)
  redSeed?: number;
  blueSeed?: number;
  // Or derived from previous match results
  redFrom?: { set: number; result: 'winner' | 'loser' };
  blueFrom?: { set: number; result: 'winner' | 'loser' };
  // Grid placement (col, row) for desktop layout
  col: number;
  row: number;
}

const BRACKET_SLOTS: BracketSlotDef[] = [
  // Upper Bracket Round 1
  { setNumber: 1, round: 'Upper R1', bracket: 'upper', redSeed: 1, blueSeed: 8, col: 0, row: 0 },
  { setNumber: 2, round: 'Upper R1', bracket: 'upper', redSeed: 4, blueSeed: 5, col: 0, row: 1 },
  { setNumber: 3, round: 'Upper R1', bracket: 'upper', redSeed: 2, blueSeed: 7, col: 0, row: 2 },
  { setNumber: 4, round: 'Upper R1', bracket: 'upper', redSeed: 3, blueSeed: 6, col: 0, row: 3 },
  // Upper Bracket Round 2
  { setNumber: 7, round: 'Upper R2', bracket: 'upper', redFrom: { set: 1, result: 'winner' }, blueFrom: { set: 2, result: 'winner' }, col: 1, row: 0.5 },
  { setNumber: 8, round: 'Upper R2', bracket: 'upper', redFrom: { set: 3, result: 'winner' }, blueFrom: { set: 4, result: 'winner' }, col: 1, row: 2.5 },
  // Upper Bracket Final
  { setNumber: 11, round: 'Upper Final', bracket: 'upper', redFrom: { set: 7, result: 'winner' }, blueFrom: { set: 8, result: 'winner' }, col: 2, row: 1.5 },
  // Lower Bracket Round 2
  { setNumber: 5, round: 'Lower R2', bracket: 'lower', redFrom: { set: 1, result: 'loser' }, blueFrom: { set: 2, result: 'loser' }, col: 1, row: 5 },
  { setNumber: 6, round: 'Lower R2', bracket: 'lower', redFrom: { set: 3, result: 'loser' }, blueFrom: { set: 4, result: 'loser' }, col: 1, row: 6 },
  // Lower Bracket Round 3
  { setNumber: 9, round: 'Lower R3', bracket: 'lower', redFrom: { set: 7, result: 'loser' }, blueFrom: { set: 6, result: 'winner' }, col: 2, row: 5 },
  { setNumber: 10, round: 'Lower R3', bracket: 'lower', redFrom: { set: 8, result: 'loser' }, blueFrom: { set: 5, result: 'winner' }, col: 2, row: 6 },
  // Lower Bracket Round 4
  { setNumber: 12, round: 'Lower R4', bracket: 'lower', redFrom: { set: 10, result: 'winner' }, blueFrom: { set: 9, result: 'winner' }, col: 3, row: 5.5 },
  // Lower Bracket Final
  { setNumber: 13, round: 'Lower Final', bracket: 'lower', redFrom: { set: 11, result: 'loser' }, blueFrom: { set: 12, result: 'winner' }, col: 4, row: 5.5 },
];

// Finals slot handled separately (comp_level='f')

// ─── Desktop Bracket Layout (absolute positions + SVG connectors) ────────────
// Slots live in a 1024 × 600 canvas. M5/M10 are paired top, M6/M9 paired bottom
// so the lower-bracket winner advances are clean horizontals (no crossing lines).
// The upper→lower loser drops are dashed and routed through column gaps.
const SLOT_W = 160;
const SLOT_H = 80;  // matches BracketSlot's natural rendered height (header + 2 rows)
const BRACKET_CANVAS_W = 1024;
const BRACKET_CANVAS_H = 600;

interface SlotPos { x: number; y: number }
const SLOT_LAYOUT: Record<number, SlotPos> = {
  // Upper Bracket — R1 stacked, R2 centered between pairs, UF centered between R2 slots
  1:  { x: 8,    y: 0   },
  2:  { x: 8,    y: 96  },
  3:  { x: 8,    y: 192 },
  4:  { x: 8,    y: 288 },
  7:  { x: 220,  y: 48  },
  8:  { x: 220,  y: 240 },
  11: { x: 432,  y: 144 },
  // Lower Bracket — slot order chosen to avoid crossing winner-advance lines
  5:  { x: 8,    y: 408 },
  6:  { x: 8,    y: 504 },
  10: { x: 220,  y: 408 },
  9:  { x: 220,  y: 504 },
  12: { x: 432,  y: 456 },
  13: { x: 644,  y: 456 },
};

const FINALS_POS: SlotPos = { x: 856, y: 290 };
const FINALS_W = 160;
const FINALS_H = 110;

interface ConnectorDef { d: string; dashed?: boolean }
const CONNECTORS: ConnectorDef[] = [
  // Upper Bracket winner advancement
  { d: 'M 168 40 H 194 V 88 H 220' },     // M1 → M7
  { d: 'M 168 136 H 194 V 88' },          // M2 merges into M7 vertical
  { d: 'M 168 232 H 194 V 280 H 220' },   // M3 → M8
  { d: 'M 168 328 H 194 V 280' },         // M4 merges into M8 vertical
  { d: 'M 380 88 H 406 V 184 H 432' },    // M7 → M11
  { d: 'M 380 280 H 406 V 184' },         // M8 merges into M11 vertical
  { d: 'M 592 184 H 724 V 345 H 856' },   // M11 → Finals (red side from above)

  // Lower Bracket winner advancement
  { d: 'M 168 448 H 220' },               // M5 → M10
  { d: 'M 168 544 H 220' },               // M6 → M9
  { d: 'M 380 448 H 406 V 496 H 432' },   // M10 → M12
  { d: 'M 380 544 H 406 V 496' },         // M9 merges into M12 vertical
  { d: 'M 592 496 H 644' },               // M12 → M13
  { d: 'M 804 496 H 820 V 345 H 856' },   // M13 → Finals (blue side from below)

  // Loser drops (dashed) — routed via column gaps to avoid overlap
  { d: 'M 220 88 H 200 V 544 H 220',  dashed: true },  // M7 loser → M9 (left gap x=200)
  { d: 'M 380 280 H 420 V 448 H 380', dashed: true },  // M8 loser → M10 (right gap x=420)
  { d: 'M 592 224 H 618 V 496 H 644', dashed: true },  // M11 loser → M13 (right gap x=618)
];

// ─── Finals Series Card (BO3) ───────────────────────────────────────────────

interface FinalsSeriesCardProps {
  redTeams: number[];
  blueTeams: number[];
  redAllianceNum: number | null;
  blueAllianceNum: number | null;
  homeTeam: number;
  finalsMatches: TBAMatch[];
  prediction: { redWinProb: number } | null;
}

function FinalsSeriesCard({ redTeams, blueTeams, redAllianceNum, blueAllianceNum, homeTeam, finalsMatches, prediction }: FinalsSeriesCardProps) {
  let redWins = 0, blueWins = 0, played = 0;
  for (const fm of finalsMatches) {
    if (fm.alliances.red.score < 0) continue;
    played++;
    if (fm.alliances.red.score > fm.alliances.blue.score) redWins++;
    else if (fm.alliances.blue.score > fm.alliances.red.score) blueWins++;
  }
  const homeOnRed = redTeams.includes(homeTeam);
  const homeOnBlue = blueTeams.includes(homeTeam);
  const hasHome = homeOnRed || homeOnBlue;
  const redChampion = redWins >= 2;
  const blueChampion = blueWins >= 2;

  const Pip = ({ filled, side }: { filled: boolean; side: 'red' | 'blue' }) => (
    <span
      className={`inline-block w-3 h-3 rounded-full text-[9px] text-center leading-3 font-bold ${
        filled
          ? side === 'red' ? 'bg-redAlliance text-white' : 'bg-blueAlliance text-white'
          : 'bg-surfaceElevated text-textMuted border border-border'
      }`}
    >
      {filled ? '✓' : '·'}
    </span>
  );

  return (
    <div className={`bg-surface rounded-lg border shadow-card overflow-hidden text-xs ${
      hasHome ? 'border-warning ring-1 ring-warning/40' : 'border-border'
    }`} style={{ width: FINALS_W, height: FINALS_H }}>
      {/* Header */}
      <div className="bg-warning/10 px-2 py-1 flex items-center justify-between border-b border-warning/30">
        <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Finals · BO3</span>
        <span className="text-[10px] text-textMuted">{played}/3</span>
      </div>

      {/* Red row */}
      <div className={`px-2 py-1.5 flex items-center gap-1.5 ${redChampion ? 'bg-success/10' : ''}`}>
        <span className="w-2 h-2 rounded-full bg-redAlliance flex-shrink-0" />
        <span className="text-redAlliance font-bold w-5 text-center text-[10px]">
          {redAllianceNum ? `A${redAllianceNum}` : '?'}
        </span>
        <span className={`flex-1 truncate text-[10px] ${homeOnRed ? 'text-warning font-bold' : 'text-textSecondary'}`}>
          {redTeams.length ? redTeams.join(', ') : 'TBD'}
        </span>
        <div className="flex gap-0.5">
          {[0, 1, 2].map(i => <Pip key={i} filled={i < redWins} side="red" />)}
        </div>
      </div>

      {/* Blue row */}
      <div className={`px-2 py-1.5 flex items-center gap-1.5 border-t border-border/50 ${blueChampion ? 'bg-success/10' : ''}`}>
        <span className="w-2 h-2 rounded-full bg-blueAlliance flex-shrink-0" />
        <span className="text-blueAlliance font-bold w-5 text-center text-[10px]">
          {blueAllianceNum ? `A${blueAllianceNum}` : '?'}
        </span>
        <span className={`flex-1 truncate text-[10px] ${homeOnBlue ? 'text-warning font-bold' : 'text-textSecondary'}`}>
          {blueTeams.length ? blueTeams.join(', ') : 'TBD'}
        </span>
        <div className="flex gap-0.5">
          {[0, 1, 2].map(i => <Pip key={i} filled={i < blueWins} side="blue" />)}
        </div>
      </div>

      {/* Prediction footer */}
      {prediction && played < 2 && (
        <div className="px-2 py-1 text-[9px] text-textMuted border-t border-border/50 text-center">
          Red {formatProb(prediction.redWinProb)} to win series
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findMatch(matches: TBAMatch[], compLevel: string, setNumber: number): TBAMatch | undefined {
  return matches.find(m => m.comp_level === compLevel && m.set_number === setNumber);
}

function getWinner(match: TBAMatch): 'red' | 'blue' | null {
  if (match.alliances.red.score < 0) return null;
  if (match.alliances.red.score > match.alliances.blue.score) return 'red';
  if (match.alliances.blue.score > match.alliances.red.score) return 'blue';
  return null; // tie — shouldn't happen in playoffs but handle gracefully
}

function allianceNumberForTeams(teamKeys: string[], alliances: TBAAlliance[]): number | null {
  for (let i = 0; i < alliances.length; i++) {
    if (alliances[i].picks.some(pk => teamKeys.includes(pk))) return i + 1;
  }
  return null;
}

// ─── Bracket Slot Component ─────────────────────────────────────────────────

interface SlotProps {
  match: TBAMatch | undefined;
  redAllianceNum: number | null;
  blueAllianceNum: number | null;
  redTeams: number[];
  blueTeams: number[];
  homeTeam: number;
  prediction: { redWinProb: number } | null;
  roundLabel: string;
  isFinal?: boolean;
  finalsMatches?: TBAMatch[];
}

function BracketSlot({ match, redAllianceNum, blueAllianceNum, redTeams, blueTeams, homeTeam, prediction, roundLabel, isFinal, finalsMatches }: SlotProps) {
  const isPlayed = match && match.alliances.red.score >= 0;
  const winner = match ? getWinner(match) : null;
  const homeOnRed = redTeams.includes(homeTeam);
  const homeOnBlue = blueTeams.includes(homeTeam);
  const hasHome = homeOnRed || homeOnBlue;

  // Finals: show series score
  const finalsInfo = useMemo(() => {
    if (!isFinal || !finalsMatches?.length) return null;
    let redWins = 0, blueWins = 0;
    for (const fm of finalsMatches) {
      if (fm.alliances.red.score < 0) continue;
      if (fm.alliances.red.score > fm.alliances.blue.score) redWins++;
      else if (fm.alliances.blue.score > fm.alliances.red.score) blueWins++;
    }
    return { redWins, blueWins, played: finalsMatches.filter(m => m.alliances.red.score >= 0).length };
  }, [isFinal, finalsMatches]);

  return (
    <div className={`bg-surface rounded-lg border shadow-card text-xs min-w-[160px] ${
      hasHome ? 'border-warning ring-1 ring-warning/40' : 'border-border'
    }`}>
      {/* Header */}
      <div className="px-2 py-1 bg-surfaceElevated rounded-t-lg border-b border-border/50 flex items-center justify-between">
        <span className="font-medium text-textMuted">{roundLabel}</span>
        {match && <span className="text-textMuted">{matchLabel(match)}</span>}
        {prediction && !isPlayed && (
          <span className="text-[10px] text-textMuted">{formatProb(prediction.redWinProb)} R</span>
        )}
      </div>

      {/* Red alliance row */}
      <div className={`px-2 py-1.5 flex items-center gap-1.5 ${
        winner === 'red' ? 'bg-success/10' : ''
      }`}>
        <span className="w-2 h-2 rounded-full bg-redAlliance flex-shrink-0" />
        <span className="text-redAlliance font-bold w-5 text-center text-[10px]">
          {redAllianceNum ? `A${redAllianceNum}` : '?'}
        </span>
        <span className={`flex-1 truncate ${homeOnRed ? 'text-warning font-bold' : 'text-textSecondary'}`}>
          {redTeams.length ? redTeams.join(', ') : 'TBD'}
        </span>
        {isFinal && finalsInfo ? (
          <span className={`font-bold ${winner === 'red' || (finalsInfo.redWins > finalsInfo.blueWins && finalsInfo.redWins >= 2) ? 'text-success' : 'text-textMuted'}`}>
            {finalsInfo.redWins}
          </span>
        ) : isPlayed ? (
          <span className={`font-bold ${winner === 'red' ? 'text-success' : 'text-textMuted'}`}>
            {match!.alliances.red.score}
          </span>
        ) : null}
      </div>

      {/* Blue alliance row */}
      <div className={`px-2 py-1.5 flex items-center gap-1.5 rounded-b-lg ${
        winner === 'blue' ? 'bg-success/10' : ''
      }`}>
        <span className="w-2 h-2 rounded-full bg-blueAlliance flex-shrink-0" />
        <span className="text-blueAlliance font-bold w-5 text-center text-[10px]">
          {blueAllianceNum ? `A${blueAllianceNum}` : '?'}
        </span>
        <span className={`flex-1 truncate ${homeOnBlue ? 'text-warning font-bold' : 'text-textSecondary'}`}>
          {blueTeams.length ? blueTeams.join(', ') : 'TBD'}
        </span>
        {isFinal && finalsInfo ? (
          <span className={`font-bold ${winner === 'blue' || (finalsInfo.blueWins > finalsInfo.redWins && finalsInfo.blueWins >= 2) ? 'text-success' : 'text-textMuted'}`}>
            {finalsInfo.blueWins}
          </span>
        ) : isPlayed ? (
          <span className={`font-bold ${winner === 'blue' ? 'text-success' : 'text-textMuted'}`}>
            {match!.alliances.blue.score}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function PlayoffBracket() {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const homeTeamNumber = useAnalyticsStore(s => s.homeTeamNumber);
  const predictionInputs = useAnalyticsStore(s => s.predictionInputs);
  const tbaLoading = useAnalyticsStore(s => s.tbaLoading);
  const fetchTBAData = useAnalyticsStore(s => s.fetchTBAData);

  const HOME = homeTeamNumber || 148;

  useEffect(() => {
    if (!tbaData) fetchTBAData();
  }, [tbaData, fetchTBAData]);

  const alliances = tbaData?.alliances ?? [];
  const matches = tbaData?.matches ?? [];
  const playoffMatches = matches.filter(m => m.comp_level !== 'qm');

  // Resolve which alliance is on each side of each bracket slot
  const resolvedSlots = useMemo(() => {
    if (!playoffMatches.length && !alliances.length) return [];

    // Build winner/loser map from completed matches
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

      if (seed && alliances[seed - 1]) {
        return alliances[seed - 1].picks;
      }
      if (from) {
        const prev = resultMap.get(from.set);
        if (prev) return from.result === 'winner' ? prev.winner : prev.loser;
      }
      // Try the actual match data if available
      const m = findMatch(playoffMatches, 'sf', slot.setNumber);
      if (m) {
        return side === 'red' ? m.alliances.red.team_keys : m.alliances.blue.team_keys;
      }
      return [];
    };

    return BRACKET_SLOTS.map(slot => {
      const m = findMatch(playoffMatches, 'sf', slot.setNumber);
      const redTeamKeys = m ? m.alliances.red.team_keys : resolveTeams(slot, 'red');
      const blueTeamKeys = m ? m.alliances.blue.team_keys : resolveTeams(slot, 'blue');
      const redTeams = redTeamKeys.map(teamKeyToNumber);
      const blueTeams = blueTeamKeys.map(teamKeyToNumber);
      const redAllianceNum = allianceNumberForTeams(redTeamKeys, alliances);
      const blueAllianceNum = allianceNumberForTeams(blueTeamKeys, alliances);

      // Prediction for unplayed matches with known teams
      let prediction: { redWinProb: number } | null = null;
      if (m && m.alliances.red.score < 0 && redTeams.length === 3 && blueTeams.length === 3 && predictionInputs.length) {
        const result = computeMatchup(redTeams, blueTeams, predictionInputs);
        prediction = { redWinProb: result.redRP.winProbability };
      }

      return { ...slot, match: m, redTeams, blueTeams, redAllianceNum, blueAllianceNum, prediction };
    });
  }, [playoffMatches, alliances, predictionInputs]);

  // Finals
  const finalsMatches = playoffMatches
    .filter(m => m.comp_level === 'f')
    .sort((a, b) => a.match_number - b.match_number);
  const firstFinal = finalsMatches[0];

  const finalsInfo = useMemo(() => {
    if (!firstFinal) {
      // Derive from bracket results
      const sf11 = resolvedSlots.find(s => s.setNumber === 11);
      const sf13 = resolvedSlots.find(s => s.setNumber === 13);
      const sf11Match = sf11?.match;
      const sf13Match = sf13?.match;
      const sf11Winner = sf11Match ? getWinner(sf11Match) : null;
      const sf13Winner = sf13Match ? getWinner(sf13Match) : null;

      const redTeamKeys = sf11Winner && sf11Match
        ? (sf11Winner === 'red' ? sf11Match.alliances.red.team_keys : sf11Match.alliances.blue.team_keys)
        : [];
      const blueTeamKeys = sf13Winner && sf13Match
        ? (sf13Winner === 'red' ? sf13Match.alliances.red.team_keys : sf13Match.alliances.blue.team_keys)
        : [];

      return {
        redTeams: redTeamKeys.map(teamKeyToNumber),
        blueTeams: blueTeamKeys.map(teamKeyToNumber),
        redAllianceNum: allianceNumberForTeams(redTeamKeys, alliances),
        blueAllianceNum: allianceNumberForTeams(blueTeamKeys, alliances),
      };
    }
    return {
      redTeams: firstFinal.alliances.red.team_keys.map(teamKeyToNumber),
      blueTeams: firstFinal.alliances.blue.team_keys.map(teamKeyToNumber),
      redAllianceNum: allianceNumberForTeams(firstFinal.alliances.red.team_keys, alliances),
      blueAllianceNum: allianceNumberForTeams(firstFinal.alliances.blue.team_keys, alliances),
    };
  }, [firstFinal, resolvedSlots, alliances]);

  // Finals prediction
  const finalsPrediction = useMemo(() => {
    if (firstFinal && firstFinal.alliances.red.score < 0 && predictionInputs.length) {
      const result = computeMatchup(finalsInfo.redTeams, finalsInfo.blueTeams, predictionInputs);
      return { redWinProb: result.redRP.winProbability };
    }
    if (!firstFinal && finalsInfo.redTeams.length === 3 && finalsInfo.blueTeams.length === 3 && predictionInputs.length) {
      const result = computeMatchup(finalsInfo.redTeams, finalsInfo.blueTeams, predictionInputs);
      return { redWinProb: result.redRP.winProbability };
    }
    return null;
  }, [firstFinal, finalsInfo, predictionInputs]);

  // Event champion
  const champion = useMemo(() => {
    let redWins = 0, blueWins = 0;
    for (const fm of finalsMatches) {
      if (fm.alliances.red.score < 0) continue;
      if (fm.alliances.red.score > fm.alliances.blue.score) redWins++;
      else blueWins++;
    }
    if (redWins >= 2) return { teams: finalsInfo.redTeams, allianceNum: finalsInfo.redAllianceNum };
    if (blueWins >= 2) return { teams: finalsInfo.blueTeams, allianceNum: finalsInfo.blueAllianceNum };
    return null;
  }, [finalsMatches, finalsInfo]);

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (!tbaData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw size={32} className="animate-spin text-textMuted" />
      </div>
    );
  }

  const hasPlayoffs = playoffMatches.length > 0 || alliances.length > 0;

  if (!hasPlayoffs) {
    return (
      <div className="text-center py-16 text-textMuted">
        <p className="text-xl font-medium">No Playoff Data Yet</p>
        <p className="text-sm mt-2">Playoff bracket will appear after alliance selection.</p>
      </div>
    );
  }

  // ─── Desktop Bracket Grid ─────────────────────────────────────────────────
  // Group by round for mobile fallback
  const roundGroups = [
    { label: 'Upper Bracket R1', slots: resolvedSlots.filter(s => [1,2,3,4].includes(s.setNumber)) },
    { label: 'Upper Bracket R2', slots: resolvedSlots.filter(s => [7,8].includes(s.setNumber)) },
    { label: 'Lower Bracket R2', slots: resolvedSlots.filter(s => [5,6].includes(s.setNumber)) },
    { label: 'Upper Final', slots: resolvedSlots.filter(s => s.setNumber === 11) },
    { label: 'Lower Bracket R3', slots: resolvedSlots.filter(s => [9,10].includes(s.setNumber)) },
    { label: 'Lower Bracket R4', slots: resolvedSlots.filter(s => s.setNumber === 12) },
    { label: 'Lower Final', slots: resolvedSlots.filter(s => s.setNumber === 13) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Playoff Bracket</h1>
        <button
          onClick={() => fetchTBAData()}
          disabled={tbaLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surfaceElevated hover:bg-interactive rounded-lg border border-border transition-colors"
        >
          <RefreshCw size={12} className={tbaLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Champion banner */}
      {champion && (
        <div className="bg-warning/15 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
          <Trophy size={28} className="text-warning flex-shrink-0" />
          <div>
            <p className="font-bold text-lg">
              Event Champion — Alliance {champion.allianceNum}
            </p>
            <p className="text-textSecondary">
              {champion.teams.map(t => (
                <Link key={t} to={`/teams/${t}`} className="hover:underline">
                  <span className={t === HOME ? 'text-warning font-bold' : ''}>{t}</span>
                </Link>
              )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}
            </p>
          </div>
        </div>
      )}


      {/* Alliance List */}
      {alliances.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-4 shadow-card">
          <p className="text-sm font-bold mb-3">Alliances</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {alliances.map((a, i) => {
              const nums = a.picks.map(teamKeyToNumber);
              const hasHomeTeam = nums.includes(HOME);
              return (
                <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${
                  hasHomeTeam ? 'border-warning bg-warning/10' : 'border-border/50'
                }`}>
                  <p className="font-bold text-sm mb-0.5">Alliance {i + 1}</p>
                  <p className="text-textSecondary">
                    {nums.map(n => (
                      <span key={n} className={n === HOME ? 'text-warning font-bold' : ''}>
                        {n}
                      </span>
                    )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Desktop Bracket — absolute layout with SVG connectors ═══ */}
      <div className="hidden lg:block overflow-x-auto">
        <div
          className="relative mx-auto"
          style={{ width: BRACKET_CANVAS_W, height: BRACKET_CANVAS_H }}
        >
          {/* Section labels */}
          <div className="absolute left-0 top-0 -mt-6 text-[11px] font-bold text-textMuted uppercase tracking-widest">
            Upper Bracket
          </div>
          <div className="absolute left-0 text-[11px] font-bold text-textMuted uppercase tracking-widest" style={{ top: 388 }}>
            Lower Bracket
          </div>
          <div className="absolute text-[11px] font-bold text-textMuted uppercase tracking-widest" style={{ left: FINALS_POS.x, top: FINALS_POS.y - 20 }}>
            Grand Finals
          </div>

          {/* Connector overlay */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={BRACKET_CANVAS_W}
            height={BRACKET_CANVAS_H}
            viewBox={`0 0 ${BRACKET_CANVAS_W} ${BRACKET_CANVAS_H}`}
          >
            {CONNECTORS.map((c, i) => (
              <path
                key={i}
                d={c.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray={c.dashed ? '4 4' : undefined}
                className={c.dashed ? 'text-textMuted/60' : 'text-textMuted'}
              />
            ))}
          </svg>

          {/* Bracket slots */}
          {resolvedSlots.map(s => {
            const pos = SLOT_LAYOUT[s.setNumber];
            if (!pos) return null;
            return (
              <div
                key={s.setNumber}
                className="absolute"
                style={{ left: pos.x, top: pos.y, width: SLOT_W, height: SLOT_H }}
              >
                <BracketSlot
                  match={s.match}
                  redAllianceNum={s.redAllianceNum}
                  blueAllianceNum={s.blueAllianceNum}
                  redTeams={s.redTeams}
                  blueTeams={s.blueTeams}
                  homeTeam={HOME}
                  prediction={s.prediction}
                  roundLabel={`M${s.setNumber}`}
                />
              </div>
            );
          })}

          {/* Finals (BO3 series card) */}
          <div
            className="absolute"
            style={{ left: FINALS_POS.x, top: FINALS_POS.y }}
          >
            <FinalsSeriesCard
              redTeams={finalsInfo.redTeams}
              blueTeams={finalsInfo.blueTeams}
              redAllianceNum={finalsInfo.redAllianceNum}
              blueAllianceNum={finalsInfo.blueAllianceNum}
              homeTeam={HOME}
              finalsMatches={finalsMatches}
              prediction={finalsPrediction}
            />
          </div>
        </div>
      </div>

      {/* ═══ Mobile: Round-by-round list ═══ */}
      <div className="lg:hidden space-y-6">
        {roundGroups.map(group => (
          <div key={group.label}>
            <p className="text-sm font-bold text-textMuted uppercase tracking-widest mb-2">{group.label}</p>
            <div className="space-y-2">
              {group.slots.map(s => (
                <BracketSlot
                  key={s.setNumber}
                  match={s.match}
                  redAllianceNum={s.redAllianceNum}
                  blueAllianceNum={s.blueAllianceNum}
                  redTeams={s.redTeams}
                  blueTeams={s.blueTeams}
                  homeTeam={HOME}
                  prediction={s.prediction}
                  roundLabel={`M${s.setNumber}`}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Finals mobile */}
        <div>
          <p className="text-sm font-bold text-textMuted uppercase tracking-widest mb-2">Grand Finals (Best of 3)</p>
          <BracketSlot
            match={firstFinal}
            redAllianceNum={finalsInfo.redAllianceNum}
            blueAllianceNum={finalsInfo.blueAllianceNum}
            redTeams={finalsInfo.redTeams}
            blueTeams={finalsInfo.blueTeams}
            homeTeam={HOME}
            prediction={finalsPrediction}
            roundLabel="Finals"
            isFinal
            finalsMatches={finalsMatches}
          />
        </div>
      </div>

      {/* ═══ Quick Prediction Matrix ═══ */}
      {alliances.length >= 2 && predictionInputs.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-4 shadow-card">
          <p className="text-sm font-bold mb-3">Alliance vs Alliance Win Probability</p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-textMuted"></th>
                  {alliances.map((_, i) => (
                    <th key={i} className="px-2 py-1 text-center font-bold">A{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alliances.map((redA, ri) => {
                  const redNums = redA.picks.map(teamKeyToNumber);
                  const hasHomeRed = redNums.includes(HOME);
                  return (
                    <tr key={ri}>
                      <td className={`px-2 py-1 font-bold ${hasHomeRed ? 'text-warning' : ''}`}>A{ri + 1}</td>
                      {alliances.map((blueA, bi) => {
                        if (ri === bi) return <td key={bi} className="px-2 py-1 text-center text-textMuted">—</td>;
                        const blueNums = blueA.picks.map(teamKeyToNumber);
                        const result = computeMatchup(redNums, blueNums, predictionInputs);
                        const prob = result.redRP.winProbability;
                        const bg = prob > 0.6 ? 'bg-success/20' : prob < 0.4 ? 'bg-danger/20' : 'bg-warning/10';
                        return (
                          <td key={bi} className={`px-2 py-1 text-center font-mono ${bg}`}>
                            {formatProb(prob)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-textMuted mt-2">Row alliance (red) win probability vs column alliance (blue)</p>
        </div>
      )}
    </div>
  );
}

export default PlayoffBracket;
