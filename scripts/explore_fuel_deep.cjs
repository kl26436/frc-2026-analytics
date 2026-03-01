/**
 * Deep dive: Every match, every robot, action sequences + notes + FMS comparison.
 * Goal: understand what scouts are actually tracking and why some matches are off.
 */

const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

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
  return { shots, passes, total: shots + passes, pendingOrphans: pending };
}

function n(val) { return val === null || val === undefined ? 0 : Number(val); }

function estimateFromSummary(row) {
  const auto = n(row.auton_SCORE_PLUS_1)*1 + n(row.auton_SCORE_PLUS_2)*2 + n(row.auton_SCORE_PLUS_3)*3 + n(row.auton_SCORE_PLUS_5)*5 + n(row.auton_SCORE_PLUS_10)*10;
  const teleop = n(row.teleop_SCORE_PLUS_1)*1 + n(row.teleop_SCORE_PLUS_2)*2 + n(row.teleop_SCORE_PLUS_3)*3 + n(row.teleop_SCORE_PLUS_5)*5 + n(row.teleop_SCORE_PLUS_10)*10;
  return { auto, teleop, total: auto + teleop };
}

function bucketStr(row, phase) {
  const p = phase === 'auto' ? 'auton' : 'teleop';
  const parts = [];
  if (n(row[`${p}_SCORE_PLUS_1`])) parts.push(`+1×${n(row[`${p}_SCORE_PLUS_1`])}`);
  if (n(row[`${p}_SCORE_PLUS_2`])) parts.push(`+2×${n(row[`${p}_SCORE_PLUS_2`])}`);
  if (n(row[`${p}_SCORE_PLUS_3`])) parts.push(`+3×${n(row[`${p}_SCORE_PLUS_3`])}`);
  if (n(row[`${p}_SCORE_PLUS_5`])) parts.push(`+5×${n(row[`${p}_SCORE_PLUS_5`])}`);
  if (n(row[`${p}_SCORE_PLUS_10`])) parts.push(`+10×${n(row[`${p}_SCORE_PLUS_10`])}`);
  return parts.length ? parts.join(' ') : '(none)';
}

async function run() {
  try {
    await client.connect();
    const EVENT = '2026week0';

    // 1. All actions
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

    // 2. Summary with notes and all flags
    const summaryData = await client.query(`
      SELECT match_number, team_number, configured_team, dedicated_passer,
             "auton_FUEL_SCORE", "auton_FUEL_PASS", "teleop_FUEL_SCORE", "teleop_FUEL_PASS",
             "auton_SCORE_PLUS_1", "auton_SCORE_PLUS_2", "auton_SCORE_PLUS_3",
             "auton_SCORE_PLUS_5", "auton_SCORE_PLUS_10",
             "teleop_SCORE_PLUS_1", "teleop_SCORE_PLUS_2", "teleop_SCORE_PLUS_3",
             "teleop_SCORE_PLUS_5", "teleop_SCORE_PLUS_10",
             poor_fuel_scoring_accuracy, eff_rep_bulldozed_fuel,
             lost_connection, no_robot_on_field, second_review,
             climb_level, "auton_AUTON_CLIMBED", auton_did_nothing,
             notes, scouter_id
      FROM public.summary_2026
      WHERE event_key = $1
        AND match_key NOT LIKE 'configuredEvent_pm%'
      ORDER BY match_number, configured_team
    `, [EVENT]);

    // 3. TBA FMS
    const tbaData = await client.query(`
      SELECT DISTINCT ON ("tba.match_number")
        "tba.match_number" as match_number,
        "tba.score_breakdown.red.hubScore.totalCount" as red_total,
        "tba.score_breakdown.red.hubScore.autoCount" as red_auto,
        "tba.score_breakdown.red.hubScore.teleopCount" as red_teleop,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_total,
        "tba.score_breakdown.blue.hubScore.autoCount" as blue_auto,
        "tba.score_breakdown.blue.hubScore.teleopCount" as blue_teleop,
        "tba.score_breakdown.red.hubScore.uncounted" as red_uncounted,
        "tba.score_breakdown.blue.hubScore.uncounted" as blue_uncounted
      FROM tba."${EVENT}_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);
    const fmsMap = new Map();
    for (const r of tbaData.rows) {
      fmsMap.set(Number(r.match_number), {
        red: { total: n(r.red_total), auto: n(r.red_auto), teleop: n(r.red_teleop), uncounted: n(r.red_uncounted) },
        blue: { total: n(r.blue_total), auto: n(r.blue_auto), teleop: n(r.blue_teleop), uncounted: n(r.blue_uncounted) },
      });
    }

    // Group summary by match
    const byMatch = new Map();
    for (const row of summaryData.rows) {
      const m = Number(row.match_number);
      if (!byMatch.has(m)) byMatch.set(m, []);
      byMatch.get(m).push(row);
    }

    // ═══════════════════════════════════════════════════════════════
    // Print each match in detail
    // ═══════════════════════════════════════════════════════════════
    const matchNums = [...byMatch.keys()].sort((a, b) => a - b);

    for (const matchNum of matchNums) {
      const fms = fmsMap.get(matchNum);
      const rows = byMatch.get(matchNum);

      console.log(`\n${'═'.repeat(70)}`);
      console.log(`  MATCH ${matchNum}`);
      if (fms) {
        console.log(`  FMS: Red ${fms.red.auto}a+${fms.red.teleop}t=${fms.red.total} scored (${fms.red.uncounted} uncounted)  |  Blue ${fms.blue.auto}a+${fms.blue.teleop}t=${fms.blue.total} scored (${fms.blue.uncounted} uncounted)`);
      } else {
        console.log(`  FMS: NO DATA`);
      }
      console.log(`${'═'.repeat(70)}`);

      // Group rows by alliance
      const red = rows.filter(r => r.configured_team.startsWith('red'));
      const blue = rows.filter(r => r.configured_team.startsWith('blue'));

      for (const [alliance, allianceRows] of [['RED', red], ['BLUE', blue]]) {
        const fmsAlliance = fms ? (alliance === 'RED' ? fms.red : fms.blue) : null;
        let allianceShots = 0, alliancePasses = 0;

        console.log(`\n  ── ${alliance} ALLIANCE ──`);

        for (const row of allianceRows) {
          const team = Number(row.team_number);
          const station = row.configured_team.split('_')[1];
          const actionKey = `${row.match_number}_${team}`;
          const actions = actionMap.get(actionKey);

          // Flags
          const flags = [];
          if (row.dedicated_passer) flags.push('PASSER');
          if (row.poor_fuel_scoring_accuracy) flags.push('POOR-ACC');
          if (row.eff_rep_bulldozed_fuel) flags.push('BULLDOZE');
          if (row.lost_connection) flags.push('LOST-CONN');
          if (row.no_robot_on_field) flags.push('NO-ROBOT');
          if (row.second_review) flags.push('REVIEW');
          if (row.auton_did_nothing) flags.push('AUTO-NOTHING');
          const flagStr = flags.length ? `  [${flags.join(', ')}]` : '';

          console.log(`\n    Team ${team} (${alliance.toLowerCase()}_${station})${flagStr}`);
          console.log(`      Climb: ${row.climb_level || 'None'}  Auto climb: ${n(row.auton_AUTON_CLIMBED) > 0 ? 'YES' : 'no'}`);

          let shots = 0, passes = 0, totalMoved = 0, source = '';

          if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
            source = 'actions';
            // Show condensed action sequence
            const autoSeq = actions.auto.map(a => {
              if (a.type === 'FUEL_SCORE') return 'SCORE';
              if (a.type === 'FUEL_PASS') return 'PASS';
              if (a.type.startsWith('SCORE_PLUS_')) return '+' + a.type.replace('SCORE_PLUS_', '');
              if (a.type === 'AUTON_CLIMBED') return 'CLIMB';
              return a.type;
            }).join(' → ');
            const teleopSeq = actions.teleop.map(a => {
              if (a.type === 'FUEL_SCORE') return 'SCORE';
              if (a.type === 'FUEL_PASS') return 'PASS';
              if (a.type.startsWith('SCORE_PLUS_')) return '+' + a.type.replace('SCORE_PLUS_', '');
              return a.type;
            }).join(' → ');

            if (autoSeq) console.log(`      Auto:   ${autoSeq}`);
            if (teleopSeq) console.log(`      Teleop: ${teleopSeq}`);

            const autoR = attributePassesAndShots(actions.auto);
            const telR = attributePassesAndShots(actions.teleop);
            shots = autoR.shots + telR.shots;
            passes = autoR.passes + telR.passes;
            totalMoved = shots + passes;

            const orphans = autoR.pendingOrphans + telR.pendingOrphans;
            console.log(`      → ${shots} shots, ${passes} passes = ${totalMoved} moved${orphans ? ` (${orphans} orphaned pending)` : ''}`);
          } else {
            source = 'summary';
            const est = estimateFromSummary(row);
            totalMoved = est.total;
            if (row.dedicated_passer) {
              passes = totalMoved;
            } else {
              passes = n(row.auton_FUEL_PASS) + n(row.teleop_FUEL_PASS);
              shots = totalMoved - passes;
            }

            console.log(`      Summary: Auto [${bucketStr(row, 'auto')}] = ${est.auto}  |  Teleop [${bucketStr(row, 'teleop')}] = ${est.teleop}`);
            console.log(`      FUEL_SCORE: a=${n(row.auton_FUEL_SCORE)} t=${n(row.teleop_FUEL_SCORE)}  |  FUEL_PASS: a=${n(row.auton_FUEL_PASS)} t=${n(row.teleop_FUEL_PASS)}`);
            console.log(`      → ${shots} shots, ${passes} passes = ${totalMoved} moved (from ${source})`);
          }

          allianceShots += shots;
          alliancePasses += passes;

          // Notes
          const notes = (row.notes || '').trim();
          if (notes) {
            console.log(`      NOTES: "${notes}"`);
          }
        }

        // Alliance totals
        const attempts = allianceShots;
        const fmsScored = fmsAlliance ? fmsAlliance.total : '?';
        const eff = (fmsAlliance && attempts > 0) ? ((fmsAlliance.total / attempts) * 100).toFixed(0) + '%' : '--';
        console.log(`\n    ALLIANCE TOTAL: ${allianceShots} shots + ${alliancePasses} passes = ${allianceShots + alliancePasses} moved`);
        console.log(`    FMS SCORED: ${fmsScored}  |  Efficiency: ${eff}`);
        if (fmsAlliance && attempts > 0) {
          const delta = attempts - fmsAlliance.total;
          console.log(`    Delta (attempts - scored): ${delta > 0 ? '+' : ''}${delta}`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Per-team summary across all matches
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'═'.repeat(70)}`);
    console.log(`  PER-TEAM AGGREGATE: Shots taken across all matches`);
    console.log(`${'═'.repeat(70)}`);

    const teamAgg = new Map();
    for (const row of summaryData.rows) {
      const team = Number(row.team_number);
      if (!teamAgg.has(team)) teamAgg.set(team, { matches: 0, totalShots: 0, totalPasses: 0, totalMoved: 0, passerMatches: 0, flags: [] });
      const t = teamAgg.get(team);
      t.matches++;
      if (row.dedicated_passer) t.passerMatches++;

      const actionKey = `${row.match_number}_${team}`;
      const actions = actionMap.get(actionKey);
      if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
        const autoR = attributePassesAndShots(actions.auto);
        const telR = attributePassesAndShots(actions.teleop);
        t.totalShots += autoR.shots + telR.shots;
        t.totalPasses += autoR.passes + telR.passes;
        t.totalMoved += autoR.total + telR.total;
      } else {
        const est = estimateFromSummary(row);
        t.totalMoved += est.total;
        if (row.dedicated_passer) {
          t.totalPasses += est.total;
        } else {
          const p = n(row.auton_FUEL_PASS) + n(row.teleop_FUEL_PASS);
          t.totalPasses += p;
          t.totalShots += est.total - p;
        }
      }
    }

    console.log(`  ${'Team'.padEnd(6)} ${'Matches'.padStart(8)} ${'TotShots'.padStart(9)} ${'TotPass'.padStart(8)} ${'TotMoved'.padStart(9)} ${'Avg Shots'.padStart(10)} ${'Avg Moved'.padStart(10)} ${'Passer%'.padStart(8)}`);
    const sorted = [...teamAgg.entries()].sort((a, b) => (b[1].totalShots / b[1].matches) - (a[1].totalShots / a[1].matches));
    for (const [team, t] of sorted) {
      const avgShots = (t.totalShots / t.matches).toFixed(1);
      const avgMoved = (t.totalMoved / t.matches).toFixed(1);
      const passerPct = ((t.passerMatches / t.matches) * 100).toFixed(0);
      console.log(`  ${String(team).padEnd(6)} ${String(t.matches).padStart(8)} ${String(t.totalShots).padStart(9)} ${String(t.totalPasses).padStart(8)} ${String(t.totalMoved).padStart(9)} ${avgShots.padStart(10)} ${avgMoved.padStart(10)} ${(passerPct + '%').padStart(8)}`);
    }

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  } finally {
    await client.end();
  }
}

run();
