/**
 * Play back actual action sequences from a few matches to verify parsing logic.
 * Shows every timestamped action in order per robot.
 */
const { Client } = require('pg');

const client = new Client({
  host: 'ls-5d5a38bd8e526c124b9d00fbc2072798e988baf1.c81q4akcqnzf.us-east-1.rds.amazonaws.com',
  port: 5432, database: '2025_148', user: 'grafana_user', password: 'give_grafana_access_2',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});

function n(val) { return val === null || val === undefined ? 0 : Number(val); }

async function playbackMatch(matchNum) {
  const EVENT = '2026week0';

  // Get all actions for this match, ordered by team then timestamp
  const autoQ = await client.query(`
    SELECT team_number, type, time_stamp, 'AUTO' as phase
    FROM public.auton_actions
    WHERE event_key = $1 AND match_number = $2
    ORDER BY team_number, time_stamp
  `, [EVENT, matchNum]);

  const teleopQ = await client.query(`
    SELECT team_number, type, time_stamp, 'TELEOP' as phase
    FROM public.teleop_actions
    WHERE event_key = $1 AND match_number = $2
    ORDER BY team_number, time_stamp
  `, [EVENT, matchNum]);

  // Group by team
  const byTeam = new Map();
  for (const r of [...autoQ.rows, ...teleopQ.rows]) {
    const team = Number(r.team_number);
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(r);
  }

  // Sort each team's actions by timestamp
  for (const [, actions] of byTeam) {
    actions.sort((a, b) => Number(a.time_stamp) - Number(b.time_stamp));
  }

  // FMS data
  const tba = await client.query(`
    SELECT DISTINCT ON ("tba.match_number")
      "tba.score_breakdown.red.hubScore.totalCount" as red_total,
      "tba.score_breakdown.blue.hubScore.totalCount" as blue_total
    FROM tba."${EVENT}_matches"
    WHERE "tba.comp_level" = 'qm' AND "tba.match_number" = $1
    ORDER BY "tba.match_number"
  `, [matchNum]);
  const fms = tba.rows[0] || {};

  // Summary data for alliance info
  const summary = await client.query(`
    SELECT team_number, configured_team, dedicated_passer, notes
    FROM public.summary_2026
    WHERE event_key = $1 AND match_number = $2 AND match_key NOT LIKE 'configuredEvent_pm%'
    ORDER BY configured_team
  `, [EVENT, matchNum]);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  MATCH ${matchNum} — FMS: Red=${n(fms.red_total)} Blue=${n(fms.blue_total)}`);
  console.log(`${'═'.repeat(70)}`);

  for (const s of summary.rows) {
    const team = Number(s.team_number);
    const actions = byTeam.get(team) || [];
    const alliance = s.configured_team.startsWith('red') ? 'RED' : 'BLUE';
    const notes = (s.notes || '').trim();
    const passer = s.dedicated_passer ? ' [PASSER]' : '';

    console.log(`\n  Team ${team} (${alliance})${passer}${notes ? ' — "' + notes + '"' : ''}`);

    if (actions.length === 0) {
      console.log('    (no action data)');
      continue;
    }

    const firstTs = Number(actions[0].time_stamp);
    let pendingBalls = 0;
    let totalShots = 0, totalPasses = 0;

    for (const a of actions) {
      const relSec = (Number(a.time_stamp) - firstTs).toFixed(1);
      const phase = a.phase;

      if (a.type.startsWith('SCORE_PLUS_')) {
        const val = parseInt(a.type.replace('SCORE_PLUS_', ''), 10) || 1;
        pendingBalls += val;
        console.log(`    +${relSec}s [${phase}] ${a.type} → pending=${pendingBalls}`);
      } else if (a.type === 'FUEL_SCORE') {
        const counted = pendingBalls > 0 ? pendingBalls : 1;
        totalShots += counted;
        console.log(`    +${relSec}s [${phase}] FUEL_SCORE → ${counted} balls SHOT (total shots: ${totalShots})`);
        pendingBalls = 0;
      } else if (a.type === 'FUEL_PASS') {
        const counted = pendingBalls > 0 ? pendingBalls : 1;
        totalPasses += counted;
        console.log(`    +${relSec}s [${phase}] FUEL_PASS → ${counted} balls PASSED (total passes: ${totalPasses})`);
        pendingBalls = 0;
      } else {
        console.log(`    +${relSec}s [${phase}] ${a.type}`);
      }
    }

    if (pendingBalls > 0) {
      console.log(`    ⚠ ${pendingBalls} orphaned pending balls (SCORE_PLUS with no FUEL_SCORE/FUEL_PASS)`);
    }
    console.log(`    TOTAL: ${totalShots} shots, ${totalPasses} passes = ${totalShots + totalPasses} moved`);
  }
}

async function run() {
  try {
    await client.connect();

    // Play back matches with interesting patterns
    // Q1: 73 shots → 1 FMS (red), 123 shots → 122 FMS (blue)
    await playbackMatch(1);
    // Q2: 130 shots → 155 FMS (red, undercount)
    await playbackMatch(2);
    // Q5: high volume with passers
    await playbackMatch(5);
    // Q12: biggest overcount
    await playbackMatch(12);
    // Q15: 6328 scored "over 100 balls"
    await playbackMatch(15);

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  } finally {
    await client.end();
  }
}

run();
