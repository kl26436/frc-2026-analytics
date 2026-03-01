/**
 * Analyze x,y coordinates from scout tablets by alliance
 * to understand coordinate mapping to field image.
 */
const { Client } = require('pg');
const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

async function run() {
  await client.connect();
  const EVENT = '2026week0';

  // Get alliance mapping
  const summary = await client.query(
    `SELECT match_number, team_number, configured_team FROM public.summary_2026 WHERE event_key = $1 AND match_key NOT LIKE 'configuredEvent_pm%'`, [EVENT]);
  const allianceMap = new Map();
  for (const r of summary.rows) {
    allianceMap.set(`${r.match_number}_${r.team_number}`, r.configured_team.startsWith('red') ? 'RED' : 'BLUE');
  }

  // Get all fuel scoring coords from teleop
  const teleQ = await client.query(
    `SELECT team_number, match_number, x, y, type FROM public.teleop_actions WHERE event_key = $1 AND type IN ('FUEL_SCORE', 'FUEL_PASS') ORDER BY match_number, team_number`, [EVENT]);
  // And auto
  const autoQ = await client.query(
    `SELECT team_number, match_number, x, y, type FROM public.auton_actions WHERE event_key = $1 AND type IN ('FUEL_SCORE', 'FUEL_PASS') ORDER BY match_number, team_number`, [EVENT]);

  const redCoords = [];
  const blueCoords = [];
  for (const r of [...autoQ.rows, ...teleQ.rows]) {
    const alliance = allianceMap.get(`${r.match_number}_${r.team_number}`);
    const x = Number(r.x), y = Number(r.y);
    if (x === 0 && y === 0) continue;
    if (alliance === 'RED') redCoords.push({ x, y, team: r.team_number, match: r.match_number });
    else blueCoords.push({ x, y, team: r.team_number, match: r.match_number });
  }

  console.log('FUEL_SCORE/FUEL_PASS Coordinates Analysis');
  console.log('Scout tablet range: x=[0,1012] y=[0,530]');
  console.log('');

  function stats(coords, label) {
    if (coords.length === 0) { console.log(label + ': no data'); return; }
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);
    const avgX = xs.reduce((a,b) => a+b, 0) / xs.length;
    const avgY = ys.reduce((a,b) => a+b, 0) / ys.length;

    console.log(`${label} (${coords.length} events):`);
    console.log(`  X: min=${Math.min(...xs)} max=${Math.max(...xs)} avg=${avgX.toFixed(0)} (center=506)`);
    console.log(`  Y: min=${Math.min(...ys)} max=${Math.max(...ys)} avg=${avgY.toFixed(0)} (center=265)`);

    // X distribution
    const leftCount = coords.filter(c => c.x < 506).length;
    const rightCount = coords.filter(c => c.x >= 506).length;
    console.log(`  Left half (x<506): ${leftCount} (${(leftCount/coords.length*100).toFixed(0)}%)`);
    console.log(`  Right half (x>=506): ${rightCount} (${(rightCount/coords.length*100).toFixed(0)}%)`);

    // X deciles for more detail
    const buckets = 10;
    const bucketSize = 1012 / buckets;
    const hist = new Array(buckets).fill(0);
    for (const c of coords) {
      const b = Math.min(Math.floor(c.x / bucketSize), buckets - 1);
      hist[b]++;
    }
    console.log(`  X histogram (${buckets} buckets):`);
    for (let i = 0; i < buckets; i++) {
      const lo = Math.round(i * bucketSize);
      const hi = Math.round((i+1) * bucketSize);
      const bar = '#'.repeat(Math.round(hist[i] / coords.length * 100));
      console.log(`    [${String(lo).padStart(4)}-${String(hi).padStart(4)}]: ${String(hist[i]).padStart(4)} ${bar}`);
    }
    console.log('');
  }

  stats(redCoords, 'RED alliance');
  stats(blueCoords, 'BLUE alliance');

  // Show Match 1 individual coords
  console.log('═'.repeat(60));
  console.log('MATCH 1 — Robot scoring locations:');
  const m1auto = await client.query(
    `SELECT team_number, x, y, type FROM public.auton_actions WHERE event_key = $1 AND match_number = 1 AND type IN ('FUEL_SCORE', 'FUEL_PASS') ORDER BY team_number, time_stamp`, [EVENT]);
  const m1tele = await client.query(
    `SELECT team_number, x, y, type FROM public.teleop_actions WHERE event_key = $1 AND match_number = 1 AND type IN ('FUEL_SCORE', 'FUEL_PASS') ORDER BY team_number, time_stamp`, [EVENT]);
  for (const r of [...m1auto.rows, ...m1tele.rows]) {
    const alliance = allianceMap.get(`1_${r.team_number}`) || '?';
    console.log(`  Team ${r.team_number} (${alliance}): ${r.type.padEnd(12)} at (${String(r.x).padStart(4)}, ${String(r.y).padStart(4)})`);
  }

  // Get FULL coordinate range from ALL actions
  console.log('\n' + '═'.repeat(60));
  console.log('FULL COORDINATE RANGE (all action types):');
  const allAuto = await client.query(
    `SELECT x, y FROM public.auton_actions WHERE event_key = $1`, [EVENT]);
  const allTele = await client.query(
    `SELECT x, y FROM public.teleop_actions WHERE event_key = $1`, [EVENT]);
  const allCoords = [...allAuto.rows, ...allTele.rows]
    .map(r => ({ x: Number(r.x), y: Number(r.y) }))
    .filter(r => r.x > 0 || r.y > 0);
  const allXs = allCoords.map(r => r.x);
  const allYs = allCoords.map(r => r.y);
  console.log(`  Total actions with coords: ${allCoords.length}`);
  console.log(`  X: min=${Math.min(...allXs)} max=${Math.max(...allXs)}`);
  console.log(`  Y: min=${Math.min(...allYs)} max=${Math.max(...allYs)}`);

  // Compare to field-size in feet: 54.269 x 26.474
  console.log('');
  console.log('  JSON field-size: 54.269 x 26.474 feet');
  console.log('  Current SCOUT_MAX: 1012 x 530');
  console.log('  Actual data max: ' + Math.max(...allXs) + ' x ' + Math.max(...allYs));
  console.log('  If coords are in feet*10: 54.269*10=542.7 x 26.474*10=264.7');
  console.log('  If coords are in inches: 54.269*12=651.2 x 26.474*12=317.7');

  await client.end();
}
run().catch(e => console.error(e.message));
