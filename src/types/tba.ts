// The Blue Alliance API Types

export interface TBATeam {
  key: string; // e.g., "frc148"
  team_number: number;
  nickname: string;
  name: string;
  city: string;
  state_prov: string;
  country: string;
  rookie_year: number;
}

export interface TBAEventTeam {
  key: string;
  team_number: number;
  nickname: string;
}

export interface TBAEventRanking {
  team_key: string; // e.g., "frc148"
  rank: number;
  record: {
    wins: number;
    losses: number;
    ties: number;
  };
  qual_average: number | null;
  matches_played: number;
  dq: number;
  sort_orders: number[];
  extra_stats?: number[];
}

export interface TBAEventRankings {
  rankings: TBAEventRanking[];
  sort_order_info: {
    precision: number;
    name: string;
  }[];
  extra_stats_info?: {
    precision: number;
    name: string;
  }[];
}

export interface TBAMatch {
  key: string;
  comp_level: 'qm' | 'ef' | 'qf' | 'sf' | 'f';
  set_number: number;
  match_number: number;
  alliances: {
    red: {
      team_keys: string[];
      score: number;
    };
    blue: {
      team_keys: string[];
      score: number;
    };
  };
  time: number;
  predicted_time: number;
  actual_time: number;
  videos: {
    type: string;
    key: string;
  }[];
}

export interface TBAEvent {
  key: string;
  name: string;
  event_code: string;
  event_type: number;
  start_date: string;
  end_date: string;
  year: number;
  city: string;
  state_prov: string;
  country: string;
  week: number;
}

// Alliance selection data
export interface TBAAlliance {
  name: string; // e.g., "Alliance 1"
  picks: string[]; // Team keys in pick order, e.g., ["frc148", "frc254", "frc1678"]
  declines?: string[]; // Teams that declined this alliance
  backup?: {
    in: string;
    out: string;
  };
  status?: {
    playoff_average: number;
    level: string;
    record: {
      wins: number;
      losses: number;
      ties: number;
    };
    current_level_record: {
      wins: number;
      losses: number;
      ties: number;
    };
    status: string;
  };
}

// All TBA data for an event
export interface TBAEventData {
  event: TBAEvent | null;
  teams: TBAEventTeam[];
  matches: TBAMatch[];
  rankings: TBAEventRankings | null;
  alliances: TBAAlliance[];
  lastUpdated: string | null;
}
