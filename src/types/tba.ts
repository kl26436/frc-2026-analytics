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
  wins: number;
  losses: number;
  ties: number;
  qual_average: number | null;
  matches_played: number;
  dq: number;
  sort_orders: number[];
}

export interface TBAEventRankings {
  rankings: TBAEventRanking[];
  sort_order_info: {
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
