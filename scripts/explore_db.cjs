// Quick read-only exploration of the scouting Postgres DB
// Usage: node scripts/explore_db.js
// Credentials via env vars — never commit these

const { Client } = require('pg');

const client = new Client({
  host: process.env.PG_HOST || 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
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
    console.log('=== CONNECTED ===\n');

    // 1. List all schemas
    const schemas = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    console.log('SCHEMAS:', schemas.rows.map(r => r.schema_name).join(', '));

    // 2. List all tables/views per schema
    const tables = await client.query(`
      SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_type, table_name
    `);
    console.log('\n=== ALL TABLES & VIEWS ===');
    let lastSchema = '';
    for (const r of tables.rows) {
      if (r.table_schema !== lastSchema) {
        console.log(`\n[${r.table_schema}]`);
        lastSchema = r.table_schema;
      }
      console.log(`  ${r.table_type === 'VIEW' ? '(view)' : '(table)'} ${r.table_name}`);
    }

    // 3. summary_2026 — column names and sample
    console.log('\n=== summary_2026 COLUMNS ===');
    const cols2026 = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'summary_2026'
      ORDER BY ordinal_position
    `);
    for (const c of cols2026.rows) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }

    const count2026 = await client.query(`SELECT COUNT(*) as cnt FROM public.summary_2026`);
    console.log(`\nTotal rows: ${count2026.rows[0].cnt}`);

    // Sample row
    console.log('\n=== summary_2026 SAMPLE (1 row) ===');
    const sample = await client.query(`SELECT * FROM public.summary_2026 LIMIT 1`);
    if (sample.rows.length > 0) {
      for (const [k, v] of Object.entries(sample.rows[0])) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }

    // 4. Distinct event_keys in summary_2026
    console.log('\n=== DISTINCT event_keys in summary_2026 ===');
    const events = await client.query(`SELECT DISTINCT event_key, COUNT(*) as cnt FROM public.summary_2026 GROUP BY event_key ORDER BY event_key`);
    for (const r of events.rows) {
      console.log(`  ${r.event_key}: ${r.cnt} rows`);
    }

    // 5. Action tables — row counts and sample types
    for (const tbl of ['auton_actions', 'teleop_actions', 'prematch_actions']) {
      const cnt = await client.query(`SELECT COUNT(*) as cnt FROM public.${tbl}`);
      const types = await client.query(`SELECT DISTINCT type FROM public.${tbl} ORDER BY type`);
      console.log(`\n=== ${tbl}: ${cnt.rows[0].cnt} rows ===`);
      console.log(`  Action types: ${types.rows.map(r => r.type).join(', ')}`);
    }

    // 6. TBA tables — what 2026 data exists
    console.log('\n=== TBA 2026 TABLES ===');
    const tbaTables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'tba' AND table_name LIKE '2026%'
      ORDER BY table_name
    `);
    for (const r of tbaTables.rows) {
      const cnt = await client.query(`SELECT COUNT(*) as cnt FROM tba."${r.table_name}"`);
      console.log(`  tba.${r.table_name}: ${cnt.rows[0].cnt} rows`);
    }

    // 7. TBA match sample — score_breakdown structure
    console.log('\n=== TBA 2026week0 MATCH SAMPLE (columns) ===');
    const tbaCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'tba' AND table_name = '2026week0_matches'
      ORDER BY ordinal_position
    `);
    for (const c of tbaCols.rows) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }

    // 8. One TBA match row to see actual field values
    console.log('\n=== TBA 2026week0 MATCH SAMPLE (1 row) ===');
    const tbaSample = await client.query(`SELECT * FROM tba."2026week0_matches" LIMIT 1`);
    if (tbaSample.rows.length > 0) {
      for (const [k, v] of Object.entries(tbaSample.rows[0])) {
        const val = typeof v === 'object' ? JSON.stringify(v) : v;
        console.log(`  ${k}: ${val}`);
      }
    }

    // 9. Check views
    console.log('\n=== 2026 VIEWS ===');
    const views = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'VIEW' AND table_name LIKE '%2026%'
      ORDER BY table_name
    `);
    for (const r of views.rows) {
      const cnt = await client.query(`SELECT COUNT(*) as cnt FROM public."${r.table_name}"`);
      console.log(`  ${r.table_name}: ${cnt.rows[0].cnt} rows`);
    }

    // 10. climb_level distinct values (important for mapping)
    console.log('\n=== DISTINCT climb_level VALUES ===');
    const climbs = await client.query(`SELECT DISTINCT climb_level, COUNT(*) as cnt FROM public.summary_2026 GROUP BY climb_level ORDER BY climb_level`);
    for (const r of climbs.rows) {
      console.log(`  "${r.climb_level}": ${r.cnt} rows`);
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
