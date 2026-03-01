const { Client } = require('pg');
const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

async function run() {
  try {
    await client.connect();

    // Raw summary rows for 6328
    const summary = await client.query(`
      SELECT *
      FROM public.summary_2026
      WHERE event_key = '2026week0' AND team_number = 6328
      ORDER BY match_number
    `);

    console.log(`\n6328 summary rows: ${summary.rows.length}`);
    console.log('Columns:', Object.keys(summary.rows[0]).join(', '));

    for (const row of summary.rows) {
      console.log('\n' + '─'.repeat(80));
      console.log(`Q${row.match_number} | configured_team: ${row.configured_team} | scouter: ${row.scouter_id}`);
      console.log('─'.repeat(80));
      for (const [key, val] of Object.entries(row)) {
        if (val !== null && val !== undefined && val !== '' && val !== false && val !== 0) {
          console.log(`  ${key}: ${val}`);
        }
      }
    }

    // Raw auto actions
    console.log('\n\n' + '═'.repeat(80));
    console.log('AUTO ACTIONS');
    console.log('═'.repeat(80));
    const auto = await client.query(`
      SELECT *
      FROM public.auton_actions
      WHERE event_key = '2026week0' AND team_number = 6328
      ORDER BY match_number, time_stamp
    `);
    console.log(`Columns: ${Object.keys(auto.rows[0] || {}).join(', ')}`);
    for (const row of auto.rows) {
      console.log(`  Q${row.match_number} | ${row.type} | ts=${row.time_stamp} | x=${row.x} y=${row.y} | val=${row.value} score=${row.score}`);
    }

    // Raw teleop actions
    console.log('\n\n' + '═'.repeat(80));
    console.log('TELEOP ACTIONS');
    console.log('═'.repeat(80));
    const teleop = await client.query(`
      SELECT *
      FROM public.teleop_actions
      WHERE event_key = '2026week0' AND team_number = 6328
      ORDER BY match_number, time_stamp
    `);
    console.log(`Columns: ${Object.keys(teleop.rows[0] || {}).join(', ')}`);
    for (const row of teleop.rows) {
      console.log(`  Q${row.match_number} | ${row.type} | ts=${row.time_stamp} | x=${row.x} y=${row.y} | val=${row.value} score=${row.score}`);
    }

  } catch(e) { console.error(e.message, e.stack); } finally { await client.end(); }
}
run();
