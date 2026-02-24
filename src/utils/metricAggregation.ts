import type { RealScoutEntry, RealTeamStatistics } from '../types/scoutingReal';
import type { MetricColumn, MetricAggregation, MetricCategory } from '../types/metrics';
import { estimateMatchFuel, estimateMatchPoints, parseClimbLevel } from '../types/scoutingReal';

// ── Raw Metric Extractors ─────────────────────────────────────────────────
// Each extractor pulls a single number from one RealScoutEntry (one match).

type Extractor = (entry: RealScoutEntry) => number;

const RAW_METRICS: Record<string, Extractor> = {
  // Fuel estimates (computed from SCORE_PLUS formula)
  autoFuelEstimate: (e) => estimateMatchFuel(e).auto,
  teleopFuelEstimate: (e) => estimateMatchFuel(e).teleop,
  totalFuelEstimate: (e) => estimateMatchFuel(e).total,

  // Points estimates
  autoPoints: (e) => estimateMatchPoints(e).autoPoints,
  teleopPoints: (e) => estimateMatchPoints(e).teleopPoints,
  endgamePoints: (e) => estimateMatchPoints(e).endgamePoints,
  totalPoints: (e) => estimateMatchPoints(e).total,

  // Raw fuel counts (before bonus buckets)
  autoFuelScore: (e) => e.auton_FUEL_SCORE,
  teleopFuelScore: (e) => e.teleop_FUEL_SCORE,

  // Passes
  autoFuelPass: (e) => e.auton_FUEL_PASS,
  teleopFuelPass: (e) => e.teleop_FUEL_PASS,
  totalPass: (e) => e.auton_FUEL_PASS + e.teleop_FUEL_PASS,

  // Bonus buckets
  autoPlus1: (e) => e.auton_SCORE_PLUS_1,
  autoPlus2: (e) => e.auton_SCORE_PLUS_2,
  autoPlus3: (e) => e.auton_SCORE_PLUS_3,
  autoPlus5: (e) => e.auton_SCORE_PLUS_5,
  autoPlus10: (e) => e.auton_SCORE_PLUS_10,
  teleopPlus1: (e) => e.teleop_SCORE_PLUS_1,
  teleopPlus2: (e) => e.teleop_SCORE_PLUS_2,
  teleopPlus3: (e) => e.teleop_SCORE_PLUS_3,
  teleopPlus5: (e) => e.teleop_SCORE_PLUS_5,
  teleopPlus10: (e) => e.teleop_SCORE_PLUS_10,

  // Climb (numeric level 0-3)
  climbLevel: (e) => parseClimbLevel(e.climb_level),
};

// ── Options for the UI dropdown ───────────────────────────────────────────

export interface RawMetricOption {
  id: string;
  label: string;
  category: MetricCategory;
}

export const RAW_METRIC_OPTIONS: RawMetricOption[] = [
  // Points
  { id: 'totalPoints', label: 'Total Points', category: 'overall' },
  { id: 'autoPoints', label: 'Auto Points', category: 'overall' },
  { id: 'teleopPoints', label: 'Teleop Points', category: 'overall' },
  { id: 'endgamePoints', label: 'Endgame Points', category: 'overall' },
  // Fuel
  { id: 'totalFuelEstimate', label: 'Total Fuel Estimate', category: 'fuel' },
  { id: 'autoFuelEstimate', label: 'Auto Fuel Estimate', category: 'fuel' },
  { id: 'teleopFuelEstimate', label: 'Teleop Fuel Estimate', category: 'fuel' },
  { id: 'autoFuelScore', label: 'Auto Raw FUEL_SCORE', category: 'fuel' },
  { id: 'teleopFuelScore', label: 'Teleop Raw FUEL_SCORE', category: 'fuel' },
  { id: 'totalPass', label: 'Total Passes', category: 'fuel' },
  { id: 'autoFuelPass', label: 'Auto Passes', category: 'fuel' },
  { id: 'teleopFuelPass', label: 'Teleop Passes', category: 'fuel' },
  // Bonus buckets
  { id: 'autoPlus1', label: 'Auto +1 Buckets', category: 'fuel' },
  { id: 'autoPlus2', label: 'Auto +2 Buckets', category: 'fuel' },
  { id: 'autoPlus3', label: 'Auto +3 Buckets', category: 'fuel' },
  { id: 'autoPlus5', label: 'Auto +5 Buckets', category: 'fuel' },
  { id: 'autoPlus10', label: 'Auto +10 Buckets', category: 'fuel' },
  { id: 'teleopPlus1', label: 'Teleop +1 Buckets', category: 'fuel' },
  { id: 'teleopPlus2', label: 'Teleop +2 Buckets', category: 'fuel' },
  { id: 'teleopPlus3', label: 'Teleop +3 Buckets', category: 'fuel' },
  { id: 'teleopPlus5', label: 'Teleop +5 Buckets', category: 'fuel' },
  { id: 'teleopPlus10', label: 'Teleop +10 Buckets', category: 'fuel' },
  // Endgame
  { id: 'climbLevel', label: 'Climb Level (0-3)', category: 'endgame' },
];

// ── Aggregation Functions ─────────────────────────────────────────────────

export function aggregate(values: number[], method: MetricAggregation): number {
  if (values.length === 0) return 0;

  switch (method) {
    case 'avg':
      return values.reduce((s, v) => s + v, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    case 'sum':
      return values.reduce((s, v) => s + v, 0);
    case 'rate':
      // rate = percentage of non-zero values
      return values.length > 0
        ? (values.filter(v => v > 0).length / values.length) * 100
        : 0;
    default:
      return values.reduce((s, v) => s + v, 0) / values.length;
  }
}

// ── Compute a metric for a specific team ──────────────────────────────────

export function computeMetric(
  allEntries: RealScoutEntry[],
  teamNumber: number,
  rawMetricId: string,
  aggregation: MetricAggregation
): number {
  const extractor = RAW_METRICS[rawMetricId];
  if (!extractor) return 0;

  const teamEntries = allEntries.filter(e => e.team_number === teamNumber);
  if (teamEntries.length === 0) return 0;

  const values = teamEntries.map(extractor);
  return aggregate(values, aggregation);
}

// ── Get metric value (handles both pre-computed and on-the-fly) ───────────

export function getMetricValue(
  column: MetricColumn,
  team: RealTeamStatistics,
  allEntries: RealScoutEntry[]
): number {
  // Dynamic metric — compute from raw entries
  if (column.rawMetric) {
    return computeMetric(allEntries, team.teamNumber, column.rawMetric, column.aggregation);
  }
  // Pre-computed metric — read from stats object
  return (team as unknown as Record<string, number>)[column.field] || 0;
}
