// Customizable Metrics Configuration

export type MetricAggregation = 'avg' | 'max' | 'min' | 'median' | 'sum' | 'rate';

export interface MetricColumn {
  id: string;
  label: string;
  field: string; // Field from TeamStatistics
  aggregation: MetricAggregation;
  format: 'number' | 'percentage' | 'time';
  decimals: number;
  enabled: boolean;
  description?: string;
}

export interface MetricsConfig {
  columns: MetricColumn[];
  lastUpdated: string;
}

// Default metrics configuration
export const DEFAULT_METRICS: MetricColumn[] = [
  {
    id: 'avgTotalPoints',
    label: 'Avg Points',
    field: 'avgTotalPoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: true,
    description: 'Average total points per match',
  },
  {
    id: 'avgAutoPoints',
    label: 'Auto Pts',
    field: 'avgAutoPoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: true,
    description: 'Average autonomous points',
  },
  {
    id: 'avgTeleopPoints',
    label: 'Teleop Pts',
    field: 'avgTeleopPoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: true,
    description: 'Average teleop points',
  },
  {
    id: 'level3ClimbRate',
    label: 'L3 Climb %',
    field: 'level3ClimbRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: true,
    description: 'Percentage of matches with Level 3 climb',
  },
  {
    id: 'autoAccuracy',
    label: 'Auto Acc',
    field: 'autoAccuracy',
    aggregation: 'avg',
    format: 'percentage',
    decimals: 0,
    enabled: true,
    description: 'Auto shooting accuracy',
  },
  {
    id: 'teleopAccuracy',
    label: 'Teleop Acc',
    field: 'teleopAccuracy',
    aggregation: 'avg',
    format: 'percentage',
    decimals: 0,
    enabled: true,
    description: 'Teleop shooting accuracy',
  },
  {
    id: 'avgCycleCount',
    label: 'Cycles',
    field: 'avgCycleCount',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average cycles per match',
  },
  {
    id: 'avgEndgamePoints',
    label: 'Endgame Pts',
    field: 'avgEndgamePoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average endgame points',
  },
  {
    id: 'avgClimbTime',
    label: 'Climb Time',
    field: 'avgClimbTime',
    aggregation: 'avg',
    format: 'time',
    decimals: 1,
    enabled: false,
    description: 'Average climb time in seconds',
  },
  {
    id: 'diedRate',
    label: 'Died %',
    field: 'diedRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches robot died',
  },
  {
    id: 'avgDriverSkill',
    label: 'Driver Skill',
    field: 'avgDriverSkill',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average driver skill rating (1-5)',
  },
];
