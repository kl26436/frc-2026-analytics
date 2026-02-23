/**
 * Firebase Cloud Functions for FRC 2026 Analytics
 *
 * - syncScoutData: Callable function — triggered from Admin UI "Sync Now" button
 * - scheduledSync: Scheduled function — runs every 15 minutes when auto-sync is enabled
 *
 * Postgres credentials are stored as Firebase secrets:
 *   firebase functions:secrets:set PG_HOST
 *   firebase functions:secrets:set PG_PASSWORD
 *
 * Deploy:
 *   firebase deploy --only functions
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Client } = require("pg");

initializeApp();
const db = getFirestore();

// ── Secrets ────────────────────────────────────────────────────────────────
const PG_HOST = defineSecret("PG_HOST");
const PG_PASSWORD = defineSecret("PG_PASSWORD");

const PG_PORT = 5432;
const PG_DATABASE = "2025_148";
const PG_USER = "grafana_user";

const BATCH_SIZE = 500;

// ── Postgres Queries ────────────────────────────────────────────────────────

function getPgConfig() {
  return {
    host: PG_HOST.value(),
    port: PG_PORT,
    database: PG_DATABASE,
    user: PG_USER,
    password: PG_PASSWORD.value(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  };
}

async function fetchScoutData(client, eventKey) {
  const result = await client.query(
    `SELECT * FROM public.summary_2026
     WHERE event_key = $1
       AND match_key NOT LIKE 'configuredEvent_pm%'
     ORDER BY match_number, configured_team`,
    [eventKey]
  );
  return result.rows;
}

async function fetchTBAMatches(client, eventKey) {
  const tableName = `${eventKey}_matches`;
  try {
    const result = await client.query(
      `SELECT DISTINCT ON ("tba.key")
        "tba.key" as match_key,
        "tba.event_key" as event_key,
        "tba.comp_level" as comp_level,
        "tba.match_number" as match_number,
        "tba.set_number" as set_number,
        "tba.winning_alliance" as winning_alliance,
        "tba.actual_time" as actual_time,
        "tba.alliances.red.score" as red_score,
        "tba.alliances.blue.score" as blue_score,
        "tba.red.1" as red_1, "tba.red.2" as red_2, "tba.red.3" as red_3,
        "tba.blue.1" as blue_1, "tba.blue.2" as blue_2, "tba.blue.3" as blue_3,
        "tba.score_breakdown.red.totalAutoPoints" as "red_totalAutoPoints",
        "tba.score_breakdown.red.totalTeleopPoints" as "red_totalTeleopPoints",
        "tba.score_breakdown.red.totalPoints" as "red_totalPoints",
        "tba.score_breakdown.red.foulPoints" as "red_foulPoints",
        "tba.score_breakdown.red.majorFoulCount" as "red_majorFoulCount",
        "tba.score_breakdown.red.minorFoulCount" as "red_minorFoulCount",
        "tba.score_breakdown.red.rp" as "red_rp",
        "tba.score_breakdown.red.energizedAchieved" as "red_energizedAchieved",
        "tba.score_breakdown.red.superchargedAchieved" as "red_superchargedAchieved",
        "tba.score_breakdown.red.traversalAchieved" as "red_traversalAchieved",
        "tba.score_breakdown.red.endGameTowerRobot1" as "red_endGameTowerRobot1",
        "tba.score_breakdown.red.endGameTowerRobot2" as "red_endGameTowerRobot2",
        "tba.score_breakdown.red.endGameTowerRobot3" as "red_endGameTowerRobot3",
        "tba.score_breakdown.red.autoTowerRobot1" as "red_autoTowerRobot1",
        "tba.score_breakdown.red.autoTowerRobot2" as "red_autoTowerRobot2",
        "tba.score_breakdown.red.autoTowerRobot3" as "red_autoTowerRobot3",
        "tba.score_breakdown.red.autoTowerPoints" as "red_autoTowerPoints",
        "tba.score_breakdown.red.endGameTowerPoints" as "red_endGameTowerPoints",
        "tba.score_breakdown.red.totalTowerPoints" as "red_totalTowerPoints",
        "tba.score_breakdown.red.hubScore.autoCount" as "red_hub_autoCount",
        "tba.score_breakdown.red.hubScore.autoPoints" as "red_hub_autoPoints",
        "tba.score_breakdown.red.hubScore.teleopCount" as "red_hub_teleopCount",
        "tba.score_breakdown.red.hubScore.teleopPoints" as "red_hub_teleopPoints",
        "tba.score_breakdown.red.hubScore.endgameCount" as "red_hub_endgameCount",
        "tba.score_breakdown.red.hubScore.endgamePoints" as "red_hub_endgamePoints",
        "tba.score_breakdown.red.hubScore.shift1Count" as "red_hub_shift1Count",
        "tba.score_breakdown.red.hubScore.shift1Points" as "red_hub_shift1Points",
        "tba.score_breakdown.red.hubScore.shift2Count" as "red_hub_shift2Count",
        "tba.score_breakdown.red.hubScore.shift2Points" as "red_hub_shift2Points",
        "tba.score_breakdown.red.hubScore.shift3Count" as "red_hub_shift3Count",
        "tba.score_breakdown.red.hubScore.shift3Points" as "red_hub_shift3Points",
        "tba.score_breakdown.red.hubScore.shift4Count" as "red_hub_shift4Count",
        "tba.score_breakdown.red.hubScore.shift4Points" as "red_hub_shift4Points",
        "tba.score_breakdown.red.hubScore.transitionCount" as "red_hub_transitionCount",
        "tba.score_breakdown.red.hubScore.transitionPoints" as "red_hub_transitionPoints",
        "tba.score_breakdown.red.hubScore.totalCount" as "red_hub_totalCount",
        "tba.score_breakdown.red.hubScore.totalPoints" as "red_hub_totalPoints",
        "tba.score_breakdown.red.hubScore.uncounted" as "red_hub_uncounted",
        "tba.score_breakdown.blue.totalAutoPoints" as "blue_totalAutoPoints",
        "tba.score_breakdown.blue.totalTeleopPoints" as "blue_totalTeleopPoints",
        "tba.score_breakdown.blue.totalPoints" as "blue_totalPoints",
        "tba.score_breakdown.blue.foulPoints" as "blue_foulPoints",
        "tba.score_breakdown.blue.majorFoulCount" as "blue_majorFoulCount",
        "tba.score_breakdown.blue.minorFoulCount" as "blue_minorFoulCount",
        "tba.score_breakdown.blue.rp" as "blue_rp",
        "tba.score_breakdown.blue.energizedAchieved" as "blue_energizedAchieved",
        "tba.score_breakdown.blue.superchargedAchieved" as "blue_superchargedAchieved",
        "tba.score_breakdown.blue.traversalAchieved" as "blue_traversalAchieved",
        "tba.score_breakdown.blue.endGameTowerRobot1" as "blue_endGameTowerRobot1",
        "tba.score_breakdown.blue.endGameTowerRobot2" as "blue_endGameTowerRobot2",
        "tba.score_breakdown.blue.endGameTowerRobot3" as "blue_endGameTowerRobot3",
        "tba.score_breakdown.blue.autoTowerRobot1" as "blue_autoTowerRobot1",
        "tba.score_breakdown.blue.autoTowerRobot2" as "blue_autoTowerRobot2",
        "tba.score_breakdown.blue.autoTowerRobot3" as "blue_autoTowerRobot3",
        "tba.score_breakdown.blue.autoTowerPoints" as "blue_autoTowerPoints",
        "tba.score_breakdown.blue.endGameTowerPoints" as "blue_endGameTowerPoints",
        "tba.score_breakdown.blue.totalTowerPoints" as "blue_totalTowerPoints",
        "tba.score_breakdown.blue.hubScore.autoCount" as "blue_hub_autoCount",
        "tba.score_breakdown.blue.hubScore.autoPoints" as "blue_hub_autoPoints",
        "tba.score_breakdown.blue.hubScore.teleopCount" as "blue_hub_teleopCount",
        "tba.score_breakdown.blue.hubScore.teleopPoints" as "blue_hub_teleopPoints",
        "tba.score_breakdown.blue.hubScore.endgameCount" as "blue_hub_endgameCount",
        "tba.score_breakdown.blue.hubScore.endgamePoints" as "blue_hub_endgamePoints",
        "tba.score_breakdown.blue.hubScore.shift1Count" as "blue_hub_shift1Count",
        "tba.score_breakdown.blue.hubScore.shift1Points" as "blue_hub_shift1Points",
        "tba.score_breakdown.blue.hubScore.shift2Count" as "blue_hub_shift2Count",
        "tba.score_breakdown.blue.hubScore.shift2Points" as "blue_hub_shift2Points",
        "tba.score_breakdown.blue.hubScore.shift3Count" as "blue_hub_shift3Count",
        "tba.score_breakdown.blue.hubScore.shift3Points" as "blue_hub_shift3Points",
        "tba.score_breakdown.blue.hubScore.shift4Count" as "blue_hub_shift4Count",
        "tba.score_breakdown.blue.hubScore.shift4Points" as "blue_hub_shift4Points",
        "tba.score_breakdown.blue.hubScore.transitionCount" as "blue_hub_transitionCount",
        "tba.score_breakdown.blue.hubScore.transitionPoints" as "blue_hub_transitionPoints",
        "tba.score_breakdown.blue.hubScore.totalCount" as "blue_hub_totalCount",
        "tba.score_breakdown.blue.hubScore.totalPoints" as "blue_hub_totalPoints",
        "tba.score_breakdown.blue.hubScore.uncounted" as "blue_hub_uncounted"
      FROM tba."${tableName}"
      ORDER BY "tba.key"`
    );
    return result.rows;
  } catch (err) {
    if (err.message && err.message.includes("does not exist")) return [];
    throw err;
  }
}

async function fetchTBARankings(client, eventKey) {
  const tableName = `${eventKey}_rankings`;
  try {
    const result = await client.query(
      `SELECT
        "tba.team_key" as team_key,
        "tba.rank" as rank,
        "tba.matches_played" as matches_played,
        "tba.record.wins" as wins,
        "tba.record.losses" as losses,
        "tba.record.ties" as ties,
        "tba.sort_orders" as sort_orders,
        "tba.extra_stats" as extra_stats,
        "tba.dq" as dq
      FROM tba."${tableName}"
      ORDER BY "tba.rank"`
    );
    return result.rows;
  } catch (err) {
    if (err.message && err.message.includes("does not exist")) return [];
    throw err;
  }
}

// ── Transform Functions ─────────────────────────────────────────────────────

function coalesceNum(val) {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function coalesceBool(val) {
  if (val === null || val === undefined) return false;
  return !!val;
}

function transformScoutRow(row) {
  const matchNum = coalesceNum(row.match_number);
  const teamNum = coalesceNum(row.team_number);
  return {
    id: `${matchNum}_${teamNum}`,
    match_number: matchNum,
    team_number: teamNum,
    year: row.year || "2026",
    configured_team: row.configured_team || "",
    event_key: row.event_key || "",
    match_key: row.match_key || "",
    scouter_id: row.scouter_id || "",
    lost_connection: coalesceBool(row.lost_connection),
    no_robot_on_field: coalesceBool(row.no_robot_on_field),
    second_review: coalesceBool(row.second_review),
    dedicated_passer: coalesceBool(row.dedicated_passer),
    teleop_climb_failed: coalesceBool(row.teleop_climb_failed),
    prematch_AUTON_START_ZONE_1: coalesceNum(row.prematch_AUTON_START_ZONE_1),
    prematch_AUTON_START_ZONE_2: coalesceNum(row.prematch_AUTON_START_ZONE_2),
    prematch_AUTON_START_ZONE_3: coalesceNum(row.prematch_AUTON_START_ZONE_3),
    prematch_AUTON_START_ZONE_4: coalesceNum(row.prematch_AUTON_START_ZONE_4),
    prematch_AUTON_START_ZONE_5: coalesceNum(row.prematch_AUTON_START_ZONE_5),
    prematch_AUTON_START_ZONE_6: coalesceNum(row.prematch_AUTON_START_ZONE_6),
    auton_FUEL_SCORE: coalesceNum(row.auton_FUEL_SCORE),
    auton_FUEL_PASS: coalesceNum(row.auton_FUEL_PASS),
    auton_AUTON_CLIMBED: coalesceNum(row.auton_AUTON_CLIMBED),
    auton_SCORE_PLUS_1: coalesceNum(row.auton_SCORE_PLUS_1),
    auton_SCORE_PLUS_2: coalesceNum(row.auton_SCORE_PLUS_2),
    auton_SCORE_PLUS_3: coalesceNum(row.auton_SCORE_PLUS_3),
    auton_SCORE_PLUS_5: coalesceNum(row.auton_SCORE_PLUS_5),
    auton_SCORE_PLUS_10: coalesceNum(row.auton_SCORE_PLUS_10),
    auton_did_nothing: coalesceBool(row.auton_did_nothing),
    teleop_FUEL_SCORE: coalesceNum(row.teleop_FUEL_SCORE),
    teleop_FUEL_PASS: coalesceNum(row.teleop_FUEL_PASS),
    teleop_SCORE_PLUS_1: coalesceNum(row.teleop_SCORE_PLUS_1),
    teleop_SCORE_PLUS_2: coalesceNum(row.teleop_SCORE_PLUS_2),
    teleop_SCORE_PLUS_3: coalesceNum(row.teleop_SCORE_PLUS_3),
    teleop_SCORE_PLUS_5: coalesceNum(row.teleop_SCORE_PLUS_5),
    teleop_SCORE_PLUS_10: coalesceNum(row.teleop_SCORE_PLUS_10),
    climb_level: row.climb_level || "1. None",
    eff_rep_bulldozed_fuel: coalesceBool(row.eff_rep_bulldozed_fuel),
    poor_fuel_scoring_accuracy: coalesceBool(row.poor_fuel_scoring_accuracy),
    relative_driver_performance: row.relative_driver_performance || "",
    notes: row.notes || "",
  };
}

function buildHubScore(row, prefix) {
  return {
    autoCount: coalesceNum(row[`${prefix}_hub_autoCount`]),
    autoPoints: coalesceNum(row[`${prefix}_hub_autoPoints`]),
    teleopCount: coalesceNum(row[`${prefix}_hub_teleopCount`]),
    teleopPoints: coalesceNum(row[`${prefix}_hub_teleopPoints`]),
    endgameCount: coalesceNum(row[`${prefix}_hub_endgameCount`]),
    endgamePoints: coalesceNum(row[`${prefix}_hub_endgamePoints`]),
    shift1Count: coalesceNum(row[`${prefix}_hub_shift1Count`]),
    shift1Points: coalesceNum(row[`${prefix}_hub_shift1Points`]),
    shift2Count: coalesceNum(row[`${prefix}_hub_shift2Count`]),
    shift2Points: coalesceNum(row[`${prefix}_hub_shift2Points`]),
    shift3Count: coalesceNum(row[`${prefix}_hub_shift3Count`]),
    shift3Points: coalesceNum(row[`${prefix}_hub_shift3Points`]),
    shift4Count: coalesceNum(row[`${prefix}_hub_shift4Count`]),
    shift4Points: coalesceNum(row[`${prefix}_hub_shift4Points`]),
    transitionCount: coalesceNum(row[`${prefix}_hub_transitionCount`]),
    transitionPoints: coalesceNum(row[`${prefix}_hub_transitionPoints`]),
    totalCount: coalesceNum(row[`${prefix}_hub_totalCount`]),
    totalPoints: coalesceNum(row[`${prefix}_hub_totalPoints`]),
    uncounted: coalesceNum(row[`${prefix}_hub_uncounted`]),
  };
}

function transformTBAMatch(row) {
  return {
    match_key: row.match_key,
    event_key: row.event_key,
    comp_level: row.comp_level,
    match_number: coalesceNum(row.match_number),
    set_number: coalesceNum(row.set_number),
    winning_alliance: row.winning_alliance || "",
    actual_time: row.actual_time ? coalesceNum(row.actual_time) : null,
    red_teams: [row.red_1, row.red_2, row.red_3],
    blue_teams: [row.blue_1, row.blue_2, row.blue_3],
    red_score: coalesceNum(row.red_score),
    blue_score: coalesceNum(row.blue_score),
    red_totalAutoPoints: coalesceNum(row.red_totalAutoPoints),
    red_totalTeleopPoints: coalesceNum(row.red_totalTeleopPoints),
    red_totalPoints: coalesceNum(row.red_totalPoints),
    red_foulPoints: coalesceNum(row.red_foulPoints),
    red_majorFoulCount: coalesceNum(row.red_majorFoulCount),
    red_minorFoulCount: coalesceNum(row.red_minorFoulCount),
    red_rp: coalesceNum(row.red_rp),
    red_energizedAchieved: coalesceBool(row.red_energizedAchieved),
    red_superchargedAchieved: coalesceBool(row.red_superchargedAchieved),
    red_traversalAchieved: coalesceBool(row.red_traversalAchieved),
    red_hubScore: buildHubScore(row, "red"),
    red_endGameTowerRobot1: row.red_endGameTowerRobot1 || "None",
    red_endGameTowerRobot2: row.red_endGameTowerRobot2 || "None",
    red_endGameTowerRobot3: row.red_endGameTowerRobot3 || "None",
    red_autoTowerRobot1: row.red_autoTowerRobot1 || "None",
    red_autoTowerRobot2: row.red_autoTowerRobot2 || "None",
    red_autoTowerRobot3: row.red_autoTowerRobot3 || "None",
    red_autoTowerPoints: coalesceNum(row.red_autoTowerPoints),
    red_endGameTowerPoints: coalesceNum(row.red_endGameTowerPoints),
    red_totalTowerPoints: coalesceNum(row.red_totalTowerPoints),
    blue_totalAutoPoints: coalesceNum(row.blue_totalAutoPoints),
    blue_totalTeleopPoints: coalesceNum(row.blue_totalTeleopPoints),
    blue_totalPoints: coalesceNum(row.blue_totalPoints),
    blue_foulPoints: coalesceNum(row.blue_foulPoints),
    blue_majorFoulCount: coalesceNum(row.blue_majorFoulCount),
    blue_minorFoulCount: coalesceNum(row.blue_minorFoulCount),
    blue_rp: coalesceNum(row.blue_rp),
    blue_energizedAchieved: coalesceBool(row.blue_energizedAchieved),
    blue_superchargedAchieved: coalesceBool(row.blue_superchargedAchieved),
    blue_traversalAchieved: coalesceBool(row.blue_traversalAchieved),
    blue_hubScore: buildHubScore(row, "blue"),
    blue_endGameTowerRobot1: row.blue_endGameTowerRobot1 || "None",
    blue_endGameTowerRobot2: row.blue_endGameTowerRobot2 || "None",
    blue_endGameTowerRobot3: row.blue_endGameTowerRobot3 || "None",
    blue_autoTowerRobot1: row.blue_autoTowerRobot1 || "None",
    blue_autoTowerRobot2: row.blue_autoTowerRobot2 || "None",
    blue_autoTowerRobot3: row.blue_autoTowerRobot3 || "None",
    blue_autoTowerPoints: coalesceNum(row.blue_autoTowerPoints),
    blue_endGameTowerPoints: coalesceNum(row.blue_endGameTowerPoints),
    blue_totalTowerPoints: coalesceNum(row.blue_totalTowerPoints),
  };
}

function transformRanking(row) {
  return {
    team_key: row.team_key,
    rank: coalesceNum(row.rank),
    matches_played: coalesceNum(row.matches_played),
    wins: coalesceNum(row.wins),
    losses: coalesceNum(row.losses),
    ties: coalesceNum(row.ties),
    sort_orders: row.sort_orders || "",
    extra_stats: row.extra_stats || "",
    dq: coalesceNum(row.dq),
  };
}

// ── Firestore Batch Write ───────────────────────────────────────────────────

async function batchWrite(collectionPath, docs, idField) {
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) {
      const docId = typeof idField === "function" ? idField(doc) : doc[idField];
      const ref = db.doc(`${collectionPath}/${docId}`);
      batch.set(ref, doc);
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

// ── Core Sync Logic ─────────────────────────────────────────────────────────

async function performSync(eventKey, triggeredBy) {
  const startTime = Date.now();

  const pgClient = new Client(getPgConfig());
  try {
    await pgClient.connect();

    // Fetch from Postgres
    const scoutRows = await fetchScoutData(pgClient, eventKey);
    const tbaRows = await fetchTBAMatches(pgClient, eventKey);
    const rankingRows = await fetchTBARankings(pgClient, eventKey);

    // Transform
    const scoutEntries = scoutRows.map(transformScoutRow);
    const tbaMatches = tbaRows.map(transformTBAMatch);
    const rankings = rankingRows.map(transformRanking);

    // Write to Firestore
    const scoutWritten = await batchWrite(
      `scoutData/${eventKey}/entries`, scoutEntries, "id"
    );
    const matchesWritten = await batchWrite(
      `tbaData/${eventKey}/matches`, tbaMatches, "match_key"
    );
    const rankingsWritten = await batchWrite(
      `tbaData/${eventKey}/rankings`, rankings, "team_key"
    );

    // Update sync metadata
    const durationMs = Date.now() - startTime;
    const syncMeta = {
      lastSyncAt: new Date().toISOString(),
      lastSyncBy: triggeredBy,
      scoutEntriesCount: scoutWritten,
      tbaMatchesCount: matchesWritten,
      tbaRankingsCount: rankingsWritten,
      eventKey,
      syncDurationMs: durationMs,
    };
    await db.doc("config/syncMeta").set(syncMeta);

    return syncMeta;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMeta = {
      lastSyncAt: new Date().toISOString(),
      lastSyncBy: triggeredBy,
      scoutEntriesCount: 0,
      tbaMatchesCount: 0,
      tbaRankingsCount: 0,
      eventKey,
      syncDurationMs: durationMs,
      error: err.message,
    };
    await db.doc("config/syncMeta").set(errorMeta);
    throw err;
  } finally {
    await pgClient.end();
  }
}

// ── Callable Function: syncScoutData ────────────────────────────────────────

exports.syncScoutData = onCall(
  {
    secrets: [PG_HOST, PG_PASSWORD],
    timeoutSeconds: 120,
    memory: "256MiB",
    region: "us-central1",
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to sync data.");
    }

    const { eventKey } = request.data;
    if (!eventKey || typeof eventKey !== "string") {
      throw new HttpsError("invalid-argument", "eventKey is required.");
    }

    try {
      const result = await performSync(eventKey, request.auth.token.email || "callable");
      return result;
    } catch (err) {
      throw new HttpsError("internal", `Sync failed: ${err.message}`);
    }
  }
);

// ── Scheduled Function: scheduledSync ───────────────────────────────────────

exports.scheduledSync = onSchedule(
  {
    schedule: "every 15 minutes",
    secrets: [PG_HOST, PG_PASSWORD],
    timeoutSeconds: 120,
    memory: "256MiB",
    region: "us-central1",
  },
  async () => {
    // Read config to check if auto-sync is enabled
    const configDoc = await db.doc("config/eventConfig").get();
    if (!configDoc.exists) {
      console.log("No eventConfig found, skipping scheduled sync.");
      return;
    }

    const config = configDoc.data();
    if (!config.autoSyncEnabled) {
      console.log("Auto-sync is disabled, skipping.");
      return;
    }

    const eventKey = config.eventCode;
    if (!eventKey) {
      console.log("No eventCode in config, skipping.");
      return;
    }

    console.log(`Running scheduled sync for event: ${eventKey}`);
    const result = await performSync(eventKey, "scheduled");
    console.log(`Scheduled sync complete: ${result.scoutEntriesCount} entries, ${result.tbaMatchesCount} matches in ${result.syncDurationMs}ms`);
  }
);
