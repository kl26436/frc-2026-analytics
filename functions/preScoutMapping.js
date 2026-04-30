/**
 * Shared row-mapping logic for pre-scout CSV imports.
 *
 * Used by:
 *   - importPreScoutData Cloud Function (functions/index.js)
 *   - scripts/importPreScout.ts CLI backup
 *
 * One source of truth so Cloud Function and CLI can't drift.
 *
 * Column mapping is documented in PRESCOUT_NEWTON_PLAN.md.
 *
 * Bucket strategy override (see plan discussion 2026-04-29):
 *   2026 scoring is 1 ball = 1 point with no multipliers. SCORE_PLUS_N
 *   buttons are scout quantity-shortcut buttons, not point multipliers.
 *   Pre-scout has hand-counted ball totals, so we route the count straight
 *   into SCORE_PLUS_1 — estimateMatchFuel() then returns the correct point
 *   total without any downstream changes.
 */

const TRUE_VALUES = new Set(['TRUE', 'true', 'True', '1', 'yes', 'Yes']);

function toBool(v) {
  if (v === undefined || v === null) return false;
  return TRUE_VALUES.has(String(v).trim());
}

function toInt(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Map a single CSV row to a ScoutEntry-shaped object.
 *
 * @param {Record<string, string>} row Raw CSV row keyed by header name.
 * @returns {{ entry: object, skip: boolean, reason?: string }}
 */
function mapRow(row) {
  const teamNum = parseInt(row['Team #'], 10);
  const matchNum = parseInt(row.match_number, 10);
  const eventKey = (row.event_key || '').trim();
  const scoutName = (row['Scout Name'] || '').trim();
  const autonFuelRaw = row.auton_FUEL_SCORE_score;
  const teleopFuelRaw = row.teleop_FUEL_SCORE_score;

  if (Number.isNaN(teamNum) || Number.isNaN(matchNum) || !eventKey) {
    return { skip: true, reason: 'missing team/match/event key' };
  }

  // Empty template: no scouter, no fuel scored at all
  if (!scoutName && !autonFuelRaw && !teleopFuelRaw) {
    return { skip: true, reason: 'empty template row' };
  }

  // Auton start zone: "Zone 1" → set _1 = 1
  const zoneMatch = (row.prematch_AUTON_START_ZONE || '').match(/Zone\s*(\d)/i);
  const zoneNum = zoneMatch ? parseInt(zoneMatch[1], 10) : 0;

  // Match key: prefer the .vbf column, fall back to qm{matchNum}
  const vbf = (row['.vbf'] || '').trim();
  const matchKey = vbf
    ? `${eventKey}_${vbf}`
    : `${eventKey}_qm${matchNum}`;

  const autonFuelScore = toInt(autonFuelRaw);
  const teleopFuelScore = toInt(teleopFuelRaw);

  const id = `${eventKey}_${matchNum}_${teamNum}`;

  const notesRaw = (row.notes || '').trim();
  const notes = notesRaw ? `[PRE-SCOUT] ${notesRaw}` : '[PRE-SCOUT]';

  const entry = {
    id,

    // Metadata
    scouter_id: scoutName || 'pre-scout',
    team_number: teamNum,
    year: row.year || '2026',
    event_key: eventKey,
    match_number: matchNum,
    match_key: matchKey,
    configured_team: '',
    notes,
    _source: 'pre-scout',

    // Auton start zones
    prematch_AUTON_START_ZONE_1: zoneNum === 1 ? 1 : 0,
    prematch_AUTON_START_ZONE_2: zoneNum === 2 ? 1 : 0,
    prematch_AUTON_START_ZONE_3: zoneNum === 3 ? 1 : 0,
    prematch_AUTON_START_ZONE_4: zoneNum === 4 ? 1 : 0,
    prematch_AUTON_START_ZONE_5: zoneNum === 5 ? 1 : 0,
    prematch_AUTON_START_ZONE_6: zoneNum === 6 ? 1 : 0,

    // Fuel — hand-counted ball totals.
    // 1 ball = 1 point: route straight into SCORE_PLUS_1 so estimateMatchFuel()
    // returns the correct point count. FUEL_SCORE preserved as a scoring-signal
    // flag (used by fuelAttribution.hasSummaryScoring).
    auton_FUEL_SCORE: autonFuelScore,
    auton_FUEL_PASS: toInt(row.auton_FUEL_PASS_score),
    teleop_FUEL_SCORE: teleopFuelScore,
    teleop_FUEL_PASS: toInt(row.teleop_FUEL_PASS_score),

    auton_SCORE_PLUS_1: autonFuelScore,
    auton_SCORE_PLUS_2: 0,
    auton_SCORE_PLUS_3: 0,
    auton_SCORE_PLUS_5: 0,
    auton_SCORE_PLUS_10: 0,
    auton_SCORE_PLUS_20: 0,

    teleop_SCORE_PLUS_1: teleopFuelScore,
    teleop_SCORE_PLUS_2: 0,
    teleop_SCORE_PLUS_3: 0,
    teleop_SCORE_PLUS_5: 0,
    teleop_SCORE_PLUS_10: 0,
    teleop_SCORE_PLUS_20: 0,

    // Climb
    auton_AUTON_CLIMBED: row.auton_AUTON_CLIMBED === 'Yes' ? 1 : 0,
    climb_level: row.climb_level || '1. None',

    // Booleans
    auton_did_nothing: toBool(row.auton_did_nothing),
    teleop_climb_failed: toBool(row.teleop_climb_failed),
    eff_rep_bulldozed_fuel: toBool(row.eff_rep_bulldozed_fuel),
    played_defense: toBool(row['Defended during match?']),
    poor_fuel_scoring_accuracy: toBool(row.poor_fuel_scoring_accuracy),
    no_robot_on_field: toBool(row.no_robot_on_field),
    lost_connection: toBool(row.lost_connection),

    // Defaults — fields not present in pre-scout sheet
    second_review: false,
    dedicated_passer: false,
    auton_went_to_neutral: false,
    relative_driver_performance: '',
  };

  return { entry, skip: false };
}

/**
 * Parse the entire CSV body into entries plus a per-origin-event summary.
 *
 * @param {string} csvText
 * @param {object} Papa papaparse module (passed in to keep this file dependency-free)
 * @returns {{ entries: object[], skipped: number, originEvents: Record<string, {entries:number, teams:number}> }}
 */
function parseCsv(csvText, Papa) {
  const { data: rows, errors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors && errors.length > 0) {
    console.warn('CSV parse warnings:', errors.slice(0, 5));
  }

  const entries = [];
  let skipped = 0;

  for (const row of rows) {
    const { entry, skip } = mapRow(row);
    if (skip) {
      skipped++;
      continue;
    }
    entries.push(entry);
  }

  // Origin-event breakdown — counts and unique team sets
  const originAcc = {};
  for (const e of entries) {
    if (!originAcc[e.event_key]) {
      originAcc[e.event_key] = { entries: 0, teamSet: new Set() };
    }
    originAcc[e.event_key].entries++;
    originAcc[e.event_key].teamSet.add(e.team_number);
  }
  const originEvents = Object.fromEntries(
    Object.entries(originAcc).map(([k, v]) => [
      k,
      { entries: v.entries, teams: v.teamSet.size },
    ])
  );

  return { entries, skipped, originEvents };
}

module.exports = { mapRow, parseCsv };
