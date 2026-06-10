export interface ApiFootballFixtureTeam {
  id: number;
  name: string;
  logo?: string | null;
  winner?: boolean | null;
}

export interface ApiFootballScorePair {
  home: number | null;
  away: number | null;
}

export interface ApiFootballFixture {
  fixture: {
    id: number;
    referee?: string | null;
    timezone?: string;
    date: string;
    timestamp: number;
    venue?: {
      id?: number | null;
      name?: string | null;
      city?: string | null;
    } | null;
    status: {
      long: string;
      short: string;
      elapsed: number | null;
      extra?: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    season: number;
    round: string;
  };
  teams: {
    home: ApiFootballFixtureTeam;
    away: ApiFootballFixtureTeam;
  };
  goals: ApiFootballScorePair;
  score: {
    halftime: ApiFootballScorePair;
    fulltime: ApiFootballScorePair;
    extratime: ApiFootballScorePair;
    penalty: ApiFootballScorePair;
  };
}

export interface ApiFootballEnvelope<T> {
  get: string;
  parameters: Record<string, string>;
  errors: unknown[] | Record<string, unknown>;
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

export interface ApiFootballQuota {
  dailyRemaining: number | null;
  minuteRemaining: number | null;
}

export interface ApiFootballResponse<T> {
  data: ApiFootballEnvelope<T>;
  quota: ApiFootballQuota;
}
