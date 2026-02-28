import { describe, it, expect } from 'vitest';
import { calculateTeamStatistics, calculateAllTeamStatistics } from './statistics';
import type { ScoutEntry } from '../types/scouting';

/** Minimal ScoutEntry with all required fields zeroed out */
function makeEntry(overrides: Partial<ScoutEntry> & { match_number: number; team_number: number }): ScoutEntry {
  return {
    id: `${overrides.match_number}_${overrides.team_number}`,
    year: '2026',
    configured_team: 'red_1',
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

describe('calculateTeamStatistics', () => {
  it('returns empty stats for a team with no entries', () => {
    const result = calculateTeamStatistics(148, []);
    expect(result.teamNumber).toBe(148);
    expect(result.matchesPlayed).toBe(0);
    expect(result.avgTotalFuelEstimate).toBe(0);
    expect(result.avgTotalPoints).toBe(0);
  });

  it('filters entries to the specified team', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148, auton_SCORE_PLUS_5: 2 }),
      makeEntry({ match_number: 1, team_number: 118, auton_SCORE_PLUS_10: 1 }),
    ];
    const result = calculateTeamStatistics(148, entries);
    expect(result.matchesPlayed).toBe(1);
    // Only team 148's entry: 2 * 5 = 10 auto fuel
    expect(result.avgAutoFuelEstimate).toBe(10);
  });

  it('computes fuel estimates from SCORE_PLUS buckets', () => {
    const entries = [
      makeEntry({
        match_number: 1,
        team_number: 148,
        auton_SCORE_PLUS_1: 2,  // 2
        auton_SCORE_PLUS_5: 1,  // 5
        teleop_SCORE_PLUS_3: 3, // 9
        teleop_SCORE_PLUS_10: 1, // 10
      }),
    ];
    const result = calculateTeamStatistics(148, entries);
    expect(result.avgAutoFuelEstimate).toBe(7);   // 2 + 5
    expect(result.avgTeleopFuelEstimate).toBe(19); // 9 + 10
    expect(result.avgTotalFuelEstimate).toBe(26);  // 7 + 19
  });

  it('computes climb rates correctly', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148, climb_level: '4. Level 3' }),
      makeEntry({ match_number: 2, team_number: 148, climb_level: '3. Level 2' }),
      makeEntry({ match_number: 3, team_number: 148, climb_level: '1. None' }),
      makeEntry({ match_number: 4, team_number: 148, climb_level: '4. Level 3' }),
    ];
    const result = calculateTeamStatistics(148, entries);
    expect(result.matchesPlayed).toBe(4);
    expect(result.level3ClimbRate).toBe(50);   // 2/4 = 50%
    expect(result.level2ClimbRate).toBe(25);   // 1/4 = 25%
    expect(result.climbNoneRate).toBe(25);     // 1/4 = 25%
  });

  it('computes points with auto climb', () => {
    const entries = [
      makeEntry({
        match_number: 1,
        team_number: 148,
        auton_AUTON_CLIMBED: 1,
        auton_SCORE_PLUS_5: 2, // 10 auto fuel
        teleop_SCORE_PLUS_3: 1, // 3 teleop fuel
        climb_level: '3. Level 2', // 20 endgame points
      }),
    ];
    const result = calculateTeamStatistics(148, entries);
    // auto = 10 fuel + 15 auto climb = 25
    expect(result.avgAutoPoints).toBe(25);
    expect(result.avgTeleopPoints).toBe(3);
    expect(result.avgEndgamePoints).toBe(20);
    expect(result.avgTotalPoints).toBe(48); // 25 + 3 + 20
  });

  it('computes flag rates', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148, lost_connection: true }),
      makeEntry({ match_number: 2, team_number: 148, no_robot_on_field: true }),
      makeEntry({ match_number: 3, team_number: 148 }),
      makeEntry({ match_number: 4, team_number: 148 }),
    ];
    const result = calculateTeamStatistics(148, entries);
    expect(result.lostConnectionRate).toBe(25);  // 1/4
    expect(result.noRobotRate).toBe(25);          // 1/4
  });

  it('computes passer ratio', () => {
    const entries = [
      makeEntry({
        match_number: 1,
        team_number: 148,
        auton_FUEL_PASS: 5,
        teleop_FUEL_PASS: 10,
        teleop_SCORE_PLUS_5: 3, // 15 teleop fuel estimate
      }),
    ];
    const result = calculateTeamStatistics(148, entries);
    // avgTotalPass = 5 + 10 = 15
    expect(result.avgTotalPass).toBe(15);
    // avgTotalFuelEstimate = 15 (only teleop SCORE_PLUS)
    // passerRatio = 15 / (15 + 15) = 0.5
    expect(result.passerRatio).toBe(0.5);
  });

  it('includes team name when provided', () => {
    const entries = [makeEntry({ match_number: 1, team_number: 148 })];
    const result = calculateTeamStatistics(148, entries, 'Robowranglers');
    expect(result.teamName).toBe('Robowranglers');
  });

  it('aggregates max correctly across matches', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148, teleop_SCORE_PLUS_10: 2 }), // 20 teleop fuel
      makeEntry({ match_number: 2, team_number: 148, teleop_SCORE_PLUS_10: 5 }), // 50 teleop fuel
      makeEntry({ match_number: 3, team_number: 148, teleop_SCORE_PLUS_10: 3 }), // 30 teleop fuel
    ];
    const result = calculateTeamStatistics(148, entries);
    // max total fuel = max(20, 50, 30) = 50
    expect(result.maxTotalFuelEstimate).toBe(50);
    // avg total fuel = (20 + 50 + 30) / 3 ≈ 33.33
    expect(result.avgTotalFuelEstimate).toBeCloseTo(33.33, 1);
  });
});

describe('calculateAllTeamStatistics', () => {
  it('returns stats for all unique teams', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148 }),
      makeEntry({ match_number: 1, team_number: 118 }),
      makeEntry({ match_number: 2, team_number: 148 }),
    ];
    const results = calculateAllTeamStatistics(entries);
    expect(results).toHaveLength(2);
    const team148 = results.find(r => r.teamNumber === 148);
    const team118 = results.find(r => r.teamNumber === 118);
    expect(team148?.matchesPlayed).toBe(2);
    expect(team118?.matchesPlayed).toBe(1);
  });

  it('applies team names from map', () => {
    const entries = [
      makeEntry({ match_number: 1, team_number: 148 }),
      makeEntry({ match_number: 1, team_number: 118 }),
    ];
    const names = new Map([[148, 'Robowranglers'], [118, 'Robonauts']]);
    const results = calculateAllTeamStatistics(entries, names);
    expect(results.find(r => r.teamNumber === 148)?.teamName).toBe('Robowranglers');
    expect(results.find(r => r.teamNumber === 118)?.teamName).toBe('Robonauts');
  });

  it('returns empty array for no entries', () => {
    expect(calculateAllTeamStatistics([])).toEqual([]);
  });
});
