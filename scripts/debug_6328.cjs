/**
 * Deep dive into 6328 and other >100% teams.
 *
 * Questions to answer:
 * 1. Where are the "missing shots" — balls FMS counted that scouts didn't?
 * 2. Do human players contribute to FMS hubScore?
 * 3. What do the action timelines look like for 6328 per match?
 * 4. Can we align scout timestamps with match phases?
 * 5. Are orphaned SCORE_PLUS events (no FUEL_SCORE/PASS following) a factor?
 */

const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

const EVENT = '2026week0';
function n(val) { return val === null || val === undefined ? 0 : Number(val); }

function attributePassesAndShots(actions) {
  let shots = 0, passes = 0, pending = 0, orphaned = 0;
  let events = []; // timeline
  for (const a of actions) {
    if (a.type.startsWith('SCORE_PLUS_')) {
      const val = parseInt(a.type.replace('SCORE_PLUS_', ''), 10) || 1;
      pending += val;
    } else if (a.type === 'FUEL_SCORE') {
      const counted = pending > 0 ? pending : 1;
      shots += counted;
      events.push({ ts: Number(a.time_stamp), type: 'SHOT', count: counted, runningShots: shots, runningPasses: passes });
      pending = 0;
    } else if (a.type === 'FUEL_PASS') {
      const counted = pending > 0 ? pending : 1;
      passes += counted;
      events.push({ ts: Number(a.time_stamp), type: 'PASS', count: counted, runningShots: shots, runningPasses: passes });
      pending = 0;
    }
  }
  orphaned = pending;
  return { shots, passes, orphaned, total: shots + passes, events };
}

async function run() {
  try {
    await client.connect();

    // ═══════════════════════════════════════════════════════════════
    // PART 1: Full FMS breakdown for all matches
    // ═══════════════════════════════════════════════════════════════
    const tbaData = await client.query(`
      SELECT
        "tba.match_number" as match_number,
        "tba.score_breakdown.red.hubScore.autoCount" as red_auto,
        "tba.score_breakdown.red.hubScore.teleopCount" as red_teleop,
        "tba.score_breakdown.red.hubScore.endgameCount" as red_endgame,
        "tba.score_breakdown.red.hubScore.totalCount" as red_total,
        "tba.score_breakdown.red.hubScore.uncounted" as red_uncounted,
        "tba.score_breakdown.red.hubScore.shift1Count" as red_s1,
        "tba.score_breakdown.red.hubScore.shift2Count" as red_s2,
        "tba.score_breakdown.red.hubScore.shift3Count" as red_s3,
        "tba.score_breakdown.red.hubScore.shift4Count" as red_s4,
        "tba.score_breakdown.red.hubScore.transitionCount" as red_trans,
        "tba.score_breakdown.blue.hubScore.autoCount" as blue_auto,
        "tba.score_breakdown.blue.hubScore.teleopCount" as blue_teleop,
        "tba.score_breakdown.blue.hubScore.endgameCount" as blue_endgame,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_total,
        "tba.score_breakdown.blue.hubScore.uncounted" as blue_uncounted,
        "tba.score_breakdown.blue.hubScore.shift1Count" as blue_s1,
        "tba.score_breakdown.blue.hubScore.shift2Count" as blue_s2,
        "tba.score_breakdown.blue.hubScore.shift3Count" as blue_s3,
        "tba.score_breakdown.blue.hubScore.shift4Count" as blue_s4,
        "tba.score_breakdown.blue.hubScore.transitionCount" as blue_trans
      FROM tba."${EVENT}_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.match_number"
    `);

    const fmsMap = new Map();
    for (const r of tbaData.rows) {
      fmsMap.set(Number(r.match_number), {
        red: { auto: n(r.red_auto), teleop: n(r.red_teleop), endgame: n(r.red_endgame), total: n(r.red_total), uncounted: n(r.red_uncounted), s1: n(r.red_s1), s2: n(r.red_s2), s3: n(r.red_s3), s4: n(r.red_s4), trans: n(r.red_trans) },
        blue: { auto: n(r.blue_auto), teleop: n(r.blue_teleop), endgame: n(r.blue_endgame), total: n(r.blue_total), uncounted: n(r.blue_uncounted), s1: n(r.blue_s1), s2: n(r.blue_s2), s3: n(r.blue_s3), s4: n(r.blue_s4), trans: n(r.blue_trans) },
      });
    }

    console.log(`${'═'.repeat(100)}`);
    console.log(`  FMS HUB SCORE FULL BREAKDOWN — What exactly is FMS counting?`);
    console.log(`${'═'.repeat(100)}`);
    console.log(`  Q#  All   Auto  S1    S2    S3    S4    Trans  TelTot  Endgm  TOTAL  Uncntd  |  auto+teleop+end=total?`);

    for (const [matchNum, fms] of [...fmsMap.entries()].sort((a,b) => a[0]-b[0])) {
      for (const alliance of ['red', 'blue']) {
        const f = fms[alliance];
        const check = f.auto + f.teleop + f.endgame;
        const ok = check === f.total ? 'OK' : `MISMATCH (${check} vs ${f.total})`;
        const shiftSum = f.s1 + f.s2 + f.s3 + f.s4 + f.trans;
        console.log(`  Q${String(matchNum).padEnd(3)} ${alliance.padEnd(5)} ${String(f.auto).padStart(4)}  ${String(f.s1).padStart(4)}  ${String(f.s2).padStart(4)}  ${String(f.s3).padStart(4)}  ${String(f.s4).padStart(4)}  ${String(f.trans).padStart(5)}  ${String(f.teleop).padStart(6)}  ${String(f.endgame).padStart(5)}  ${String(f.total).padStart(5)}  ${String(f.uncounted).padStart(6)}  |  ${ok}  shifts=${shiftSum}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 2: Deep dive into 6328's matches with action timelines
    // ═══════════════════════════════════════════════════════════════
    const FOCUS_TEAMS = [6328, 2423];

    // Get summary data for focus team matches
    const summaryData = await client.query(`
      SELECT match_number, team_number, configured_team, dedicated_passer,
             "auton_FUEL_SCORE", "auton_FUEL_PASS", "teleop_FUEL_SCORE", "teleop_FUEL_PASS",
             "auton_SCORE_PLUS_1", "auton_SCORE_PLUS_2", "auton_SCORE_PLUS_3",
             "auton_SCORE_PLUS_5", "auton_SCORE_PLUS_10",
             "teleop_SCORE_PLUS_1", "teleop_SCORE_PLUS_2", "teleop_SCORE_PLUS_3",
             "teleop_SCORE_PLUS_5", "teleop_SCORE_PLUS_10",
             notes
      FROM public.summary_2026
      WHERE event_key = $1 AND match_key NOT LIKE 'configuredEvent_pm%'
      ORDER BY match_number, configured_team
    `, [EVENT]);

    // Get all actions
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

    // For each focus team, walk through each match
    for (const focusTeam of FOCUS_TEAMS) {
      console.log(`\n${'═'.repeat(100)}`);
      console.log(`  TEAM ${focusTeam} — MATCH-BY-MATCH DEEP DIVE`);
      console.log(`${'═'.repeat(100)}`);

      const teamMatches = summaryData.rows.filter(r => Number(r.team_number) === focusTeam);

      for (const entry of teamMatches) {
        const matchNum = Number(entry.match_number);
        const alliance = entry.configured_team.startsWith('red') ? 'red' : 'blue';
        const fms = fmsMap.get(matchNum);
        if (!fms) continue;
        const fmsData = fms[alliance];

        // Get ALL robots on same alliance this match
        const allianceEntries = summaryData.rows.filter(r =>
          Number(r.match_number) === matchNum &&
          (r.configured_team.startsWith('red') ? 'red' : 'blue') === alliance
        );

        console.log(`\n  ── Q${matchNum} ${alliance.toUpperCase()} ──`);
        console.log(`  FMS: auto=${fmsData.auto} teleop=${fmsData.teleop} endgame=${fmsData.endgame} total=${fmsData.total} uncounted=${fmsData.uncounted}`);
        console.log(`  FMS shifts: s1=${fmsData.s1} s2=${fmsData.s2} s3=${fmsData.s3} s4=${fmsData.s4} trans=${fmsData.trans}`);

        let allianceTotalShots = 0;
        let allianceTotalPasses = 0;

        for (const ae of allianceEntries) {
          const team = Number(ae.team_number);
          const isFocus = team === focusTeam;
          const actionKey = `${matchNum}_${team}`;
          const actions = actionMap.get(actionKey);

          let autoResult = { shots: 0, passes: 0, orphaned: 0, total: 0, events: [] };
          let teleopResult = { shots: 0, passes: 0, orphaned: 0, total: 0, events: [] };

          if (actions) {
            autoResult = attributePassesAndShots(actions.auto);
            teleopResult = attributePassesAndShots(actions.teleop);
          }

          const totalShots = autoResult.shots + teleopResult.shots;
          const totalPasses = autoResult.passes + teleopResult.passes;
          const orphaned = autoResult.orphaned + teleopResult.orphaned;
          allianceTotalShots += totalShots;
          allianceTotalPasses += totalPasses;

          // Summary comparison
          const summaryAutoFuel = n(ae.auton_SCORE_PLUS_1)*1 + n(ae.auton_SCORE_PLUS_2)*2 + n(ae.auton_SCORE_PLUS_3)*3 + n(ae.auton_SCORE_PLUS_5)*5 + n(ae.auton_SCORE_PLUS_10)*10;
          const summaryTeleopFuel = n(ae.teleop_SCORE_PLUS_1)*1 + n(ae.teleop_SCORE_PLUS_2)*2 + n(ae.teleop_SCORE_PLUS_3)*3 + n(ae.teleop_SCORE_PLUS_5)*5 + n(ae.teleop_SCORE_PLUS_10)*10;
          const fuelScoreCount = n(ae.auton_FUEL_SCORE) + n(ae.teleop_FUEL_SCORE);
          const fuelPassCount = n(ae.auton_FUEL_PASS) + n(ae.teleop_FUEL_PASS);

          const marker = isFocus ? '>>>' : '   ';
          console.log(`${marker} Team ${team}: actionShots=${totalShots} actionPasses=${totalPasses} orphaned=${orphaned} | summary=${summaryAutoFuel}+${summaryTeleopFuel}=${summaryAutoFuel+summaryTeleopFuel} | FUEL_SCORE×${fuelScoreCount} FUEL_PASS×${fuelPassCount}${ae.dedicated_passer ? ' [PASSER]' : ''}${ae.notes ? ` "${ae.notes}"` : ''}`);

          // Show action timeline for focus team
          if (isFocus && actions) {
            const allActions = [
              ...actions.auto.map(a => ({ ...a, phase: 'AUTO' })),
              ...actions.teleop.map(a => ({ ...a, phase: 'TELEOP' })),
            ].sort((a, b) => Number(a.time_stamp) - Number(b.time_stamp));

            if (allActions.length > 0) {
              const firstTs = Number(allActions[0].time_stamp);
              let pending = 0;
              let runShots = 0, runPasses = 0;

              console.log(`      Timeline (${allActions.length} actions):`);
              for (const a of allActions) {
                const relSec = ((Number(a.time_stamp) - firstTs) / 1000).toFixed(1);
                if (a.type.startsWith('SCORE_PLUS_')) {
                  const val = parseInt(a.type.replace('SCORE_PLUS_', ''), 10) || 1;
                  pending += val;
                  console.log(`      +${relSec.padStart(6)}s [${a.phase.padEnd(6)}] ${a.type} → pending=${pending}`);
                } else if (a.type === 'FUEL_SCORE') {
                  const counted = pending > 0 ? pending : 1;
                  runShots += counted;
                  console.log(`      +${relSec.padStart(6)}s [${a.phase.padEnd(6)}] FUEL_SCORE → ${counted} balls SHOT (cumulative: ${runShots} shots)`);
                  pending = 0;
                } else if (a.type === 'FUEL_PASS') {
                  const counted = pending > 0 ? pending : 1;
                  runPasses += counted;
                  console.log(`      +${relSec.padStart(6)}s [${a.phase.padEnd(6)}] FUEL_PASS → ${counted} balls PASSED (cumulative: ${runPasses} passes)`);
                  pending = 0;
                } else {
                  console.log(`      +${relSec.padStart(6)}s [${a.phase.padEnd(6)}] ${a.type}`);
                }
              }
              if (pending > 0) console.log(`      ⚠ ${pending} orphaned balls at end`);
            }
          }
        }

        const ratio = allianceTotalShots > 0 ? fmsData.total / allianceTotalShots : Infinity;
        console.log(`  ALLIANCE TOTAL: ${allianceTotalShots} shots + ${allianceTotalPasses} passes = ${allianceTotalShots + allianceTotalPasses} moved | FMS=${fmsData.total} | ratio=${ratio.toFixed(2)}`);

        if (ratio > 1.05) {
          const gap = fmsData.total - allianceTotalShots;
          console.log(`  ⚠ FMS has ${gap} MORE scored balls than scouts tracked as shots`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 3: Check if passes could be misattributed shots
    // (robot scores but scout records FUEL_PASS instead of FUEL_SCORE)
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(100)}`);
    console.log(`  WHAT IF PASSES ARE ACTUALLY SHOTS? (shots + passes vs FMS)`);
    console.log(`${'═'.repeat(100)}`);
    console.log(`  Q#  All   ScoutShots  ScoutPass  Shots+Pass   FMS    ShotsRatio  TotalRatio`);

    const byMatchAlliance = new Map();
    for (const row of summaryData.rows) {
      const alliance = row.configured_team.startsWith('red') ? 'red' : 'blue';
      const key = `${row.match_number}_${alliance}`;
      if (!byMatchAlliance.has(key)) byMatchAlliance.set(key, []);
      byMatchAlliance.get(key).push(row);
    }

    for (const [key, rows] of [...byMatchAlliance.entries()].sort()) {
      const [matchNumStr, alliance] = key.split('_');
      const matchNum = Number(matchNumStr);
      const fms = fmsMap.get(matchNum);
      if (!fms) continue;
      const fmsData = fms[alliance];

      let totalShots = 0, totalPasses = 0;
      for (const row of rows) {
        const team = Number(row.team_number);
        const actionKey = `${matchNum}_${team}`;
        const actions = actionMap.get(actionKey);
        if (actions && (actions.auto.length > 0 || actions.teleop.length > 0)) {
          const autoR = attributePassesAndShots(actions.auto);
          const telR = attributePassesAndShots(actions.teleop);
          totalShots += autoR.shots + telR.shots;
          totalPasses += autoR.passes + telR.passes;
        } else {
          // Summary fallback
          const est = n(row.auton_SCORE_PLUS_1)*1 + n(row.auton_SCORE_PLUS_2)*2 + n(row.auton_SCORE_PLUS_3)*3 + n(row.auton_SCORE_PLUS_5)*5 + n(row.auton_SCORE_PLUS_10)*10
                    + n(row.teleop_SCORE_PLUS_1)*1 + n(row.teleop_SCORE_PLUS_2)*2 + n(row.teleop_SCORE_PLUS_3)*3 + n(row.teleop_SCORE_PLUS_5)*5 + n(row.teleop_SCORE_PLUS_10)*10;
          const p = n(row.auton_FUEL_PASS) + n(row.teleop_FUEL_PASS);
          totalShots += est - p;
          totalPasses += p;
        }
      }

      const shotsRatio = totalShots > 0 ? (fmsData.total / totalShots).toFixed(2) : 'N/A';
      const totalRatio = (totalShots + totalPasses) > 0 ? (fmsData.total / (totalShots + totalPasses)).toFixed(2) : 'N/A';

      const marker = Number(shotsRatio) > 1.1 && Number(totalRatio) < 1.1 ? ' ← PASSES EXPLAIN GAP' : '';
      console.log(`  Q${String(matchNum).padEnd(3)} ${alliance.padEnd(5)} ${String(totalShots).padStart(10)}  ${String(totalPasses).padStart(9)}  ${String(totalShots + totalPasses).padStart(10)}  ${String(fmsData.total).padStart(5)}  ${String(shotsRatio).padStart(10)}  ${String(totalRatio).padStart(10)}${marker}`);
    }

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  } finally {
    await client.end();
  }
}

run();
