/**
 * Verify: totalCount = autoCount + teleopCount (with endgame already in teleop)
 * And check: teleopCount = shift1 + shift2 + shift3 + shift4 + transition + endgame?
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
    const r = await client.query(`
      SELECT "tba.match_number" as mn,
        "tba.score_breakdown.red.hubScore.autoCount" as r_auto,
        "tba.score_breakdown.red.hubScore.teleopCount" as r_teleop,
        "tba.score_breakdown.red.hubScore.endgameCount" as r_end,
        "tba.score_breakdown.red.hubScore.totalCount" as r_total,
        "tba.score_breakdown.red.hubScore.shift1Count" as r_s1,
        "tba.score_breakdown.red.hubScore.shift2Count" as r_s2,
        "tba.score_breakdown.red.hubScore.shift3Count" as r_s3,
        "tba.score_breakdown.red.hubScore.shift4Count" as r_s4,
        "tba.score_breakdown.red.hubScore.transitionCount" as r_trans,
        "tba.score_breakdown.blue.hubScore.autoCount" as b_auto,
        "tba.score_breakdown.blue.hubScore.teleopCount" as b_teleop,
        "tba.score_breakdown.blue.hubScore.endgameCount" as b_end,
        "tba.score_breakdown.blue.hubScore.totalCount" as b_total,
        "tba.score_breakdown.blue.hubScore.shift1Count" as b_s1,
        "tba.score_breakdown.blue.hubScore.shift2Count" as b_s2,
        "tba.score_breakdown.blue.hubScore.shift3Count" as b_s3,
        "tba.score_breakdown.blue.hubScore.shift4Count" as b_s4,
        "tba.score_breakdown.blue.hubScore.transitionCount" as b_trans
      FROM tba."2026week0_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);

    console.log('Q#  All   auto + teleop = total?   |  shifts+trans+end = teleop?');
    for (const row of r.rows) {
      for (const [alliance, pfx] of [['red','r_'], ['blue','b_']]) {
        const auto = n(row[pfx+'auto']), teleop = n(row[pfx+'teleop']), end = n(row[pfx+'end']), total = n(row[pfx+'total']);
        const s1 = n(row[pfx+'s1']), s2 = n(row[pfx+'s2']), s3 = n(row[pfx+'s3']), s4 = n(row[pfx+'s4']), trans = n(row[pfx+'trans']);
        const sumPhases = auto + teleop;
        const sumShifts = s1 + s2 + s3 + s4 + trans + end;
        const ok1 = sumPhases === total ? 'OK' : `FAIL(${sumPhases})`;
        const ok2 = sumShifts === teleop ? 'OK' : `FAIL(${sumShifts}vs${teleop})`;
        console.log(`Q${String(row.mn).padEnd(3)} ${alliance.padEnd(5)} ${auto}+${teleop}=${ok1.padEnd(12)} | ${s1}+${s2}+${s3}+${s4}+${trans}+${end}=${ok2}`);
      }
    }
  } catch(e) { console.error(e.message); } finally { await client.end(); }
}
run();
