// Customizable Metrics Configuration

export type MetricAggregation = 'avg' | 'max' | 'min' | 'median' | 'sum' | 'rate';
export type MetricCategory = 'overall' | 'auto' | 'teleop' | 'endgame' | 'fuel' | 'quality' | 'reliability';

export interface MetricColumn {
  id: string;
  label: string;
  field: string; // Field from RealTeamStatistics (or TeamStatistics in mock mode)
  aggregation: MetricAggregation;
  format: 'number' | 'percentage' | 'time';
  decimals: number;
  enabled: boolean;
  description?: string;
  category: MetricCategory;
}

export interface MetricsConfig {
  columns: MetricColumn[];
  lastUpdated: string;
}

// All available metrics from RealTeamStatistics, organized by category
export const DEFAULT_METRICS: MetricColumn[] = [
  // ========== OVERALL ==========
  {
    id: 'avgTotalPoints',
    label: 'Avg Points',
    field: 'avgTotalPoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: true,
    description: 'Average estimated total points per match',
    category: 'overall',
  },
  {
    id: 'maxTotalPoints',
    label: 'Max Points',
    field: 'maxTotalPoints',
    aggregation: 'max',
    format: 'number',
    decimals: 0,
    enabled: false,
    description: 'Maximum estimated total points in a single match',
    category: 'overall',
  },
  {
    id: 'avgAutoPoints',
    label: 'Avg Auto Pts',
    field: 'avgAutoPoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: true,
    description: 'Average autonomous points (fuel + auto climb)',
    category: 'overall',
  },
  {
    id: 'avgTeleopPoints',
    label: 'Avg Teleop Pts',
    field: 'avgTeleopPoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: true,
    description: 'Average teleop points',
    category: 'overall',
  },
  {
    id: 'avgEndgamePoints',
    label: 'Avg Endgame Pts',
    field: 'avgEndgamePoints',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average endgame climb points',
    category: 'overall',
  },

  // ========== FUEL SCORING ==========
  {
    id: 'avgTotalFuelEstimate',
    label: 'Avg Total Fuel',
    field: 'avgTotalFuelEstimate',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: true,
    description: 'Average estimated total fuel scored per match',
    category: 'fuel',
  },
  {
    id: 'avgAutoFuelEstimate',
    label: 'Avg Auto Fuel',
    field: 'avgAutoFuelEstimate',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average estimated auto fuel (FUEL_SCORE + bonus buckets)',
    category: 'fuel',
  },
  {
    id: 'avgTeleopFuelEstimate',
    label: 'Avg Teleop Fuel',
    field: 'avgTeleopFuelEstimate',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average estimated teleop fuel (FUEL_SCORE + bonus buckets)',
    category: 'fuel',
  },
  {
    id: 'maxTotalFuelEstimate',
    label: 'Max Total Fuel',
    field: 'maxTotalFuelEstimate',
    aggregation: 'max',
    format: 'number',
    decimals: 0,
    enabled: false,
    description: 'Maximum estimated total fuel in a single match',
    category: 'fuel',
  },
  {
    id: 'avgAutoFuelScore',
    label: 'Avg Auto Raw',
    field: 'avgAutoFuelScore',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average raw FUEL_SCORE count in auto (before bonus buckets)',
    category: 'fuel',
  },
  {
    id: 'avgTeleopFuelScore',
    label: 'Avg Teleop Raw',
    field: 'avgTeleopFuelScore',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average raw FUEL_SCORE count in teleop (before bonus buckets)',
    category: 'fuel',
  },
  {
    id: 'avgTotalPass',
    label: 'Avg Passes',
    field: 'avgTotalPass',
    aggregation: 'avg',
    format: 'number',
    decimals: 1,
    enabled: false,
    description: 'Average fuel passes per match (auto + teleop)',
    category: 'fuel',
  },
  {
    id: 'passerRatio',
    label: 'Passer Ratio',
    field: 'passerRatio',
    aggregation: 'avg',
    format: 'number',
    decimals: 2,
    enabled: false,
    description: 'Ratio of passes to total activity (0 = pure scorer, 1 = pure passer)',
    category: 'fuel',
  },

  // ========== AUTONOMOUS ==========
  {
    id: 'autoClimbRate',
    label: 'Auto Climb %',
    field: 'autoClimbRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: true,
    description: 'Percentage of matches with successful auto climb',
    category: 'auto',
  },
  {
    id: 'autoDidNothingRate',
    label: 'Auto Did Nothing %',
    field: 'autoDidNothingRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches where robot did nothing in auto',
    category: 'auto',
  },

  // ========== ENDGAME ==========
  {
    id: 'level3ClimbRate',
    label: 'L3 Climb %',
    field: 'level3ClimbRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: true,
    description: 'Percentage of matches with Level 3 climb',
    category: 'endgame',
  },
  {
    id: 'level2ClimbRate',
    label: 'L2 Climb %',
    field: 'level2ClimbRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches with Level 2 climb',
    category: 'endgame',
  },
  {
    id: 'level1ClimbRate',
    label: 'L1 Climb %',
    field: 'level1ClimbRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches with Level 1 climb',
    category: 'endgame',
  },
  {
    id: 'climbNoneRate',
    label: 'No Climb %',
    field: 'climbNoneRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches with no climb',
    category: 'endgame',
  },
  {
    id: 'climbFailedRate',
    label: 'Climb Failed %',
    field: 'climbFailedRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches where climb was attempted but failed',
    category: 'endgame',
  },

  // ========== QUALITY ==========
  {
    id: 'dedicatedPasserRate',
    label: 'Ded. Passer %',
    field: 'dedicatedPasserRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches marked as dedicated passer',
    category: 'quality',
  },
  {
    id: 'bulldozedFuelRate',
    label: 'Bulldozed %',
    field: 'bulldozedFuelRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches where robot bulldozed fuel',
    category: 'quality',
  },
  {
    id: 'poorAccuracyRate',
    label: 'Poor Accuracy %',
    field: 'poorAccuracyRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches flagged for poor fuel scoring accuracy',
    category: 'quality',
  },

  // ========== RELIABILITY ==========
  {
    id: 'lostConnectionRate',
    label: 'Lost Conn %',
    field: 'lostConnectionRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches with lost connection',
    category: 'reliability',
  },
  {
    id: 'noRobotRate',
    label: 'No Robot %',
    field: 'noRobotRate',
    aggregation: 'rate',
    format: 'percentage',
    decimals: 0,
    enabled: false,
    description: 'Percentage of matches with no robot on field',
    category: 'reliability',
  },
];

// Category labels for display
export const CATEGORY_LABELS: Record<MetricCategory, string> = {
  overall: 'Overall Scoring',
  auto: 'Autonomous',
  teleop: 'Teleop',
  endgame: 'Endgame & Climbing',
  fuel: 'Fuel Scoring',
  quality: 'Quality Flags',
  reliability: 'Reliability',
};
