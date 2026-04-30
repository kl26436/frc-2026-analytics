import { describe, it, expect } from 'vitest';
import {
  percentileRank,
  characterizeTeam,
  buildOpponentBriefing,
  assessThreat,
  topMovers,
  buildWatchForList,
  analyzeTrend,
  defenseRateForTeam,
} from './strategicInsights';
import type { TeamStatistics, ScoutEntry } from '../types/scouting';
import type { TeamTrend, MatchResult } from './trendAnalysis';

function makeStats(overrides: Partial<TeamStatistics> & { teamNumber: number }): TeamStatistics {
  return {
    matchesPlayed: 8,
    climbNoneCount: 0, level1ClimbCount: 0, level2ClimbCount: 0, level3ClimbCount: 0,
    climbFailedCount: 0, autoClimbCount: 0, autoDidNothingCount: 0,
    startZoneCounts: [0, 0, 0, 0, 0, 0],
    dedicatedPasserCount: 0, bulldozedFuelCount: 0, poorAccuracyCount: 0,
    lostConnectionCount: 0, noRobotCount: 0, unreliableMatchCount: 0, secondReviewCount: 0,
    totalAutoFuelScore: 0, totalTeleopFuelScore: 0, totalAutoFuelPass: 0, totalTeleopFuelPass: 0,
    totalAutoPlus1: 0, totalAutoPlus2: 0, totalAutoPlus3: 0, totalAutoPlus5: 0, totalAutoPlus10: 0, totalAutoPlus20: 0,
    totalTeleopPlus1: 0, totalTeleopPlus2: 0, totalTeleopPlus3: 0, totalTeleopPlus5: 0, totalTeleopPlus10: 0, totalTeleopPlus20: 0,
    totalAutoFuelEstimate: 0, totalTeleopFuelEstimate: 0, totalTotalFuelEstimate: 0,
    totalAutoPoints: 0, totalTeleopPoints: 0, totalEndgamePoints: 0, totalTotalPoints: 0,
    avgAutoFuelEstimate: 0, avgTeleopFuelEstimate: 0, avgTotalFuelEstimate: 0,
    maxAutoFuelEstimate: 0, maxTeleopFuelEstimate: 0, maxTotalFuelEstimate: 0,
    avgAutoFuelScore: 0, avgTeleopFuelScore: 0, avgAutoFuelPass: 0, avgTeleopFuelPass: 0,
    climbNoneRate: 100, level1ClimbRate: 0, level2ClimbRate: 0, level3ClimbRate: 0, climbFailedRate: 0,
    autoClimbRate: 0, autoDidNothingRate: 0,
    centerFieldAutoRate: 0, centerFieldAutoCount: 0,
    startZoneDistribution: [0, 0, 0, 0, 0, 0],
    dedicatedPasserRate: 0, bulldozedFuelRate: 0, poorAccuracyRate: 0,
    lostConnectionRate: 0, noRobotRate: 0, overallUnreliabilityRate: 0,
    avgAutoPlus1: 0, avgAutoPlus2: 0, avgAutoPlus3: 0, avgAutoPlus5: 0, avgAutoPlus10: 0, avgAutoPlus20: 0,
    avgTeleopPlus1: 0, avgTeleopPlus2: 0, avgTeleopPlus3: 0, avgTeleopPlus5: 0, avgTeleopPlus10: 0, avgTeleopPlus20: 0,
    avgAutoPoints: 30, avgTeleopPoints: 60, avgEndgamePoints: 15, avgTotalPoints: 105, maxTotalPoints: 150,
    avgTotalPass: 0, passerRatio: 0, notesList: [],
    ...overrides,
  } as TeamStatistics;
}

function makeTrend(overrides: Partial<TeamTrend> & { teamNumber: number }): TeamTrend {
  const matchResults: MatchResult[] = overrides.matchResults ?? [
    { matchNumber: 1, matchLabel: 'Q1', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
    { matchNumber: 5, matchLabel: 'Q5', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
    { matchNumber: 10, matchLabel: 'Q10', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
    { matchNumber: 15, matchLabel: 'Q15', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
  ];
  return {
    matchResults,
    overallAvg: { total: 105, auto: 30, endgame: 15, l3ClimbRate: 0 },
    last3Avg: { total: 105, auto: 30, endgame: 15, l3ClimbRate: 0 },
    best3of4Avg: { total: 105 },
    delta: 0,
    trend: 'stable',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ScoutEntry> & { match_number: number; team_number: number }): ScoutEntry {
  return {
    id: `${overrides.match_number}_${overrides.team_number}`,
    year: '2026', configured_team: 'red_1', event_key: '2026test',
    match_key: `2026test_qm${overrides.match_number}`, scouter_id: 'test',
    lost_connection: false, no_robot_on_field: false, second_review: false,
    dedicated_passer: false, teleop_climb_failed: false,
    prematch_AUTON_START_ZONE_1: 0, prematch_AUTON_START_ZONE_2: 0,
    prematch_AUTON_START_ZONE_3: 0, prematch_AUTON_START_ZONE_4: 0,
    prematch_AUTON_START_ZONE_5: 0, prematch_AUTON_START_ZONE_6: 0,
    auton_FUEL_SCORE: 0, auton_FUEL_PASS: 0, auton_AUTON_CLIMBED: 0,
    auton_SCORE_PLUS_1: 0, auton_SCORE_PLUS_2: 0, auton_SCORE_PLUS_3: 0,
    auton_SCORE_PLUS_5: 0, auton_SCORE_PLUS_10: 0, auton_SCORE_PLUS_20: 0,
    auton_did_nothing: false, auton_went_to_neutral: false,
    teleop_FUEL_SCORE: 0, teleop_FUEL_PASS: 0,
    teleop_SCORE_PLUS_1: 0, teleop_SCORE_PLUS_2: 0, teleop_SCORE_PLUS_3: 0,
    teleop_SCORE_PLUS_5: 0, teleop_SCORE_PLUS_10: 0, teleop_SCORE_PLUS_20: 0,
    climb_level: '1. None',
    eff_rep_bulldozed_fuel: false, poor_fuel_scoring_accuracy: false,
    relative_driver_performance: '', notes: '',
    ...overrides,
  };
}

describe('percentileRank', () => {
  it('returns 0.5 for empty list', () => {
    expect(percentileRank(10, [])).toBe(0.5);
  });

  it('places top value near 1', () => {
    expect(percentileRank(100, [10, 20, 30, 40, 100])).toBeGreaterThan(0.8);
  });

  it('places bottom value near 0', () => {
    expect(percentileRank(5, [10, 20, 30, 40, 100])).toBeLessThan(0.2);
  });
});

describe('characterizeTeam', () => {
  const field = [
    makeStats({ teamNumber: 1, avgTotalPoints: 50, avgAutoPoints: 10 }),
    makeStats({ teamNumber: 2, avgTotalPoints: 80, avgAutoPoints: 20 }),
    makeStats({ teamNumber: 3, avgTotalPoints: 100, avgAutoPoints: 28 }),
    makeStats({ teamNumber: 4, avgTotalPoints: 130, avgAutoPoints: 35 }),
    makeStats({ teamNumber: 5, avgTotalPoints: 200, avgAutoPoints: 50 }),
  ];

  it('flags top scorers as "aggressive scorer"', () => {
    const stats = makeStats({ teamNumber: 5, avgTotalPoints: 200, avgAutoPoints: 50 });
    const out = characterizeTeam(stats, undefined, { allStats: field });
    expect(out.toLowerCase()).toContain('aggressive scorer');
  });

  it('flags bottom scorers as "low scorer"', () => {
    const stats = makeStats({ teamNumber: 1, avgTotalPoints: 50, avgAutoPoints: 10 });
    const out = characterizeTeam(stats, undefined, { allStats: field });
    expect(out.toLowerCase()).toContain('low scorer');
  });

  it('flags reliable climbers', () => {
    const stats = makeStats({
      teamNumber: 6,
      avgTotalPoints: 100, avgAutoPoints: 25,
      level3ClimbRate: 80, climbNoneRate: 20,
    });
    const out = characterizeTeam(stats, undefined, { allStats: [...field, stats] });
    expect(out.toLowerCase()).toContain('reliable climber');
  });

  it('flags unreliable teams', () => {
    const stats = makeStats({
      teamNumber: 6,
      avgTotalPoints: 100, avgAutoPoints: 25,
      lostConnectionRate: 25,
    });
    const out = characterizeTeam(stats, undefined, { allStats: [...field, stats] });
    expect(out.toLowerCase()).toContain('unreliable');
  });

  it('flags trending up when delta > 15', () => {
    const stats = makeStats({ teamNumber: 6, avgTotalPoints: 100, avgAutoPoints: 25 });
    const trend = makeTrend({ teamNumber: 6, delta: 30 });
    const out = characterizeTeam(stats, trend, { allStats: [...field, stats] });
    expect(out.toLowerCase()).toContain('trending up');
  });

  it('flags plays defense when defenseRate > 30%', () => {
    const stats = makeStats({ teamNumber: 6, avgTotalPoints: 100, avgAutoPoints: 25 });
    const out = characterizeTeam(stats, undefined, { allStats: [...field, stats], defenseRate: 0.5 });
    expect(out.toLowerCase()).toContain('plays defense');
  });

  it('caps output at 3 traits', () => {
    const stats = makeStats({
      teamNumber: 6,
      avgTotalPoints: 200, avgAutoPoints: 50,
      level3ClimbRate: 80, climbNoneRate: 20,
      lostConnectionRate: 25,
    });
    const trend = makeTrend({ teamNumber: 6, delta: 30 });
    const out = characterizeTeam(stats, trend, { allStats: [...field, stats], defenseRate: 0.5 });
    // Comma separators; expect exactly 2 commas (three traits)
    const commaCount = (out.match(/,/g) || []).length;
    expect(commaCount).toBeLessThanOrEqual(2);
  });
});

describe('buildOpponentBriefing', () => {
  const allStats = [
    makeStats({ teamNumber: 100, avgTotalPoints: 200, avgAutoPoints: 50, level3ClimbRate: 80, climbNoneRate: 20 }),
    makeStats({ teamNumber: 200, avgTotalPoints: 180, avgAutoPoints: 40, level3ClimbRate: 70, climbNoneRate: 30 }),
    makeStats({ teamNumber: 300, avgTotalPoints: 150, avgAutoPoints: 35, level3ClimbRate: 60, climbNoneRate: 40 }),
    makeStats({ teamNumber: 400, avgTotalPoints: 50, avgAutoPoints: 5 }),
    makeStats({ teamNumber: 500, avgTotalPoints: 70, avgAutoPoints: 8 }),
  ];
  const allTrends = [
    makeTrend({ teamNumber: 100, delta: 0 }),
    makeTrend({ teamNumber: 200, delta: 0 }),
    makeTrend({ teamNumber: 300, delta: 0 }),
  ];

  it('produces a headline that mentions climbers when alliance climbs well', () => {
    const out = buildOpponentBriefing([100, 200, 300], allStats, allTrends);
    expect(out.headline.toLowerCase()).toContain('climber');
  });

  it('returns one bullet per opponent', () => {
    const out = buildOpponentBriefing([100, 200, 300], allStats, allTrends);
    expect(out.bullets.length).toBe(3);
  });

  it('handles missing teams gracefully', () => {
    const out = buildOpponentBriefing([99999], allStats, allTrends);
    expect(out.bullets.length).toBe(0);
  });
});

describe('assessThreat', () => {
  it('finds candidates beating home at total points', () => {
    const home = makeStats({ teamNumber: 148, avgTotalPoints: 100 });
    const candidates = [
      makeStats({ teamNumber: 1796, avgTotalPoints: 130 }),
      makeStats({ teamNumber: 9128, avgTotalPoints: 70 }),
    ];
    const threats = assessThreat(home, candidates);
    expect(threats.find(t => t.team === 1796)).toBeDefined();
    expect(threats.find(t => t.team === 9128)).toBeUndefined();
  });

  it('flags high-danger threats above 25% delta', () => {
    const home = makeStats({ teamNumber: 148, avgTotalPoints: 100 });
    const candidates = [makeStats({ teamNumber: 1796, avgTotalPoints: 200 })];
    const threats = assessThreat(home, candidates);
    expect(threats[0].danger).toBe('high');
  });

  it('excludes the home team from results', () => {
    const home = makeStats({ teamNumber: 148, avgTotalPoints: 100 });
    const candidates = [home, makeStats({ teamNumber: 1796, avgTotalPoints: 200 })];
    const threats = assessThreat(home, candidates);
    expect(threats.find(t => t.team === 148)).toBeUndefined();
  });
});

describe('topMovers', () => {
  it('returns climbing and falling teams sorted by delta', () => {
    const trends = [
      makeTrend({ teamNumber: 1, delta: 25 }),
      makeTrend({ teamNumber: 2, delta: -25 }),
      makeTrend({ teamNumber: 3, delta: 5 }),
    ];
    const out = topMovers(trends, 3);
    expect(out.climbing[0].teamNumber).toBe(1);
    expect(out.falling[0].teamNumber).toBe(2);
  });

  it('filters out teams with too few matches', () => {
    const trends = [
      makeTrend({
        teamNumber: 1,
        delta: 50,
        matchResults: [
          { matchNumber: 1, matchLabel: 'Q1', autoPoints: 0, teleopPoints: 0, endgamePoints: 0, total: 0, climbLevel: 0 },
        ],
      }),
    ];
    const out = topMovers(trends, 3);
    expect(out.climbing.length).toBe(0);
  });
});

describe('buildWatchForList', () => {
  const allStats = [
    makeStats({ teamNumber: 100, avgTotalPoints: 200, avgAutoPoints: 60, level3ClimbRate: 70, climbNoneRate: 20 }),
    makeStats({ teamNumber: 200, avgTotalPoints: 50, avgAutoPoints: 5, lostConnectionRate: 30 }),
    makeStats({ teamNumber: 300, avgTotalPoints: 100, avgAutoPoints: 20 }),
    makeStats({ teamNumber: 400, avgTotalPoints: 80, avgAutoPoints: 15 }),
    makeStats({ teamNumber: 500, avgTotalPoints: 70, avgAutoPoints: 10 }),
    makeStats({ teamNumber: 600, avgTotalPoints: 60, avgAutoPoints: 8 }),
  ];

  it('caps output at 4 bullets', () => {
    const out = buildWatchForList([100, 200], [300, 400], allStats, []);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it('flags strong auto', () => {
    const out = buildWatchForList([100], [], allStats, []);
    expect(out.some(s => s.includes("100") && s.toLowerCase().includes('auto'))).toBe(true);
  });

  it('flags unreliable teams', () => {
    const out = buildWatchForList([200], [], allStats, []);
    expect(out.some(s => s.includes("200") && s.toLowerCase().includes('unreliable'))).toBe(true);
  });
});

describe('analyzeTrend', () => {
  it('returns "consistent" with low matches available', () => {
    const stats = makeStats({ teamNumber: 1 });
    const trend = makeTrend({
      teamNumber: 1,
      matchResults: [
        { matchNumber: 1, matchLabel: 'Q1', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
      ],
    });
    const out = analyzeTrend(stats, trend, []);
    expect(out.direction).toBe('consistent');
  });

  it('returns "improving" when delta > 15', () => {
    const stats = makeStats({ teamNumber: 1 });
    const trend = makeTrend({ teamNumber: 1, delta: 30 });
    const out = analyzeTrend(stats, trend, []);
    expect(out.direction).toBe('improving');
  });

  it('returns "declining" with attribution to dropouts', () => {
    const stats = makeStats({ teamNumber: 1 });
    const trend = makeTrend({
      teamNumber: 1, delta: -25,
      matchResults: [
        { matchNumber: 1, matchLabel: 'Q1', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
        { matchNumber: 2, matchLabel: 'Q2', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
        { matchNumber: 3, matchLabel: 'Q3', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
        { matchNumber: 4, matchLabel: 'Q4', autoPoints: 30, teleopPoints: 60, endgamePoints: 15, total: 105, climbLevel: 1 },
      ],
    });
    const entries = [
      makeEntry({ match_number: 1, team_number: 1, lost_connection: true }),
      makeEntry({ match_number: 2, team_number: 1, no_robot_on_field: true }),
      makeEntry({ match_number: 3, team_number: 1 }),
      makeEntry({ match_number: 4, team_number: 1 }),
    ];
    const out = analyzeTrend(stats, trend, entries);
    expect(out.direction).toBe('declining');
    expect(out.reasoning.toLowerCase()).toContain('lost connection');
  });
});

describe('defenseRateForTeam', () => {
  it('computes fraction of entries where played_defense is true', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148, played_defense: true }),
      makeEntry({ match_number: 2, team_number: 148, played_defense: true }),
      makeEntry({ match_number: 3, team_number: 148 }),
      makeEntry({ match_number: 4, team_number: 148 }),
    ];
    expect(defenseRateForTeam(148, entries)).toBe(0.5);
  });

  it('returns 0 for a team with no entries', () => {
    expect(defenseRateForTeam(999, [])).toBe(0);
  });
});
