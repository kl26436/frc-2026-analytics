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
    const MATCH = 7;
    const EVENT = '2026week0';

    // 1. Who played in match 7?
    console.log(`\n========== MATCH ${MATCH} — TEAMS ==========`);
    const tba = await client.query(`
      SELECT "tba.red.1" as r1, "tba.red.2" as r2, "tba.red.3" as r3,
             "tba.blue.1" as b1, "tba.blue.2" as b2, "tba.blue.3" as b3,
             "tba.alliances.red.score" as red_score,
             "tba.alliances.blue.score" as blue_score,
             "tba.score_breakdown.red.hubScore.autoCount" as red_hub_auto,
             "tba.score_breakdown.red.hubScore.teleopCount" as red_hub_teleop,
             "tba.score_breakdown.red.hubScore.totalCount" as red_hub_total,
             "tba.score_breakdown.blue.hubScore.autoCount" as blue_hub_auto,
             "tba.score_breakdown.blue.hubScore.teleopCount" as blue_hub_teleop,
             "tba.score_breakdown.blue.hubScore.totalCount" as blue_hub_total
      FROM tba."${EVENT}_matches"
      WHERE "tba.match_number" = ${MATCH} AND "tba.comp_level" = 'qm'
      LIMIT 1
    `);
    if (tba.rows.length) {
      const t = tba.rows[0];
      console.log(`  RED:  ${t.r1}, ${t.r2}, ${t.r3}  (score: ${t.red_score})`);
      console.log(`  BLUE: ${t.b1}, ${t.b2}, ${t.b3}  (score: ${t.blue_score})`);
      console.log(`  RED  hub: auto=${t.red_hub_auto} teleop=${t.red_hub_teleop} total=${t.red_hub_total}`);
      console.log(`  BLUE hub: auto=${t.blue_hub_auto} teleop=${t.blue_hub_teleop} total=${t.blue_hub_total}`);
    }

    // 2. Summary data for all 6 robots
    console.log(`\n========== MATCH ${MATCH} — SUMMARY (per robot) ==========`);
    const summary = await client.query(`
      SELECT team_number, configured_team, dedicated_passer,
             "auton_FUEL_SCORE" as a_score, "auton_FUEL_PASS" as a_pass,
             "auton_SCORE_PLUS_1" as a_p1, "auton_SCORE_PLUS_2" as a_p2,
             "auton_SCORE_PLUS_3" as a_p3, "auton_SCORE_PLUS_5" as a_p5,
             "auton_SCORE_PLUS_10" as a_p10,
             "teleop_FUEL_SCORE" as t_score, "teleop_FUEL_PASS" as t_pass,
             "teleop_SCORE_PLUS_1" as t_p1, "teleop_SCORE_PLUS_2" as t_p2,
             "teleop_SCORE_PLUS_3" as t_p3, "teleop_SCORE_PLUS_5" as t_p5,
             "teleop_SCORE_PLUS_10" as t_p10,
             climb_level
      FROM public.summary_2026
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      ORDER BY configured_team
    `);
    for (const r of summary.rows) {
      const alliance = r.configured_team.startsWith('red') ? 'RED' : 'BLUE';
      const autoFuel = (r.a_score||0) + (r.a_p1||0)*1 + (r.a_p2||0)*2 + (r.a_p3||0)*3 + (r.a_p5||0)*5 + (r.a_p10||0)*10;
      const teleFuel = (r.t_score||0) + (r.t_p1||0)*1 + (r.t_p2||0)*2 + (r.t_p3||0)*3 + (r.t_p5||0)*5 + (r.t_p10||0)*10;
      console.log(`\n  [${alliance}] Team ${r.team_number} (${r.configured_team}) ${r.dedicated_passer ? '** PASSER **' : ''}`);
      console.log(`    Auto:   FUEL_SCORE=${r.a_score||0} FUEL_PASS=${r.a_pass||0} +1x${r.a_p1||0} +2x${r.a_p2||0} +3x${r.a_p3||0} +5x${r.a_p5||0} +10x${r.a_p10||0} → est ${autoFuel} balls`);
      console.log(`    Teleop: FUEL_SCORE=${r.t_score||0} FUEL_PASS=${r.t_pass||0} +1x${r.t_p1||0} +2x${r.t_p2||0} +3x${r.t_p3||0} +5x${r.t_p5||0} +10x${r.t_p10||0} → est ${teleFuel} balls`);
      console.log(`    Total est: ${autoFuel + teleFuel} balls | Climb: ${r.climb_level}`);
    }

    // 3. Raw auto actions for match 7
    console.log(`\n========== MATCH ${MATCH} — AUTO ACTIONS (all robots) ==========`);
    const autoActions = await client.query(`
      SELECT team_number, type, x, y, time_stamp, value, score
      FROM public.auton_actions
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      ORDER BY team_number, time_stamp
    `);
    if (autoActions.rows.length === 0) {
      console.log('  (no auto actions found)');
    } else {
      let lastTeam = null;
      for (const r of autoActions.rows) {
        if (r.team_number !== lastTeam) {
          console.log(`\n  --- Team ${r.team_number} ---`);
          lastTeam = r.team_number;
        }
        console.log(`    ${r.type.padEnd(15)} x=${String(r.x).padEnd(7)} y=${String(r.y).padEnd(7)} ts=${r.time_stamp} val=${r.value} score=${r.score}`);
      }
    }

    // 4. Raw teleop actions for match 7
    console.log(`\n========== MATCH ${MATCH} — TELEOP ACTIONS (all robots) ==========`);
    const teleopActions = await client.query(`
      SELECT team_number, type, x, y, time_stamp, value, score
      FROM public.teleop_actions
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      ORDER BY team_number, time_stamp
    `);
    if (teleopActions.rows.length === 0) {
      console.log('  (no teleop actions found)');
    } else {
      let lastTeam = null;
      for (const r of teleopActions.rows) {
        if (r.team_number !== lastTeam) {
          console.log(`\n  --- Team ${r.team_number} ---`);
          lastTeam = r.team_number;
        }
        console.log(`    ${r.type.padEnd(15)} x=${String(r.x).padEnd(7)} y=${String(r.y).padEnd(7)} ts=${r.time_stamp} val=${r.value} score=${r.score}`);
      }
    }

    // 5. Count actions per team
    console.log(`\n========== MATCH ${MATCH} — ACTION COUNTS PER TEAM ==========`);
    const counts = await client.query(`
      SELECT team_number, 'auto' as phase, COUNT(*) as cnt
      FROM public.auton_actions
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      GROUP BY team_number
      UNION ALL
      SELECT team_number, 'teleop' as phase, COUNT(*) as cnt
      FROM public.teleop_actions
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      GROUP BY team_number
      ORDER BY team_number, phase
    `);
    for (const r of counts.rows) {
      console.log(`  Team ${r.team_number} ${r.phase}: ${r.cnt} actions`);
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
