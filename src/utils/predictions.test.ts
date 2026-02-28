import { describe, it, expect } from 'vitest';
import {
  buildPredictionInputs,
  predictAlliance,
  monteCarloMatchup,
  computeMatchup,
} from './predictions';
import type { PredictionTeamInput } from './predictions';
import type { TeamStatistics } from '../types/scouting';
import type { TeamFuelStats } from './fuelAttribution';

/** Minimal TeamStatistics stub */
function makeScoutStats(overrides: Partial<TeamStatistics> & { teamNumber: number }): TeamStatistics {
  return {
    matchesPlayed: 5,
    climbNoneCount: 0, level1ClimbCount: 0, level2ClimbCount: 0, level3ClimbCount: 0,
    climbFailedCount: 0, autoClimbCount: 0, autoDidNothingCount: 0,
    startZoneCounts: [0, 0, 0, 0, 0, 0],
    dedicatedPasserCount: 0, bulldozedFuelCount: 0, poorAccuracyCount: 0,
    lostConnectionCount: 0, noRobotCount: 0, secondReviewCount: 0,
    totalAutoFuelScore: 0, totalTeleopFuelScore: 0, totalAutoFuelPass: 0, totalTeleopFuelPass: 0,
    totalAutoPlus1: 0, totalAutoPlus2: 0, totalAutoPlus3: 0, totalAutoPlus5: 0, totalAutoPlus10: 0,
    totalTeleopPlus1: 0, totalTeleopPlus2: 0, totalTeleopPlus3: 0, totalTeleopPlus5: 0, totalTeleopPlus10: 0,
    totalAutoFuelEstimate: 0, totalTeleopFuelEstimate: 0, totalTotalFuelEstimate: 0,
    totalAutoPoints: 0, totalTeleopPoints: 0, totalEndgamePoints: 0, totalTotalPoints: 0,
    avgAutoFuelEstimate: 0, avgTeleopFuelEstimate: 0, avgTotalFuelEstimate: 0,
    maxAutoFuelEstimate: 0, maxTeleopFuelEstimate: 0, maxTotalFuelEstimate: 0,
    avgAutoFuelScore: 0, avgTeleopFuelScore: 0, avgAutoFuelPass: 0, avgTeleopFuelPass: 0,
    climbNoneRate: 100, level1ClimbRate: 0, level2ClimbRate: 0, level3ClimbRate: 0, climbFailedRate: 0,
    autoClimbRate: 0, autoDidNothingRate: 0, startZoneDistribution: [0, 0, 0, 0, 0, 0],
    dedicatedPasserRate: 0, bulldozedFuelRate: 0, poorAccuracyRate: 0,
    lostConnectionRate: 0, noRobotRate: 0,
    avgAutoPlus1: 0, avgAutoPlus2: 0, avgAutoPlus3: 0, avgAutoPlus5: 0, avgAutoPlus10: 0,
    avgTeleopPlus1: 0, avgTeleopPlus2: 0, avgTeleopPlus3: 0, avgTeleopPlus5: 0, avgTeleopPlus10: 0,
    avgAutoPoints: 0, avgTeleopPoints: 0, avgEndgamePoints: 0, avgTotalPoints: 0, maxTotalPoints: 0,
    avgTotalPass: 0, passerRatio: 0, notesList: [],
    ...overrides,
  } as TeamStatistics;
}

/** Minimal TeamFuelStats stub */
function makeFuelStats(overrides: Partial<TeamFuelStats> & { teamNumber: number }): TeamFuelStats {
  return {
    matchesPlayed: 5,
    totalShots: 0, totalShotsScored: 0, totalAutoScored: 0, totalTeleopScored: 0,
    totalPasses: 0, totalMoved: 0,
    avgShots: 0, avgShotsScored: 0, avgAutoScored: 0, avgTeleopScored: 0,
    avgPasses: 0, avgMoved: 0, scoringAccuracy: 0,
    avgAutoPointsScored: 0, avgTeleopPointsScored: 0, avgFuelPointsScored: 0,
    autoClimbCount: 0, autoClimbRate: 0,
    endgameClimbCounts: [5, 0, 0, 0], endgameClimbRates: [1, 0, 0, 0],
    avgAutoTowerPoints: 0, avgEndgameTowerPoints: 0, avgTowerPoints: 0,
    stdAutoPointsScored: 0, stdTeleopPointsScored: 0, stdFuelPointsScored: 0,
    stdAutoTowerPoints: 0, stdEndgameTowerPoints: 0, stdTowerPoints: 0,
    reliabilityRate: 1,
    dedicatedPasserMatches: 0, actionDataMatches: 0,
    noShowMatches: 0, lostConnectionMatches: 0, bulldozedOnlyMatches: 0, zeroWeightMatches: 0,
    ...overrides,
  };
}

describe('buildPredictionInputs', () => {
  it('uses FMS data when fuel stats available', () => {
    const scout = [makeScoutStats({ teamNumber: 148 })];
    const fuel = [makeFuelStats({
      teamNumber: 148,
      matchesPlayed: 5,
      avgAutoPointsScored: 20,
      avgTeleopPointsScored: 40,
      stdAutoPointsScored: 5,
      stdTeleopPointsScored: 10,
      autoClimbRate: 0.8,
      endgameClimbRates: [0.1, 0.2, 0.3, 0.4],
      avgAutoTowerPoints: 12,
      avgEndgameTowerPoints: 22,
      stdAutoTowerPoints: 3,
      stdEndgameTowerPoints: 6,
    })];
    const inputs = buildPredictionInputs(scout, fuel);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].dataSource).toBe('fms');
    expect(inputs[0].avgAutoHubPoints).toBe(20);
    expect(inputs[0].avgTeleopHubPoints).toBe(40);
    expect(inputs[0].autoClimbRate).toBe(0.8);
  });

  it('falls back to scout data when no fuel stats', () => {
    const scout = [makeScoutStats({
      teamNumber: 148,
      avgAutoFuelEstimate: 10,
      avgTeleopFuelEstimate: 25,
      autoClimbRate: 60,        // 60% as 0-100
      level1ClimbRate: 20,
      level2ClimbRate: 30,
      level3ClimbRate: 40,
    })];
    const inputs = buildPredictionInputs(scout, []);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].dataSource).toBe('scout');
    expect(inputs[0].avgAutoHubPoints).toBe(10);
    expect(inputs[0].avgTeleopHubPoints).toBe(25);
    expect(inputs[0].autoClimbRate).toBe(0.6); // 60/100
    // Endgame rates should sum to ~1
    const rates = inputs[0].endgameClimbRates;
    expect(rates[1]).toBeCloseTo(0.2); // L1
    expect(rates[2]).toBeCloseTo(0.3); // L2
    expect(rates[3]).toBeCloseTo(0.4); // L3
    expect(rates[0]).toBeCloseTo(0.1); // none = 1 - 0.2 - 0.3 - 0.4
  });

  it('computes reliability from scout flags', () => {
    const scout = [makeScoutStats({
      teamNumber: 148,
      lostConnectionRate: 20,  // 20%
      noRobotRate: 10,         // 10%
    })];
    const inputs = buildPredictionInputs(scout, []);
    // reliability = 1 - min((20 + 10) / 100, 0.5) = 1 - 0.3 = 0.7
    expect(inputs[0].reliability).toBeCloseTo(0.7);
  });
});

describe('predictAlliance', () => {
  it('sums team contributions with reliability multiplier', () => {
    const inputs: PredictionTeamInput[] = [
      {
        teamNumber: 148, matchesPlayed: 6, dataSource: 'fms',
        avgAutoHubPoints: 20, avgTeleopHubPoints: 30,
        stdAutoHubPoints: 5, stdTeleopHubPoints: 8,
        autoClimbRate: 0.5, endgameClimbRates: [0.5, 0.5, 0, 0],
        avgAutoTowerPoints: 7.5, avgEndgameTowerPoints: 5,
        stdAutoTowerPoints: 3, stdEndgameTowerPoints: 4,
        reliability: 1.0,
      },
      {
        teamNumber: 118, matchesPlayed: 6, dataSource: 'fms',
        avgAutoHubPoints: 15, avgTeleopHubPoints: 25,
        stdAutoHubPoints: 4, stdTeleopHubPoints: 7,
        autoClimbRate: 0.3, endgameClimbRates: [0.4, 0.3, 0.2, 0.1],
        avgAutoTowerPoints: 4.5, avgEndgameTowerPoints: 7,
        stdAutoTowerPoints: 2, stdEndgameTowerPoints: 3,
        reliability: 0.9,
      },
    ];
    const result = predictAlliance([148, 118], inputs);

    // Team 148: (20 + 30 + 7.5 + 5) * 1.0 = 62.5
    // Team 118: (15 + 25 + 4.5 + 7) * 0.9 = 46.35
    expect(result.totalScore).toBeCloseTo(108.85, 1);
    expect(result.confidence).toBe('high'); // both have 6+ matches
    expect(result.teams).toHaveLength(2);
  });

  it('handles missing team gracefully', () => {
    const inputs: PredictionTeamInput[] = [];
    const result = predictAlliance([999], inputs);
    // Missing team gets zero breakdown
    expect(result.totalScore).toBe(0);
    expect(result.teams[0].teamNumber).toBe(999);
    expect(result.teams[0].reliability).toBe(0.5);
  });

  it('sets confidence based on minimum matches', () => {
    const makeInput = (team: number, matches: number): PredictionTeamInput => ({
      teamNumber: team, matchesPlayed: matches, dataSource: 'scout',
      avgAutoHubPoints: 10, avgTeleopHubPoints: 20,
      stdAutoHubPoints: 3, stdTeleopHubPoints: 5,
      autoClimbRate: 0, endgameClimbRates: [1, 0, 0, 0],
      avgAutoTowerPoints: 0, avgEndgameTowerPoints: 0,
      stdAutoTowerPoints: 0, stdEndgameTowerPoints: 0,
      reliability: 1,
    });

    expect(predictAlliance([1], [makeInput(1, 6)]).confidence).toBe('high');
    expect(predictAlliance([1], [makeInput(1, 3)]).confidence).toBe('medium');
    expect(predictAlliance([1], [makeInput(1, 2)]).confidence).toBe('low');
  });
});

describe('monteCarloMatchup', () => {
  it('produces valid probability distributions', () => {
    const makeInput = (team: number, strength: number): PredictionTeamInput => ({
      teamNumber: team, matchesPlayed: 10, dataSource: 'fms',
      avgAutoHubPoints: strength, avgTeleopHubPoints: strength * 2,
      stdAutoHubPoints: strength * 0.3, stdTeleopHubPoints: strength * 0.3,
      autoClimbRate: 0.5, endgameClimbRates: [0.25, 0.25, 0.25, 0.25],
      avgAutoTowerPoints: 7.5, avgEndgameTowerPoints: 15,
      stdAutoTowerPoints: 3, stdEndgameTowerPoints: 5,
      reliability: 0.95,
    });

    const redInputs = [makeInput(1, 20), makeInput(2, 15), makeInput(3, 18)];
    const blueInputs = [makeInput(4, 10), makeInput(5, 12), makeInput(6, 8)];

    const result = monteCarloMatchup(redInputs, blueInputs, 500);

    // Win probabilities should be between 0 and 1
    expect(result.red.winProbability).toBeGreaterThanOrEqual(0);
    expect(result.red.winProbability).toBeLessThanOrEqual(1);
    expect(result.blue.winProbability).toBeGreaterThanOrEqual(0);
    expect(result.blue.winProbability).toBeLessThanOrEqual(1);

    // Red should be heavily favored (much stronger teams)
    expect(result.red.winProbability).toBeGreaterThan(0.5);

    // RP probabilities in valid range
    expect(result.red.energizedProb).toBeGreaterThanOrEqual(0);
    expect(result.red.energizedProb).toBeLessThanOrEqual(1);
    expect(result.red.traversalProb).toBeGreaterThanOrEqual(0);
    expect(result.red.traversalProb).toBeLessThanOrEqual(1);

    // Score percentiles should be monotonically increasing
    const p = result.red.scorePercentiles;
    expect(p.p10).toBeLessThanOrEqual(p.p25);
    expect(p.p25).toBeLessThanOrEqual(p.p50);
    expect(p.p50).toBeLessThanOrEqual(p.p75);
    expect(p.p75).toBeLessThanOrEqual(p.p90);

    // Mean and std should be positive
    expect(result.red.meanScore).toBeGreaterThan(0);
    expect(result.red.stdScore).toBeGreaterThanOrEqual(0);
  });

  it('returns correct trial count', () => {
    const input: PredictionTeamInput = {
      teamNumber: 1, matchesPlayed: 5, dataSource: 'scout',
      avgAutoHubPoints: 10, avgTeleopHubPoints: 20,
      stdAutoHubPoints: 3, stdTeleopHubPoints: 5,
      autoClimbRate: 0, endgameClimbRates: [1, 0, 0, 0],
      avgAutoTowerPoints: 0, avgEndgameTowerPoints: 0,
      stdAutoTowerPoints: 0, stdEndgameTowerPoints: 0,
      reliability: 1,
    };
    const result = monteCarloMatchup([input], [input], 200);
    expect(result.red.numTrials).toBe(200);
    expect(result.blue.numTrials).toBe(200);
  });
});

describe('computeMatchup', () => {
  it('orchestrates deterministic + Monte Carlo correctly', () => {
    const inputs: PredictionTeamInput[] = [
      {
        teamNumber: 1, matchesPlayed: 6, dataSource: 'fms',
        avgAutoHubPoints: 20, avgTeleopHubPoints: 30,
        stdAutoHubPoints: 5, stdTeleopHubPoints: 8,
        autoClimbRate: 0.5, endgameClimbRates: [0.5, 0.5, 0, 0],
        avgAutoTowerPoints: 7.5, avgEndgameTowerPoints: 5,
        stdAutoTowerPoints: 3, stdEndgameTowerPoints: 4,
        reliability: 1.0,
      },
      {
        teamNumber: 2, matchesPlayed: 6, dataSource: 'fms',
        avgAutoHubPoints: 5, avgTeleopHubPoints: 10,
        stdAutoHubPoints: 2, stdTeleopHubPoints: 3,
        autoClimbRate: 0, endgameClimbRates: [1, 0, 0, 0],
        avgAutoTowerPoints: 0, avgEndgameTowerPoints: 0,
        stdAutoTowerPoints: 0, stdEndgameTowerPoints: 0,
        reliability: 0.8,
      },
    ];

    const result = computeMatchup([1], [2], inputs, 100);

    expect(result.red.totalScore).toBeGreaterThan(result.blue.totalScore);
    expect(result.favoredAlliance).toBe('red');
    expect(result.scoreDiff).toBeGreaterThan(0);
    expect(result.redRP).toBeDefined();
    expect(result.blueRP).toBeDefined();
  });

  it('reports even when teams are equal', () => {
    const input: PredictionTeamInput = {
      teamNumber: 1, matchesPlayed: 6, dataSource: 'fms',
      avgAutoHubPoints: 20, avgTeleopHubPoints: 30,
      stdAutoHubPoints: 5, stdTeleopHubPoints: 8,
      autoClimbRate: 0.5, endgameClimbRates: [0.5, 0.5, 0, 0],
      avgAutoTowerPoints: 7.5, avgEndgameTowerPoints: 5,
      stdAutoTowerPoints: 3, stdEndgameTowerPoints: 4,
      reliability: 1.0,
    };
    // Same team on both sides → deterministic scores equal
    const result = computeMatchup([1], [1], [input], 100);
    expect(result.favoredAlliance).toBe('even');
    expect(result.scoreDiff).toBeLessThan(1);
  });
});
