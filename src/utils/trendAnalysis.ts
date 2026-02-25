import type { ScoutEntry } from '../types/scouting';
import { estimateMatchPoints, parseClimbLevel } from '../types/scouting';

// ── Types ──

export interface MatchResult {
  matchNumber: number;
  matchLabel: string;        // "Q5"
  autoPoints: number;
  teleopPoints: number;
  endgamePoints: number;
  total: number;
  climbLevel: number;        // 0-3
}

export interface TeamTrend {
  teamNumber: number;
  matchResults: MatchResult[];   // sorted ascending by match_number
  overallAvg: {
    total: number;
    auto: number;
    l3ClimbRate: number;         // 0-100
  };
  last3Avg: {
    total: number;
    auto: number;
    l3ClimbRate: number;         // 0-100
  };
  best3of4Avg: {
    total: number;
  };
  delta: number;                 // percentage: (last3 - overall) / overall * 100
  trend: 'improving' | 'declining' | 'stable';
}

// ── Computation ──

export function computeTeamTrend(teamNumber: number, allEntries: ScoutEntry[]): TeamTrend {
  const entries = allEntries
    .filter(e => e.team_number === teamNumber)
    .sort((a, b) => a.match_number - b.match_number);

  const matchResults: MatchResult[] = entries.map(e => {
    const pts = estimateMatchPoints(e);
    return {
      matchNumber: e.match_number,
      matchLabel: `Q${e.match_number}`,
      autoPoints: pts.autoPoints,
      teleopPoints: pts.teleopPoints,
      endgamePoints: pts.endgamePoints,
      total: pts.total,
      climbLevel: parseClimbLevel(e.climb_level),
    };
  });

  const n = matchResults.length;

  if (n === 0) {
    return {
      teamNumber,
      matchResults: [],
      overallAvg: { total: 0, auto: 0, l3ClimbRate: 0 },
      last3Avg: { total: 0, auto: 0, l3ClimbRate: 0 },
      best3of4Avg: { total: 0 },
      delta: 0,
      trend: 'stable',
    };
  }

  // Overall averages
  const overallTotal = matchResults.reduce((s, m) => s + m.total, 0) / n;
  const overallAuto = matchResults.reduce((s, m) => s + m.autoPoints, 0) / n;
  const overallL3 = (matchResults.filter(m => m.climbLevel === 3).length / n) * 100;

  // Last 3 (or fewer)
  const last3 = matchResults.slice(-3);
  const l3n = last3.length;
  const last3Total = last3.reduce((s, m) => s + m.total, 0) / l3n;
  const last3Auto = last3.reduce((s, m) => s + m.autoPoints, 0) / l3n;
  const last3L3 = (last3.filter(m => m.climbLevel === 3).length / l3n) * 100;

  // Best 3 of last 4
  let best3of4Total: number;
  if (n >= 4) {
    const last4 = matchResults.slice(-4).map(m => m.total);
    last4.sort((a, b) => a - b); // ascending — drop lowest
    best3of4Total = (last4[1] + last4[2] + last4[3]) / 3;
  } else {
    best3of4Total = last3Total;
  }

  // Delta and trend
  const delta = overallTotal > 0
    ? ((last3Total - overallTotal) / overallTotal) * 100
    : 0;
  const trend: TeamTrend['trend'] =
    n < 3 ? 'stable'
    : delta > 10 ? 'improving'
    : delta < -10 ? 'declining'
    : 'stable';

  return {
    teamNumber,
    matchResults,
    overallAvg: { total: overallTotal, auto: overallAuto, l3ClimbRate: overallL3 },
    last3Avg: { total: last3Total, auto: last3Auto, l3ClimbRate: last3L3 },
    best3of4Avg: { total: best3of4Total },
    delta,
    trend,
  };
}

export function computeAllTeamTrends(allEntries: ScoutEntry[]): TeamTrend[] {
  const teamNumbers = [...new Set(allEntries.map(e => e.team_number))];
  return teamNumbers.map(num => computeTeamTrend(num, allEntries));
}
