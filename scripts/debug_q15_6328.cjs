/**
 * Pull up everything the scout recorded for 6328 in Q15
 */
const { Client } = require('pg');
const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});
function n(v) { return v === null || v === undefined ? 0 : Number(v); }

async function run() {
  try {
    await client.connect();

    // Full summary row
    const summary = await client.query(`
      SELECT *
      FROM public.summary_2026
      WHERE event_key = '2026week0' AND match_number = 15 AND team_number = 6328
    `);

    if (summary.rows.length === 0) {
      console.log('No summary data found for 6328 Q15');
      return;
    }

    const row = summary.rows[0];

    console.log('═'.repeat(80));
    console.log('  TEAM 6328 — Q15 — FULL SCOUT SUMMARY');
    console.log('═'.repeat(80));

    console.log('\n  ── METADATA ──');
    console.log(`  Match: ${row.match_number}`);
    console.log(`  Team: ${row.team_number}`);
    console.log(`  Configured Team: ${row.configured_team}`);
    console.log(`  Event: ${row.event_key}`);
    console.log(`  Match Key: ${row.match_key}`);
    console.log(`  Scouter ID: ${row.scouter_id}`);

    console.log('\n  ── FLAGS ──');
    console.log(`  Dedicated Passer: ${row.dedicated_passer}`);
    console.log(`  Lost Connection: ${row.lost_connection}`);
    console.log(`  No Robot: ${row.no_robot_on_field}`);
    console.log(`  Second Review: ${row.second_review}`);
    console.log(`  Climb Failed: ${row.teleop_climb_failed}`);
    console.log(`  Poor Accuracy: ${row.poor_fuel_scoring_accuracy}`);
    console.log(`  Bulldozed Fuel: ${row.eff_rep_bulldozed_fuel}`);

    console.log('\n  ── PREMATCH ──');
    for (let i = 1; i <= 6; i++) {
      const val = row[`prematch_AUTON_START_ZONE_${i}`];
      if (val) console.log(`  Auto Start Zone ${i}: ${val}`);
    }

    console.log('\n  ── AUTONOMOUS ──');
    console.log(`  FUEL_SCORE count: ${n(row.auton_FUEL_SCORE)}`);
    console.log(`  FUEL_PASS count:  ${n(row.auton_FUEL_PASS)}`);
    console.log(`  SCORE_PLUS_1:  ${n(row.auton_SCORE_PLUS_1)}`);
    console.log(`  SCORE_PLUS_2:  ${n(row.auton_SCORE_PLUS_2)}`);
    console.log(`  SCORE_PLUS_3:  ${n(row.auton_SCORE_PLUS_3)}`);
    console.log(`  SCORE_PLUS_5:  ${n(row.auton_SCORE_PLUS_5)}`);
    console.log(`  SCORE_PLUS_10: ${n(row.auton_SCORE_PLUS_10)}`);
    console.log(`  AUTON_CLIMBED: ${n(row.auton_AUTON_CLIMBED)}`);
    console.log(`  Did Nothing:   ${row.auton_did_nothing}`);
    const autoEstimate = n(row.auton_SCORE_PLUS_1)*1 + n(row.auton_SCORE_PLUS_2)*2 + n(row.auton_SCORE_PLUS_3)*3 + n(row.auton_SCORE_PLUS_5)*5 + n(row.auton_SCORE_PLUS_10)*10;
    console.log(`  → Estimated auto fuel: ${autoEstimate}`);

    console.log('\n  ── TELEOP ──');
    console.log(`  FUEL_SCORE count: ${n(row.teleop_FUEL_SCORE)}`);
    console.log(`  FUEL_PASS count:  ${n(row.teleop_FUEL_PASS)}`);
    console.log(`  SCORE_PLUS_1:  ${n(row.teleop_SCORE_PLUS_1)}`);
    console.log(`  SCORE_PLUS_2:  ${n(row.teleop_SCORE_PLUS_2)}`);
    console.log(`  SCORE_PLUS_3:  ${n(row.teleop_SCORE_PLUS_3)}`);
    console.log(`  SCORE_PLUS_5:  ${n(row.teleop_SCORE_PLUS_5)}`);
    console.log(`  SCORE_PLUS_10: ${n(row.teleop_SCORE_PLUS_10)}`);
    const teleopEstimate = n(row.teleop_SCORE_PLUS_1)*1 + n(row.teleop_SCORE_PLUS_2)*2 + n(row.teleop_SCORE_PLUS_3)*3 + n(row.teleop_SCORE_PLUS_5)*5 + n(row.teleop_SCORE_PLUS_10)*10;
    console.log(`  → Estimated teleop fuel: ${teleopEstimate}`);

    console.log('\n  ── ENDGAME ──');
    console.log(`  Climb Level: ${row.climb_level}`);
    console.log(`  Climb Failed: ${row.teleop_climb_failed}`);

    console.log('\n  ── QUALITY ──');
    console.log(`  Driver Performance: ${row.relative_driver_performance}`);
    console.log(`  Notes: "${row.notes || ''}"`);

    console.log(`\n  ── TOTAL ESTIMATE: ${autoEstimate + teleopEstimate} balls ──`);

    // Now show action data
    console.log('\n' + '═'.repeat(80));
    console.log('  TEAM 6328 — Q15 — ACTION DATA (timestamped)');
    console.log('═'.repeat(80));

    const autoActions = await client.query(`
      SELECT type, time_stamp, x, y, value, score
      FROM public.auton_actions
      WHERE event_key = '2026week0' AND match_number = 15 AND team_number = 6328
      ORDER BY time_stamp
    `);

    const teleopActions = await client.query(`
      SELECT type, time_stamp, x, y, value, score
      FROM public.teleop_actions
      WHERE event_key = '2026week0' AND match_number = 15 AND team_number = 6328
      ORDER BY time_stamp
    `);

    const allActions = [
      ...autoActions.rows.map(a => ({ ...a, phase: 'AUTO' })),
      ...teleopActions.rows.map(a => ({ ...a, phase: 'TELEOP' })),
    ].sort((a, b) => Number(a.time_stamp) - Number(b.time_stamp));

    console.log(`\n  Total actions: ${allActions.length} (${autoActions.rows.length} auto, ${teleopActions.rows.length} teleop)`);

    if (allActions.length > 0) {
      const firstTs = Number(allActions[0].time_stamp);
      const lastTs = Number(allActions[allActions.length - 1].time_stamp);
      console.log(`  Time span: ${((lastTs - firstTs) / 1000).toFixed(1)}s`);
      console.log(`  First timestamp: ${new Date(firstTs).toISOString()}`);
      console.log(`  Last timestamp:  ${new Date(lastTs).toISOString()}`);

      console.log(`\n  ${'Time'.padStart(8)}  ${'Phase'.padEnd(7)} ${'Type'.padEnd(16)} ${'Val'.padStart(4)} ${'Score'.padStart(6)}  ${'x'.padStart(4)} ${'y'.padStart(4)}  Notes`);

      let pending = 0;
      let totalShots = 0, totalPasses = 0;

      for (const a of allActions) {
        const relMs = Number(a.time_stamp) - firstTs;
        const relSec = (relMs / 1000).toFixed(1);
        let note = '';

        if (a.type.startsWith('SCORE_PLUS_')) {
          const val = parseInt(a.type.replace('SCORE_PLUS_', ''), 10) || 1;
          pending += val;
          note = `pending=${pending}`;
        } else if (a.type === 'FUEL_SCORE') {
          const counted = pending > 0 ? pending : 1;
          totalShots += counted;
          note = `→ ${counted} balls SHOT (total: ${totalShots})`;
          pending = 0;
        } else if (a.type === 'FUEL_PASS') {
          const counted = pending > 0 ? pending : 1;
          totalPasses += counted;
          note = `→ ${counted} balls PASSED (total: ${totalPasses})`;
          pending = 0;
        }

        console.log(`  ${('+' + relSec + 's').padStart(8)}  ${a.phase.padEnd(7)} ${a.type.padEnd(16)} ${String(n(a.value)).padStart(4)} ${String(n(a.score)).padStart(6)}  ${String(n(a.x)).padStart(4)} ${String(n(a.y)).padStart(4)}  ${note}`);
      }

      if (pending > 0) console.log(`\n  ⚠ ${pending} orphaned balls at end`);
      console.log(`\n  ACTION TOTALS: ${totalShots} shots + ${totalPasses} passes = ${totalShots + totalPasses} moved`);
    }

    // Also show the other 2 robots on the alliance
    console.log('\n' + '═'.repeat(80));
    console.log('  Q15 BLUE ALLIANCE — ALL 3 ROBOTS');
    console.log('═'.repeat(80));

    const allSummary = await client.query(`
      SELECT team_number, configured_team, dedicated_passer, notes,
             "auton_FUEL_SCORE", "auton_FUEL_PASS", "teleop_FUEL_SCORE", "teleop_FUEL_PASS",
             "auton_SCORE_PLUS_1", "auton_SCORE_PLUS_2", "auton_SCORE_PLUS_3",
             "auton_SCORE_PLUS_5", "auton_SCORE_PLUS_10",
             "teleop_SCORE_PLUS_1", "teleop_SCORE_PLUS_2", "teleop_SCORE_PLUS_3",
             "teleop_SCORE_PLUS_5", "teleop_SCORE_PLUS_10",
             scouter_id
      FROM public.summary_2026
      WHERE event_key = '2026week0' AND match_number = 15
      ORDER BY configured_team
    `);

    for (const r of allSummary.rows) {
      const alliance = r.configured_team.startsWith('red') ? 'RED' : 'BLUE';
      if (alliance !== 'BLUE') continue;
      const autoEst = n(r.auton_SCORE_PLUS_1)*1 + n(r.auton_SCORE_PLUS_2)*2 + n(r.auton_SCORE_PLUS_3)*3 + n(r.auton_SCORE_PLUS_5)*5 + n(r.auton_SCORE_PLUS_10)*10;
      const telEst = n(r.teleop_SCORE_PLUS_1)*1 + n(r.teleop_SCORE_PLUS_2)*2 + n(r.teleop_SCORE_PLUS_3)*3 + n(r.teleop_SCORE_PLUS_5)*5 + n(r.teleop_SCORE_PLUS_10)*10;

      console.log(`\n  Team ${r.team_number} (${r.configured_team}) — scouter: ${r.scouter_id}`);
      console.log(`    Passer: ${r.dedicated_passer ? 'YES' : 'no'}  Notes: "${r.notes || ''}"`);
      console.log(`    Auto:   FUEL_SCORE×${n(r.auton_FUEL_SCORE)} FUEL_PASS×${n(r.auton_FUEL_PASS)} | +1×${n(r.auton_SCORE_PLUS_1)} +2×${n(r.auton_SCORE_PLUS_2)} +3×${n(r.auton_SCORE_PLUS_3)} +5×${n(r.auton_SCORE_PLUS_5)} +10×${n(r.auton_SCORE_PLUS_10)} = ${autoEst}`);
      console.log(`    Teleop: FUEL_SCORE×${n(r.teleop_FUEL_SCORE)} FUEL_PASS×${n(r.teleop_FUEL_PASS)} | +1×${n(r.teleop_SCORE_PLUS_1)} +2×${n(r.teleop_SCORE_PLUS_2)} +3×${n(r.teleop_SCORE_PLUS_3)} +5×${n(r.teleop_SCORE_PLUS_5)} +10×${n(r.teleop_SCORE_PLUS_10)} = ${telEst}`);
      console.log(`    TOTAL: ${autoEst + telEst}`);
    }

    // FMS data
    const tba = await client.query(`
      SELECT
        "tba.score_breakdown.blue.hubScore.autoCount" as auto,
        "tba.score_breakdown.blue.hubScore.teleopCount" as teleop,
        "tba.score_breakdown.blue.hubScore.endgameCount" as endgame,
        "tba.score_breakdown.blue.hubScore.totalCount" as total,
        "tba.score_breakdown.blue.hubScore.shift1Count" as s1,
        "tba.score_breakdown.blue.hubScore.shift2Count" as s2,
        "tba.score_breakdown.blue.hubScore.shift3Count" as s3,
        "tba.score_breakdown.blue.hubScore.shift4Count" as s4,
        "tba.score_breakdown.blue.hubScore.transitionCount" as trans
      FROM tba."2026week0_matches"
      WHERE "tba.comp_level" = 'qm' AND "tba.match_number" = 15
      LIMIT 1
    `);
    const f = tba.rows[0];
    console.log(`\n  FMS BLUE: auto=${n(f.auto)} | trans=${n(f.trans)} s1=${n(f.s1)} s2=${n(f.s2)} s3=${n(f.s3)} s4=${n(f.s4)} end=${n(f.endgame)} | teleop=${n(f.teleop)} | TOTAL=${n(f.total)}`);
    console.log(`  Scout total (all 3 robots): shots+passes counted from actions`);

  } catch(e) { console.error(e.message, e.stack); } finally { await client.end(); }
}
run();
