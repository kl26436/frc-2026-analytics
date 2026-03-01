// OPR (Offensive Power Rating) calculator
// Solves the standard least-squares system: alliance_score = OPR_a + OPR_b + OPR_c

import type { PgTBAMatch } from '../types/scouting';
import { teamKeyToNumber } from './tbaApi';

export interface OPRResults {
  /** team number → total OPR (excluding foul points received) */
  totalOpr: Map<number, number>;
  /** team number → auto OPR */
  autoOpr: Map<number, number>;
  /** team number → teleop OPR */
  teleopOpr: Map<number, number>;
  /** team number → endgame (tower) OPR */
  endgameOpr: Map<number, number>;
}

type ScoreExtractor = (match: PgTBAMatch, alliance: 'red' | 'blue') => number;

// ── Score extractors ──

const totalScore: ScoreExtractor = (m, a) =>
  (a === 'red' ? m.red_totalPoints - m.red_foulPoints : m.blue_totalPoints - m.blue_foulPoints);

const autoScore: ScoreExtractor = (m, a) =>
  a === 'red' ? m.red_totalAutoPoints : m.blue_totalAutoPoints;

const teleopScore: ScoreExtractor = (m, a) =>
  a === 'red' ? m.red_totalTeleopPoints : m.blue_totalTeleopPoints;

const endgameScore: ScoreExtractor = (m, a) =>
  a === 'red' ? m.red_totalTowerPoints : m.blue_totalTowerPoints;

// ── Gaussian elimination to solve Ax = b ──

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  // Build augmented matrix
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) continue; // singular — skip

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(aug[row][row]) < 1e-10) continue;
    let sum = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= aug[row][col] * x[col];
    }
    x[row] = sum / aug[row][row];
  }
  return x;
}

/**
 * Compute OPR for a single score component.
 * Returns Map<teamNumber, opr>.
 */
function computeComponentOPR(
  matches: PgTBAMatch[],
  teamIndex: Map<number, number>,
  extractor: ScoreExtractor,
): Map<number, number> {
  const n = teamIndex.size;
  if (n === 0) return new Map();

  // M^T M (n×n) and M^T s (n×1)
  const MtM: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Mts: number[] = new Array(n).fill(0);

  for (const match of matches) {
    for (const alliance of ['red', 'blue'] as const) {
      const teamKeys = alliance === 'red' ? match.red_teams : match.blue_teams;
      const teams = teamKeys.map(k => teamKeyToNumber(k));
      const score = extractor(match, alliance);

      // Each alliance row has 1s for its 3 teams
      const indices = teams.map(t => teamIndex.get(t)!).filter(i => i !== undefined);
      for (const i of indices) {
        Mts[i] += score;
        for (const j of indices) {
          MtM[i][j] += 1;
        }
      }
    }
  }

  const oprValues = solveLinearSystem(MtM, Mts);
  const result = new Map<number, number>();
  for (const [team, idx] of teamIndex) {
    result.set(team, Math.round(oprValues[idx] * 100) / 100);
  }
  return result;
}

/**
 * Compute OPR + component OPRs from PgTBAMatch data.
 * Only uses qual matches (comp_level === 'qm') with valid scores.
 */
export function computeOPR(pgTbaMatches: PgTBAMatch[]): OPRResults {
  // Filter to qual matches with valid scores
  const matches = pgTbaMatches.filter(
    m => m.comp_level === 'qm' && m.red_score >= 0 && m.blue_score >= 0
  );

  if (matches.length === 0) {
    return { totalOpr: new Map(), autoOpr: new Map(), teleopOpr: new Map(), endgameOpr: new Map() };
  }

  // Build team index
  const teamSet = new Set<number>();
  for (const m of matches) {
    for (const k of [...m.red_teams, ...m.blue_teams]) {
      teamSet.add(teamKeyToNumber(k));
    }
  }
  const teamIndex = new Map<number, number>();
  let idx = 0;
  for (const t of teamSet) {
    teamIndex.set(t, idx++);
  }

  return {
    totalOpr: computeComponentOPR(matches, teamIndex, totalScore),
    autoOpr: computeComponentOPR(matches, teamIndex, autoScore),
    teleopOpr: computeComponentOPR(matches, teamIndex, teleopScore),
    endgameOpr: computeComponentOPR(matches, teamIndex, endgameScore),
  };
}
