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

const MATCH = 6;
const EVENT = '2026week0';

async function run() {
  try {
    await client.connect();

    // =========================================================================
    // 1. TBA DATA FOR MATCH 6
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('  SECTION 1: TBA DATA FOR MATCH ' + MATCH);
    console.log('='.repeat(70));

    const tba = await client.query(`
      SELECT
        "tba.red.1" as r1, "tba.red.2" as r2, "tba.red.3" as r3,
        "tba.blue.1" as b1, "tba.blue.2" as b2, "tba.blue.3" as b3,
        "tba.alliances.red.score" as red_score,
        "tba.alliances.blue.score" as blue_score,
        "tba.score_breakdown.red.hubScore.autoCount" as red_hub_auto_count,
        "tba.score_breakdown.red.hubScore.teleopCount" as red_hub_teleop_count,
        "tba.score_breakdown.red.hubScore.totalCount" as red_hub_total_count,
        "tba.score_breakdown.red.hubScore.totalPoints" as red_hub_total_pts,
        "tba.score_breakdown.red.hubScore.shift1Count" as red_shift1,
        "tba.score_breakdown.red.hubScore.shift2Count" as red_shift2,
        "tba.score_breakdown.red.hubScore.shift3Count" as red_shift3,
        "tba.score_breakdown.red.hubScore.shift4Count" as red_shift4,
        "tba.score_breakdown.red.hubScore.transitionCount" as red_transition,
        "tba.score_breakdown.red.hubScore.endgameCount" as red_endgame,
        "tba.score_breakdown.red.hubScore.uncounted" as red_uncounted,
        "tba.score_breakdown.blue.hubScore.autoCount" as blue_hub_auto_count,
        "tba.score_breakdown.blue.hubScore.teleopCount" as blue_hub_teleop_count,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_hub_total_count,
        "tba.score_breakdown.blue.hubScore.totalPoints" as blue_hub_total_pts,
        "tba.score_breakdown.blue.hubScore.shift1Count" as blue_shift1,
        "tba.score_breakdown.blue.hubScore.shift2Count" as blue_shift2,
        "tba.score_breakdown.blue.hubScore.shift3Count" as blue_shift3,
        "tba.score_breakdown.blue.hubScore.shift4Count" as blue_shift4,
        "tba.score_breakdown.blue.hubScore.transitionCount" as blue_transition,
        "tba.score_breakdown.blue.hubScore.endgameCount" as blue_endgame,
        "tba.score_breakdown.blue.hubScore.uncounted" as blue_uncounted
      FROM tba."${EVENT}_matches"
      WHERE "tba.match_number" = ${MATCH} AND "tba.comp_level" = 'qm'
      LIMIT 1
    `);

    let tbaData = null;
    if (tba.rows.length) {
      tbaData = tba.rows[0];
      const t = tbaData;
      console.log('\n  RED ALLIANCE:  ' + t.r1 + ', ' + t.r2 + ', ' + t.r3);
      console.log('    Score: ' + t.red_score);
      console.log('    Hub - autoCount: ' + t.red_hub_auto_count + ', teleopCount: ' + t.red_hub_teleop_count + ', totalCount: ' + t.red_hub_total_count + ', totalPoints: ' + t.red_hub_total_pts);
      console.log('    Hub - shift1: ' + t.red_shift1 + ', shift2: ' + t.red_shift2 + ', shift3: ' + t.red_shift3 + ', shift4: ' + t.red_shift4);
      console.log('    Hub - transition: ' + t.red_transition + ', endgame: ' + t.red_endgame + ', uncounted: ' + t.red_uncounted);
      console.log('\n  BLUE ALLIANCE: ' + t.b1 + ', ' + t.b2 + ', ' + t.b3);
      console.log('    Score: ' + t.blue_score);
      console.log('    Hub - autoCount: ' + t.blue_hub_auto_count + ', teleopCount: ' + t.blue_hub_teleop_count + ', totalCount: ' + t.blue_hub_total_count + ', totalPoints: ' + t.blue_hub_total_pts);
      console.log('    Hub - shift1: ' + t.blue_shift1 + ', shift2: ' + t.blue_shift2 + ', shift3: ' + t.blue_shift3 + ', shift4: ' + t.blue_shift4);
      console.log('    Hub - transition: ' + t.blue_transition + ', endgame: ' + t.blue_endgame + ', uncounted: ' + t.blue_uncounted);
    } else {
      console.log('  (no TBA data found for match 6)');
    }

    const redTeams = tbaData ? [tbaData.r1, tbaData.r2, tbaData.r3].map(t => t ? t.replace('frc', '') : null) : [];
    const blueTeams = tbaData ? [tbaData.b1, tbaData.b2, tbaData.b3].map(t => t ? t.replace('frc', '') : null) : [];
    const allTeams = [...redTeams, ...blueTeams].filter(Boolean);

    // =========================================================================
    // 2. SCOUT SUMMARY DATA
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('  SECTION 2: SCOUT SUMMARY DATA (public.summary_2026)');
    console.log('='.repeat(70));

    const summary = await client.query(`
      SELECT team_number, configured_team, dedicated_passer,
             COALESCE("auton_FUEL_SCORE", 0) as a_score,
             COALESCE("auton_FUEL_PASS", 0) as a_pass,
             COALESCE("auton_SCORE_PLUS_1", 0) as a_p1,
             COALESCE("auton_SCORE_PLUS_2", 0) as a_p2,
             COALESCE("auton_SCORE_PLUS_3", 0) as a_p3,
             COALESCE("auton_SCORE_PLUS_5", 0) as a_p5,
             COALESCE("auton_SCORE_PLUS_10", 0) as a_p10,
             COALESCE("teleop_FUEL_SCORE", 0) as t_score,
             COALESCE("teleop_FUEL_PASS", 0) as t_pass,
             COALESCE("teleop_SCORE_PLUS_1", 0) as t_p1,
             COALESCE("teleop_SCORE_PLUS_2", 0) as t_p2,
             COALESCE("teleop_SCORE_PLUS_3", 0) as t_p3,
             COALESCE("teleop_SCORE_PLUS_5", 0) as t_p5,
             COALESCE("teleop_SCORE_PLUS_10", 0) as t_p10,
             notes
      FROM public.summary_2026
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      ORDER BY configured_team
    `);

    const summaryByTeam = {};
    for (const r of summary.rows) {
      const autoMult = (r.a_p1*1) + (r.a_p2*2) + (r.a_p3*3) + (r.a_p5*5) + (r.a_p10*10);
      const teleopMult = (r.t_p1*1) + (r.t_p2*2) + (r.t_p3*3) + (r.t_p5*5) + (r.t_p10*10);
      const totalMult = autoMult + teleopMult;
      const alliance = r.configured_team && r.configured_team.startsWith('red') ? 'RED' : 'BLUE';

      summaryByTeam[String(r.team_number)] = {
        team_number: r.team_number, configured_team: r.configured_team,
        dedicated_passer: r.dedicated_passer, alliance,
        a_score: r.a_score, a_pass: r.a_pass,
        a_p1: r.a_p1, a_p2: r.a_p2, a_p3: r.a_p3, a_p5: r.a_p5, a_p10: r.a_p10,
        t_score: r.t_score, t_pass: r.t_pass,
        t_p1: r.t_p1, t_p2: r.t_p2, t_p3: r.t_p3, t_p5: r.t_p5, t_p10: r.t_p10,
        autoMult, teleopMult, totalMult, notes: r.notes,
      };

      console.log('\n  [' + alliance + '] Team ' + r.team_number + ' (' + r.configured_team + ') ' + (r.dedicated_passer ? '** PASSER **' : ''));
      console.log('    Auto:   FUEL_SCORE=' + r.a_score + ' FUEL_PASS=' + r.a_pass + ' | +1x' + r.a_p1 + ' +2x' + r.a_p2 + ' +3x' + r.a_p3 + ' +5x' + r.a_p5 + ' +10x' + r.a_p10);
      console.log('            Multiplier-only fuel estimate: ' + autoMult);
      console.log('    Teleop: FUEL_SCORE=' + r.t_score + ' FUEL_PASS=' + r.t_pass + ' | +1x' + r.t_p1 + ' +2x' + r.t_p2 + ' +3x' + r.t_p3 + ' +5x' + r.t_p5 + ' +10x' + r.t_p10);
      console.log('            Multiplier-only fuel estimate: ' + teleopMult);
      console.log('    Total multiplier-only: ' + totalMult);
      if (r.notes) console.log('    Notes: ' + r.notes);
    }

    // =========================================================================
    // 3. ACTION DATA
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('  SECTION 3: ACTION DATA (auton_actions + teleop_actions)');
    console.log('='.repeat(70));

    const autoActions = await client.query(`
      SELECT team_number, type, x, y, time_stamp, value, score
      FROM public.auton_actions
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      ORDER BY team_number, time_stamp
    `);
    const teleopActions = await client.query(`
      SELECT team_number, type, x, y, time_stamp, value, score
      FROM public.teleop_actions
      WHERE event_key = '${EVENT}' AND match_number = ${MATCH}
      ORDER BY team_number, time_stamp
    `);

    function groupByTeam(rows) {
      const map = {};
      for (const r of rows) { const t = String(r.team_number); if (!map[t]) map[t] = []; map[t].push(r); }
      return map;
    }
    const autoByTeam = groupByTeam(autoActions.rows);
    const teleopByTeam = groupByTeam(teleopActions.rows);

    function traceActions(actions) {
      let pending = 0, shots = 0, passes = 0;
      const log = [];
      for (const a of actions) {
        const m = a.type.match(/^SCORE_PLUS_(\d+)$/);
        if (m) {
          pending += parseInt(m[1]);
          log.push('  ' + a.type + ' -> pending now ' + pending);
        } else if (a.type === 'FUEL_SCORE') {
          const attr = pending || 1;
          shots += attr;
          log.push('  FUEL_SCORE -> ' + attr + ' shots (total: ' + shots + ')');
          pending = 0;
        } else if (a.type === 'FUEL_PASS') {
          const attr = pending || 1;
          passes += attr;
          log.push('  FUEL_PASS -> ' + attr + ' passes (total: ' + passes + ')');
          pending = 0;
        } else {
          log.push('  ' + a.type + ' (ignored)');
        }
      }
      if (pending > 0) log.push('  *** DANGLING pending=' + pending + ' ***');
      return { shots, passes, total: shots + passes, dangling: pending, log };
    }

    const actionResults = {};
    const teamsInActions = new Set([...Object.keys(autoByTeam), ...Object.keys(teleopByTeam)]);

    for (const team of [...teamsInActions].sort()) {
      const ar = traceActions(autoByTeam[team] || []);
      const tr = traceActions(teleopByTeam[team] || []);
      actionResults[team] = {
        autoShots: ar.shots, autoPasses: ar.passes, autoTotal: ar.total,
        teleopShots: tr.shots, teleopPasses: tr.passes, teleopTotal: tr.total,
        totalShots: ar.shots + tr.shots, totalPasses: ar.passes + tr.passes,
        totalMoved: ar.total + tr.total,
        autoDangling: ar.dangling, teleopDangling: tr.dangling,
      };
      const res = actionResults[team];
      console.log('\n  --- Team ' + team + ' ---');
      console.log('    AUTO (' + (autoByTeam[team] || []).length + ' actions):');
      for (const line of ar.log) console.log('      ' + line);
      console.log('    Auto: shots=' + res.autoShots + ' passes=' + res.autoPasses + ' total=' + res.autoTotal);
      console.log('    TELEOP (' + (teleopByTeam[team] || []).length + ' actions):');
      for (const line of tr.log) console.log('      ' + line);
      console.log('    Teleop: shots=' + res.teleopShots + ' passes=' + res.teleopPasses + ' total=' + res.teleopTotal);
      console.log('    TOTALS: shots=' + res.totalShots + ' passes=' + res.totalPasses + ' totalMoved=' + res.totalMoved);
      if (res.autoDangling > 0 || res.teleopDangling > 0)
        console.log('    *** DANGLING: auto=' + res.autoDangling + ', teleop=' + res.teleopDangling + ' ***');
    }

    // =========================================================================
    // 4. COMPARISON TABLE
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('  SECTION 4: COMPARISON TABLE');
    console.log('='.repeat(70));

    for (const [color, teams, hubTotal] of [
      ['RED', redTeams, tbaData ? tbaData.red_hub_total_count : null],
      ['BLUE', blueTeams, tbaData ? tbaData.blue_hub_total_count : null],
    ]) {
      console.log('\n  ' + color + ' ALLIANCE');
      console.log('  ' + '-'.repeat(66));
      console.log('  ' + 'Team'.padEnd(8) + ' ' + 'SummFuel'.padEnd(10) + ' ' + 'ActTotal'.padEnd(10) + ' ' + 'ActShots'.padEnd(10) + ' ' + 'ActPasses'.padEnd(10) + ' ' + 'Passer?'.padEnd(8));
      console.log('  ' + '-'.repeat(66));

      let aSF = 0, aAT = 0, aAS = 0, aAP = 0;
      for (const team of teams) {
        const s = summaryByTeam[team];
        const a = actionResults[team];
        const sf = s ? s.totalMult : '(none)';
        const at = a ? a.totalMoved : '(none)';
        const as2 = a ? a.totalShots : '(none)';
        const ap = a ? a.totalPasses : '(none)';
        const ip = s ? (s.dedicated_passer ? 'YES' : 'no') : '?';
        console.log('  ' + String(team).padEnd(8) + ' ' + String(sf).padEnd(10) + ' ' + String(at).padEnd(10) + ' ' + String(as2).padEnd(10) + ' ' + String(ap).padEnd(10) + ' ' + ip.padEnd(8));
        if (typeof sf === 'number') aSF += sf;
        if (typeof at === 'number') aAT += at;
        if (typeof as2 === 'number') aAS += as2;
        if (typeof ap === 'number') aAP += ap;
      }

      console.log('  ' + '-'.repeat(66));
      console.log('  ' + 'TOTAL'.padEnd(8) + ' ' + String(aSF).padEnd(10) + ' ' + String(aAT).padEnd(10) + ' ' + String(aAS).padEnd(10) + ' ' + String(aAP).padEnd(10));

      const tbaTC = hubTotal !== null ? Number(hubTotal) : null;
      const adjusted = aAT - aAP;

      console.log('\n  TBA hub totalCount:         ' + (tbaTC !== null ? tbaTC : '(unknown)'));
      console.log('  Scout summary fuel total:   ' + aSF);
      console.log('  Action-based total moved:   ' + aAT);
      console.log('  Action-based shots only:    ' + aAS);
      console.log('  Action-based passes:        ' + aAP);
      console.log('  Adjusted (total - passes):  ' + adjusted);

      if (tbaTC !== null) {
        const d1 = adjusted - tbaTC;
        const d2 = aSF - tbaTC;
        console.log('  Delta (adjusted - TBA):     ' + (d1 > 0 ? '+' : '') + d1);
        console.log('  Delta (summary - TBA):      ' + (d2 > 0 ? '+' : '') + d2);
        if (d1 < 0) console.log('  >> SCOUTS UNDER-COUNTED by ' + Math.abs(d1) + ' balls vs TBA');
        else if (d1 > 0) console.log('  >> SCOUTS OVER-COUNTED by ' + d1 + ' balls vs TBA');
        else console.log('  >> EXACT MATCH between scouts and TBA');
      }
    }

    // =========================================================================
    // 5. MISSING DATA CHECK
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('  SECTION 5: MISSING DATA CHECK');
    console.log('='.repeat(70));

    const sTeams = new Set(Object.keys(summaryByTeam));
    console.log('\n  Teams from TBA:      ' + allTeams.join(', '));
    console.log('  Teams in summary:    ' + [...sTeams].sort().join(', '));
    console.log('  Teams in actions:    ' + [...teamsInActions].sort().join(', '));

    for (const team of allTeams) {
      const inS = summaryByTeam[team] ? 'YES' : 'MISSING';
      const inAA = autoByTeam[team] ? 'YES (' + autoByTeam[team].length + ')' : 'MISSING';
      const inTA = teleopByTeam[team] ? 'YES (' + teleopByTeam[team].length + ')' : 'MISSING';
      console.log('  Team ' + team + ': summary=' + inS + ', auto_actions=' + inAA + ', teleop_actions=' + inTA);
    }

    const allSet = new Set(allTeams);
    const extraS = [...sTeams].filter(t => !allSet.has(t));
    const extraA = [...teamsInActions].filter(t => !allSet.has(t));
    if (extraS.length) console.log('\n  WARNING: In summary but NOT TBA: ' + extraS.join(', '));
    if (extraA.length) console.log('  WARNING: In actions but NOT TBA: ' + extraA.join(', '));

    // =========================================================================
    // 6. DIAGNOSIS
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('  SECTION 6: DIAGNOSIS -- WHY MIGHT SCOUTS HAVE UNDER-COUNTED?');
    console.log('='.repeat(70));

    let hasDang = false;
    for (const team of allTeams) {
      const a = actionResults[team];
      if (a && (a.autoDangling > 0 || a.teleopDangling > 0)) {
        console.log('  [DANGLING] Team ' + team + ': auto=' + a.autoDangling + ', teleop=' + a.teleopDangling);
        console.log('    -> Scout pressed SCORE_PLUS_X but never FUEL_SCORE/FUEL_PASS. Counted in summary but not actions.');
        hasDang = true;
      }
    }
    if (!hasDang) console.log('  No dangling multipliers found.');

    const passers = allTeams.filter(t => summaryByTeam[t] && summaryByTeam[t].dedicated_passer);
    if (passers.length) {
      console.log('\n  [PASSERS] Dedicated passers: ' + passers.join(', '));
      console.log('    -> Passes move balls to scorers. Same ball may be double-counted.');
    }

    const missS = allTeams.filter(t => !summaryByTeam[t]);
    const missA = allTeams.filter(t => !actionResults[t]);
    if (missS.length) {
      console.log('\n  [MISSING] Not in summary: ' + missS.join(', '));
      console.log('    -> No scouting data. Contributions completely lost.');
    }
    if (missA.length) console.log('  [MISSING] Not in actions: ' + missA.join(', '));

    console.log('\n  Per-robot summary vs action discrepancy:');
    for (const team of allTeams) {
      const s = summaryByTeam[team];
      const a = actionResults[team];
      if (s && a) {
        const diff = s.totalMult - a.totalMoved;
        if (diff !== 0) {
          console.log('  Team ' + team + ': summary=' + s.totalMult + ', actions=' + a.totalMoved + ', diff=' + (diff > 0 ? '+' : '') + diff);
          if (diff > 0) console.log('    -> Summary > actions: dangling multipliers or lost FUEL_SCORE/PASS.');
          else console.log('    -> Actions > summary: FUEL_SCORE/PASS with no prior multiplier (counted as 1).');
        } else {
          console.log('  Team ' + team + ': summary=' + s.totalMult + ', actions=' + a.totalMoved + ' -- MATCH');
        }
      } else if (!s && !a) {
        console.log('  Team ' + team + ': NO DATA anywhere');
      } else if (!s) {
        console.log('  Team ' + team + ': NO summary, actions=' + a.totalMoved);
      } else {
        console.log('  Team ' + team + ': summary=' + s.totalMult + ', NO actions');
      }
    }

    console.log('\n  Done.\n');

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
  } finally {
    await client.end();
  }
}

run();
