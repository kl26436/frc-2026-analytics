/**
 * Pull all notes + flags + alliance compositions for context analysis.
 */
const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

function n(val) { return val === null || val === undefined ? 0 : Number(val); }

function estimateFromSummary(row) {
  const auto = n(row.auton_SCORE_PLUS_1)*1 + n(row.auton_SCORE_PLUS_2)*2 + n(row.auton_SCORE_PLUS_3)*3 + n(row.auton_SCORE_PLUS_5)*5 + n(row.auton_SCORE_PLUS_10)*10;
  const teleop = n(row.teleop_SCORE_PLUS_1)*1 + n(row.teleop_SCORE_PLUS_2)*2 + n(row.teleop_SCORE_PLUS_3)*3 + n(row.teleop_SCORE_PLUS_5)*5 + n(row.teleop_SCORE_PLUS_10)*10;
  return { auto, teleop, total: auto + teleop };
}

async function run() {
  try {
    await client.connect();
    const EVENT = '2026week0';

    // ── 1. All entries with full context ──
    const all = await client.query(`
      SELECT match_number, team_number, configured_team,
             dedicated_passer, poor_fuel_scoring_accuracy, eff_rep_bulldozed_fuel,
             lost_connection, no_robot_on_field, auton_did_nothing,
             "auton_SCORE_PLUS_1", "auton_SCORE_PLUS_2", "auton_SCORE_PLUS_3",
             "auton_SCORE_PLUS_5", "auton_SCORE_PLUS_10",
             "teleop_SCORE_PLUS_1", "teleop_SCORE_PLUS_2", "teleop_SCORE_PLUS_3",
             "teleop_SCORE_PLUS_5", "teleop_SCORE_PLUS_10",
             "auton_FUEL_PASS", "teleop_FUEL_PASS",
             notes
      FROM public.summary_2026
      WHERE event_key = $1
        AND match_key NOT LIKE 'configuredEvent_pm%'
      ORDER BY match_number, configured_team
    `, [EVENT]);

    // ── 2. FMS data ──
    const tba = await client.query(`
      SELECT DISTINCT ON ("tba.match_number")
        "tba.match_number" as match_number,
        "tba.score_breakdown.red.hubScore.totalCount" as red_total,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_total
      FROM tba."${EVENT}_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);
    const fmsMap = new Map();
    for (const r of tba.rows) {
      fmsMap.set(Number(r.match_number), { red: n(r.red_total), blue: n(r.blue_total) });
    }

    // ── 3. Group by match + alliance ──
    const byMatch = new Map();
    for (const r of all.rows) {
      const m = Number(r.match_number);
      if (!byMatch.has(m)) byMatch.set(m, []);
      byMatch.get(m).push(r);
    }

    // ── KEY ANALYSIS ──

    // A. Efficiency distribution
    console.log('════════════════════════════════════════════════════════════');
    console.log('  ALLIANCE EFFICIENCY DISTRIBUTION (scoutShots → FMS scored)');
    console.log('════════════════════════════════════════════════════════════');

    const efficiencies = [];
    for (const [matchNum, rows] of [...byMatch.entries()].sort((a, b) => a[0] - b[0])) {
      const fms = fmsMap.get(matchNum);
      if (!fms) continue;

      for (const color of ['red', 'blue']) {
        const prefix = color + '_';
        const allianceRows = rows.filter(r => r.configured_team.startsWith(color));

        let totalShots = 0;
        let totalPasses = 0;
        let hasPasser = false;
        let hasNoRobot = false;
        let hasBulldoze = false;
        let hasPoorAcc = false;
        let hasLostConn = false;

        for (const r of allianceRows) {
          const est = estimateFromSummary(r);
          const passes = n(r.auton_FUEL_PASS) + n(r.teleop_FUEL_PASS);
          if (r.dedicated_passer) {
            totalPasses += est.total;
            hasPasser = true;
          } else {
            totalShots += est.total - passes;
            totalPasses += passes;
          }
          if (r.no_robot_on_field) hasNoRobot = true;
          if (r.eff_rep_bulldozed_fuel) hasBulldoze = true;
          if (r.poor_fuel_scoring_accuracy) hasPoorAcc = true;
          if (r.lost_connection) hasLostConn = true;
        }

        const fmsScored = color === 'red' ? fms.red : fms.blue;
        const eff = totalShots > 0 ? (fmsScored / totalShots * 100) : (fmsScored > 0 ? Infinity : 0);

        const flags = [];
        if (hasPasser) flags.push('PASSER');
        if (hasNoRobot) flags.push('NO-ROBOT');
        if (hasBulldoze) flags.push('BULLDOZE');
        if (hasPoorAcc) flags.push('POOR-ACC');
        if (hasLostConn) flags.push('LOST-CONN');

        efficiencies.push({
          match: matchNum, color, totalShots, totalPasses, fmsScored,
          eff: eff === Infinity ? 'INF' : eff.toFixed(0) + '%',
          effNum: eff === Infinity ? 9999 : eff,
          flags
        });
      }
    }

    // Sort by efficiency
    efficiencies.sort((a, b) => a.effNum - b.effNum);
    console.log('  Match  Alliance   Shots  Passes  FMS   Eff%    Flags');
    for (const e of efficiencies) {
      console.log(`  Q${String(e.match).padEnd(4)} ${e.color.padEnd(8)}  ${String(e.totalShots).padStart(5)}  ${String(e.totalPasses).padStart(6)}  ${String(e.fmsScored).padStart(4)}  ${String(e.eff).padStart(6)}   ${e.flags.join(', ')}`);
    }

    // B. Undercount analysis (FMS > shots)
    const undercounts = efficiencies.filter(e => e.effNum > 100 && e.fmsScored > 0);
    console.log('\n\n════════════════════════════════════════════════════════════');
    console.log('  UNDERCOUNT CASES: FMS scored MORE than scout tracked');
    console.log('════════════════════════════════════════════════════════════');

    for (const e of undercounts) {
      const rows = byMatch.get(e.match).filter(r => r.configured_team.startsWith(e.color));
      console.log(`\n  Q${e.match} ${e.color.toUpperCase()}: ${e.totalShots} shots → ${e.fmsScored} FMS (${e.eff})`);
      for (const r of rows) {
        const est = estimateFromSummary(r);
        const flags = [];
        if (r.dedicated_passer) flags.push('PASSER');
        if (r.eff_rep_bulldozed_fuel) flags.push('BULLDOZE');
        if (r.poor_fuel_scoring_accuracy) flags.push('POOR-ACC');
        if (r.no_robot_on_field) flags.push('NO-ROBOT');
        if (r.lost_connection) flags.push('LOST-CONN');
        const notes = (r.notes || '').trim();
        console.log(`    Team ${r.team_number}: ${est.total} est fuel [${flags.join(',')}]${notes ? ' → "' + notes + '"' : ''}`);
      }
    }

    // C. Overcount analysis (FMS < 50% of shots)
    const overcounts = efficiencies.filter(e => e.effNum < 50 && e.totalShots > 0);
    console.log('\n\n════════════════════════════════════════════════════════════');
    console.log('  OVERCOUNT CASES: FMS scored LESS than 50% of scout tracked');
    console.log('════════════════════════════════════════════════════════════');

    for (const e of overcounts) {
      const rows = byMatch.get(e.match).filter(r => r.configured_team.startsWith(e.color));
      console.log(`\n  Q${e.match} ${e.color.toUpperCase()}: ${e.totalShots} shots → ${e.fmsScored} FMS (${e.eff})`);
      for (const r of rows) {
        const est = estimateFromSummary(r);
        const flags = [];
        if (r.dedicated_passer) flags.push('PASSER');
        if (r.eff_rep_bulldozed_fuel) flags.push('BULLDOZE');
        if (r.poor_fuel_scoring_accuracy) flags.push('POOR-ACC');
        if (r.no_robot_on_field) flags.push('NO-ROBOT');
        if (r.lost_connection) flags.push('LOST-CONN');
        const notes = (r.notes || '').trim();
        console.log(`    Team ${r.team_number}: ${est.total} est fuel [${flags.join(',')}]${notes ? ' → "' + notes + '"' : ''}`);
      }
    }

    // D. All notes dump
    console.log('\n\n════════════════════════════════════════════════════════════');
    console.log('  ALL SCOUT NOTES');
    console.log('════════════════════════════════════════════════════════════');

    for (const r of all.rows) {
      const notes = (r.notes || '').trim();
      if (!notes) continue;
      console.log(`  Q${r.match_number} Team ${r.team_number} (${r.configured_team}): "${notes}"`);
    }

    // E. Summary stats
    const validEff = efficiencies.filter(e => e.totalShots > 0 && e.effNum !== 9999);
    const avgEff = validEff.reduce((s, e) => s + e.effNum, 0) / validEff.length;
    const medianEff = validEff.sort((a, b) => a.effNum - b.effNum)[Math.floor(validEff.length / 2)].effNum;

    console.log('\n\n════════════════════════════════════════════════════════════');
    console.log('  EFFICIENCY SUMMARY');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  Total alliance-matches: ${efficiencies.length}`);
    console.log(`  With shots > 0: ${validEff.length}`);
    console.log(`  Mean efficiency: ${avgEff.toFixed(1)}%`);
    console.log(`  Median efficiency: ${medianEff.toFixed(1)}%`);
    console.log(`  Undercount cases (>100%): ${undercounts.length}`);
    console.log(`  Severe overcount (<50%): ${overcounts.length}`);
    console.log(`  Normal range (50-100%): ${validEff.filter(e => e.effNum >= 50 && e.effNum <= 100).length}`);

    // F. Per-team bucket usage analysis (how imprecise is each team's tracking?)
    console.log('\n\n════════════════════════════════════════════════════════════');
    console.log('  PER-TEAM PRECISION: % of fuel from +5/+10 buckets');
    console.log('════════════════════════════════════════════════════════════');

    const teamPrecision = new Map();
    for (const r of all.rows) {
      const team = Number(r.team_number);
      if (!teamPrecision.has(team)) teamPrecision.set(team, { precise: 0, imprecise: 0 });
      const t = teamPrecision.get(team);
      const precise = n(r.auton_SCORE_PLUS_1)*1 + n(r.auton_SCORE_PLUS_2)*2 + n(r.auton_SCORE_PLUS_3)*3
                    + n(r.teleop_SCORE_PLUS_1)*1 + n(r.teleop_SCORE_PLUS_2)*2 + n(r.teleop_SCORE_PLUS_3)*3;
      const imprecise = n(r.auton_SCORE_PLUS_5)*5 + n(r.auton_SCORE_PLUS_10)*10
                      + n(r.teleop_SCORE_PLUS_5)*5 + n(r.teleop_SCORE_PLUS_10)*10;
      t.precise += precise;
      t.imprecise += imprecise;
    }

    const sorted = [...teamPrecision.entries()]
      .filter(([_, v]) => v.precise + v.imprecise > 0)
      .sort((a, b) => (b[1].imprecise / (b[1].precise + b[1].imprecise)) - (a[1].imprecise / (a[1].precise + a[1].imprecise)));

    console.log('  Team    Total    Precise   Imprecise   Imp%');
    for (const [team, v] of sorted) {
      const total = v.precise + v.imprecise;
      const impPct = ((v.imprecise / total) * 100).toFixed(0);
      console.log(`  ${String(team).padEnd(7)} ${String(total).padStart(5)}    ${String(v.precise).padStart(7)}     ${String(v.imprecise).padStart(7)}   ${impPct}%`);
    }

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  } finally {
    await client.end();
  }
}

run();
