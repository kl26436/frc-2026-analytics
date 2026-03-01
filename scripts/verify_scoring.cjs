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

async function run() {
  try {
    await client.connect();

    // Pull all week0 scouting data with computed fuel totals
    const scouts = await client.query(`
      SELECT
        match_number,
        team_number,
        configured_team,
        COALESCE("auton_FUEL_SCORE", 0) as auto_fuel,
        COALESCE("auton_SCORE_PLUS_1", 0) as auto_p1,
        COALESCE("auton_SCORE_PLUS_2", 0) as auto_p2,
        COALESCE("auton_SCORE_PLUS_3", 0) as auto_p3,
        COALESCE("auton_SCORE_PLUS_5", 0) as auto_p5,
        COALESCE("auton_SCORE_PLUS_10", 0) as auto_p10,
        COALESCE("teleop_FUEL_SCORE", 0) as teleop_fuel,
        COALESCE("teleop_SCORE_PLUS_1", 0) as teleop_p1,
        COALESCE("teleop_SCORE_PLUS_2", 0) as teleop_p2,
        COALESCE("teleop_SCORE_PLUS_3", 0) as teleop_p3,
        COALESCE("teleop_SCORE_PLUS_5", 0) as teleop_p5,
        COALESCE("teleop_SCORE_PLUS_10", 0) as teleop_p10
      FROM public.summary_2026
      WHERE event_key = '2026week0'
      ORDER BY match_number, configured_team
    `);

    // Pull all TBA match data (one query, get everything)
    const tba = await client.query(`
      SELECT DISTINCT ON ("tba.key")
        "tba.key" as match_key,
        "tba.match_number" as match_number,
        "tba.comp_level" as comp_level,
        "tba.score_breakdown.blue.hubScore.autoCount" as blue_auto,
        "tba.score_breakdown.blue.hubScore.teleopCount" as blue_teleop,
        "tba.score_breakdown.blue.hubScore.totalCount" as blue_total,
        "tba.score_breakdown.red.hubScore.autoCount" as red_auto,
        "tba.score_breakdown.red.hubScore.teleopCount" as red_teleop,
        "tba.score_breakdown.red.hubScore.totalCount" as red_total
      FROM tba."2026week0_matches"
      WHERE "tba.comp_level" = 'qm'
      ORDER BY "tba.key", "tba.match_number"
    `);

    // Build FMS lookup by match number
    const fmsMap = {};
    for (const m of tba.rows) {
      fmsMap[parseInt(m.match_number)] = {
        blue: { auto: parseInt(m.blue_auto), teleop: parseInt(m.blue_teleop), total: parseInt(m.blue_total) },
        red: { auto: parseInt(m.red_auto), teleop: parseInt(m.red_teleop), total: parseInt(m.red_total) },
      };
    }

    // Compute scout fuel estimates and compare to FMS
    console.log('=== MATCH-BY-MATCH: SCOUT ESTIMATED FUEL vs FMS ===\n');
    console.log('Formula: FUEL_SCORE + P1×1 + P2×2 + P3×3 + P5×5 + P10×10\n');

    // Group scouts by match + alliance
    const matchAlliances = {};
    for (const s of scouts.rows) {
      const mn = parseInt(s.match_number);
      const alliance = s.configured_team.startsWith('blue') ? 'blue' : 'red';
      const key = `${mn}-${alliance}`;

      const autoEst = parseInt(s.auto_fuel)
        + parseInt(s.auto_p1) * 1
        + parseInt(s.auto_p2) * 2
        + parseInt(s.auto_p3) * 3
        + parseInt(s.auto_p5) * 5
        + parseInt(s.auto_p10) * 10;

      const teleopEst = parseInt(s.teleop_fuel)
        + parseInt(s.teleop_p1) * 1
        + parseInt(s.teleop_p2) * 2
        + parseInt(s.teleop_p3) * 3
        + parseInt(s.teleop_p5) * 5
        + parseInt(s.teleop_p10) * 10;

      if (!matchAlliances[key]) matchAlliances[key] = { match: mn, alliance, robots: [], autoTotal: 0, teleopTotal: 0 };
      matchAlliances[key].robots.push({
        team: parseInt(s.team_number),
        autoEst,
        teleopEst,
        totalEst: autoEst + teleopEst,
      });
      matchAlliances[key].autoTotal += autoEst;
      matchAlliances[key].teleopTotal += teleopEst;
    }

    let totalScout = 0, totalFms = 0;
    let matchCount = 0;
    const ratios = [];

    for (const key of Object.keys(matchAlliances).sort((a, b) => {
      const [am, aa] = a.split('-');
      const [bm, ba] = b.split('-');
      return parseInt(am) - parseInt(bm) || aa.localeCompare(ba);
    })) {
      const ma = matchAlliances[key];
      const fms = fmsMap[ma.match];
      if (!fms) continue;
      const fmsData = fms[ma.alliance];
      const scoutTotal = ma.autoTotal + ma.teleopTotal;
      const gap = scoutTotal - fmsData.total;
      const pct = fmsData.total > 0 ? ((gap / fmsData.total) * 100).toFixed(0) : 'N/A';
      const ratio = fmsData.total > 0 ? (scoutTotal / fmsData.total).toFixed(2) : 'N/A';

      console.log(`Match ${ma.match} ${ma.alliance.toUpperCase()}: scout=${scoutTotal} (auto=${ma.autoTotal} teleop=${ma.teleopTotal}) | FMS=${fmsData.total} (auto=${fmsData.auto} teleop=${fmsData.teleop}) | gap=${gap > 0 ? '+' : ''}${gap} (${pct}%) ratio=${ratio}`);

      // Per-robot breakdown
      for (const r of ma.robots) {
        const share = scoutTotal > 0 ? ((r.totalEst / scoutTotal) * 100).toFixed(0) : '0';
        console.log(`    Team ${r.team}: ${r.totalEst} fuel (auto=${r.autoEst} teleop=${r.teleopEst}) → ${share}% of alliance`);
      }

      totalScout += scoutTotal;
      totalFms += fmsData.total;
      ratios.push(fmsData.total > 0 ? scoutTotal / fmsData.total : 0);
      matchCount++;
    }

    console.log(`\n=== SUMMARY ACROSS ${matchCount} ALLIANCE-MATCHES ===`);
    console.log(`Total scout estimated: ${totalScout}`);
    console.log(`Total FMS actual:     ${totalFms}`);
    console.log(`Overall ratio:        ${(totalScout / totalFms).toFixed(2)}x`);
    console.log(`Average ratio:        ${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)}x`);
    console.log(`Median ratio:         ${ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)].toFixed(2)}x`);

    // Verdict distribution
    const verdicts = ratios.map(r => {
      const pctGap = Math.abs(r - 1);
      if (pctGap <= 0.10) return 'accurate';
      if (pctGap <= 0.25) return 'close';
      if (pctGap <= 0.45) return 'off';
      if (pctGap <= 0.70) return 'way_off';
      return 'unusable';
    });
    const vCounts = {};
    for (const v of verdicts) vCounts[v] = (vCounts[v] || 0) + 1;
    console.log('\nVerdict distribution:', vCounts);

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
