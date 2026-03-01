/**
 * Try 3 attribution models for distributing FMS scored balls back to robots.
 *
 * All models start with the same inputs:
 *   - Per-robot shots (from action data / summary)
 *   - Alliance FMS scored total (ground truth)
 *
 * Model A: Linear proportional (current baseline)
 *   robotScored = (robotShots / allianceShots) × fmsTotal
 *
 * Model B: Power curve dampening
 *   robotScored = (robotShots^β / Σ(shots^β)) × fmsTotal
 *   β < 1 compresses high-volume estimates (less trust in big +10 counts)
 *
 * Model C: Volume-tiered efficiency
 *   Different scoring rates by volume bucket, then normalize to sum to fmsTotal
 *
 * We evaluate by looking at per-team consistency across matches.
 * A good model should give more stable per-team averages.
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
  return { shots, passes, total: shots + passes };
}

function n(val) { return val === null || val === undefined ? 0 : Number(val); }

function estimateFromSummary(row) {
  const auto = n(row.auton_SCORE_PLUS_1)*1 + n(row.auton_SCORE_PLUS_2)*2 + n(row.auton_SCORE_PLUS_3)*3 + n(row.auton_SCORE_PLUS_5)*5 + n(row.auton_SCORE_PLUS_10)*10;
  const teleop = n(row.teleop_SCORE_PLUS_1)*1 + n(row.teleop_SCORE_PLUS_2)*2 + n(row.teleop_SCORE_PLUS_3)*3 + n(row.teleop_SCORE_PLUS_5)*5 + n(row.teleop_SCORE_PLUS_10)*10;
  return { auto, teleop, total: auto + teleop };
}

// ═══════════════════════════════════════════════════════════════
// MODEL A: Linear proportional
// ═══════════════════════════════════════════════════════════════
function modelA_linear(robotShots, allianceShots, fmsTotal) {
  if (allianceShots === 0) return robotShots > 0 ? fmsTotal / 3 : 0; // edge case
  return (robotShots / allianceShots) * fmsTotal;
}

// ═══════════════════════════════════════════════════════════════
// MODEL B: Power curve  shots^β
// ═══════════════════════════════════════════════════════════════
function modelB_power(robotShots, allRobotShots, fmsTotal, beta) {
  const weights = allRobotShots.map(s => Math.pow(Math.max(s, 0), beta));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return fmsTotal / allRobotShots.length;
  const robotWeight = Math.pow(Math.max(robotShots, 0), beta);
  return (robotWeight / totalWeight) * fmsTotal;
}

// ═══════════════════════════════════════════════════════════════
// MODEL C: Log curve  ln(shots + 1)
// ═══════════════════════════════════════════════════════════════
function modelC_log(robotShots, allRobotShots, fmsTotal) {
  const weights = allRobotShots.map(s => Math.log(Math.max(s, 0) + 1));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return fmsTotal / allRobotShots.length;
  const robotWeight = Math.log(Math.max(robotShots, 0) + 1);
  return (robotWeight / totalWeight) * fmsTotal;
}

async function run() {
  try {
    await client.connect();
    const EVENT = '2026week0';

    // Fetch all data (same as before)
    const autoActions = await client.query(
      `SELECT team_number, match_number, type FROM public.auton_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);
    const teleopActions = await client.query(
      `SELECT team_number, match_number, type FROM public.teleop_actions WHERE event_key = $1 ORDER BY match_number, team_number, time_stamp`, [EVENT]);

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
             notes
      FROM public.summary_2026
      WHERE event_key = $1 AND match_key NOT LIKE 'configuredEvent_pm%'
      ORDER BY match_number, configured_team
    `, [EVENT]);

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

    // Build match/alliance groups with per-robot shots
    const matchAlliances = []; // { matchNum, alliance, fmsScored, robots: [{team, shots, passes}] }

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
      const fmsScored = fms[alliance];

      const robots = rows.map(row => {
        const team = Number(row.team_number);
        const actionKey = `${row.match_number}_${team}`;
        const actions = actionMap.get(actionKey);
        let shots = 0, passes = 0;

        if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
          const autoR = attributePassesAndShots(actions.auto);
          const telR = attributePassesAndShots(actions.teleop);
          shots = autoR.shots + telR.shots;
          passes = autoR.passes + telR.passes;
        } else {
          const est = estimateFromSummary(row);
          if (row.dedicated_passer) {
            passes = est.total;
          } else {
            passes = n(row.auton_FUEL_PASS) + n(row.teleop_FUEL_PASS);
            shots = est.total - passes;
          }
        }

        return { team, shots, passes, isPasser: !!row.dedicated_passer, noRobot: !!row.no_robot_on_field };
      });

      matchAlliances.push({ matchNum, alliance, fmsScored, robots });
    }

    // ═══════════════════════════════════════════════════════════════
    // Run all models and collect per-team attributed balls
    // ═══════════════════════════════════════════════════════════════
    const betas = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]; // 1.0 = linear baseline

    // teamResults[model][teamNum] = [scored_match1, scored_match2, ...]
    const teamResults = {};
    for (const beta of betas) teamResults[`power_${beta}`] = new Map();
    teamResults['log'] = new Map();

    // Also store per-match detail for a few interesting matches
    const detailMatches = [1, 2, 5, 7, 11, 12, 13, 15];

    console.log(`${'═'.repeat(80)}`);
    console.log(`  MODEL COMPARISON: Per-match attribution`);
    console.log(`${'═'.repeat(80)}`);

    for (const ma of matchAlliances) {
      const allShots = ma.robots.map(r => r.shots);
      const allianceShots = allShots.reduce((s, v) => s + v, 0);

      const isDetail = detailMatches.includes(ma.matchNum);
      if (isDetail) {
        console.log(`\n  Q${ma.matchNum} ${ma.alliance.toUpperCase()} — FMS: ${ma.fmsScored} scored, Scout: ${allianceShots} shots`);
        console.log(`  ${'Team'.padEnd(6)} ${'Shots'.padStart(6)} ${'Linear'.padStart(7)} ${'β=0.7'.padStart(7)} ${'β=0.5'.padStart(7)} ${'Log'.padStart(7)}`);
      }

      for (let i = 0; i < ma.robots.length; i++) {
        const r = ma.robots[i];

        // Model A / Power with various betas
        for (const beta of betas) {
          const scored = modelB_power(r.shots, allShots, ma.fmsScored, beta);
          const key = `power_${beta}`;
          if (!teamResults[key].has(r.team)) teamResults[key].set(r.team, []);
          teamResults[key].get(r.team).push(scored);
        }

        // Model C: Log
        const logScored = modelC_log(r.shots, allShots, ma.fmsScored);
        if (!teamResults['log'].has(r.team)) teamResults['log'].set(r.team, []);
        teamResults['log'].get(r.team).push(logScored);

        if (isDetail) {
          const linear = modelB_power(r.shots, allShots, ma.fmsScored, 1.0);
          const p07 = modelB_power(r.shots, allShots, ma.fmsScored, 0.7);
          const p05 = modelB_power(r.shots, allShots, ma.fmsScored, 0.5);
          console.log(`  ${String(r.team).padEnd(6)} ${String(r.shots).padStart(6)} ${linear.toFixed(1).padStart(7)} ${p07.toFixed(1).padStart(7)} ${p05.toFixed(1).padStart(7)} ${logScored.toFixed(1).padStart(7)}`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Per-team averages under each model
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log(`  PER-TEAM AVERAGE "BALLS SCORED" UNDER EACH MODEL`);
    console.log(`  (sorted by Linear avg descending)`);
    console.log(`${'═'.repeat(80)}`);

    const models = ['power_1', 'power_0.8', 'power_0.7', 'power_0.6', 'power_0.5', 'log'];
    const labels = ['Linear', 'β=0.8', 'β=0.7', 'β=0.6', 'β=0.5', 'Log'];

    console.log(`  ${'Team'.padEnd(6)} ${'Matches'.padStart(4)} ${labels.map(l => l.padStart(8)).join('')}`);

    // Sort by linear average
    const teams = [...teamResults['power_1'].keys()];
    const teamAvgs = teams.map(t => {
      const vals = teamResults['power_1'].get(t);
      return { team: t, avg: vals.reduce((s, v) => s + v, 0) / vals.length, matches: vals.length };
    }).sort((a, b) => b.avg - a.avg);

    for (const { team, matches } of teamAvgs) {
      const row = [String(team).padEnd(6), String(matches).padStart(4)];
      for (const model of models) {
        const vals = teamResults[model].get(team) || [];
        const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        row.push(avg.toFixed(1).padStart(8));
      }
      console.log(`  ${row.join('')}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // Consistency metric: coefficient of variation per team per model
    // (lower = more consistent across matches = more stable)
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log(`  CONSISTENCY: Coefficient of Variation per team (lower = more stable)`);
    console.log(`  Only teams with 3+ matches shown`);
    console.log(`${'═'.repeat(80)}`);

    console.log(`  ${'Team'.padEnd(6)} ${labels.map(l => l.padStart(8)).join('')}`);

    const cvSums = {};
    let cvCount = 0;
    for (const model of models) cvSums[model] = 0;

    for (const { team } of teamAvgs) {
      const vals0 = teamResults[models[0]].get(team) || [];
      if (vals0.length < 3) continue;

      const row = [String(team).padEnd(6)];
      for (const model of models) {
        const vals = teamResults[model].get(team) || [];
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
        const stddev = Math.sqrt(variance);
        const cv = mean > 0 ? (stddev / mean * 100) : 0;
        row.push((cv.toFixed(0) + '%').padStart(8));
        cvSums[model] += cv;
      }
      cvCount++;
      console.log(`  ${row.join('')}`);
    }

    console.log(`  ${'─'.repeat(6 + 8 * labels.length)}`);
    const avgRow = ['AVG CV'.padEnd(6)];
    for (const model of models) {
      avgRow.push(((cvSums[model] / cvCount).toFixed(0) + '%').padStart(8));
    }
    console.log(`  ${avgRow.join('')}`);

    // ═══════════════════════════════════════════════════════════════
    // Show a specific example: Q12 red (worst overcount: 263 → 122)
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log(`  DEEP DIVE: Matches where scouts significantly over/undercounted`);
    console.log(`${'═'.repeat(80)}`);

    for (const ma of matchAlliances) {
      const allianceShots = ma.robots.reduce((s, r) => s + r.shots, 0);
      if (allianceShots === 0) continue;
      const eff = ma.fmsScored / allianceShots;
      if (eff > 0.75 && eff < 1.3) continue; // skip "close enough" matches

      console.log(`\n  Q${ma.matchNum} ${ma.alliance.toUpperCase()} — ${allianceShots} shots → ${ma.fmsScored} FMS (${(eff * 100).toFixed(0)}% eff)`);
      console.log(`  ${'Team'.padEnd(6)} ${'Shots'.padStart(6)} ${'Linear'.padStart(7)} ${'β=0.7'.padStart(7)} ${'β=0.5'.padStart(7)} ${'Notes'.padStart(6)}`);

      const allShots = ma.robots.map(r => r.shots);
      for (const r of ma.robots) {
        const linear = modelB_power(r.shots, allShots, ma.fmsScored, 1.0);
        const p07 = modelB_power(r.shots, allShots, ma.fmsScored, 0.7);
        const p05 = modelB_power(r.shots, allShots, ma.fmsScored, 0.5);
        const flags = [];
        if (r.isPasser) flags.push('PASSER');
        if (r.noRobot) flags.push('NO-ROBOT');
        console.log(`  ${String(r.team).padEnd(6)} ${String(r.shots).padStart(6)} ${linear.toFixed(1).padStart(7)} ${p07.toFixed(1).padStart(7)} ${p05.toFixed(1).padStart(7)}   ${flags.join(' ')}`);
      }
    }

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  } finally {
    await client.end();
  }
}

run();
