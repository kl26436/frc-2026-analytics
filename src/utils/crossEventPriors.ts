import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ScoutEntry, RobotActions, PgTBAMatch } from '../types/scouting';
import { computeMatchFuelAttribution, DEFAULT_BETA } from './fuelAttribution';

// ── Types ────────────────────────────────────────────────────────────────────

/** Per-team accumulated priors from prior events. */
export interface TeamPrior {
  totalShots: number;
  totalScored: number;
  matchCount: number;
}

export type CrossEventPriors = Map<number, TeamPrior>;

// ── Fetch Prior Event Data ──────────────────────────────────────────────────

/**
 * Fetch all scout entries, actions, and TBA matches for a single event.
 * Uses one-shot getDocs() (not real-time) since prior events are static.
 */
async function fetchEventData(eventKey: string): Promise<{
  entries: ScoutEntry[];
  actions: RobotActions[];
  matches: PgTBAMatch[];
}> {
  const [entriesSnap, actionsSnap, matchesSnap] = await Promise.all([
    getDocs(collection(db, 'scoutData', eventKey, 'entries')),
    getDocs(collection(db, 'scoutActions', eventKey, 'actions')),
    getDocs(collection(db, 'tbaData', eventKey, 'matches')),
  ]);

  const entries: ScoutEntry[] = entriesSnap.docs.map(d => {
    const raw = d.data();
    return {
      ...raw,
      id: d.id,
      auton_SCORE_PLUS_1: raw.auton_SCORE_PLUS_1 || 0,
      auton_SCORE_PLUS_2: raw.auton_SCORE_PLUS_2 || 0,
      auton_SCORE_PLUS_3: raw.auton_SCORE_PLUS_3 || 0,
      auton_SCORE_PLUS_5: raw.auton_SCORE_PLUS_5 || 0,
      auton_SCORE_PLUS_10: raw.auton_SCORE_PLUS_10 || 0,
      auton_SCORE_PLUS_20: raw.auton_SCORE_PLUS_20 || 0,
      teleop_SCORE_PLUS_1: raw.teleop_SCORE_PLUS_1 || 0,
      teleop_SCORE_PLUS_2: raw.teleop_SCORE_PLUS_2 || 0,
      teleop_SCORE_PLUS_3: raw.teleop_SCORE_PLUS_3 || 0,
      teleop_SCORE_PLUS_5: raw.teleop_SCORE_PLUS_5 || 0,
      teleop_SCORE_PLUS_10: raw.teleop_SCORE_PLUS_10 || 0,
      teleop_SCORE_PLUS_20: raw.teleop_SCORE_PLUS_20 || 0,
    } as ScoutEntry;
  });

  const actions = actionsSnap.docs.map(d => d.data()) as RobotActions[];
  const matches = matchesSnap.docs.map(d => d.data()) as PgTBAMatch[];

  return { entries, actions, matches };
}

// ── Build Cross-Event Priors ────────────────────────────────────────────────

/**
 * Load data from prior events and compute per-team accuracy priors.
 *
 * For each prior event:
 *   1. Fetch entries, actions, TBA matches from Firestore (one-shot)
 *   2. Run computeMatchFuelAttribution() with linear β=1.0
 *   3. Accumulate per-team {shots, scored, matchCount}
 *
 * Returns a Map<teamNumber, TeamPrior> that can be passed to
 * reattributeWithBayesian() as initial priors.
 */
export async function buildCrossEventPriors(
  priorEventKeys: string[],
): Promise<CrossEventPriors> {
  const priors: CrossEventPriors = new Map();

  for (const eventKey of priorEventKeys) {
    try {
      const { entries, actions, matches } = await fetchEventData(eventKey);

      if (entries.length === 0 || matches.length === 0) continue;

      // Run attribution with linear (β=1.0) to get per-robot scored estimates
      const attribution = computeMatchFuelAttribution(
        entries, actions, matches, DEFAULT_BETA,
      );

      // Accumulate per-team priors
      for (const row of attribution) {
        if (row.isZeroWeight) continue; // skip no-shows and bulldozed-only

        const existing = priors.get(row.teamNumber) ?? {
          totalShots: 0,
          totalScored: 0,
          matchCount: 0,
        };

        existing.totalShots += row.shots;
        existing.totalScored += row.shotsScored;
        existing.matchCount += 1;

        priors.set(row.teamNumber, existing);
      }
    } catch (err) {
      // Prior event may not exist or be inaccessible — skip gracefully
      console.warn(`[crossEventPriors] Failed to load ${eventKey}:`, err);
    }
  }

  return priors;
}

/**
 * Convert CrossEventPriors to accuracy values for use in bayesianAttribution().
 * Returns null for teams with insufficient data (< minShots).
 */
export function priorsToAccuracy(
  priors: CrossEventPriors,
  teamNumber: number,
  minShots: number = 10,
): number | null {
  const p = priors.get(teamNumber);
  if (!p || p.totalShots < minShots) return null;
  return p.totalScored / p.totalShots;
}
