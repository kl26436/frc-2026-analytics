/**
 * Debug >100% accuracy: find which matches drive inflated accuracy per team
 * and look for patterns (undercount, summary vs action, dedicated passer, etc.)
 */

const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

const BETA = 0.7;
const EVENT = '2026week0';

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
  // pending = orphaned SCORE_PLUS with no FUEL event
  return { shots, passes, orphaned: pending, total: shots + passes };
}

function estimateFromSummary(row) {
  const auto = n(row.auton_SCORE_PLUS_1)*1 + n(row.auton_SCORE_PLUS_2)*2 + n(row.auton_SCORE_PLUS_3)*3 + n(row.auton_SCORE_PLUS_5)*5 + n(row.auton_SCORE_PLUS_10)*10;
  const teleop = n(row.teleop_SCORE_PLUS_1)*1 + n(row.teleop_SCORE_PLUS_2)*2 + n(row.teleop_SCORE_PLUS_3)*3 + n(row.teleop_SCORE_PLUS_5)*5 + n(row.teleop_SCORE_PLUS_10)*10;
  return { auto, teleop, total: auto + teleop };
}

function powerCurve(shots, fmsTotal) {
  const weights = shots.map(s => Math.pow(Math.max(s, 0), BETA));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return shots.map(() => fmsTotal / (shots.length || 1));
  return weights.map(w => (w / totalWeight) * fmsTotal);
}

async function run() {
  try {
    await client.connect();

    // 1. Load all data
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

    const summaryData = await client.query(`
      SELECT match_number, team_number, configured_team, dedicated_passer,
             "auton_FUEL_SCORE", "auton_FUEL_PASS", "teleop_FUEL_SCORE", "teleop_FUEL_PASS",
             "auton_SCORE_PLUS_1", "auton_SCORE_PLUS_2", "auton_SCORE_PLUS_3",
             "auton_SCORE_PLUS_5", "auton_SCORE_PLUS_10",
             "teleop_SCORE_PLUS_1", "teleop_SCORE_PLUS_2", "teleop_SCORE_PLUS_3",
             "teleop_SCORE_PLUS_5", "teleop_SCORE_PLUS_10",
             poor_fuel_scoring_accuracy, lost_connection, no_robot_on_field,
             dedicated_passer, notes
      FROM public.summary_2026
      WHERE event_key = $1 AND match_key NOT LIKE 'configuredEvent_pm%'
      ORDER BY match_number, configured_team
    `, [EVENT]);

    // FMS data with auto/teleop/endgame breakdown
    const tbaData = await client.query(`
      SELECT DISTINCT ON ("tba.match_number")
        "tba.match_number" as match_number,
        "tba.score_breakdown.red.hubScore.totalCount" as red_total,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_total,
        "tba.score_breakdown.red.hubScore.autoCount" as red_auto,
        "tba.score_breakdown.blue.hubScore.autoCount" as blue_auto,
        "tba.score_breakdown.red.hubScore.teleopCount" as red_teleop,
        "tba.score_breakdown.blue.hubScore.teleopCount" as blue_teleop,
        "tba.score_breakdown.red.hubScore.endgameCount" as red_endgame,
        "tba.score_breakdown.blue.hubScore.endgameCount" as blue_endgame,
        "tba.score_breakdown.red.hubScore.uncounted" as red_uncounted,
        "tba.score_breakdown.blue.hubScore.uncounted" as blue_uncounted
      FROM tba."${EVENT}_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);
    const fmsMap = new Map();
    for (const r of tbaData.rows) {
      fmsMap.set(Number(r.match_number), {
        red: { total: n(r.red_total), auto: n(r.red_auto), teleop: n(r.red_teleop), endgame: n(r.red_endgame), uncounted: n(r.red_uncounted) },
        blue: { total: n(r.blue_total), auto: n(r.blue_auto), teleop: n(r.blue_teleop), endgame: n(r.blue_endgame), uncounted: n(r.blue_uncounted) },
      });
    }

    // 2. Build per-robot per-match data
    const matchRows = [];
    const byMatchAlliance = new Map();
    for (const row of summaryData.rows) {
      const alliance = row.configured_team.startsWith('red') ? 'red' : 'blue';
      const key = `${row.match_number}_${alliance}`;
      if (!byMatchAlliance.has(key)) byMatchAlliance.set(key, []);
      byMatchAlliance.get(key).push(row);
    }

    for (const [key, rows] of byMatchAlliance) {
      const [matchNumStr, alliance] = key.split('_');
      const matchNum = Number(matchNumStr);
      const fms = fmsMap.get(matchNum);
      if (!fms) continue;
      const fmsData = fms[alliance];

      const robots = rows.map(row => {
        const team = Number(row.team_number);
        const actionKey = `${row.match_number}_${team}`;
        const actions = actionMap.get(actionKey);
        let shots = 0, passes = 0, orphaned = 0;
        let hasActions = false;
        let summaryEstimate = estimateFromSummary(row);
        let fuelScore = n(row.auton_FUEL_SCORE) + n(row.teleop_FUEL_SCORE);
        let fuelPass = n(row.auton_FUEL_PASS) + n(row.teleop_FUEL_PASS);

        if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
          hasActions = true;
          const autoR = attributePassesAndShots(actions.auto);
          const telR = attributePassesAndShots(actions.teleop);
          shots = autoR.shots + telR.shots;
          passes = autoR.passes + telR.passes;
          orphaned = autoR.orphaned + telR.orphaned;
        } else {
          if (row.dedicated_passer) {
            passes = summaryEstimate.total;
          } else {
            passes = fuelPass;
            shots = summaryEstimate.total - passes;
          }
        }

        if (row.dedicated_passer) {
          passes = shots + passes;
          shots = 0;
        }

        return {
          team, shots, passes, orphaned, hasActions,
          summaryTotal: summaryEstimate.total,
          fuelScore, fuelPass,
          isPasser: !!row.dedicated_passer,
          noRobot: !!row.no_robot_on_field,
          lostConn: !!row.lost_connection,
          poorAccuracy: !!row.poor_fuel_scoring_accuracy,
          notes: row.notes || '',
        };
      });

      const allShots = robots.map(r => r.shots);
      const allianceShots = allShots.reduce((s, v) => s + v, 0);
      const attributed = powerCurve(allShots, fmsData.total);

      for (let i = 0; i < robots.length; i++) {
        const r = robots[i];
        const scored = attributed[i];
        const accuracy = r.shots > 0 ? scored / r.shots : (r.isPasser ? null : 0);

        matchRows.push({
          matchNum, alliance,
          ...r,
          allianceShots,
          fmsTotal: fmsData.total,
          fmsAuto: fmsData.auto,
          fmsTeleop: fmsData.teleop,
          fmsEndgame: fmsData.endgame,
          fmsUncounted: fmsData.uncounted,
          shotsScored: scored,
          accuracy,
          ratio: allianceShots > 0 ? fmsData.total / allianceShots : null, // FMS/scout ratio
        });
      }
    }

    // 3. Team-level aggregation
    const byTeam = new Map();
    for (const row of matchRows) {
      if (!byTeam.has(row.team)) byTeam.set(row.team, []);
      byTeam.get(row.team).push(row);
    }

    const teamStats = [];
    for (const [team, rows] of byTeam) {
      const nonPasserRows = rows.filter(r => !r.isPasser);
      const totalShots = nonPasserRows.reduce((s, r) => s + r.shots, 0);
      const totalScored = nonPasserRows.reduce((s, r) => s + r.shotsScored, 0);
      const weightedAccuracy = totalShots > 0 ? totalScored / totalShots : 0;

      teamStats.push({
        team,
        matches: rows.length,
        totalShots,
        totalScored,
        avgShots: totalShots / rows.length,
        avgScored: totalScored / rows.length,
        weightedAccuracy,
        actionDataMatches: rows.filter(r => r.hasActions).length,
        passerMatches: rows.filter(r => r.isPasser).length,
        matchesOver100: nonPasserRows.filter(r => r.accuracy !== null && r.accuracy > 1.0).length,
        rows, // keep for drill-down
      });
    }

    teamStats.sort((a, b) => b.weightedAccuracy - a.weightedAccuracy);

    // ═══════════════════════════════════════════════════════════════
    // REPORT 1: Teams with >100% weighted accuracy
    // ═══════════════════════════════════════════════════════════════
    console.log(`${'═'.repeat(90)}`);
    console.log(`  TEAMS WITH >100% WEIGHTED ACCURACY (β=${BETA})`);
    console.log(`${'═'.repeat(90)}`);
    console.log(`  ${'Team'.padEnd(6)} ${'Mtch'.padStart(4)} ${'TotShots'.padStart(9)} ${'TotScored'.padStart(10)} ${'WtdAcc'.padStart(8)} ${'ActData'.padStart(8)} ${'Passer'.padStart(7)} ${'Over100'.padStart(8)}`);

    const overTeams = teamStats.filter(t => t.weightedAccuracy > 1.0);
    for (const t of overTeams) {
      console.log(`  ${String(t.team).padEnd(6)} ${String(t.matches).padStart(4)} ${t.totalShots.toFixed(0).padStart(9)} ${t.totalScored.toFixed(1).padStart(10)} ${(t.weightedAccuracy * 100).toFixed(0).padStart(7)}% ${`${t.actionDataMatches}/${t.matches}`.padStart(8)} ${String(t.passerMatches).padStart(7)} ${String(t.matchesOver100).padStart(8)}`);
    }
    console.log(`\n  ${overTeams.length} teams with >100% accuracy out of ${teamStats.length} total`);

    // ═══════════════════════════════════════════════════════════════
    // REPORT 2: Per-match detail for each >100% team
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(90)}`);
    console.log(`  MATCH-BY-MATCH DETAIL FOR >100% ACCURACY TEAMS`);
    console.log(`${'═'.repeat(90)}`);

    for (const t of overTeams) {
      console.log(`\n  ── Team ${t.team} (weighted acc: ${(t.weightedAccuracy * 100).toFixed(0)}%) ──`);
      console.log(`  ${'Q#'.padEnd(4)} ${'All'.padStart(5)} ${'Shots'.padStart(6)} ${'Pass'.padStart(5)} ${'Orph'.padStart(5)} ${'AllShots'.padStart(9)} ${'FMS'.padStart(5)} ${'Ratio'.padStart(6)} ${'Attrib'.padStart(7)} ${'Acc%'.padStart(6)} ${'Act?'.padStart(5)} ${'Flags'.padStart(20)}`);

      for (const r of t.rows.sort((a, b) => a.matchNum - b.matchNum)) {
        const flags = [];
        if (r.isPasser) flags.push('PASSER');
        if (r.noRobot) flags.push('NO-BOT');
        if (r.lostConn) flags.push('LOST-CONN');
        if (r.poorAccuracy) flags.push('POOR-ACC');
        const accStr = r.accuracy !== null ? `${(r.accuracy * 100).toFixed(0)}%` : 'N/A';
        const ratioStr = r.ratio !== null ? r.ratio.toFixed(2) : 'N/A';
        console.log(`  Q${String(r.matchNum).padEnd(3)} ${r.alliance.padStart(5)} ${String(r.shots).padStart(6)} ${String(r.passes).padStart(5)} ${String(r.orphaned).padStart(5)} ${String(r.allianceShots).padStart(9)} ${String(r.fmsTotal).padStart(5)} ${ratioStr.padStart(6)} ${r.shotsScored.toFixed(1).padStart(7)} ${accStr.padStart(6)} ${(r.hasActions ? 'Y' : 'N').padStart(5)} ${flags.join(' ').padStart(20)}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // REPORT 3: Alliance-level ratio analysis (FMS / scout shots)
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(90)}`);
    console.log(`  ALLIANCE-LEVEL: FMS TOTAL vs SCOUT SHOTS (all matches)`);
    console.log(`${'═'.repeat(90)}`);
    console.log(`  ${'Q#'.padEnd(4)} ${'All'.padStart(5)} ${'ScoutShots'.padStart(11)} ${'FMS'.padStart(5)} ${'Ratio'.padStart(7)} ${'FMS-Auto'.padStart(9)} ${'FMS-Tel'.padStart(8)} ${'FMS-End'.padStart(8)} ${'Uncntd'.padStart(7)} ${'Note'.padStart(20)}`);

    // Group match rows by match+alliance for ratio view
    const allianceGroups = new Map();
    for (const r of matchRows) {
      const key = `${r.matchNum}_${r.alliance}`;
      if (!allianceGroups.has(key)) allianceGroups.set(key, { matchNum: r.matchNum, alliance: r.alliance, rows: [] });
      allianceGroups.get(key).rows.push(r);
    }

    const sortedGroups = [...allianceGroups.values()].sort((a, b) => {
      const ratioA = a.rows[0].ratio || 0;
      const ratioB = b.rows[0].ratio || 0;
      return ratioB - ratioA; // highest ratio first (most undercount)
    });

    for (const g of sortedGroups) {
      const r = g.rows[0]; // all same alliance data
      const scoutShots = g.rows.reduce((s, x) => s + x.shots, 0);
      const ratio = scoutShots > 0 ? r.fmsTotal / scoutShots : Infinity;
      const note = ratio > 1.3 ? '** UNDERCOUNT' : ratio < 0.5 ? '** OVERCOUNT' : '';
      console.log(`  Q${String(r.matchNum).padEnd(3)} ${r.alliance.padStart(5)} ${String(scoutShots).padStart(11)} ${String(r.fmsTotal).padStart(5)} ${ratio.toFixed(2).padStart(7)} ${String(r.fmsAuto).padStart(9)} ${String(r.fmsTeleop).padStart(8)} ${String(r.fmsEndgame).padStart(8)} ${String(r.fmsUncounted).padStart(7)} ${note.padStart(20)}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // REPORT 4: Pattern analysis
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(90)}`);
    console.log(`  PATTERN ANALYSIS`);
    console.log(`${'═'.repeat(90)}`);

    // All >100% individual match rows
    const overRows = matchRows.filter(r => r.accuracy !== null && r.accuracy > 1.0);
    const normalRows = matchRows.filter(r => r.accuracy !== null && r.accuracy <= 1.0 && r.accuracy > 0);

    console.log(`\n  Total match-robot rows: ${matchRows.length}`);
    console.log(`  Rows with >100% accuracy: ${overRows.length}`);
    console.log(`  Rows with 0-100% accuracy: ${normalRows.length}`);

    // Action data vs summary
    const overWithActions = overRows.filter(r => r.hasActions).length;
    const overWithoutActions = overRows.filter(r => !r.hasActions).length;
    const normalWithActions = normalRows.filter(r => r.hasActions).length;
    const normalWithoutActions = normalRows.filter(r => !r.hasActions).length;
    console.log(`\n  >100% rows with action data: ${overWithActions}/${overRows.length} (${(overWithActions/overRows.length*100).toFixed(0)}%)`);
    console.log(`  Normal rows with action data: ${normalWithActions}/${normalRows.length} (${(normalWithActions/normalRows.length*100).toFixed(0)}%)`);

    // Orphaned SCORE_PLUS in >100% vs normal
    const overOrphaned = overRows.reduce((s, r) => s + r.orphaned, 0) / overRows.length;
    const normalOrphaned = normalRows.reduce((s, r) => s + r.orphaned, 0) / normalRows.length;
    console.log(`\n  Avg orphaned SCORE_PLUS in >100% rows: ${overOrphaned.toFixed(1)}`);
    console.log(`  Avg orphaned SCORE_PLUS in normal rows: ${normalOrphaned.toFixed(1)}`);

    // Average alliance FMS/scout ratio
    const overRatio = overRows.reduce((s, r) => s + (r.ratio || 0), 0) / overRows.length;
    const normalRatio = normalRows.reduce((s, r) => s + (r.ratio || 0), 0) / normalRows.length;
    console.log(`\n  Avg alliance FMS/scout ratio in >100% rows: ${overRatio.toFixed(2)}`);
    console.log(`  Avg alliance FMS/scout ratio in normal rows: ${normalRatio.toFixed(2)}`);

    // Low shot count
    const overLowShots = overRows.filter(r => r.shots <= 5).length;
    const normalLowShots = normalRows.filter(r => r.shots <= 5).length;
    console.log(`\n  >100% rows with <=5 shots: ${overLowShots}/${overRows.length} (${(overLowShots/overRows.length*100).toFixed(0)}%)`);
    console.log(`  Normal rows with <=5 shots: ${normalLowShots}/${normalRows.length} (${(normalLowShots/normalRows.length*100).toFixed(0)}%)`);

    // FMS endgame count contribution
    const overEndgame = overRows.reduce((s, r) => s + r.fmsEndgame, 0) / overRows.length;
    const normalEndgame = normalRows.reduce((s, r) => s + r.fmsEndgame, 0) / normalRows.length;
    console.log(`\n  Avg FMS endgame count in >100% rows: ${overEndgame.toFixed(1)}`);
    console.log(`  Avg FMS endgame count in normal rows: ${normalEndgame.toFixed(1)}`);

    // Summary estimate vs action estimate comparison
    console.log(`\n  >100% rows summary vs action estimate:`);
    for (const r of overRows.filter(r => r.hasActions).slice(0, 10)) {
      console.log(`    Q${r.matchNum} ${r.alliance} team ${r.team}: actionShots=${r.shots} summaryTotal=${r.summaryTotal} fuelScore=${r.fuelScore} fuelPass=${r.fuelPass} orphaned=${r.orphaned}`);
    }

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  } finally {
    await client.end();
  }
}

run();
