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

    // 1. Scoring ranges (quoted column names)
    console.log('=== WEEK 0 SCORING RANGES ===');
    const ranges = await client.query(`
      SELECT
        AVG(COALESCE("auton_FUEL_SCORE", 0))::numeric(5,1) as avg_auto_fuel,
        MAX(COALESCE("auton_FUEL_SCORE", 0)) as max_auto_fuel,
        AVG(COALESCE("teleop_FUEL_SCORE", 0))::numeric(5,1) as avg_teleop_fuel,
        MAX(COALESCE("teleop_FUEL_SCORE", 0)) as max_teleop_fuel,
        AVG(COALESCE("auton_FUEL_PASS", 0))::numeric(5,1) as avg_auto_pass,
        MAX(COALESCE("auton_FUEL_PASS", 0)) as max_auto_pass,
        AVG(COALESCE("teleop_FUEL_PASS", 0))::numeric(5,1) as avg_teleop_pass,
        MAX(COALESCE("teleop_FUEL_PASS", 0)) as max_teleop_pass
      FROM public.summary_2026
      WHERE event_key = '2026week0'
    `);
    console.log(ranges.rows[0]);

    // 2. SCORE_PLUS usage
    console.log('\n=== SCORE_PLUS COUNTS (total actions across all 90 rows) ===');
    const plus = await client.query(`
      SELECT
        SUM(COALESCE("auton_SCORE_PLUS_1", 0)) as auto_plus1_total,
        SUM(COALESCE("auton_SCORE_PLUS_2", 0)) as auto_plus2_total,
        SUM(COALESCE("auton_SCORE_PLUS_3", 0)) as auto_plus3_total,
        SUM(COALESCE("auton_SCORE_PLUS_5", 0)) as auto_plus5_total,
        SUM(COALESCE("auton_SCORE_PLUS_10", 0)) as auto_plus10_total,
        SUM(COALESCE("teleop_SCORE_PLUS_1", 0)) as teleop_plus1_total,
        SUM(COALESCE("teleop_SCORE_PLUS_2", 0)) as teleop_plus2_total,
        SUM(COALESCE("teleop_SCORE_PLUS_3", 0)) as teleop_plus3_total,
        SUM(COALESCE("teleop_SCORE_PLUS_5", 0)) as teleop_plus5_total,
        SUM(COALESCE("teleop_SCORE_PLUS_10", 0)) as teleop_plus10_total
      FROM public.summary_2026
      WHERE event_key = '2026week0'
    `);
    console.log(plus.rows[0]);

    // 3. Auto climb count
    console.log('\n=== AUTO CLIMB AT WEEK 0 ===');
    const autoClimb = await client.query(`
      SELECT
        SUM(COALESCE("auton_AUTON_CLIMBED", 0)) as auto_climbed_count,
        COUNT(*) as total_rows
      FROM public.summary_2026
      WHERE event_key = '2026week0'
    `);
    console.log(autoClimb.rows[0]);

    // 4. Climb level distribution
    console.log('\n=== CLIMB LEVELS AT WEEK 0 ===');
    const climbs = await client.query(`
      SELECT climb_level, COUNT(*) as cnt
      FROM public.summary_2026
      WHERE event_key = '2026week0'
      GROUP BY climb_level ORDER BY climb_level
    `);
    for (const r of climbs.rows) console.log(`  "${r.climb_level}": ${r.cnt}`);

    // 5. All endGameTower values across all robot positions
    console.log('\n=== ALL ENDGAME TOWER VALUES (any non-None?) ===');
    for (const color of ['red', 'blue']) {
      for (let i = 1; i <= 3; i++) {
        const col = `tba.score_breakdown.${color}.endGameTowerRobot${i}`;
        const q = await client.query(`
          SELECT "${col}" as val, COUNT(*) as cnt
          FROM tba."2026week0_matches"
          GROUP BY "${col}"
          ORDER BY "${col}"
        `);
        const nonNone = q.rows.filter(r => r.val !== 'None');
        if (nonNone.length > 0) {
          console.log(`  ${col}: ${nonNone.map(r => `"${r.val}"(${r.cnt})`).join(', ')}`);
        }
      }
    }
    console.log('  (if nothing printed above, all tower values are "None")');

    // 6. Teleop action sample with field coordinates
    console.log('\n=== TELEOP_ACTIONS SAMPLE (10 rows, 1 team in 1 match) ===');
    const actions = await client.query(`
      SELECT type, x, y, time_stamp, score, value
      FROM public.teleop_actions
      WHERE event_key = '2026week0' AND match_number = 1 AND team_number = 1768
      ORDER BY time_stamp
      LIMIT 10
    `);
    for (const r of actions.rows) {
      console.log(`  ${r.type} at (${r.x}, ${r.y}) score=${r.score} ts=${r.time_stamp}`);
    }

    // 7. v_2026week0_stats — full column list
    console.log('\n=== v_2026week0_stats COLUMNS ===');
    const statCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_2026week0_stats'
      ORDER BY ordinal_position
    `);
    for (const c of statCols.rows) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }

    // 8. v_2026week0_stats — sample of aggregated data for a team
    console.log('\n=== v_2026week0_stats — SAMPLE TEAM ===');
    const teamStats = await client.query(`SELECT * FROM public.v_2026week0_stats LIMIT 1`);
    if (teamStats.rows.length > 0) {
      for (const [k, v] of Object.entries(teamStats.rows[0])) {
        if (v !== null) console.log(`  ${k}: ${v}`);
      }
    }

    // 9. How many unique matches are in TBA data
    console.log('\n=== TBA UNIQUE MATCHES ===');
    const matchCounts = await client.query(`
      SELECT "tba.comp_level" as lvl, COUNT(DISTINCT "tba.key") as cnt
      FROM tba."2026week0_matches"
      GROUP BY "tba.comp_level"
    `);
    for (const r of matchCounts.rows) {
      console.log(`  ${r.lvl}: ${r.cnt} unique matches`);
    }

    // 10. Compare scout fuel totals vs TBA hub totals for a match
    console.log('\n=== MATCH 1: SCOUT vs TBA FUEL COMPARISON ===');
    // Scout side (blue alliance in match 1)
    const scoutBlue = await client.query(`
      SELECT team_number,
             COALESCE("auton_FUEL_SCORE", 0) as auto_fuel,
             COALESCE("teleop_FUEL_SCORE", 0) as teleop_fuel,
             COALESCE("auton_FUEL_SCORE", 0) + COALESCE("teleop_FUEL_SCORE", 0) as total_fuel
      FROM public.summary_2026
      WHERE event_key = '2026week0' AND match_number = 1
        AND configured_team LIKE 'blue%'
      ORDER BY configured_team
    `);
    console.log('  BLUE ALLIANCE (scout data):');
    let scoutTotal = 0;
    for (const r of scoutBlue.rows) {
      console.log(`    Team ${r.team_number}: auto=${r.auto_fuel} teleop=${r.teleop_fuel} total=${r.total_fuel}`);
      scoutTotal += parseInt(r.total_fuel);
    }
    console.log(`    Scout alliance total: ${scoutTotal}`);

    // TBA side
    const tbaBlue = await client.query(`
      SELECT
        "tba.score_breakdown.blue.hubScore.autoCount" as auto_count,
        "tba.score_breakdown.blue.hubScore.teleopCount" as teleop_count,
        "tba.score_breakdown.blue.hubScore.totalCount" as total_count,
        "tba.score_breakdown.blue.totalPoints" as total_points
      FROM tba."2026week0_matches"
      WHERE "tba.key" = '2026week0_qm1'
      LIMIT 1
    `);
    if (tbaBlue.rows.length > 0) {
      const t = tbaBlue.rows[0];
      console.log(`  TBA (FMS): auto=${t.auto_count} teleop=${t.teleop_count} total=${t.total_count} totalPoints=${t.total_points}`);
      console.log(`  GAP: scout=${scoutTotal} vs FMS=${t.total_count} (${scoutTotal > t.total_count ? 'OVER' : 'UNDER'} by ${Math.abs(scoutTotal - t.total_count)})`);
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
