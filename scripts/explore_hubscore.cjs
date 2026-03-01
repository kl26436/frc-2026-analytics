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
    const EVENT = '2026week0';

    // 1. Full hub score breakdown for match 7 (both alliances)
    console.log('========== MATCH 7 — FULL HUB SCORE BREAKDOWN ==========');
    for (const color of ['red', 'blue']) {
      const prefix = `tba.score_breakdown.${color}.hubScore`;
      const q = await client.query(`
        SELECT
          "${prefix}.autoCount" as auto_count,
          "${prefix}.autoPoints" as auto_pts,
          "${prefix}.teleopCount" as teleop_count,
          "${prefix}.teleopPoints" as teleop_pts,
          "${prefix}.endgameCount" as endgame_count,
          "${prefix}.endgamePoints" as endgame_pts,
          "${prefix}.shift1Count" as shift1_count,
          "${prefix}.shift1Points" as shift1_pts,
          "${prefix}.shift2Count" as shift2_count,
          "${prefix}.shift2Points" as shift2_pts,
          "${prefix}.shift3Count" as shift3_count,
          "${prefix}.shift3Points" as shift3_pts,
          "${prefix}.shift4Count" as shift4_count,
          "${prefix}.shift4Points" as shift4_pts,
          "${prefix}.transitionCount" as transition_count,
          "${prefix}.transitionPoints" as transition_pts,
          "${prefix}.totalCount" as total_count,
          "${prefix}.totalPoints" as total_pts,
          "${prefix}.uncounted" as uncounted
        FROM tba."${EVENT}_matches"
        WHERE "tba.match_number" = 7 AND "tba.comp_level" = 'qm'
        LIMIT 1
      `);
      if (q.rows.length) {
        const r = q.rows[0];
        console.log(`\n  ${color.toUpperCase()} ALLIANCE:`);
        console.log(`    Auto:       ${r.auto_count} balls (${r.auto_pts} pts)`);
        console.log(`    Shift 1:    ${r.shift1_count} balls (${r.shift1_pts} pts)`);
        console.log(`    Shift 2:    ${r.shift2_count} balls (${r.shift2_pts} pts)`);
        console.log(`    Shift 3:    ${r.shift3_count} balls (${r.shift3_pts} pts)`);
        console.log(`    Shift 4:    ${r.shift4_count} balls (${r.shift4_pts} pts)`);
        console.log(`    Transition: ${r.transition_count} balls (${r.transition_pts} pts)`);
        console.log(`    Endgame:    ${r.endgame_count} balls (${r.endgame_pts} pts)`);
        console.log(`    Teleop tot: ${r.teleop_count} balls (${r.teleop_pts} pts)`);
        console.log(`    TOTAL:      ${r.total_count} balls (${r.total_pts} pts)`);
        console.log(`    Uncounted:  ${r.uncounted}`);
      }
    }

    // 2. Action timestamps for match 7 — can we figure out which shift each action falls in?
    console.log('\n\n========== MATCH 7 — ACTION TIMESTAMPS vs SHIFTS ==========');

    // Get all actions with timestamps
    const allActions = await client.query(`
      SELECT team_number, type, time_stamp, 'auto' as phase
      FROM public.auton_actions
      WHERE event_key = '${EVENT}' AND match_number = 7
      UNION ALL
      SELECT team_number, type, time_stamp, 'teleop' as phase
      FROM public.teleop_actions
      WHERE event_key = '${EVENT}' AND match_number = 7
      ORDER BY time_stamp
    `);

    if (allActions.rows.length > 0) {
      const timestamps = allActions.rows.map(r => Number(r.time_stamp));
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      console.log(`  Time range: ${minTs} to ${maxTs} (${maxTs - minTs} seconds span)`);
      console.log(`  First action: ${new Date(minTs * 1000).toISOString()}`);
      console.log(`  Last action:  ${new Date(maxTs * 1000).toISOString()}`);

      // Group by team and show their time ranges
      const byTeam = new Map();
      for (const r of allActions.rows) {
        const team = Number(r.team_number);
        if (!byTeam.has(team)) byTeam.set(team, { auto: [], teleop: [] });
        byTeam.get(team)[r.phase].push(Number(r.time_stamp));
      }

      console.log('\n  Per-team timing:');
      for (const [team, data] of byTeam) {
        const allTs = [...data.auto, ...data.teleop];
        const start = Math.min(...allTs) - minTs;
        const end = Math.max(...allTs) - minTs;
        console.log(`    Team ${team}: ${start}s to ${end}s (auto: ${data.auto.length} actions, teleop: ${data.teleop.length} actions)`);
      }

      // Show FUEL_SCORE and FUEL_PASS events with relative timestamps per team
      console.log('\n  Scoring events timeline (relative seconds):');
      for (const r of allActions.rows) {
        if (r.type === 'FUEL_SCORE' || r.type === 'FUEL_PASS') {
          const relTime = Number(r.time_stamp) - minTs;
          console.log(`    +${String(relTime).padStart(3)}s  Team ${r.team_number}  ${r.type.padEnd(12)}  [${r.phase}]`);
        }
      }
    }

    // 3. Check ALL matches — do hub score shifts vary?
    console.log('\n\n========== ALL MATCHES — SHIFT DISTRIBUTION ==========');
    for (const color of ['red', 'blue']) {
      const prefix = `tba.score_breakdown.${color}.hubScore`;
      const q = await client.query(`
        SELECT "tba.match_number" as match,
          "${prefix}.autoCount" as auto_c,
          "${prefix}.shift1Count" as s1,
          "${prefix}.shift2Count" as s2,
          "${prefix}.shift3Count" as s3,
          "${prefix}.shift4Count" as s4,
          "${prefix}.transitionCount" as trans,
          "${prefix}.endgameCount" as endg,
          "${prefix}.totalCount" as total,
          "${prefix}.uncounted" as unc
        FROM tba."${EVENT}_matches"
        WHERE "tba.comp_level" = 'qm'
        ORDER BY "tba.match_number"
      `);
      console.log(`\n  ${color.toUpperCase()} alliance hub scores:`);
      console.log(`  ${'Match'.padEnd(6)} ${'Auto'.padStart(5)} ${'S1'.padStart(5)} ${'S2'.padStart(5)} ${'S3'.padStart(5)} ${'S4'.padStart(5)} ${'Trans'.padStart(6)} ${'Endg'.padStart(5)} ${'Total'.padStart(6)} ${'Unc'.padStart(5)}`);
      for (const r of q.rows) {
        console.log(`  ${String('Q'+r.match).padEnd(6)} ${String(r.auto_c||0).padStart(5)} ${String(r.s1||0).padStart(5)} ${String(r.s2||0).padStart(5)} ${String(r.s3||0).padStart(5)} ${String(r.s4||0).padStart(5)} ${String(r.trans||0).padStart(6)} ${String(r.endg||0).padStart(5)} ${String(r.total||0).padStart(6)} ${String(r.unc||0).padStart(5)}`);
      }
    }

    // 4. Points per ball — do they vary by shift?
    console.log('\n\n========== POINTS PER BALL BY SHIFT ==========');
    for (const color of ['red', 'blue']) {
      const prefix = `tba.score_breakdown.${color}.hubScore`;
      const q = await client.query(`
        SELECT
          SUM("${prefix}.autoCount") as auto_c, SUM("${prefix}.autoPoints") as auto_p,
          SUM("${prefix}.shift1Count") as s1_c, SUM("${prefix}.shift1Points") as s1_p,
          SUM("${prefix}.shift2Count") as s2_c, SUM("${prefix}.shift2Points") as s2_p,
          SUM("${prefix}.shift3Count") as s3_c, SUM("${prefix}.shift3Points") as s3_p,
          SUM("${prefix}.shift4Count") as s4_c, SUM("${prefix}.shift4Points") as s4_p,
          SUM("${prefix}.transitionCount") as tr_c, SUM("${prefix}.transitionPoints") as tr_p,
          SUM("${prefix}.endgameCount") as eg_c, SUM("${prefix}.endgamePoints") as eg_p,
          SUM("${prefix}.totalCount") as tot_c, SUM("${prefix}.totalPoints") as tot_p
        FROM tba."${EVENT}_matches"
        WHERE "tba.comp_level" = 'qm'
      `);
      if (q.rows.length) {
        const r = q.rows[0];
        console.log(`\n  ${color.toUpperCase()} (all quals summed):`);
        const ppb = (c, p) => c > 0 ? (p / c).toFixed(2) : 'N/A';
        console.log(`    Auto:       ${r.auto_c} balls, ${r.auto_p} pts → ${ppb(r.auto_c, r.auto_p)} pts/ball`);
        console.log(`    Shift 1:    ${r.s1_c} balls, ${r.s1_p} pts → ${ppb(r.s1_c, r.s1_p)} pts/ball`);
        console.log(`    Shift 2:    ${r.s2_c} balls, ${r.s2_p} pts → ${ppb(r.s2_c, r.s2_p)} pts/ball`);
        console.log(`    Shift 3:    ${r.s3_c} balls, ${r.s3_p} pts → ${ppb(r.s3_c, r.s3_p)} pts/ball`);
        console.log(`    Shift 4:    ${r.s4_c} balls, ${r.s4_p} pts → ${ppb(r.s4_c, r.s4_p)} pts/ball`);
        console.log(`    Transition: ${r.tr_c} balls, ${r.tr_p} pts → ${ppb(r.tr_c, r.tr_p)} pts/ball`);
        console.log(`    Endgame:    ${r.eg_c} balls, ${r.eg_p} pts → ${ppb(r.eg_c, r.eg_p)} pts/ball`);
        console.log(`    Total:      ${r.tot_c} balls, ${r.tot_p} pts → ${ppb(r.tot_c, r.tot_p)} pts/ball`);
      }
    }

    // 5. TBA actual_time for match timing reference
    console.log('\n\n========== MATCH TIMING (actual_time from TBA) ==========');
    const timing = await client.query(`
      SELECT "tba.match_number" as match, "tba.actual_time" as actual_time
      FROM tba."${EVENT}_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);
    for (const r of timing.rows) {
      const dt = r.actual_time ? new Date(Number(r.actual_time) * 1000).toISOString() : 'null';
      console.log(`  Q${r.match}: actual_time=${r.actual_time} (${dt})`);
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
