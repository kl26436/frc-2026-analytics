import { describe, it, expect } from 'vitest';
import { computeMatchFuelAttribution, aggregateTeamFuel } from './fuelAttribution';
import type { RobotMatchFuel } from './fuelAttribution';
import type { ScoutEntry, RobotActions, PgTBAMatch, HubScore } from '../types/scouting';

/** Minimal ScoutEntry factory */
function makeEntry(overrides: Partial<ScoutEntry> & {
  match_number: number;
  team_number: number;
  configured_team: string;
}): ScoutEntry {
  return {
    id: `${overrides.match_number}_${overrides.team_number}`,
    year: '2026',
    event_key: '2026test',
    match_key: `2026test_qm${overrides.match_number}`,
    scouter_id: 'test',
    lost_connection: false,
    no_robot_on_field: false,
    second_review: false,
    dedicated_passer: false,
    teleop_climb_failed: false,
    prematch_AUTON_START_ZONE_1: 0,
    prematch_AUTON_START_ZONE_2: 0,
    prematch_AUTON_START_ZONE_3: 0,
    prematch_AUTON_START_ZONE_4: 0,
    prematch_AUTON_START_ZONE_5: 0,
    prematch_AUTON_START_ZONE_6: 0,
    auton_FUEL_SCORE: 0,
    auton_FUEL_PASS: 0,
    auton_AUTON_CLIMBED: 0,
    auton_SCORE_PLUS_1: 0,
    auton_SCORE_PLUS_2: 0,
    auton_SCORE_PLUS_3: 0,
    auton_SCORE_PLUS_5: 0,
    auton_SCORE_PLUS_10: 0,
    auton_did_nothing: false,
    auton_went_to_neutral: false,
    teleop_FUEL_SCORE: 0,
    teleop_FUEL_PASS: 0,
    teleop_SCORE_PLUS_1: 0,
    teleop_SCORE_PLUS_2: 0,
    teleop_SCORE_PLUS_3: 0,
    teleop_SCORE_PLUS_5: 0,
    teleop_SCORE_PLUS_10: 0,
    climb_level: '1. None',
    eff_rep_bulldozed_fuel: false,
    poor_fuel_scoring_accuracy: false,
    relative_driver_performance: '',
    notes: '',
    ...overrides,
  };
}

/** Minimal HubScore factory */
function makeHubScore(overrides: Partial<HubScore> = {}): HubScore {
  return {
    autoCount: 0, autoPoints: 0,
    teleopCount: 0, teleopPoints: 0,
    endgameCount: 0, endgamePoints: 0,
    shift1Count: 0, shift1Points: 0,
    shift2Count: 0, shift2Points: 0,
    shift3Count: 0, shift3Points: 0,
    shift4Count: 0, shift4Points: 0,
    transitionCount: 0, transitionPoints: 0,
    totalCount: 0, totalPoints: 0,
    uncounted: 0,
    ...overrides,
  };
}

/** Minimal PgTBAMatch factory for a qual match */
function makeTbaMatch(matchNumber: number, overrides: Partial<PgTBAMatch> = {}): PgTBAMatch {
  return {
    match_key: `2026test_qm${matchNumber}`,
    event_key: '2026test',
    comp_level: 'qm',
    match_number: matchNumber,
    set_number: 1,
    winning_alliance: '',
    actual_time: null,
    red_teams: ['frc148', 'frc118', 'frc1477'] as [string, string, string],
    blue_teams: ['frc254', 'frc971', 'frc973'] as [string, string, string],
    red_score: 100,
    blue_score: 80,
    red_totalAutoPoints: 0, red_totalTeleopPoints: 0, red_totalPoints: 100,
    red_foulPoints: 0, red_majorFoulCount: 0, red_minorFoulCount: 0,
    red_rp: 0, red_energizedAchieved: false, red_superchargedAchieved: false,
    red_traversalAchieved: false,
    red_hubScore: makeHubScore(),
    red_endGameTowerRobot1: 'None', red_endGameTowerRobot2: 'None', red_endGameTowerRobot3: 'None',
    red_autoTowerRobot1: 'None', red_autoTowerRobot2: 'None', red_autoTowerRobot3: 'None',
    red_autoTowerPoints: 0, red_endGameTowerPoints: 0, red_totalTowerPoints: 0,
    blue_totalAutoPoints: 0, blue_totalTeleopPoints: 0, blue_totalPoints: 80,
    blue_foulPoints: 0, blue_majorFoulCount: 0, blue_minorFoulCount: 0,
    blue_rp: 0, blue_energizedAchieved: false, blue_superchargedAchieved: false,
    blue_traversalAchieved: false,
    blue_hubScore: makeHubScore(),
    blue_endGameTowerRobot1: 'None', blue_endGameTowerRobot2: 'None', blue_endGameTowerRobot3: 'None',
    blue_autoTowerRobot1: 'None', blue_autoTowerRobot2: 'None', blue_autoTowerRobot3: 'None',
    blue_autoTowerPoints: 0, blue_endGameTowerPoints: 0, blue_totalTowerPoints: 0,
    ...overrides,
  };
}

describe('computeMatchFuelAttribution', () => {
  it('returns empty array for no entries', () => {
    expect(computeMatchFuelAttribution([], [], [])).toEqual([]);
  });

  it('attributes FMS scored balls proportionally via power curve', () => {
    // Two red robots: one shoots 8 balls, other shoots 2
    // FMS says 10 total scored for the alliance
    const entries = [
      makeEntry({
        match_number: 1, team_number: 148, configured_team: 'red_1',
        teleop_SCORE_PLUS_5: 1, teleop_SCORE_PLUS_3: 1, // 8 teleop fuel
        teleop_FUEL_SCORE: 2, // not used for count, just event marker
      }),
      makeEntry({
        match_number: 1, team_number: 118, configured_team: 'red_2',
        teleop_SCORE_PLUS_2: 1, // 2 teleop fuel
        teleop_FUEL_SCORE: 1,
      }),
      makeEntry({
        match_number: 1, team_number: 1477, configured_team: 'red_3',
        // zero fuel — no shots
      }),
    ];

    const tbaMatches = [
      makeTbaMatch(1, {
        red_hubScore: makeHubScore({ totalCount: 10, teleopCount: 10, teleopPoints: 20 }),
      }),
    ];

    const results = computeMatchFuelAttribution(entries, [], tbaMatches);
    expect(results).toHaveLength(3);

    const team148 = results.find(r => r.teamNumber === 148)!;
    const team118 = results.find(r => r.teamNumber === 118)!;
    const team1477 = results.find(r => r.teamNumber === 1477)!;

    // Power curve (β=0.7): team 148 has 8 shots, team 118 has 2 shots
    // weights: 8^0.7 ≈ 5.278, 2^0.7 ≈ 1.624, 0^0.7 = 0
    // total weight ≈ 6.902
    // 148: (5.278 / 6.902) * 10 ≈ 7.65
    // 118: (1.624 / 6.902) * 10 ≈ 2.35
    expect(team148.shotsScored).toBeGreaterThan(team118.shotsScored);
    expect(team148.shotsScored + team118.shotsScored).toBeCloseTo(10, 5);
    expect(team1477.shotsScored).toBe(0);
    expect(team1477.shots).toBe(0);
  });

  it('handles no-show robots (zero weight)', () => {
    const entries = [
      makeEntry({
        match_number: 1, team_number: 148, configured_team: 'red_1',
        no_robot_on_field: true,
        // no fuel data → real no-show
      }),
      makeEntry({
        match_number: 1, team_number: 118, configured_team: 'red_2',
        teleop_SCORE_PLUS_5: 2, // 10 shots
      }),
    ];

    const tbaMatches = [
      makeTbaMatch(1, {
        red_hubScore: makeHubScore({ totalCount: 10, teleopCount: 10 }),
      }),
    ];

    const results = computeMatchFuelAttribution(entries, [], tbaMatches);
    const noShow = results.find(r => r.teamNumber === 148)!;
    const active = results.find(r => r.teamNumber === 118)!;

    expect(noShow.isRealNoShow).toBe(true);
    expect(noShow.shots).toBe(0);
    expect(noShow.shotsScored).toBe(0);
    // All FMS balls go to the active robot
    expect(active.shotsScored).toBeCloseTo(10, 5);
  });

  it('handles mislabeled no-show (flag set but has fuel data)', () => {
    // hasSummaryFuel checks FUEL_SCORE/FUEL_PASS, not SCORE_PLUS
    const entries = [
      makeEntry({
        match_number: 1, team_number: 148, configured_team: 'red_1',
        no_robot_on_field: true,
        teleop_FUEL_SCORE: 2,      // confirms fuel activity (event markers)
        teleop_SCORE_PLUS_5: 2,    // 10 teleop fuel estimate
      }),
    ];

    const results = computeMatchFuelAttribution(entries, [], []);
    const robot = results.find(r => r.teamNumber === 148)!;

    expect(robot.isNoShow).toBe(true);
    expect(robot.isRealNoShow).toBe(false);
    expect(robot.noShowMislabeled).toBe(true);
    expect(robot.shots).toBe(10); // still counted from SCORE_PLUS
  });

  it('uses action data when available', () => {
    const entries = [
      makeEntry({
        match_number: 1, team_number: 148, configured_team: 'red_1',
        // summary data is fallback
        teleop_SCORE_PLUS_5: 1,
      }),
    ];

    const actions: RobotActions[] = [{
      id: '1_148',
      match_number: 1,
      team_number: 148,
      auto: [
        { x: 0, y: 0, time_stamp: 0, type: 'SCORE_PLUS_3', value: 1, score: 0 },
        { x: 0, y: 0, time_stamp: 1, type: 'FUEL_SCORE', value: 1, score: 3 },
      ],
      teleop: [
        { x: 0, y: 0, time_stamp: 10, type: 'SCORE_PLUS_5', value: 1, score: 3 },
        { x: 0, y: 0, time_stamp: 11, type: 'FUEL_SCORE', value: 1, score: 8 },
        { x: 0, y: 0, time_stamp: 12, type: 'SCORE_PLUS_2', value: 1, score: 8 },
        { x: 0, y: 0, time_stamp: 13, type: 'FUEL_PASS', value: 1, score: 8 },
      ],
    }];

    const results = computeMatchFuelAttribution(entries, actions, []);
    const robot = results[0];

    expect(robot.hasActionData).toBe(true);
    expect(robot.shots).toBe(8);  // 3 auto + 5 teleop
    expect(robot.passes).toBe(2); // 2 teleop passes
    expect(robot.autoShots).toBe(3);
    expect(robot.teleopShots).toBe(5);
    expect(robot.totalMoved).toBe(10); // 3 + 5 + 2
  });

  it('reads tower data from TBA match', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148, configured_team: 'red_1' }),
    ];

    const tbaMatches = [
      makeTbaMatch(1, {
        red_autoTowerRobot1: 'Level1',      // auto climb
        red_endGameTowerRobot1: 'Level3',    // L3 endgame
      }),
    ];

    const results = computeMatchFuelAttribution(entries, [], tbaMatches);
    const robot = results[0];

    expect(robot.autoClimbed).toBe(true);
    expect(robot.autoTowerPoints).toBe(15);
    expect(robot.endgameClimbLevel).toBe(3);
    expect(robot.endgameTowerPoints).toBe(30);
    expect(robot.totalTowerPoints).toBe(45);
  });

  it('sorts results by match, alliance, team', () => {
    const entries = [
      makeEntry({ match_number: 2, team_number: 118, configured_team: 'red_2' }),
      makeEntry({ match_number: 1, team_number: 148, configured_team: 'red_1' }),
      makeEntry({ match_number: 1, team_number: 254, configured_team: 'blue_1' }),
      makeEntry({ match_number: 2, team_number: 148, configured_team: 'red_1' }),
    ];

    const results = computeMatchFuelAttribution(entries, [], []);

    expect(results[0].matchNumber).toBe(1);
    expect(results[0].alliance).toBe('blue'); // blue < red alphabetically
    expect(results[1].matchNumber).toBe(1);
    expect(results[1].alliance).toBe('red');
    expect(results[2].matchNumber).toBe(2);
    expect(results[3].matchNumber).toBe(2);
  });
});

describe('aggregateTeamFuel', () => {
  it('returns empty array for no rows', () => {
    expect(aggregateTeamFuel([])).toEqual([]);
  });

  it('computes per-team averages correctly', () => {
    const rows: RobotMatchFuel[] = [
      makeRobotMatchFuel({ matchNumber: 1, teamNumber: 148, shots: 10, shotsScored: 8 }),
      makeRobotMatchFuel({ matchNumber: 2, teamNumber: 148, shots: 6, shotsScored: 4 }),
    ];

    const results = aggregateTeamFuel(rows);
    expect(results).toHaveLength(1);

    const team = results[0];
    expect(team.teamNumber).toBe(148);
    expect(team.matchesPlayed).toBe(2);
    expect(team.totalShots).toBe(16);
    expect(team.totalShotsScored).toBe(12);
    expect(team.avgShots).toBe(8);        // 16 / 2
    expect(team.avgShotsScored).toBe(6);  // 12 / 2
    // Weighted accuracy: 12 / 16 = 0.75
    expect(team.scoringAccuracy).toBe(0.75);
  });

  it('computes tower stats and climb rates', () => {
    const rows: RobotMatchFuel[] = [
      makeRobotMatchFuel({ matchNumber: 1, teamNumber: 148, autoClimbed: true, endgameClimbLevel: 3, autoTowerPoints: 15, endgameTowerPoints: 30, totalTowerPoints: 45 }),
      makeRobotMatchFuel({ matchNumber: 2, teamNumber: 148, autoClimbed: false, endgameClimbLevel: 2, autoTowerPoints: 0, endgameTowerPoints: 20, totalTowerPoints: 20 }),
      makeRobotMatchFuel({ matchNumber: 3, teamNumber: 148, autoClimbed: true, endgameClimbLevel: 0, autoTowerPoints: 15, endgameTowerPoints: 0, totalTowerPoints: 15 }),
      makeRobotMatchFuel({ matchNumber: 4, teamNumber: 148, autoClimbed: false, endgameClimbLevel: 1, autoTowerPoints: 0, endgameTowerPoints: 10, totalTowerPoints: 10 }),
    ];

    const results = aggregateTeamFuel(rows);
    const team = results[0];

    expect(team.autoClimbCount).toBe(2);
    expect(team.autoClimbRate).toBe(0.5);
    expect(team.endgameClimbCounts).toEqual([1, 1, 1, 1]); // one of each
    expect(team.endgameClimbRates).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(team.avgAutoTowerPoints).toBe(7.5);   // (15 + 0 + 15 + 0) / 4
    expect(team.avgEndgameTowerPoints).toBe(15);  // (30 + 20 + 0 + 10) / 4
  });

  it('computes reliability rate', () => {
    const rows: RobotMatchFuel[] = [
      makeRobotMatchFuel({ matchNumber: 1, teamNumber: 148, isNoShow: false, isLostConnection: false }),
      makeRobotMatchFuel({ matchNumber: 2, teamNumber: 148, isNoShow: true, isLostConnection: false }),
      makeRobotMatchFuel({ matchNumber: 3, teamNumber: 148, isNoShow: false, isLostConnection: true }),
      makeRobotMatchFuel({ matchNumber: 4, teamNumber: 148, isNoShow: false, isLostConnection: false }),
    ];

    const results = aggregateTeamFuel(rows);
    // reliability = 1 - min((1 + 1) / 4, 0.5) = 1 - 0.5 = 0.5
    expect(results[0].reliabilityRate).toBe(0.5);
    expect(results[0].noShowMatches).toBe(1);
    expect(results[0].lostConnectionMatches).toBe(1);
  });

  it('sorts by average shots scored descending', () => {
    const rows: RobotMatchFuel[] = [
      makeRobotMatchFuel({ matchNumber: 1, teamNumber: 148, shotsScored: 5 }),
      makeRobotMatchFuel({ matchNumber: 1, teamNumber: 118, shotsScored: 10 }),
      makeRobotMatchFuel({ matchNumber: 1, teamNumber: 1477, shotsScored: 2 }),
    ];

    const results = aggregateTeamFuel(rows);
    expect(results[0].teamNumber).toBe(118);
    expect(results[1].teamNumber).toBe(148);
    expect(results[2].teamNumber).toBe(1477);
  });

  it('handles zero shots (accuracy = 0)', () => {
    const rows: RobotMatchFuel[] = [
      makeRobotMatchFuel({ matchNumber: 1, teamNumber: 148, shots: 0, shotsScored: 0 }),
    ];
    const results = aggregateTeamFuel(rows);
    expect(results[0].scoringAccuracy).toBe(0);
  });
});

/** Minimal RobotMatchFuel factory */
function makeRobotMatchFuel(overrides: Partial<RobotMatchFuel> & { matchNumber: number; teamNumber: number }): RobotMatchFuel {
  return {
    alliance: 'red',
    totalMoved: 0,
    passes: 0,
    shots: 0,
    autoShots: 0,
    teleopShots: 0,
    isDedicatedPasser: false,
    hasActionData: false,
    isNoShow: false,
    isRealNoShow: false,
    noShowMislabeled: false,
    isLostConnection: false,
    isBulldozedOnly: false,
    isZeroWeight: false,
    hasFuelActions: false,
    fmsAllianceTotal: 0,
    allianceScoutShots: 0,
    allianceUnattributed: 0,
    shotsScored: 0,
    autoScored: 0,
    teleopScored: 0,
    scoringAccuracy: 0,
    autoPointsScored: 0,
    teleopPointsScored: 0,
    totalPointsScored: 0,
    autoClimbed: false,
    endgameClimbLevel: 0,
    autoTowerPoints: 0,
    endgameTowerPoints: 0,
    totalTowerPoints: 0,
    ...overrides,
  };
}
