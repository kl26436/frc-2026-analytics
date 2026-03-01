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

    // 1. Week 0 scouting data - a real competition match
    console.log('=== summary_2026 — WEEK 0 COMPETITION SAMPLE (3 rows) ===');
    const week0 = await client.query(`
      SELECT * FROM public.summary_2026
      WHERE event_key = '2026week0'
      ORDER BY match_number, configured_team
      LIMIT 3
    `);
    for (const row of week0.rows) {
      console.log('\n--- Match', row.match_number, 'Team', row.team_number, '(' + row.configured_team + ') ---');
      for (const [k, v] of Object.entries(row)) {
        if (v !== null) console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }

    // 2. Scouting coverage at week 0
    console.log('\n\n=== WEEK 0 SCOUTING COVERAGE ===');
    const coverage = await client.query(`
      SELECT match_number, COUNT(*) as robots_scouted,
             STRING_AGG(DISTINCT scouter_id, ', ') as scouters
      FROM public.summary_2026
      WHERE event_key = '2026week0'
      GROUP BY match_number
      ORDER BY match_number
    `);
    for (const r of coverage.rows) {
      console.log(`  Match ${r.match_number}: ${r.robots_scouted} robots scouted by ${r.scouters}`);
    }

    // 3. Distinct scouters
    console.log('\n=== SCOUTERS AT WEEK 0 ===');
    const scouters = await client.query(`
      SELECT scouter_id, COUNT(*) as cnt
      FROM public.summary_2026
      WHERE event_key = '2026week0'
      GROUP BY scouter_id ORDER BY cnt DESC
    `);
    for (const r of scouters.rows) {
      console.log(`  ${r.scouter_id}: ${r.cnt} entries`);
    }

    // 4. Score ranges to understand the data
    console.log('\n=== WEEK 0 SCORING RANGES ===');
    const ranges = await client.query(`
      SELECT
        AVG(COALESCE(auton_FUEL_SCORE, 0))::numeric(5,1) as avg_auto_fuel,
        MAX(COALESCE(auton_FUEL_SCORE, 0)) as max_auto_fuel,
        AVG(COALESCE(teleop_FUEL_SCORE, 0))::numeric(5,1) as avg_teleop_fuel,
        MAX(COALESCE(teleop_FUEL_SCORE, 0)) as max_teleop_fuel,
        AVG(COALESCE(auton_FUEL_PASS, 0))::numeric(5,1) as avg_auto_pass,
        MAX(COALESCE(auton_FUEL_PASS, 0)) as max_auto_pass,
        AVG(COALESCE(teleop_FUEL_PASS, 0))::numeric(5,1) as avg_teleop_pass,
        MAX(COALESCE(teleop_FUEL_PASS, 0)) as max_teleop_pass
      FROM public.summary_2026
      WHERE event_key = '2026week0'
    `);
    console.log(ranges.rows[0]);

    // 5. SCORE_PLUS usage
    console.log('\n=== SCORE_PLUS USAGE AT WEEK 0 ===');
    const plus = await client.query(`
      SELECT
        SUM(CASE WHEN auton_SCORE_PLUS_1 > 0 THEN 1 ELSE 0 END) as auto_plus1,
        SUM(CASE WHEN auton_SCORE_PLUS_2 > 0 THEN 1 ELSE 0 END) as auto_plus2,
        SUM(CASE WHEN auton_SCORE_PLUS_3 > 0 THEN 1 ELSE 0 END) as auto_plus3,
        SUM(CASE WHEN auton_SCORE_PLUS_5 > 0 THEN 1 ELSE 0 END) as auto_plus5,
        SUM(CASE WHEN auton_SCORE_PLUS_10 > 0 THEN 1 ELSE 0 END) as auto_plus10,
        SUM(CASE WHEN teleop_SCORE_PLUS_1 > 0 THEN 1 ELSE 0 END) as teleop_plus1,
        SUM(CASE WHEN teleop_SCORE_PLUS_2 > 0 THEN 1 ELSE 0 END) as teleop_plus2,
        SUM(CASE WHEN teleop_SCORE_PLUS_3 > 0 THEN 1 ELSE 0 END) as teleop_plus3,
        SUM(CASE WHEN teleop_SCORE_PLUS_5 > 0 THEN 1 ELSE 0 END) as teleop_plus5,
        SUM(CASE WHEN teleop_SCORE_PLUS_10 > 0 THEN 1 ELSE 0 END) as teleop_plus10
      FROM public.summary_2026
      WHERE event_key = '2026week0'
    `);
    console.log(plus.rows[0]);

    // 6. Auto climbed count
    console.log('\n=== AUTO CLIMB AT WEEK 0 ===');
    const autoClimb = await client.query(`
      SELECT
        SUM(CASE WHEN auton_AUTON_CLIMBED > 0 THEN 1 ELSE 0 END) as auto_climbed,
        COUNT(*) as total
      FROM public.summary_2026
      WHERE event_key = '2026week0'
    `);
    console.log(autoClimb.rows[0]);

    // 7. The joined view — sample
    console.log('\n=== v_2026week0_matches — COLUMN LIST ===');
    const viewCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_2026week0_matches'
      ORDER BY ordinal_position
    `);
    console.log(`  ${viewCols.rows.length} columns total`);
    console.log(`  First 20: ${viewCols.rows.slice(0, 20).map(r => r.column_name).join(', ')}`);

    // 8. v_2026week0_stats sample
    console.log('\n=== v_2026week0_stats — SAMPLE (1 team) ===');
    const statsSample = await client.query(`SELECT * FROM public.v_2026week0_stats LIMIT 1`);
    if (statsSample.rows.length > 0) {
      for (const [k, v] of Object.entries(statsSample.rows[0])) {
        if (v !== null) console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }

    // 9. Teams scouted at week 0
    console.log('\n=== DISTINCT TEAMS SCOUTED AT WEEK 0 ===');
    const teams = await client.query(`
      SELECT DISTINCT team_number FROM public.summary_2026
      WHERE event_key = '2026week0' ORDER BY team_number
    `);
    console.log(`  ${teams.rows.length} teams: ${teams.rows.map(r => r.team_number).join(', ')}`);

    // 10. TBA match count by comp_level
    console.log('\n=== TBA MATCHES BY COMP LEVEL ===');
    const levels = await client.query(`
      SELECT "tba.comp_level" as comp_level, COUNT(DISTINCT "tba.key") as match_count
      FROM tba."2026week0_matches"
      GROUP BY "tba.comp_level"
      ORDER BY "tba.comp_level"
    `);
    for (const r of levels.rows) {
      console.log(`  ${r.comp_level}: ${r.match_count} matches`);
    }

    // 11. Check if endGameTowerRobot has any non-None values
    console.log('\n=== ENDGAME TOWER ROBOT VALUES (non-None) ===');
    const endgame = await client.query(`
      SELECT "tba.score_breakdown.red.endGameTowerRobot1" as val, COUNT(*) as cnt
      FROM tba."2026week0_matches"
      WHERE "tba.score_breakdown.red.endGameTowerRobot1" != 'None'
      GROUP BY val
      UNION ALL
      SELECT "tba.score_breakdown.blue.endGameTowerRobot1", COUNT(*)
      FROM tba."2026week0_matches"
      WHERE "tba.score_breakdown.blue.endGameTowerRobot1" != 'None'
      GROUP BY 1
    `);
    if (endgame.rows.length === 0) {
      console.log('  ALL endGameTowerRobot values are "None" — climb enums still unconfirmed');
    } else {
      for (const r of endgame.rows) console.log(`  "${r.val}": ${r.cnt}`);
    }

    // 12. Action table sample with timestamps
    console.log('\n=== TELEOP_ACTIONS SAMPLE (5 rows from 1 match) ===');
    const actions = await client.query(`
      SELECT * FROM public.teleop_actions
      WHERE event_key = '2026week0'
      ORDER BY match_number, team_number, time_stamp
      LIMIT 5
    `);
    for (const row of actions.rows) {
      console.log(`  Match ${row.match_number} Team ${row.team_number}: ${row.type} score=${row.score} at (${row.x}, ${row.y}) ts=${row.time_stamp}`);
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
