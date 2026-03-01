/**
 * Correct timespan analysis — timestamps are Unix SECONDS, not milliseconds
 */
const { Client } = require('pg');
const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

async function run() {
  try {
    await client.connect();
    const EVENT = '2026week0';

    const autoActions = await client.query(
      `SELECT team_number, match_number, time_stamp FROM public.auton_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);
    const teleopActions = await client.query(
      `SELECT team_number, match_number, time_stamp FROM public.teleop_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);

    const groups = new Map();
    for (const r of [...autoActions.rows, ...teleopActions.rows]) {
      const key = `${r.match_number}_${r.team_number}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(Number(r.time_stamp));
    }

    // Get scouter IDs
    const summaryData = await client.query(`
      SELECT match_number, team_number, scouter_id,
             "auton_FUEL_SCORE", "teleop_FUEL_SCORE", "auton_FUEL_PASS", "teleop_FUEL_PASS"
      FROM public.summary_2026
      WHERE event_key = $1 AND match_key NOT LIKE 'configuredEvent_pm%'
    `, [EVENT]);
    const scouterMap = new Map();
    for (const r of summaryData.rows) {
      scouterMap.set(`${r.match_number}_${r.team_number}`, {
        scouter: r.scouter_id,
        fuelScoreCount: (Number(r.auton_FUEL_SCORE) || 0) + (Number(r.teleop_FUEL_SCORE) || 0),
        fuelPassCount: (Number(r.auton_FUEL_PASS) || 0) + (Number(r.teleop_FUEL_PASS) || 0),
      });
    }

    console.log('═'.repeat(100));
    console.log('  ACTION TIME SPANS — timestamps are Unix seconds (corrected)');
    console.log('═'.repeat(100));
    console.log(`  ${'Q#'.padEnd(4)} ${'Team'.padEnd(6)} ${'Acts'.padStart(5)} ${'Span'.padStart(6)} ${'SCORE'.padStart(6)} ${'PASS'.padStart(5)} ${'Scouter'.padEnd(25)} ${'Style'}`);

    const spans = [];
    for (const [key, timestamps] of [...groups.entries()].sort()) {
      const [matchNum, team] = key.split('_');
      timestamps.sort((a, b) => a - b);
      const spanSec = timestamps[timestamps.length - 1] - timestamps[0]; // already seconds!
      const info = scouterMap.get(key) || { scouter: '?', fuelScoreCount: 0, fuelPassCount: 0 };

      let style;
      if (spanSec < 10) style = 'BATCH';
      else if (spanSec < 60) style = 'PARTIAL';
      else if (spanSec < 120) style = 'REAL-TIME';
      else style = 'FULL-MATCH';

      spans.push({ matchNum: Number(matchNum), team: Number(team), actions: timestamps.length, spanSec, style, ...info });
      console.log(`  Q${matchNum.padEnd(3)} ${team.padEnd(6)} ${String(timestamps.length).padStart(5)} ${(spanSec + 's').padStart(6)} ${String(info.fuelScoreCount).padStart(6)} ${String(info.fuelPassCount).padStart(5)} ${info.scouter.padEnd(25)} ${style}`);
    }

    // Summary
    console.log('\n' + '═'.repeat(100));
    console.log('  SUMMARY');
    console.log('═'.repeat(100));
    const batch = spans.filter(s => s.style === 'BATCH');
    const partial = spans.filter(s => s.style === 'PARTIAL');
    const realtime = spans.filter(s => s.style === 'REAL-TIME');
    const fullmatch = spans.filter(s => s.style === 'FULL-MATCH');
    console.log(`  BATCH (<10s):       ${batch.length}/${spans.length} (${(batch.length/spans.length*100).toFixed(0)}%)`);
    console.log(`  PARTIAL (10-60s):   ${partial.length}/${spans.length} (${(partial.length/spans.length*100).toFixed(0)}%)`);
    console.log(`  REAL-TIME (60-120s):${realtime.length}/${spans.length} (${(realtime.length/spans.length*100).toFixed(0)}%)`);
    console.log(`  FULL-MATCH (>120s): ${fullmatch.length}/${spans.length} (${(fullmatch.length/spans.length*100).toFixed(0)}%)`);

    // Per-scouter
    console.log('\n' + '═'.repeat(100));
    console.log('  PER-SCOUTER');
    console.log('═'.repeat(100));
    const byScouter = new Map();
    for (const s of spans) {
      if (!byScouter.has(s.scouter)) byScouter.set(s.scouter, []);
      byScouter.get(s.scouter).push(s);
    }
    console.log(`  ${'Scouter'.padEnd(25)} ${'N'.padStart(3)} ${'AvgSpan'.padStart(8)} ${'AvgScoreEvts'.padStart(13)} ${'Batch'.padStart(6)} ${'Partial'.padStart(8)} ${'RT+Full'.padStart(8)}`);
    for (const [scouter, entries] of [...byScouter.entries()].sort()) {
      const avgSpan = entries.reduce((s, e) => s + e.spanSec, 0) / entries.length;
      const avgScore = entries.reduce((s, e) => s + e.fuelScoreCount, 0) / entries.length;
      const b = entries.filter(e => e.style === 'BATCH').length;
      const p = entries.filter(e => e.style === 'PARTIAL').length;
      const rt = entries.filter(e => e.style === 'REAL-TIME' || e.style === 'FULL-MATCH').length;
      console.log(`  ${scouter.padEnd(25)} ${String(entries.length).padStart(3)} ${(avgSpan.toFixed(0) + 's').padStart(8)} ${avgScore.toFixed(1).padStart(13)} ${String(b).padStart(6)} ${String(p).padStart(8)} ${String(rt).padStart(8)}`);
    }

  } catch(e) { console.error(e.message); } finally { await client.end(); }
}
run();
