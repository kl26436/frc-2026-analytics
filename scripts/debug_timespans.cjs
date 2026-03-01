/**
 * Check action time spans per robot per match.
 * Real-time scouting should span ~150-180s (match length).
 * Batch entry shows <1s.
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
    const EVENT = '2026week0';

    const autoActions = await client.query(
      `SELECT team_number, match_number, time_stamp FROM public.auton_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);
    const teleopActions = await client.query(
      `SELECT team_number, match_number, time_stamp FROM public.teleop_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);

    // Group all actions by match_team
    const groups = new Map();
    for (const r of [...autoActions.rows, ...teleopActions.rows]) {
      const key = `${r.match_number}_${r.team_number}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(Number(r.time_stamp));
    }

    // Get scouter IDs
    const summaryData = await client.query(`
      SELECT match_number, team_number, scouter_id
      FROM public.summary_2026
      WHERE event_key = $1 AND match_key NOT LIKE 'configuredEvent_pm%'
    `, [EVENT]);
    const scouterMap = new Map();
    for (const r of summaryData.rows) {
      scouterMap.set(`${r.match_number}_${r.team_number}`, r.scouter_id);
    }

    console.log('═'.repeat(90));
    console.log('  ACTION TIME SPANS PER ROBOT PER MATCH');
    console.log('═'.repeat(90));
    console.log(`  ${'Q#'.padEnd(4)} ${'Team'.padEnd(6)} ${'Actions'.padStart(8)} ${'Span(s)'.padStart(9)} ${'Type'.padStart(10)} ${'Scouter'.padStart(25)}`);

    const spans = [];
    for (const [key, timestamps] of [...groups.entries()].sort()) {
      const [matchNum, team] = key.split('_');
      timestamps.sort((a, b) => a - b);
      const spanMs = timestamps[timestamps.length - 1] - timestamps[0];
      const spanSec = spanMs / 1000;
      const scouter = scouterMap.get(key) || '?';

      let type;
      if (spanSec < 1) type = 'BATCH';
      else if (spanSec < 30) type = 'PARTIAL';
      else if (spanSec < 120) type = 'DELAYED';
      else type = 'REAL-TIME';

      spans.push({ matchNum: Number(matchNum), team: Number(team), actions: timestamps.length, spanSec, type, scouter });
      console.log(`  Q${matchNum.padEnd(3)} ${team.padEnd(6)} ${String(timestamps.length).padStart(8)} ${spanSec.toFixed(1).padStart(9)} ${type.padStart(10)} ${scouter.padStart(25)}`);
    }

    // Summary stats
    console.log('\n' + '═'.repeat(90));
    console.log('  SUMMARY');
    console.log('═'.repeat(90));

    const batch = spans.filter(s => s.type === 'BATCH');
    const partial = spans.filter(s => s.type === 'PARTIAL');
    const delayed = spans.filter(s => s.type === 'DELAYED');
    const realtime = spans.filter(s => s.type === 'REAL-TIME');

    console.log(`  BATCH (<1s):      ${batch.length}/${spans.length} (${(batch.length/spans.length*100).toFixed(0)}%)`);
    console.log(`  PARTIAL (1-30s):  ${partial.length}/${spans.length} (${(partial.length/spans.length*100).toFixed(0)}%)`);
    console.log(`  DELAYED (30-120s):${delayed.length}/${spans.length} (${(delayed.length/spans.length*100).toFixed(0)}%)`);
    console.log(`  REAL-TIME (>120s):${realtime.length}/${spans.length} (${(realtime.length/spans.length*100).toFixed(0)}%)`);

    // Per-scouter stats
    console.log('\n' + '═'.repeat(90));
    console.log('  PER-SCOUTER BREAKDOWN');
    console.log('═'.repeat(90));

    const byScouter = new Map();
    for (const s of spans) {
      if (!byScouter.has(s.scouter)) byScouter.set(s.scouter, []);
      byScouter.get(s.scouter).push(s);
    }

    console.log(`  ${'Scouter'.padEnd(25)} ${'Matches'.padStart(8)} ${'AvgSpan'.padStart(9)} ${'Batch'.padStart(6)} ${'Partial'.padStart(8)} ${'RT'.padStart(4)} ${'AvgActions'.padStart(10)}`);

    for (const [scouter, entries] of [...byScouter.entries()].sort()) {
      const avgSpan = entries.reduce((s, e) => s + e.spanSec, 0) / entries.length;
      const batchCount = entries.filter(e => e.type === 'BATCH').length;
      const partialCount = entries.filter(e => e.type === 'PARTIAL').length;
      const rtCount = entries.filter(e => e.type === 'REAL-TIME' || e.type === 'DELAYED').length;
      const avgActions = entries.reduce((s, e) => s + e.actions, 0) / entries.length;
      console.log(`  ${scouter.padEnd(25)} ${String(entries.length).padStart(8)} ${avgSpan.toFixed(1).padStart(8)}s ${String(batchCount).padStart(6)} ${String(partialCount).padStart(8)} ${String(rtCount).padStart(4)} ${avgActions.toFixed(0).padStart(10)}`);
    }

    // Do real-time scouts have better FMS alignment?
    console.log('\n' + '═'.repeat(90));
    console.log('  DOES ENTRY METHOD AFFECT ACCURACY?');
    console.log('═'.repeat(90));

    // Get FMS data
    const tbaData = await client.query(`
      SELECT DISTINCT ON ("tba.match_number")
        "tba.match_number" as match_number,
        "tba.score_breakdown.red.hubScore.totalCount" as red_total,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_total
      FROM tba."${EVENT}_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);
    const fmsMap = new Map();
    for (const r of tbaData.rows) {
      fmsMap.set(Number(r.match_number), { red: n(r.red_total), blue: n(r.blue_total) });
    }

    // Get configured_team for alliance
    const configMap = new Map();
    for (const r of summaryData.rows) {
      configMap.set(`${r.match_number}_${r.team_number}`, r.configured_team);
    }

    // Not straightforward to get per-robot accuracy without full attribution,
    // but we can compare per-alliance scout totals for alliances with all batch vs all real-time
    // Let's just show it per scouter
    // Actually, let's compute total "balls tracked" per scouter and see if it correlates with span

    const autoActionsAll = await client.query(`
      SELECT team_number, match_number, type FROM public.auton_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);
    const teleopActionsAll = await client.query(`
      SELECT team_number, match_number, type FROM public.teleop_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);

    const actionMap = new Map();
    for (const r of autoActionsAll.rows) {
      const key = `${r.match_number}_${r.team_number}`;
      if (!actionMap.has(key)) actionMap.set(key, { auto: [], teleop: [] });
      actionMap.get(key).auto.push(r);
    }
    for (const r of teleopActionsAll.rows) {
      const key = `${r.match_number}_${r.team_number}`;
      if (!actionMap.has(key)) actionMap.set(key, { auto: [], teleop: [] });
      actionMap.get(key).teleop.push(r);
    }

    function countShots(actions) {
      let shots = 0, pending = 0;
      for (const a of actions) {
        if (a.type.startsWith('SCORE_PLUS_')) {
          pending += parseInt(a.type.replace('SCORE_PLUS_', ''), 10) || 1;
        } else if (a.type === 'FUEL_SCORE') {
          shots += pending > 0 ? pending : 1;
          pending = 0;
        } else if (a.type === 'FUEL_PASS') {
          pending = 0; // passes don't count as shots
        }
      }
      return shots;
    }

    // Per span entry, get shots tracked
    for (const s of spans) {
      const key = `${s.matchNum}_${s.team}`;
      const actions = actionMap.get(key);
      if (actions) {
        const autoShots = countShots(actions.auto);
        const teleopShots = countShots(actions.teleop);
        s.totalShots = autoShots + teleopShots;
      } else {
        s.totalShots = 0;
      }
    }

    // Group by entry type and show avg shots tracked
    for (const type of ['BATCH', 'PARTIAL', 'DELAYED', 'REAL-TIME']) {
      const entries = spans.filter(s => s.type === type);
      if (entries.length === 0) continue;
      const avgShots = entries.reduce((s, e) => s + e.totalShots, 0) / entries.length;
      const avgActions = entries.reduce((s, e) => s + e.actions, 0) / entries.length;
      console.log(`  ${type.padEnd(12)} avg shots tracked: ${avgShots.toFixed(1).padStart(6)}  avg actions: ${avgActions.toFixed(0).padStart(4)}  (n=${entries.length})`);
    }

  } catch(e) { console.error(e.message, e.stack); } finally { await client.end(); }
}
run();
