const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: '2025_148',
  user: 'grafana_user',
  password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  try {
    await client.connect();
    const MATCH = 13;
    const EVENT = '2026week0';
    const sep = '='.repeat(70);

    // ==========================================================
    // 1. TBA MATCH DATA - BLUE ALLIANCE
    // ==========================================================
    console.log('\n' + sep);
    console.log('  MATCH ' + MATCH + ' - TBA DATA (BLUE ALLIANCE FOCUS)');
    console.log(sep);

    const tbaQ = 'SELECT ' +
      '"tba.blue.1" as b1, "tba.blue.2" as b2, "tba.blue.3" as b3, ' +
      '"tba.alliances.blue.score" as blue_score, ' +
      '"tba.alliances.red.score" as red_score, ' +
      '"tba.score_breakdown.blue.hubScore.autoCount" as hub_auto_count, ' +
      '"tba.score_breakdown.blue.hubScore.autoPoints" as hub_auto_pts, ' +
      '"tba.score_breakdown.blue.hubScore.teleopCount" as hub_teleop_count, ' +
      '"tba.score_breakdown.blue.hubScore.teleopPoints" as hub_teleop_pts, ' +
      '"tba.score_breakdown.blue.hubScore.totalCount" as hub_total_count, ' +
      '"tba.score_breakdown.blue.hubScore.totalPoints" as hub_total_pts, ' +
      '"tba.score_breakdown.blue.hubScore.shift1Count" as shift1_count, ' +
      '"tba.score_breakdown.blue.hubScore.shift1Points" as shift1_pts, ' +
      '"tba.score_breakdown.blue.hubScore.shift2Count" as shift2_count, ' +
      '"tba.score_breakdown.blue.hubScore.shift2Points" as shift2_pts, ' +
      '"tba.score_breakdown.blue.hubScore.shift3Count" as shift3_count, ' +
      '"tba.score_breakdown.blue.hubScore.shift3Points" as shift3_pts, ' +
      '"tba.score_breakdown.blue.hubScore.shift4Count" as shift4_count, ' +
      '"tba.score_breakdown.blue.hubScore.shift4Points" as shift4_pts, ' +
      '"tba.score_breakdown.blue.hubScore.transitionCount" as transition_count, ' +
      '"tba.score_breakdown.blue.hubScore.transitionPoints" as transition_pts, ' +
      '"tba.score_breakdown.blue.hubScore.endgameCount" as endgame_count, ' +
      '"tba.score_breakdown.blue.hubScore.endgamePoints" as endgame_pts, ' +
      '"tba.score_breakdown.blue.hubScore.uncounted" as uncounted, ' +
      '"tba.score_breakdown.blue.totalPoints" as total_pts, ' +
      '"tba.score_breakdown.blue.totalAutoPoints" as total_auto_pts, ' +
      '"tba.score_breakdown.blue.totalTeleopPoints" as total_teleop_pts, ' +
      '"tba.score_breakdown.blue.foulPoints" as foul_pts, ' +
      '"tba.score_breakdown.blue.autoTowerPoints" as auto_tower_pts, ' +
      '"tba.score_breakdown.blue.endGameTowerPoints" as endgame_tower_pts, ' +
      '"tba.score_breakdown.blue.totalTowerPoints" as total_tower_pts ' +
      'FROM tba."' + EVENT + '_matches" ' +
      'WHERE "tba.match_number" = ' + MATCH + " AND \"tba.comp_level\" = 'qm' LIMIT 1";

    const tba = await client.query(tbaQ);
    if (tba.rows.length === 0) {
      console.log('  NO TBA DATA FOUND');
      await client.end();
      return;
    }
    const t = tba.rows[0];
    console.log('  Blue Teams: ' + t.b1 + ', ' + t.b2 + ', ' + t.b3);
    console.log('  Blue Score: ' + t.blue_score + '   (Red Score: ' + t.red_score + ')');
    console.log('  --- Hub Score Breakdown (Blue) ---');
    console.log('    Auto:       count=' + t.hub_auto_count + '   pts=' + t.hub_auto_pts);
    console.log('    Teleop:     count=' + t.hub_teleop_count + '   pts=' + t.hub_teleop_pts);
    console.log('    Transition: count=' + t.transition_count + '   pts=' + t.transition_pts);
    console.log('    Shift 1:    count=' + t.shift1_count + '   pts=' + t.shift1_pts);
    console.log('    Shift 2:    count=' + t.shift2_count + '   pts=' + t.shift2_pts);
    console.log('    Shift 3:    count=' + t.shift3_count + '   pts=' + t.shift3_pts);
    console.log('    Shift 4:    count=' + t.shift4_count + '   pts=' + t.shift4_pts);
    console.log('    Endgame:    count=' + t.endgame_count + '   pts=' + t.endgame_pts);
    console.log('    TOTAL:      count=' + t.hub_total_count + '   pts=' + t.hub_total_pts);
    console.log('    Uncounted:  ' + t.uncounted);
    console.log('  --- Other Blue Breakdown ---');
    console.log('    Total Points:        ' + t.total_pts);
    console.log('    Total Auto Points:   ' + t.total_auto_pts);
    console.log('    Total Teleop Points: ' + t.total_teleop_pts);
    console.log('    Foul Points:         ' + t.foul_pts);
    console.log('    Auto Tower Points:   ' + t.auto_tower_pts);
    console.log('    Endgame Tower Pts:   ' + t.endgame_tower_pts);
    console.log('    Total Tower Points:  ' + t.total_tower_pts);

    const blueTeams = [t.b1, t.b2, t.b3].map(s => parseInt(s.replace('frc', '')));
    console.log('  Blue team numbers: ' + blueTeams.join(', '));

    // ==========================================================
    // 2. SCOUT SUMMARY DATA - BLUE ALLIANCE ROBOTS
    // ==========================================================
    console.log('\n' + sep);
    console.log('  MATCH ' + MATCH + ' - SCOUT SUMMARY (BLUE ALLIANCE)');
    console.log(sep);

    const summaryQ = 'SELECT team_number, configured_team, dedicated_passer, notes, ' +
      '"auton_FUEL_SCORE" as a_score, "auton_FUEL_PASS" as a_pass, ' +
      '"auton_SCORE_PLUS_1" as a_p1, "auton_SCORE_PLUS_2" as a_p2, ' +
      '"auton_SCORE_PLUS_3" as a_p3, "auton_SCORE_PLUS_5" as a_p5, ' +
      '"auton_SCORE_PLUS_10" as a_p10, ' +
      '"teleop_FUEL_SCORE" as t_score, "teleop_FUEL_PASS" as t_pass, ' +
      '"teleop_SCORE_PLUS_1" as t_p1, "teleop_SCORE_PLUS_2" as t_p2, ' +
      '"teleop_SCORE_PLUS_3" as t_p3, "teleop_SCORE_PLUS_5" as t_p5, ' +
      '"teleop_SCORE_PLUS_10" as t_p10, ' +
      'climb_level ' +
      'FROM public.summary_2026 ' +
      "WHERE event_key = '" + EVENT + "' AND match_number = " + MATCH +
      " AND configured_team LIKE 'blue%' ORDER BY configured_team";

    const summary = await client.query(summaryQ);
    let summaryTotalScored = 0;
    let summaryTotalPassed = 0;
    const summaryByTeam = {};

    for (const r of summary.rows) {
      const autoMult = (r.a_p1||0)*1 + (r.a_p2||0)*2 + (r.a_p3||0)*3 + (r.a_p5||0)*5 + (r.a_p10||0)*10;
      const teleMult = (r.t_p1||0)*1 + (r.t_p2||0)*2 + (r.t_p3||0)*3 + (r.t_p5||0)*5 + (r.t_p10||0)*10;
      const totalMult = autoMult + teleMult;
      const autoWithBase = (r.a_score||0) + autoMult;
      const teleWithBase = (r.t_score||0) + teleMult;
      const totalWithBase = autoWithBase + teleWithBase;
      const autoPasses = (r.a_pass||0);
      const telePasses = (r.t_pass||0);
      const totalPasses = autoPasses + telePasses;

      summaryTotalScored += totalMult;
      summaryTotalPassed += totalPasses;
      summaryByTeam[r.team_number] = { autoMult, teleMult, totalMult, autoWithBase, teleWithBase, totalWithBase, autoPasses, telePasses, totalPasses };

      console.log('');
      console.log('  Team ' + r.team_number + ' (' + r.configured_team + ')' + (r.dedicated_passer ? ' ** DEDICATED PASSER **' : ''));
      console.log('    Climb: ' + (r.climb_level || 'none'));
      console.log('    Notes: ' + (r.notes || '(none)'));
      console.log('    --- Auto ---');
      console.log('      FUEL_SCORE=' + (r.a_score||0) + '  FUEL_PASS=' + (r.a_pass||0));
      console.log('      +1x' + (r.a_p1||0) + '  +2x' + (r.a_p2||0) + '  +3x' + (r.a_p3||0) + '  +5x' + (r.a_p5||0) + '  +10x' + (r.a_p10||0));
      console.log('      Multiplier-only est: ' + autoMult + ' balls scored');
      console.log('      With base FUEL_SCORE: ' + autoWithBase + ' balls scored');
      console.log('    --- Teleop ---');
      console.log('      FUEL_SCORE=' + (r.t_score||0) + '  FUEL_PASS=' + (r.t_pass||0));
      console.log('      +1x' + (r.t_p1||0) + '  +2x' + (r.t_p2||0) + '  +3x' + (r.t_p3||0) + '  +5x' + (r.t_p5||0) + '  +10x' + (r.t_p10||0));
      console.log('      Multiplier-only est: ' + teleMult + ' balls scored');
      console.log('      With base FUEL_SCORE: ' + teleWithBase + ' balls scored');
      console.log('    --- Total ---');
      console.log('      Multiplier-only est: ' + totalMult + ' balls | Passes: ' + totalPasses);
      console.log('      With base FUEL_SCORE: ' + totalWithBase + ' balls | Passes: ' + totalPasses);
    }

    console.log('');
    console.log('  --- BLUE ALLIANCE SUMMARY TOTALS ---');
    console.log('    Total scored (multiplier-only): ' + summaryTotalScored);
    console.log('    Total passes:                   ' + summaryTotalPassed);

    // ==========================================================
    // 3. RAW ACTION DATA - BLUE ALLIANCE
    // ==========================================================
    console.log('\n' + sep);
    console.log('  MATCH ' + MATCH + ' - RAW ACTIONS (BLUE ALLIANCE)');
    console.log(sep);

    const btList = blueTeams.join(',');
    const autoQ = "SELECT team_number, type, time_stamp, x, y, score, value FROM public.auton_actions WHERE event_key = '" + EVENT + "' AND match_number = " + MATCH + " AND team_number IN (" + btList + ") ORDER BY team_number, time_stamp";
    const teleQ = "SELECT team_number, type, time_stamp, x, y, score, value FROM public.teleop_actions WHERE event_key = '" + EVENT + "' AND match_number = " + MATCH + " AND team_number IN (" + btList + ") ORDER BY team_number, time_stamp";

    const autoActions = await client.query(autoQ);
    const teleopActions = await client.query(teleQ);

    console.log('\n  --- AUTO ACTIONS ---');
    if (autoActions.rows.length === 0) {
      console.log('  (no auto actions found for blue alliance)');
    } else {
      let lastTeam = null;
      for (const r of autoActions.rows) {
        if (r.team_number !== lastTeam) {
          console.log('\n    --- Team ' + r.team_number + ' (auto) ---');
          lastTeam = r.team_number;
        }
        console.log('      ' + String(r.type).padEnd(18) + ' ts=' + String(r.time_stamp).padEnd(8) + ' x=' + String(r.x).padEnd(7) + ' y=' + String(r.y).padEnd(7) + ' score=' + String(r.score).padEnd(5) + ' val=' + r.value);
      }
    }

    console.log('\n  --- TELEOP ACTIONS ---');
    if (teleopActions.rows.length === 0) {
      console.log('  (no teleop actions found for blue alliance)');
    } else {
      let lastTeam = null;
      for (const r of teleopActions.rows) {
        if (r.team_number !== lastTeam) {
          console.log('\n    --- Team ' + r.team_number + ' (teleop) ---');
          lastTeam = r.team_number;
        }
        console.log('      ' + String(r.type).padEnd(18) + ' ts=' + String(r.time_stamp).padEnd(8) + ' x=' + String(r.x).padEnd(7) + ' y=' + String(r.y).padEnd(7) + ' score=' + String(r.score).padEnd(5) + ' val=' + r.value);
      }
    }

    // ==========================================================
    // 4. TRACE THROUGH ACTION SEQUENCES - COMPUTE ATTRIBUTION
    // ==========================================================
    console.log('\n' + sep);
    console.log('  MATCH ' + MATCH + ' - ACTION ATTRIBUTION TRACE (BLUE ALLIANCE)');
    console.log(sep);

    const actionsByTeam = {};
    for (const team of blueTeams) actionsByTeam[team] = { auto: [], teleop: [] };
    for (const r of autoActions.rows) actionsByTeam[r.team_number].auto.push(r);
    for (const r of teleopActions.rows) actionsByTeam[r.team_number].teleop.push(r);

    const actionTotals = {};

    for (const team of blueTeams) {
      console.log('\n  ===== Team ' + team + ' =====');
      let totalActionScored = 0;
      let totalActionPassed = 0;

      for (const phase of ['auto', 'teleop']) {
        const actions = actionsByTeam[team][phase];
        if (actions.length === 0) {
          console.log('\n    [' + phase.toUpperCase() + '] (no actions)');
          continue;
        }
        console.log('\n    [' + phase.toUpperCase() + '] - ' + actions.length + ' actions');
        let pendingMultiplier = 0;
        let phaseScored = 0;
        let phasePassed = 0;

        for (const a of actions) {
          const typeStr = String(a.type);
          if (typeStr.startsWith('SCORE_PLUS_')) {
            const mult = parseInt(typeStr.replace('SCORE_PLUS_', ''));
            pendingMultiplier += mult;
            console.log('      ts=' + String(a.time_stamp).padEnd(8) + ' ' + typeStr.padEnd(18) + ' => pending multiplier now ' + pendingMultiplier);
          } else if (typeStr === 'FUEL_SCORE') {
            const attributed = pendingMultiplier > 0 ? pendingMultiplier : 1;
            phaseScored += attributed;
            console.log('      ts=' + String(a.time_stamp).padEnd(8) + ' FUEL_SCORE           => attributed ' + attributed + ' balls scored (pending was ' + pendingMultiplier + ', reset to 0)');
            pendingMultiplier = 0;
          } else if (typeStr === 'FUEL_PASS') {
            const attributed = pendingMultiplier > 0 ? pendingMultiplier : 1;
            phasePassed += attributed;
            console.log('      ts=' + String(a.time_stamp).padEnd(8) + ' FUEL_PASS            => attributed ' + attributed + ' balls passed (pending was ' + pendingMultiplier + ', reset to 0)');
            pendingMultiplier = 0;
          } else {
            console.log('      ts=' + String(a.time_stamp).padEnd(8) + ' ' + typeStr.padEnd(18) + ' (non-fuel action, pending unchanged: ' + pendingMultiplier + ')');
          }
        }

        if (pendingMultiplier > 0) {
          console.log('      ** WARNING: leftover pending multiplier = ' + pendingMultiplier + ' (never consumed by SCORE or PASS)');
        }
        console.log('    [' + phase.toUpperCase() + '] Result: ' + phaseScored + ' scored, ' + phasePassed + ' passed');
        totalActionScored += phaseScored;
        totalActionPassed += phasePassed;
      }

      console.log('\n    TEAM ' + team + ' ACTION TOTAL: ' + totalActionScored + ' scored, ' + totalActionPassed + ' passed');
      actionTotals[team] = { scored: totalActionScored, passed: totalActionPassed };
    }

    let actionAllianceScored = 0;
    let actionAlliancePassed = 0;
    for (const team of blueTeams) {
      actionAllianceScored += actionTotals[team].scored;
      actionAlliancePassed += actionTotals[team].passed;
    }

    // ==========================================================
    // 5. COMPARISON
    // ==========================================================
    console.log('\n' + sep);
    console.log('  MATCH ' + MATCH + ' - COMPARISON (BLUE ALLIANCE)');
    console.log(sep);

    console.log('\n  TBA Hub Score:');
    console.log('    Auto count:   ' + t.hub_auto_count);
    console.log('    Teleop count: ' + t.hub_teleop_count);
    console.log('    Total count:  ' + t.hub_total_count);
    console.log('    Total points: ' + t.hub_total_pts);

    console.log('\n  Summary-Based (multiplier-only, NO base FUEL_SCORE):');
    console.log('    Total scored: ' + summaryTotalScored);
    console.log('    Total passed: ' + summaryTotalPassed);
    for (const team of blueTeams) {
      const s = summaryByTeam[team];
      if (s) console.log('      Team ' + team + ': scored=' + s.totalMult + '  passed=' + s.totalPasses);
    }

    console.log('\n  Action-Based Attribution:');
    console.log('    Total scored: ' + actionAllianceScored);
    console.log('    Total passed: ' + actionAlliancePassed);
    for (const team of blueTeams) {
      console.log('      Team ' + team + ': scored=' + actionTotals[team].scored + '  passed=' + actionTotals[team].passed);
    }

    console.log('\n  --- DELTA ---');
    console.log('    TBA total count vs Summary scored:  ' + t.hub_total_count + ' vs ' + summaryTotalScored + '  (diff: ' + (t.hub_total_count - summaryTotalScored) + ')');
    console.log('    TBA total count vs Action scored:   ' + t.hub_total_count + ' vs ' + actionAllianceScored + '  (diff: ' + (t.hub_total_count - actionAllianceScored) + ')');
    console.log('    Summary scored vs Action scored:    ' + summaryTotalScored + ' vs ' + actionAllianceScored + '  (diff: ' + (summaryTotalScored - actionAllianceScored) + ')');

    console.log('\n  Done.\n');

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
  } finally {
    await client.end();
  }
}

run();
