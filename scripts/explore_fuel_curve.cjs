/**
 * Explore the relationship between scout-estimated "balls moved" and FMS "balls scored"
 * to determine if a curve fit can improve per-robot fuel attribution.
 *
 * For each qual match/alliance:
 *   - Per-robot: action-based shots/passes (or summary fallback)
 *   - Alliance total: FMS hubScore.totalCount (ground truth scored)
 *   - Bucket breakdown: which SCORE_PLUS sizes each robot used (precision signal)
 */

const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: '2025_148',
  user: 'grafana_user',
  password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// Replicate attributePassesAndShots from scouting.ts
function attributePassesAndShots(actions) {
  let shots = 0;
  let passes = 0;
  let pending = 0;
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

// Replicate estimateMatchFuel from summary SCORE_PLUS fields
function estimateFromSummary(row) {
  const auto =
    (row.auton_SCORE_PLUS_1 || 0) * 1 +
    (row.auton_SCORE_PLUS_2 || 0) * 2 +
    (row.auton_SCORE_PLUS_3 || 0) * 3 +
    (row.auton_SCORE_PLUS_5 || 0) * 5 +
    (row.auton_SCORE_PLUS_10 || 0) * 10;
  const teleop =
    (row.teleop_SCORE_PLUS_1 || 0) * 1 +
    (row.teleop_SCORE_PLUS_2 || 0) * 2 +
    (row.teleop_SCORE_PLUS_3 || 0) * 3 +
    (row.teleop_SCORE_PLUS_5 || 0) * 5 +
    (row.teleop_SCORE_PLUS_10 || 0) * 10;
  return { auto, teleop, total: auto + teleop };
}

// Which bucket sizes did scout use? (precision signal)
function bucketBreakdown(row) {
  return {
    auto: {
      p1: row.auton_SCORE_PLUS_1 || 0,
      p2: row.auton_SCORE_PLUS_2 || 0,
      p3: row.auton_SCORE_PLUS_3 || 0,
      p5: row.auton_SCORE_PLUS_5 || 0,
      p10: row.auton_SCORE_PLUS_10 || 0,
    },
    teleop: {
      p1: row.teleop_SCORE_PLUS_1 || 0,
      p2: row.teleop_SCORE_PLUS_2 || 0,
      p3: row.teleop_SCORE_PLUS_3 || 0,
      p5: row.teleop_SCORE_PLUS_5 || 0,
      p10: row.teleop_SCORE_PLUS_10 || 0,
    },
  };
}

async function run() {
  try {
    await client.connect();
    const EVENT = '2026week0';

    // ═══════════════════════════════════════════════════════════════
    // 1. Per-robot action data for ALL matches
    // ═══════════════════════════════════════════════════════════════
    const autoActions = await client.query(`
      SELECT team_number, match_number, type, time_stamp
      FROM public.auton_actions
      WHERE event_key = $1
      ORDER BY match_number, team_number, time_stamp
    `, [EVENT]);

    const teleopActions = await client.query(`
      SELECT team_number, match_number, type, time_stamp
      FROM public.teleop_actions
      WHERE event_key = $1
      ORDER BY match_number, team_number, time_stamp
    `, [EVENT]);

    // Group actions by match_team
    const actionMap = new Map(); // "matchNum_teamNum" -> { auto: [], teleop: [] }
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

    // ═══════════════════════════════════════════════════════════════
    // 2. Summary data (scout entries)
    // ═══════════════════════════════════════════════════════════════
    const summaryData = await client.query(`
      SELECT match_number, team_number, configured_team, dedicated_passer,
             "auton_FUEL_SCORE", "auton_FUEL_PASS", "teleop_FUEL_SCORE", "teleop_FUEL_PASS",
             "auton_SCORE_PLUS_1", "auton_SCORE_PLUS_2", "auton_SCORE_PLUS_3",
             "auton_SCORE_PLUS_5", "auton_SCORE_PLUS_10",
             "teleop_SCORE_PLUS_1", "teleop_SCORE_PLUS_2", "teleop_SCORE_PLUS_3",
             "teleop_SCORE_PLUS_5", "teleop_SCORE_PLUS_10",
             poor_fuel_scoring_accuracy
      FROM public.summary_2026
      WHERE event_key = $1
        AND match_key NOT LIKE 'configuredEvent_pm%'
      ORDER BY match_number, configured_team
    `, [EVENT]);

    // Group by match + alliance
    const matchAlliances = new Map(); // "matchNum_red/blue" -> [rows]
    for (const row of summaryData.rows) {
      const alliance = row.configured_team.startsWith('red') ? 'red' : 'blue';
      const key = `${row.match_number}_${alliance}`;
      if (!matchAlliances.has(key)) matchAlliances.set(key, []);
      matchAlliances.get(key).push(row);
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. TBA FMS data
    // ═══════════════════════════════════════════════════════════════
    const tbaData = await client.query(`
      SELECT DISTINCT ON ("tba.match_number")
        "tba.match_number" as match_number,
        "tba.score_breakdown.red.hubScore.totalCount" as red_total,
        "tba.score_breakdown.red.hubScore.autoCount" as red_auto,
        "tba.score_breakdown.red.hubScore.teleopCount" as red_teleop,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_total,
        "tba.score_breakdown.blue.hubScore.autoCount" as blue_auto,
        "tba.score_breakdown.blue.hubScore.teleopCount" as blue_teleop
      FROM tba."${EVENT}_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);

    const fmsMap = new Map();
    for (const r of tbaData.rows) {
      fmsMap.set(Number(r.match_number), {
        red: { total: Number(r.red_total || 0), auto: Number(r.red_auto || 0), teleop: Number(r.red_teleop || 0) },
        blue: { total: Number(r.blue_total || 0), auto: Number(r.blue_auto || 0), teleop: Number(r.blue_teleop || 0) },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. EXAMPLE: Show one match in detail (action sequence)
    // ═══════════════════════════════════════════════════════════════
    // Pick first match with scout data
    const firstMatch = summaryData.rows[0]?.match_number;
    if (firstMatch) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`  DETAILED EXAMPLE: Match ${firstMatch} — Raw Action Sequences`);
      console.log(`${'='.repeat(70)}`);

      const matchRows = summaryData.rows.filter(r => r.match_number == firstMatch);
      for (const row of matchRows) {
        const alliance = row.configured_team.startsWith('red') ? 'red' : 'blue';
        const key = `${row.match_number}_${row.team_number}`;
        const actions = actionMap.get(key);
        const passer = row.dedicated_passer ? ' [PASSER]' : '';

        console.log(`\n  Team ${row.team_number} (${alliance} ${row.configured_team.split('_')[1]})${passer}:`);

        if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
          // Show raw action sequence
          const allActs = [
            ...actions.auto.map(a => ({ ...a, phase: 'AUTO' })),
            ...actions.teleop.map(a => ({ ...a, phase: 'TELEOP' })),
          ];
          console.log(`    Action sequence (${allActs.length} events):`);
          for (const a of allActs) {
            console.log(`      [${a.phase.padEnd(6)}] ${a.type}`);
          }

          const autoResult = attributePassesAndShots(actions.auto);
          const teleopResult = attributePassesAndShots(actions.teleop);
          console.log(`    → Auto:   ${autoResult.shots} shots, ${autoResult.passes} passes = ${autoResult.total} moved`);
          console.log(`    → Teleop: ${teleopResult.shots} shots, ${teleopResult.passes} passes = ${teleopResult.total} moved`);
          console.log(`    → TOTAL:  ${autoResult.shots + teleopResult.shots} shots, ${autoResult.passes + teleopResult.passes} passes = ${autoResult.total + teleopResult.total} moved`);
        } else {
          // Fallback to summary
          const est = estimateFromSummary(row);
          const buckets = bucketBreakdown(row);
          console.log(`    No action data — using summary SCORE_PLUS fields:`);
          console.log(`    Auto buckets:   +1×${buckets.auto.p1} +2×${buckets.auto.p2} +3×${buckets.auto.p3} +5×${buckets.auto.p5} +10×${buckets.auto.p10} = ${est.auto} balls`);
          console.log(`    Teleop buckets: +1×${buckets.teleop.p1} +2×${buckets.teleop.p2} +3×${buckets.teleop.p3} +5×${buckets.teleop.p5} +10×${buckets.teleop.p10} = ${est.teleop} balls`);
          console.log(`    FUEL_SCORE: auto=${row.auton_FUEL_SCORE||0} teleop=${row.teleop_FUEL_SCORE||0}`);
          console.log(`    FUEL_PASS:  auto=${row.auton_FUEL_PASS||0} teleop=${row.teleop_FUEL_PASS||0}`);
          console.log(`    → TOTAL: ${est.total} balls moved`);
        }
      }

      // Show FMS for comparison
      const fms = fmsMap.get(Number(firstMatch));
      if (fms) {
        console.log(`\n  FMS Ground Truth (Match ${firstMatch}):`);
        console.log(`    Red:  ${fms.red.auto} auto + ${fms.red.teleop} teleop = ${fms.red.total} scored`);
        console.log(`    Blue: ${fms.blue.auto} auto + ${fms.blue.teleop} teleop = ${fms.blue.total} scored`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. ALL MATCHES: Scout shots vs FMS scored (the curve data)
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`  ALL MATCHES: Per-Alliance Scout Shots vs FMS Scored`);
    console.log(`${'='.repeat(70)}`);
    console.log(`  ${'Match'.padEnd(6)} ${'Alli'.padEnd(5)} ${'R1 shots'.padStart(9)} ${'R2 shots'.padStart(9)} ${'R3 shots'.padStart(9)} ${'AllShots'.padStart(9)} ${'AllPass'.padStart(8)} ${'Attempts'.padStart(9)} ${'FMS'.padStart(5)} ${'Eff%'.padStart(6)} ${'Delta'.padStart(6)}`);

    const curveData = []; // collect for regression

    for (const [key, robots] of matchAlliances) {
      const [matchNumStr, alliance] = key.split('_');
      const matchNum = Number(matchNumStr);
      const fms = fmsMap.get(matchNum);
      if (!fms) continue;
      const fmsScored = fms[alliance].total;

      // Per-robot shots
      const robotDetails = robots.map(row => {
        const actionKey = `${row.match_number}_${row.team_number}`;
        const actions = actionMap.get(actionKey);
        let shots = 0, passes = 0, totalMoved = 0;

        if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
          const autoR = attributePassesAndShots(actions.auto);
          const telR = attributePassesAndShots(actions.teleop);
          shots = autoR.shots + telR.shots;
          passes = autoR.passes + telR.passes;
          totalMoved = shots + passes;
        } else {
          const est = estimateFromSummary(row);
          totalMoved = est.total;
          if (row.dedicated_passer) {
            passes = totalMoved;
            shots = 0;
          } else {
            passes = (row.auton_FUEL_PASS || 0) + (row.teleop_FUEL_PASS || 0);
            shots = totalMoved - passes;
          }
        }

        // Bucket breakdown for precision analysis
        const buckets = bucketBreakdown(row);
        const totalBucketTaps =
          buckets.auto.p1 + buckets.auto.p2 + buckets.auto.p3 + buckets.auto.p5 + buckets.auto.p10 +
          buckets.teleop.p1 + buckets.teleop.p2 + buckets.teleop.p3 + buckets.teleop.p5 + buckets.teleop.p10;
        const bigBucketTaps = buckets.auto.p5 + buckets.auto.p10 + buckets.teleop.p5 + buckets.teleop.p10;
        const bigBucketRatio = totalBucketTaps > 0 ? bigBucketTaps / totalBucketTaps : 0;

        return {
          team: Number(row.team_number),
          shots,
          passes,
          totalMoved,
          isPasser: !!row.dedicated_passer,
          poorAccuracy: !!row.poor_fuel_scoring_accuracy,
          bigBucketRatio,
          buckets,
        };
      });

      const allianceShots = robotDetails.reduce((s, r) => s + r.shots, 0);
      const alliancePasses = robotDetails.reduce((s, r) => s + r.passes, 0);
      const attempts = allianceShots; // shots = scoring attempts (passes removed)
      const eff = attempts > 0 ? (fmsScored / attempts * 100) : 0;
      const delta = attempts - fmsScored;

      console.log(`  ${('Q' + matchNum).padEnd(6)} ${alliance.padEnd(5)} ${String(robotDetails[0]?.shots ?? '-').padStart(9)} ${String(robotDetails[1]?.shots ?? '-').padStart(9)} ${String(robotDetails[2]?.shots ?? '-').padStart(9)} ${String(allianceShots).padStart(9)} ${String(alliancePasses).padStart(8)} ${String(attempts).padStart(9)} ${String(fmsScored).padStart(5)} ${(eff.toFixed(0) + '%').padStart(6)} ${String(delta > 0 ? '+' + delta : delta).padStart(6)}`);

      curveData.push({
        matchNum, alliance, fmsScored, allianceShots, alliancePasses, attempts,
        robots: robotDetails,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. AGGREGATE: Scoring efficiency by robot volume tier
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`  SCORING EFFICIENCY BY ROBOT SHOT VOLUME`);
    console.log(`  (Can we see the nonlinear relationship?)`);
    console.log(`${'='.repeat(70)}`);

    // Collect all robot-level data points
    const robotPoints = [];
    for (const match of curveData) {
      if (match.fmsScored === 0) continue;
      for (const r of match.robots) {
        if (r.isPasser) continue; // exclude dedicated passers
        robotPoints.push({
          shots: r.shots,
          allianceShots: match.allianceShots,
          fmsScored: match.fmsScored,
          // Proportional share if linear
          linearShare: match.allianceShots > 0 ? (r.shots / match.allianceShots) * match.fmsScored : 0,
          bigBucketRatio: r.bigBucketRatio,
          poorAccuracy: r.poorAccuracy,
          team: r.team,
          matchNum: match.matchNum,
        });
      }
    }

    // Bin by shot volume
    const bins = [
      { label: '0 shots', min: 0, max: 0 },
      { label: '1-5 shots', min: 1, max: 5 },
      { label: '6-10 shots', min: 6, max: 10 },
      { label: '11-20 shots', min: 11, max: 20 },
      { label: '21-30 shots', min: 21, max: 30 },
      { label: '31+ shots', min: 31, max: 999 },
    ];

    console.log(`  ${'Volume'.padEnd(14)} ${'Count'.padStart(6)} ${'Avg Shots'.padStart(10)} ${'Avg Linear'.padStart(11)} ${'Avg BigBkt%'.padStart(12)}`);
    for (const bin of bins) {
      const inBin = robotPoints.filter(r => r.shots >= bin.min && r.shots <= bin.max);
      if (inBin.length === 0) continue;
      const avgShots = inBin.reduce((s, r) => s + r.shots, 0) / inBin.length;
      const avgLinear = inBin.reduce((s, r) => s + r.linearShare, 0) / inBin.length;
      const avgBigBkt = inBin.reduce((s, r) => s + r.bigBucketRatio, 0) / inBin.length;
      console.log(`  ${bin.label.padEnd(14)} ${String(inBin.length).padStart(6)} ${avgShots.toFixed(1).padStart(10)} ${avgLinear.toFixed(1).padStart(11)} ${(avgBigBkt * 100).toFixed(0).padStart(11)}%`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. ALLIANCE-LEVEL: Attempts → Scored scatter data
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`  ALLIANCE-LEVEL: Attempts vs Scored (for curve fitting)`);
    console.log(`${'='.repeat(70)}`);
    console.log(`  Attempts  Scored  Eff%`);
    for (const m of curveData) {
      if (m.attempts === 0 && m.fmsScored === 0) continue;
      const eff = m.attempts > 0 ? (m.fmsScored / m.attempts * 100).toFixed(0) : '?';
      console.log(`  ${String(m.attempts).padStart(8)}  ${String(m.fmsScored).padStart(6)}  ${String(eff + '%').padStart(5)}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. BUCKET USAGE: How are scouts actually counting?
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`  BUCKET USAGE: How scouts count balls`);
    console.log(`${'='.repeat(70)}`);

    let totalP1 = 0, totalP2 = 0, totalP3 = 0, totalP5 = 0, totalP10 = 0;
    let ballsFromP1 = 0, ballsFromP2 = 0, ballsFromP3 = 0, ballsFromP5 = 0, ballsFromP10 = 0;

    for (const row of summaryData.rows) {
      const b = bucketBreakdown(row);
      totalP1 += b.auto.p1 + b.teleop.p1;
      totalP2 += b.auto.p2 + b.teleop.p2;
      totalP3 += b.auto.p3 + b.teleop.p3;
      totalP5 += b.auto.p5 + b.teleop.p5;
      totalP10 += b.auto.p10 + b.teleop.p10;
      ballsFromP1 += (b.auto.p1 + b.teleop.p1) * 1;
      ballsFromP2 += (b.auto.p2 + b.teleop.p2) * 2;
      ballsFromP3 += (b.auto.p3 + b.teleop.p3) * 3;
      ballsFromP5 += (b.auto.p5 + b.teleop.p5) * 5;
      ballsFromP10 += (b.auto.p10 + b.teleop.p10) * 10;
    }

    const totalTaps = totalP1 + totalP2 + totalP3 + totalP5 + totalP10;
    const totalBalls = ballsFromP1 + ballsFromP2 + ballsFromP3 + ballsFromP5 + ballsFromP10;

    console.log(`  Bucket   Taps   Balls   % of Taps   % of Balls   Precision`);
    const show = (label, taps, balls) => {
      console.log(`  ${label.padEnd(7)} ${String(taps).padStart(5)}  ${String(balls).padStart(6)}   ${(taps/totalTaps*100).toFixed(0).padStart(8)}%  ${(balls/totalBalls*100).toFixed(0).padStart(9)}%   ${label === '+1' || label === '+2' ? 'HIGH' : label === '+3' ? 'MEDIUM' : 'LOW'}`);
    };
    show('+1', totalP1, ballsFromP1);
    show('+2', totalP2, ballsFromP2);
    show('+3', totalP3, ballsFromP3);
    show('+5', totalP5, ballsFromP5);
    show('+10', totalP10, ballsFromP10);
    console.log(`  ${'TOTAL'.padEnd(7)} ${String(totalTaps).padStart(5)}  ${String(totalBalls).padStart(6)}`);
    console.log(`\n  ${((ballsFromP5 + ballsFromP10) / totalBalls * 100).toFixed(0)}% of all estimated balls come from low-precision +5/+10 buckets`);

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
