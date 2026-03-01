/**
 * Compare fuel estimates: action-based vs summary-based, per robot per match.
 * Goal: find where my scripts diverge from what the app shows.
 */
const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

function n(val) { return val === null || val === undefined ? 0 : Number(val); }

function attributePassesAndShots(actions) {
  let shots = 0, passes = 0, pending = 0;
  for (const a of actions) {
    if (a.type.startsWith('SCORE_PLUS_')) {
      pending += parseInt(a.type.replace('SCORE_PLUS_', ''), 10) || 1;
    } else if (a.type === 'FUEL_SCORE') {
      shots += pending > 0 ? pending : 1;
      pending = 0;
    } else if (a.type === 'FUEL_PASS') {
      passes += pending > 0 ? pending : 1;
      pending = 0;
    }
  }
  return { shots, passes, total: shots + passes, orphaned: pending };
}

function estimateFromSummary(row) {
  const auto = n(row.auton_SCORE_PLUS_1)*1 + n(row.auton_SCORE_PLUS_2)*2 + n(row.auton_SCORE_PLUS_3)*3 + n(row.auton_SCORE_PLUS_5)*5 + n(row.auton_SCORE_PLUS_10)*10;
  const teleop = n(row.teleop_SCORE_PLUS_1)*1 + n(row.teleop_SCORE_PLUS_2)*2 + n(row.teleop_SCORE_PLUS_3)*3 + n(row.teleop_SCORE_PLUS_5)*5 + n(row.teleop_SCORE_PLUS_10)*10;
  return { auto, teleop, total: auto + teleop };
}

async function run() {
  try {
    await client.connect();
    const EVENT = '2026week0';

    // 1. Actions
    const autoActions = await client.query(
      `SELECT team_number, match_number, type, time_stamp FROM public.auton_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);
    const teleopActions = await client.query(
      `SELECT team_number, match_number, type, time_stamp FROM public.teleop_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);

    const actionMap = new Map();
    for (const r of autoActions.rows) {
      const key = `${r.match_number}_${r.team_number}`;
      if (!actionMap.has(key)) actionMap.set(key, { auto: [], teleop: [] });
      actionMap.get(key).auto.push(r);
    }
    for (const r of teleopActions.rows) {
      const key = `${r.match_number}_${r.team_number}`;
      if (!actionMap.has(key)) actionMap.set(key, { auto: [], teleop: [] });
      actionMap.get(key).teleop.push(r);
    }

    // 2. Summary
    const summaryData = await client.query(`
      SELECT match_number, team_number, configured_team, dedicated_passer,
             "auton_FUEL_SCORE", "auton_FUEL_PASS", "teleop_FUEL_SCORE", "teleop_FUEL_PASS",
             "auton_SCORE_PLUS_1", "auton_SCORE_PLUS_2", "auton_SCORE_PLUS_3",
             "auton_SCORE_PLUS_5", "auton_SCORE_PLUS_10",
             "teleop_SCORE_PLUS_1", "teleop_SCORE_PLUS_2", "teleop_SCORE_PLUS_3",
             "teleop_SCORE_PLUS_5", "teleop_SCORE_PLUS_10"
      FROM public.summary_2026
      WHERE event_key = $1 AND match_key NOT LIKE 'configuredEvent_pm%'
      ORDER BY match_number, team_number
    `, [EVENT]);

    // 3. FMS
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

    console.log('════════════════════════════════════════════════════════════════════');
    console.log('  PER-ROBOT: Action-based vs Summary-based fuel estimates');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('  Match Team   Source     Shots  Passes  Total  Orphaned  SummaryTotal');

    let totalActionShots = 0, totalSummaryShots = 0;
    let totalActionPasses = 0, totalSummaryPasses = 0;
    let actionCount = 0, summaryCount = 0;

    // Group by match+alliance for alliance totals
    const allianceTotals = new Map(); // key = "matchNum_alliance" -> { actionShots, summaryShots, fms }

    for (const row of summaryData.rows) {
      const team = Number(row.team_number);
      const matchNum = Number(row.match_number);
      const actionKey = `${row.match_number}_${team}`;
      const actions = actionMap.get(actionKey);
      const summaryEst = estimateFromSummary(row);
      const summaryPasses = n(row.auton_FUEL_PASS) + n(row.teleop_FUEL_PASS);

      const alliance = row.configured_team.startsWith('red') ? 'red' : 'blue';
      const allianceKey = `${matchNum}_${alliance}`;
      if (!allianceTotals.has(allianceKey)) {
        const fms = fmsMap.get(matchNum);
        allianceTotals.set(allianceKey, {
          matchNum, alliance,
          actionShots: 0, actionPasses: 0, actionTotal: 0,
          summaryShots: 0, summaryPasses: 0, summaryTotal: 0,
          fms: fms ? (alliance === 'red' ? fms.red : fms.blue) : 0,
          robots: []
        });
      }
      const at = allianceTotals.get(allianceKey);

      let source, shots, passes, total, orphaned;

      if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
        source = 'ACTION';
        const autoR = attributePassesAndShots(actions.auto);
        const telR = attributePassesAndShots(actions.teleop);
        shots = autoR.shots + telR.shots;
        passes = autoR.passes + telR.passes;
        total = shots + passes;
        orphaned = autoR.orphaned + telR.orphaned;
        actionCount++;
        totalActionShots += shots;
        totalActionPasses += passes;
        at.actionShots += shots;
        at.actionPasses += passes;
        at.actionTotal += total;
      } else {
        source = 'SUMM  ';
        if (row.dedicated_passer) {
          shots = 0;
          passes = summaryEst.total;
        } else {
          passes = summaryPasses;
          shots = summaryEst.total - passes;
        }
        total = shots + passes;
        orphaned = 0;
        summaryCount++;
        totalSummaryShots += shots;
        totalSummaryPasses += passes;
        at.summaryShots += shots;
        at.summaryPasses += passes;
        at.summaryTotal += total;
      }

      at.robots.push({ team, source: source.trim(), shots, passes, total, orphaned, summaryTotal: summaryEst.total });

      // Flag differences
      const diff = Math.abs(total - summaryEst.total);
      const flag = diff > 0 ? ` *** DIFF=${total - summaryEst.total}` : '';
      console.log(`  Q${String(matchNum).padEnd(3)} ${String(team).padEnd(6)} ${source}  ${String(shots).padStart(5)}  ${String(passes).padStart(6)}  ${String(total).padStart(5)}  ${String(orphaned).padStart(8)}  ${String(summaryEst.total).padStart(12)}${flag}`);
    }

    console.log(`\n  Action-based entries: ${actionCount}, Summary-based entries: ${summaryCount}`);
    console.log(`  Action totals: ${totalActionShots} shots, ${totalActionPasses} passes`);
    console.log(`  Summary totals: ${totalSummaryShots} shots, ${totalSummaryPasses} passes`);

    // Alliance comparison
    console.log('\n\n════════════════════════════════════════════════════════════════════');
    console.log('  ALLIANCE TOTALS: Action vs Summary vs FMS');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('  Match  Alliance   Shots(act+sum)  Passes  AdjTotal   FMS    Eff%');

    let grandTotalShots = 0, grandTotalFms = 0;

    for (const [, at] of [...allianceTotals.entries()].sort((a, b) => a[1].matchNum - b[1].matchNum || a[1].alliance.localeCompare(b[1].alliance))) {
      const totalShots = at.actionShots + at.summaryShots;
      const totalPasses = at.actionPasses + at.summaryPasses;
      const adjTotal = totalShots; // shots only
      const eff = adjTotal > 0 ? ((at.fms / adjTotal) * 100).toFixed(0) + '%' : (at.fms > 0 ? 'INF' : '-');

      grandTotalShots += adjTotal;
      grandTotalFms += at.fms;

      console.log(`  Q${String(at.matchNum).padEnd(4)} ${at.alliance.padEnd(8)}  ${String(totalShots).padStart(5)}         ${String(totalPasses).padStart(5)}  ${String(adjTotal).padStart(8)}  ${String(at.fms).padStart(4)}   ${eff.padStart(5)}`);
    }

    console.log(`\n  Grand total shots: ${grandTotalShots}, Grand total FMS: ${grandTotalFms}`);
    console.log(`  Overall efficiency: ${((grandTotalFms / grandTotalShots) * 100).toFixed(1)}%`);

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  } finally {
    await client.end();
  }
}

run();
