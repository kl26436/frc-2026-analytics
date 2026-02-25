import type { TeamStatistics } from '../types/scouting';
import type { TeamFuelStats } from './fuelAttribution';

// ─── Prediction Input ────────────────────────────────────────

/** Merged team data for the prediction engine. One per team. */
export interface PredictionTeamInput {
  teamNumber: number;
  teamName?: string;
  matchesPlayed: number;
  dataSource: 'fms' | 'scout';

  // Hub fuel scoring (FMS points when available, scout estimate fallback)
  avgAutoHubPoints: number;
  avgTeleopHubPoints: number;
  stdAutoHubPoints: number;
  stdTeleopHubPoints: number;

  // Tower scoring (FMS climb data when available, scout rate fallback)
  autoClimbRate: number;                                  // 0–1 fraction
  endgameClimbRates: [number, number, number, number];    // [none, L1, L2, L3]
  avgAutoTowerPoints: number;
  avgEndgameTowerPoints: number;
  stdAutoTowerPoints: number;
  stdEndgameTowerPoints: number;

  // Reliability (0–1, higher is better)
  reliability: number;
}

/**
 * Merge TeamStatistics (scout) + TeamFuelStats (FMS-attributed) into
 * PredictionTeamInput. FMS data preferred when available.
 */
export function buildPredictionInputs(
  scoutStats: TeamStatistics[],
  fuelStats: TeamFuelStats[],
): PredictionTeamInput[] {
  const fuelMap = new Map(fuelStats.map(f => [f.teamNumber, f]));
  const SCOUT_CV = 0.4; // coefficient of variation heuristic for scout-only data

  return scoutStats.map(scout => {
    const fuel = fuelMap.get(scout.teamNumber);
    const useFms = fuel && fuel.matchesPlayed >= 1;

    // Reliability from scout flags (both paths use this)
    const unreliabilityPct = (scout.lostConnectionRate + scout.noRobotRate);
    const reliability = 1 - Math.min(unreliabilityPct / 100, 0.5);

    if (useFms) {
      return {
        teamNumber: scout.teamNumber,
        teamName: scout.teamName,
        matchesPlayed: fuel.matchesPlayed,
        dataSource: 'fms' as const,
        avgAutoHubPoints: fuel.avgAutoPointsScored,
        avgTeleopHubPoints: fuel.avgTeleopPointsScored,
        stdAutoHubPoints: fuel.stdAutoPointsScored,
        stdTeleopHubPoints: fuel.stdTeleopPointsScored,
        autoClimbRate: fuel.autoClimbRate,
        endgameClimbRates: fuel.endgameClimbRates,
        avgAutoTowerPoints: fuel.avgAutoTowerPoints,
        avgEndgameTowerPoints: fuel.avgEndgameTowerPoints,
        stdAutoTowerPoints: fuel.stdAutoTowerPoints,
        stdEndgameTowerPoints: fuel.stdEndgameTowerPoints,
        reliability,
      };
    }

    // Fallback: scout-only estimates
    // Convert scout rates (0–100) to 0–1 fractions
    const l1 = scout.level1ClimbRate / 100;
    const l2 = scout.level2ClimbRate / 100;
    const l3 = scout.level3ClimbRate / 100;
    const none = Math.max(0, 1 - l1 - l2 - l3);

    // avgAutoFuelEstimate is ball-equivalent, treat as hub points
    // (don't use avgAutoPoints which includes auto climb pts)
    const scoutAutoHub = scout.avgAutoFuelEstimate;
    const scoutTeleopHub = scout.avgTeleopFuelEstimate;
    const autoClimbRate = scout.autoClimbRate / 100;
    const avgAutoTowerPoints = autoClimbRate * 15;
    const avgEndgameTowerPoints = l1 * 10 + l2 * 20 + l3 * 30;

    return {
      teamNumber: scout.teamNumber,
      teamName: scout.teamName,
      matchesPlayed: scout.matchesPlayed,
      dataSource: 'scout' as const,
      avgAutoHubPoints: scoutAutoHub,
      avgTeleopHubPoints: scoutTeleopHub,
      stdAutoHubPoints: Math.max(scoutAutoHub * SCOUT_CV, 1),
      stdTeleopHubPoints: Math.max(scoutTeleopHub * SCOUT_CV, 1),
      autoClimbRate,
      endgameClimbRates: [none, l1, l2, l3] as [number, number, number, number],
      avgAutoTowerPoints,
      avgEndgameTowerPoints,
      stdAutoTowerPoints: avgAutoTowerPoints > 0 ? avgAutoTowerPoints * 0.5 : 0,
      stdEndgameTowerPoints: avgEndgameTowerPoints > 0 ? avgEndgameTowerPoints * 0.5 : 0,
      reliability,
    };
  });
}

// ─── Prediction Output Types ─────────────────────────────────

export interface TeamBreakdown {
  teamNumber: number;
  teamName?: string;
  autoHubPoints: number;
  teleopHubPoints: number;
  autoTowerPoints: number;
  endgameTowerPoints: number;
  totalPoints: number;
  reliability: number;
  matchesPlayed: number;
  dataSource: 'fms' | 'scout';
}

export interface AlliancePrediction {
  totalScore: number;
  autoHubScore: number;
  teleopHubScore: number;
  autoTowerScore: number;
  endgameTowerScore: number;
  totalHubPoints: number;       // for Energized/Supercharged RP check
  totalTowerPoints: number;     // for Traversal RP check
  reliability: number;
  confidence: 'high' | 'medium' | 'low';
  teams: TeamBreakdown[];
}

export interface MonteCarloResult {
  winProbability: number;
  expectedTotalRP: number;
  expectedWinRP: number;
  energizedProb: number;        // P(hub points ≥ 100)
  superchargedProb: number;     // P(hub points ≥ 360)
  traversalProb: number;        // P(tower points ≥ 50)
  scorePercentiles: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  meanScore: number;
  stdScore: number;
  numTrials: number;
}

export interface MatchupResult {
  red: AlliancePrediction;
  blue: AlliancePrediction;
  scoreDiff: number;
  favoredAlliance: 'red' | 'blue' | 'even';
  redRP: MonteCarloResult;
  blueRP: MonteCarloResult;
}

// ─── Deterministic Prediction ────────────────────────────────

function zeroTeamBreakdown(teamNumber: number): TeamBreakdown {
  return {
    teamNumber, autoHubPoints: 0, teleopHubPoints: 0,
    autoTowerPoints: 0, endgameTowerPoints: 0, totalPoints: 0,
    reliability: 0.5, matchesPlayed: 0, dataSource: 'scout',
  };
}

export function predictAlliance(
  teamNumbers: number[],
  inputs: PredictionTeamInput[],
): AlliancePrediction {
  const teams: TeamBreakdown[] = teamNumbers.map(num => {
    const t = inputs.find(i => i.teamNumber === num);
    if (!t) return zeroTeamBreakdown(num);

    const rel = t.reliability;
    return {
      teamNumber: num,
      teamName: t.teamName,
      autoHubPoints: t.avgAutoHubPoints * rel,
      teleopHubPoints: t.avgTeleopHubPoints * rel,
      autoTowerPoints: t.avgAutoTowerPoints * rel,
      endgameTowerPoints: t.avgEndgameTowerPoints * rel,
      totalPoints:
        (t.avgAutoHubPoints + t.avgTeleopHubPoints +
         t.avgAutoTowerPoints + t.avgEndgameTowerPoints) * rel,
      reliability: rel,
      matchesPlayed: t.matchesPlayed,
      dataSource: t.dataSource,
    };
  });

  const autoHubScore = teams.reduce((s, t) => s + t.autoHubPoints, 0);
  const teleopHubScore = teams.reduce((s, t) => s + t.teleopHubPoints, 0);
  const autoTowerScore = teams.reduce((s, t) => s + t.autoTowerPoints, 0);
  const endgameTowerScore = teams.reduce((s, t) => s + t.endgameTowerPoints, 0);
  const totalHubPoints = autoHubScore + teleopHubScore;
  const totalTowerPoints = autoTowerScore + endgameTowerScore;
  const totalScore = totalHubPoints + totalTowerPoints;

  const avgReliability = teams.length > 0
    ? teams.reduce((s, t) => s + t.reliability, 0) / teams.length : 0;
  const minMatches = teams.length > 0
    ? Math.min(...teams.map(t => t.matchesPlayed)) : 0;
  const confidence: 'high' | 'medium' | 'low' =
    minMatches >= 6 ? 'high' : minMatches >= 3 ? 'medium' : 'low';

  return {
    totalScore, autoHubScore, teleopHubScore,
    autoTowerScore, endgameTowerScore,
    totalHubPoints, totalTowerPoints,
    reliability: avgReliability, confidence, teams,
  };
}

// ─── Monte Carlo Engine ──────────────────────────────────────

const NUM_TRIALS = 1000;
const WIN_RP = 3;   // 2026 REBUILT: win = 3 RP
const TIE_RP = 1;

/** Box-Muller normal sample, clamped ≥ 0 */
function sampleNormal(mu: number, sigma: number): number {
  if (sigma <= 0) return Math.max(0, mu);
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, mu + sigma * z);
}

/** Sample endgame climb level from categorical distribution → points */
function sampleClimbPoints(rates: [number, number, number, number]): number {
  const r = Math.random();
  const points = [0, 10, 20, 30];
  let cumulative = 0;
  for (let i = 0; i < 4; i++) {
    cumulative += rates[i];
    if (r < cumulative) return points[i];
  }
  return 0;
}

interface SimTrial {
  totalScore: number;
  hubPoints: number;
  towerPoints: number;
}

function simulateAllianceTrial(teams: PredictionTeamInput[]): SimTrial {
  let hubPoints = 0;
  let towerPoints = 0;

  for (const t of teams) {
    // Reliability check: does robot show up?
    if (Math.random() > t.reliability) continue;

    // Hub scoring
    hubPoints += sampleNormal(t.avgAutoHubPoints, t.stdAutoHubPoints);
    hubPoints += sampleNormal(t.avgTeleopHubPoints, t.stdTeleopHubPoints);

    // Tower scoring
    towerPoints += Math.random() < t.autoClimbRate ? 15 : 0;
    towerPoints += sampleClimbPoints(t.endgameClimbRates);
  }

  return { totalScore: hubPoints + towerPoints, hubPoints, towerPoints };
}

function buildMonteCarloResult(
  myTrials: SimTrial[],
  oppTrials: SimTrial[],
  numTrials: number,
): MonteCarloResult {
  let wins = 0, ties = 0;
  let energized = 0, supercharged = 0, traversal = 0;
  const scores: number[] = [];

  for (let i = 0; i < numTrials; i++) {
    const my = myTrials[i];
    const opp = oppTrials[i];
    scores.push(my.totalScore);

    if (my.totalScore > opp.totalScore) wins++;
    else if (Math.abs(my.totalScore - opp.totalScore) < 0.5) ties++;

    if (my.hubPoints >= 100) energized++;
    if (my.hubPoints >= 360) supercharged++;
    if (my.towerPoints >= 50) traversal++;
  }

  const winProb = wins / numTrials;
  const tieProb = ties / numTrials;
  const energizedProb = energized / numTrials;
  const superchargedProb = supercharged / numTrials;
  const traversalProb = traversal / numTrials;
  const expectedWinRP = winProb * WIN_RP + tieProb * TIE_RP;
  const expectedTotalRP = expectedWinRP + energizedProb + superchargedProb + traversalProb;

  scores.sort((a, b) => a - b);
  const pct = (p: number) => scores[Math.floor(p * scores.length)] ?? 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;

  return {
    winProbability: winProb,
    expectedTotalRP,
    expectedWinRP,
    energizedProb,
    superchargedProb,
    traversalProb,
    scorePercentiles: { p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) },
    meanScore: mean,
    stdScore: Math.sqrt(variance),
    numTrials,
  };
}

export function monteCarloMatchup(
  redInputs: PredictionTeamInput[],
  blueInputs: PredictionTeamInput[],
  numTrials: number = NUM_TRIALS,
): { red: MonteCarloResult; blue: MonteCarloResult } {
  const redTrials: SimTrial[] = [];
  const blueTrials: SimTrial[] = [];

  for (let i = 0; i < numTrials; i++) {
    redTrials.push(simulateAllianceTrial(redInputs));
    blueTrials.push(simulateAllianceTrial(blueInputs));
  }

  return {
    red: buildMonteCarloResult(redTrials, blueTrials, numTrials),
    blue: buildMonteCarloResult(blueTrials, redTrials, numTrials),
  };
}

// ─── Matchup Orchestrator ────────────────────────────────────

export function computeMatchup(
  redTeams: number[],
  blueTeams: number[],
  inputs: PredictionTeamInput[],
  numTrials: number = NUM_TRIALS,
): MatchupResult {
  const red = predictAlliance(redTeams, inputs);
  const blue = predictAlliance(blueTeams, inputs);
  const scoreDiff = Math.abs(red.totalScore - blue.totalScore);
  const favoredAlliance: 'red' | 'blue' | 'even' =
    scoreDiff < 1 ? 'even' : red.totalScore > blue.totalScore ? 'red' : 'blue';

  // Look up inputs for Monte Carlo
  const redInputs = redTeams
    .map(n => inputs.find(i => i.teamNumber === n))
    .filter((i): i is PredictionTeamInput => !!i);
  const blueInputs = blueTeams
    .map(n => inputs.find(i => i.teamNumber === n))
    .filter((i): i is PredictionTeamInput => !!i);
  const mc = monteCarloMatchup(redInputs, blueInputs, numTrials);

  return { red, blue, scoreDiff, favoredAlliance, redRP: mc.red, blueRP: mc.blue };
}
