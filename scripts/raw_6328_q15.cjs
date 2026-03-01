const { Client } = require('pg');
const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

async function run() {
  try {
    await client.connect();

    console.log('══════════════════════════════════════════════════════');
    console.log('  SELECT * FROM summary_2026');
    console.log('  WHERE team_number=6328 AND match_number=15');
    console.log('══════════════════════════════════════════════════════');
    const s = await client.query(`SELECT * FROM public.summary_2026 WHERE event_key='2026week0' AND team_number=6328 AND match_number=15`);
    for (const [k, v] of Object.entries(s.rows[0])) {
      console.log(`  ${k}: ${v}`);
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  SELECT * FROM auton_actions');
    console.log('  WHERE team_number=6328 AND match_number=15');
    console.log('══════════════════════════════════════════════════════');
    const a = await client.query(`SELECT * FROM public.auton_actions WHERE event_key='2026week0' AND team_number=6328 AND match_number=15 ORDER BY time_stamp`);
    for (const row of a.rows) {
      for (const [k, v] of Object.entries(row)) {
        console.log(`  ${k}: ${v}`);
      }
      console.log('  ---');
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  SELECT * FROM teleop_actions');
    console.log('  WHERE team_number=6328 AND match_number=15');
    console.log('══════════════════════════════════════════════════════');
    const t = await client.query(`SELECT * FROM public.teleop_actions WHERE event_key='2026week0' AND team_number=6328 AND match_number=15 ORDER BY time_stamp`);
    for (const row of t.rows) {
      for (const [k, v] of Object.entries(row)) {
        console.log(`  ${k}: ${v}`);
      }
      console.log('  ---');
    }

  } catch(e) { console.error(e.message); } finally { await client.end(); }
}
run();
