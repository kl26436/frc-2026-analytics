import { useMemo, useEffect } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { matchLabel, matchSortKey } from '../utils/formatting';
import { computeMatchup } from '../utils/predictions';
import SourceMixFooter from '../components/SourceMixFooter';
import { formatProb } from '../utils/formatting';
import { RefreshCw, Trophy, ChevronDown } from 'lucide-react';
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
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
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

  // ─── Home team next match info (for hero card) ───────────────────────────
  const homeKey = `frc${HOME}`;

  const allSorted = useMemo(() =>
    [...matches].sort((a, b) => matchSortKey(a) - matchSortKey(b)),
    [matches],
  );

  const homePlayoffMatches = useMemo(() =>
    allSorted.filter(m =>
      m.comp_level !== 'qm' &&
      (m.alliances.red.team_keys.includes(homeKey) || m.alliances.blue.team_keys.includes(homeKey)),
    ),
    [allSorted, homeKey],
  );

  const nextHomeMatch = homePlayoffMatches.find(m => m.alliances.red.score < 0) ?? null;

  const nextMatchInfo = useMemo(() => {
    if (!nextHomeMatch) return null;
    const onRed = nextHomeMatch.alliances.red.team_keys.includes(homeKey);
    const bumperColor = onRed ? 'red' : 'blue';
    const partners = (onRed ? nextHomeMatch.alliances.red.team_keys : nextHomeMatch.alliances.blue.team_keys)
      .filter(k => k !== homeKey).map(teamKeyToNumber);
    const opponents = (onRed ? nextHomeMatch.alliances.blue.team_keys : nextHomeMatch.alliances.red.team_keys)
      .map(teamKeyToNumber);

    // Matches away
    const firstUnplayed = allSorted.findIndex(m => m.alliances.red.score < 0);
    const nextIdx = allSorted.findIndex(m => m.key === nextHomeMatch.key);
    const matchesAway = firstUnplayed >= 0 && nextIdx >= 0 ? nextIdx - firstUnplayed : null;

    // Time
    const time = nextHomeMatch.predicted_time || nextHomeMatch.time;
    const timeStr = time ? new Date(time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

    // Prediction
    let prediction: ReturnType<typeof computeMatchup> | null = null;
    if (predictionInputs.length) {
      const redNums = nextHomeMatch.alliances.red.team_keys.map(teamKeyToNumber);
      const blueNums = nextHomeMatch.alliances.blue.team_keys.map(teamKeyToNumber);
      prediction = computeMatchup(redNums, blueNums, predictionInputs);
    }

    return { label: matchLabel(nextHomeMatch), bumperColor, partners, opponents, matchesAway, timeStr, prediction, onRed };
  }, [nextHomeMatch, allSorted, homeKey, predictionInputs]);

  // Home alliance number
  const homeAllianceNum = useMemo(() => {
    for (let i = 0; i < alliances.length; i++) {
      if (alliances[i].picks.includes(homeKey)) return i + 1;
    }
    return null;
  }, [alliances, homeKey]);

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

      {/* ═══ Home Team Hero Card ═══ */}
      {(nextMatchInfo || homeAllianceNum) && (
        <div className="bg-gradient-to-r from-warning/15 to-transparent rounded-xl border border-warning/20 p-4 md:p-6 shadow-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-4xl md:text-5xl font-black text-warning">{HOME}</div>
              <div>
                <p className="text-lg font-bold">
                  {homeAllianceNum ? `Alliance ${homeAllianceNum}` : 'Robowranglers'}
                </p>
                <p className="text-sm text-textSecondary">Playoffs</p>
              </div>
            </div>
            {nextMatchInfo ? (
              <div className="flex items-center gap-3 md:gap-4 divide-x divide-border">
                {/* Next Match */}
                <div className="text-center min-w-[60px]">
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest">Next</p>
                  <p className="text-2xl md:text-3xl font-black">{nextMatchInfo.label}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    {nextMatchInfo.timeStr && <span className="text-xs text-textSecondary">~{nextMatchInfo.timeStr}</span>}
                    {nextMatchInfo.matchesAway !== null && nextMatchInfo.matchesAway > 0 && (
                      <span className="text-xs text-textMuted">· {nextMatchInfo.matchesAway} away</span>
                    )}
                    {nextMatchInfo.matchesAway === 0 && (
                      <span className="text-xs text-warning font-bold animate-pulse">ON DECK</span>
                    )}
                  </div>
                </div>
                {/* Bumper Color */}
                <div className="text-center min-w-[60px] pl-3 md:pl-4">
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest">Bumpers</p>
                  <p className={`text-2xl md:text-3xl font-black ${
                    nextMatchInfo.bumperColor === 'red' ? 'text-redAlliance' : 'text-blueAlliance'
                  }`}>
                    {nextMatchInfo.bumperColor === 'red' ? 'RED' : 'BLUE'}
                  </p>
                </div>
                {/* Partners */}
                <div className="pl-3 md:pl-4">
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest">With Us</p>
                  <p className="text-sm font-bold">
                    {nextMatchInfo.partners.map(n => (
                      <Link key={n} to={`/teams/${n}`} className="hover:underline">
                        {n}
                      </Link>
                    )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}
                  </p>
                </div>
                {/* Opponents */}
                <div className="pl-3 md:pl-4">
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest">Against</p>
                  <p className="text-sm font-bold text-danger">
                    {nextMatchInfo.opponents.map(n => (
                      <Link key={n} to={`/teams/${n}`} className="hover:underline">
                        {n}
                      </Link>
                    )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-textSecondary">No upcoming playoff matches</div>
            )}
          </div>

        </div>
      )}

      {/* ═══ Match Prediction (Dashboard-style, no RP) ═══ */}
      {nextMatchInfo?.prediction && (() => {
        const pred = nextMatchInfo.prediction;
        const { red, blue, scoreDiff, favoredAlliance } = pred;
        const isRed = nextMatchInfo.onRed;
        const weFavored = (isRed && favoredAlliance === 'red') || (!isRed && favoredAlliance === 'blue');
        const favoredLabel = favoredAlliance === 'even'
          ? 'Even matchup'
          : `${favoredAlliance === 'red' ? 'Red' : 'Blue'} favored by ${scoreDiff.toFixed(1)} pts`;

        const phases = [
          { label: 'Auto', red: red.autoHubScore + red.autoTowerScore, blue: blue.autoHubScore + blue.autoTowerScore },
          { label: 'Teleop', red: red.teleopHubScore, blue: blue.teleopHubScore },
          { label: 'Endgame', red: red.endgameTowerScore, blue: blue.endgameTowerScore },
          { label: 'TOTAL', red: red.totalScore, blue: blue.totalScore },
        ];

        // Scout notes
        const redNums = nextMatchInfo.onRed
          ? nextMatchInfo.partners.concat(HOME)
          : nextMatchInfo.opponents;
        const blueNums = nextMatchInfo.onRed
          ? nextMatchInfo.opponents
          : nextMatchInfo.partners.concat(HOME);
        const getTeamNotes = (nums: number[]) => nums
          .filter(num => num !== HOME)
          .map(num => {
            const stats = teamStatistics.find(t => t.teamNumber === num);
            const notes = (stats?.notesList ?? []).filter((n: string) => n.trim().length > 0);
            return { teamNumber: num, notes: notes.slice(-3) };
          }).filter(t => t.notes.length > 0);
        const allyNums = isRed ? redNums : blueNums;
        const oppNums = isRed ? blueNums : redNums;
        const allyNotes = getTeamNotes(allyNums);
        const oppNotes = getTeamNotes(oppNums);
        const hasNotes = allyNotes.length > 0 || oppNotes.length > 0;

        return (
          <div className="bg-surface rounded-xl border border-border p-4 md:p-6 shadow-card">
            <h2 className="text-sm md:text-base font-bold flex items-center gap-2 mb-4">
              Next Match — {nextMatchInfo.label}
            </h2>

            {/* Big predicted scores */}
            <div className="bg-surfaceElevated rounded-lg p-4 md:p-5">
              <div className="flex items-center justify-between">
                <div className="text-center flex-1">
                  <p className="text-xs text-redAlliance font-semibold mb-1">Red</p>
                  <div className="flex justify-center gap-1 mb-2 flex-wrap">
                    {(nextMatchInfo.onRed ? [HOME, ...nextMatchInfo.partners] : nextMatchInfo.opponents).map(num => (
                      <Link key={num} to={`/teams/${num}`}
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${num === HOME ? 'bg-redAlliance/20 text-redAlliance ring-1 ring-redAlliance/50' : 'bg-surface text-textSecondary'}`}>
                        {num}
                      </Link>
                    ))}
                  </div>
                  <p className="text-3xl md:text-4xl font-black text-redAlliance">{red.totalScore.toFixed(1)}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                    red.confidence === 'high' ? 'bg-success/20 text-success' : red.confidence === 'medium' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                  }`}>{red.confidence} confidence</span>
                  <SourceMixFooter teamNumbers={redNums} color="red" className="mt-1" />
                </div>
                <span className="text-textMuted text-lg font-semibold px-4">vs</span>
                <div className="text-center flex-1">
                  <p className="text-xs text-blueAlliance font-semibold mb-1">Blue</p>
                  <div className="flex justify-center gap-1 mb-2 flex-wrap">
                    {(nextMatchInfo.onRed ? nextMatchInfo.opponents : [HOME, ...nextMatchInfo.partners]).map(num => (
                      <Link key={num} to={`/teams/${num}`}
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${num === HOME ? 'bg-blueAlliance/20 text-blueAlliance ring-1 ring-blueAlliance/50' : 'bg-surface text-textSecondary'}`}>
                        {num}
                      </Link>
                    ))}
                  </div>
                  <p className="text-3xl md:text-4xl font-black text-blueAlliance">{blue.totalScore.toFixed(1)}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                    blue.confidence === 'high' ? 'bg-success/20 text-success' : blue.confidence === 'medium' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                  }`}>{blue.confidence} confidence</span>
                  <SourceMixFooter teamNumbers={blueNums} color="blue" className="mt-1" />
                </div>
              </div>
              <p className={`text-center mt-3 text-sm font-semibold ${
                favoredAlliance === 'even' ? 'text-textMuted' : weFavored ? 'text-success' : 'text-danger'
              }`}>{favoredLabel}</p>
            </div>

            {/* Phase breakdown */}
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surfaceElevated text-xs uppercase tracking-wider">
                    <th className="text-left py-2.5 px-3 font-semibold text-textSecondary">Phase</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-redAlliance">Red</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-blueAlliance">Blue</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-textSecondary">Advantage</th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map((p, index) => {
                    const diff = p.red - p.blue;
                    const advLabel = Math.abs(diff) < 0.5 ? 'Even' : `${diff > 0 ? 'Red' : 'Blue'} +${Math.abs(diff).toFixed(1)}`;
                    const advColor = Math.abs(diff) < 0.5 ? 'text-textMuted' : diff > 0 ? 'text-redAlliance' : 'text-blueAlliance';
                    const isTotal = p.label === 'TOTAL';
                    return (
                      <tr key={p.label} className={`border-t border-border/50 ${isTotal ? 'bg-surfaceElevated font-bold' : index % 2 === 1 ? 'bg-surfaceAlt/50' : ''}`}>
                        <td className="py-2 px-3 font-medium">{p.label}</td>
                        <td className="py-2 px-3 text-center text-redAlliance">{p.red.toFixed(1)}</td>
                        <td className="py-2 px-3 text-center text-blueAlliance">{p.blue.toFixed(1)}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${advColor}`}>
                          {Math.abs(diff) >= 0.5 && <span className="text-[10px] mr-0.5">{diff > 0 ? '\u25B2' : '\u25BC'}</span>}
                          {advLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Team breakdowns + scout notes (collapsible) */}
            <details className="mt-4 group/detail">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-textSecondary hover:text-textPrimary transition-colors">
                <ChevronDown size={14} className="transition-transform group-open/detail:rotate-180" />
                Team Breakdowns{hasNotes ? ` & Scout Notes` : ''}
              </summary>
              <div className="mt-3 space-y-4">
                {/* Team breakdowns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {[
                    { label: 'Red' as const, color: 'redAlliance', headerBg: 'bg-redAlliance/10', teams: red.teams },
                    { label: 'Blue' as const, color: 'blueAlliance', headerBg: 'bg-blueAlliance/10', teams: blue.teams },
                  ].map(side => (
                    <div key={side.label} className="overflow-hidden rounded-lg border border-border">
                      <div className={`${side.headerBg} px-3 py-1.5`}>
                        <p className={`text-xs font-semibold text-${side.color}`}>{side.label} Breakdown</p>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-textMuted bg-surfaceElevated">
                            <th className="text-left py-1 px-2 font-medium">Team</th>
                            <th className="text-center py-1 px-1 font-medium">Auto</th>
                            <th className="text-center py-1 px-1 font-medium">Tele</th>
                            <th className="text-center py-1 px-1 font-medium">End</th>
                            <th className="text-center py-1 px-1 font-medium">Total</th>
                            <th className="text-right py-1 px-2 font-medium">Rel.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {side.teams.map(t => (
                            <tr key={t.teamNumber} className="border-t border-border/30">
                              <td className="py-1 px-2">
                                <Link to={`/teams/${t.teamNumber}`} className={`font-semibold hover:underline ${t.teamNumber === HOME ? 'text-warning' : ''}`}>{t.teamNumber}</Link>
                              </td>
                              <td className="py-1 px-1 text-center">{(t.autoHubPoints + t.autoTowerPoints).toFixed(1)}</td>
                              <td className="py-1 px-1 text-center">{t.teleopHubPoints.toFixed(1)}</td>
                              <td className="py-1 px-1 text-center">{t.endgameTowerPoints.toFixed(1)}</td>
                              <td className="py-1 px-1 text-center font-bold">{t.totalPoints.toFixed(1)}</td>
                              <td className={`py-1 px-2 text-right font-medium ${t.reliability >= 0.9 ? 'text-success' : t.reliability >= 0.7 ? 'text-warning' : 'text-danger'}`}>
                                {(t.reliability * 100).toFixed(0)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>

                {/* Scout notes */}
                {hasNotes && (
                  <>
                    <div className="border-t border-border/50" />
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-textSecondary">Scout Notes</p>
                      {allyNotes.length > 0 && (
                        <>
                          <p className="text-[10px] uppercase tracking-widest text-success font-semibold">Alliance Partners</p>
                          {allyNotes.map(t => (
                            <div key={t.teamNumber}>
                              <Link to={`/teams/${t.teamNumber}`} className="text-xs font-bold hover:underline">{t.teamNumber}</Link>
                              <div className="mt-1 space-y-1">
                                {t.notes.map((note: string, i: number) => (
                                  <p key={i} className="text-xs text-textSecondary bg-surfaceElevated rounded px-2.5 py-1.5 leading-relaxed">"{note}"</p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {allyNotes.length > 0 && oppNotes.length > 0 && <div className="border-t border-border/30" />}
                      {oppNotes.length > 0 && (
                        <>
                          <p className="text-[10px] uppercase tracking-widest text-danger font-semibold">Opponents</p>
                          {oppNotes.map(t => (
                            <div key={t.teamNumber}>
                              <Link to={`/teams/${t.teamNumber}`} className="text-xs font-bold hover:underline">{t.teamNumber}</Link>
                              <div className="mt-1 space-y-1">
                                {t.notes.map((note: string, i: number) => (
                                  <p key={i} className="text-xs text-textSecondary bg-surfaceElevated rounded px-2.5 py-1.5 leading-relaxed">"{note}"</p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </details>
          </div>
        );
      })()}

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
