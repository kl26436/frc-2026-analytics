import type { TeamStatistics } from '../types/scouting';

// ─── Interfaces ───────────────────────────────────────────────

export interface TeamBreakdown {
  teamNumber: number;
  teamName?: string;
  autoPoints: number;
  teleopPoints: number;
  endgamePoints: number;
  totalPoints: number;
  reliability: number;
  matchesPlayed: number;
  climbRate: number;
}

export interface AlliancePrediction {
  totalScore: number;
  autoScore: number;
  teleopScore: number;
  endgameScore: number;
  reliability: number;
  confidence: 'high' | 'medium' | 'low';
  teams: TeamBreakdown[];
}

export interface RPPrediction {
  winProbability: number;
  expectedWinRP: number;
  climbBonusProb: number;
  scoringBonusProb: number;
  expectedTotalRP: number;
}

export interface MatchupResult {
  red: AlliancePrediction;
  blue: AlliancePrediction;
  scoreDiff: number;
  favoredAlliance: 'red' | 'blue' | 'even';
  redRP: RPPrediction;
  blueRP: RPPrediction;
}

// ─── Prediction Logic ─────────────────────────────────────────

export function predictAlliance(teamNumbers: number[], stats: TeamStatistics[]): AlliancePrediction {
  const teams: TeamBreakdown[] = teamNumbers.map(num => {
    const s = stats.find(t => t.teamNumber === num);
    if (!s) return { teamNumber: num, autoPoints: 0, teleopPoints: 0, endgamePoints: 0, totalPoints: 0, reliability: 0.5, matchesPlayed: 0, climbRate: 0 };

    const reliability = 1 - Math.min((s.diedRate + s.noShowRate) / 100, 0.5);
    return {
      teamNumber: num,
      teamName: s.teamName,
      autoPoints: s.avgAutoPoints * reliability,
      teleopPoints: s.avgTeleopPoints * reliability,
      endgamePoints: s.avgEndgamePoints * reliability,
      totalPoints: s.avgTotalPoints * reliability,
      reliability,
      matchesPlayed: s.matchesPlayed,
      climbRate: s.climbAttemptRate * (s.level1ClimbRate + s.level2ClimbRate + s.level3ClimbRate) / 100,
    };
  });

  const autoScore = teams.reduce((sum, t) => sum + t.autoPoints, 0);
  const teleopScore = teams.reduce((sum, t) => sum + t.teleopPoints, 0);
  const endgameScore = teams.reduce((sum, t) => sum + t.endgamePoints, 0);
  const totalScore = autoScore + teleopScore + endgameScore;
  const avgReliability = teams.length > 0 ? teams.reduce((sum, t) => sum + t.reliability, 0) / teams.length : 0;
  const minMatches = teams.length > 0 ? Math.min(...teams.map(t => t.matchesPlayed)) : 0;
  const confidence: 'high' | 'medium' | 'low' = minMatches >= 6 ? 'high' : minMatches >= 3 ? 'medium' : 'low';

  return { totalScore, autoScore, teleopScore, endgameScore, reliability: avgReliability, confidence, teams };
}

export function winProbability(myScore: number, oppScore: number): number {
  const diff = myScore - oppScore;
  return 1 / (1 + Math.exp(-0.1 * diff));
}

export function predictRP(alliance: AlliancePrediction, opponent: AlliancePrediction): RPPrediction {
  const winProb = winProbability(alliance.totalScore, opponent.totalScore);
  const tieBand = Math.max(0, 1 - Math.abs(alliance.totalScore - opponent.totalScore) / 5) * 0.1;
  const expectedWinRP = winProb * 2 + tieBand * 1;

  const climbRates = alliance.teams.map(t => Math.min(t.climbRate / 100, 1));
  const climbBonusProb = climbRates.length === 3
    ? climbRates[0] * climbRates[1] * climbRates[2]
    : 0;

  const scoringBase = alliance.autoScore + alliance.teleopScore;
  const scoringBonusProb = 1 / (1 + Math.exp(-0.15 * (scoringBase - 50)));

  const expectedTotalRP = expectedWinRP + climbBonusProb + scoringBonusProb;

  return { winProbability: winProb, expectedWinRP, climbBonusProb, scoringBonusProb, expectedTotalRP };
}

export function computeMatchup(redTeams: number[], blueTeams: number[], stats: TeamStatistics[]): MatchupResult {
  const red = predictAlliance(redTeams, stats);
  const blue = predictAlliance(blueTeams, stats);
  const scoreDiff = Math.abs(red.totalScore - blue.totalScore);
  const favoredAlliance: 'red' | 'blue' | 'even' = scoreDiff < 1 ? 'even' : red.totalScore > blue.totalScore ? 'red' : 'blue';
  const redRP = predictRP(red, blue);
  const blueRP = predictRP(blue, red);
  return { red, blue, scoreDiff, favoredAlliance, redRP, blueRP };
}
