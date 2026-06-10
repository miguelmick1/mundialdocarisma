import { getServerEnv } from "@/lib/env";
import type {
  ApiFootballEnvelope,
  ApiFootballFixture,
  ApiFootballResponse,
} from "@/lib/api-football/types";

const BASE_URL = "https://v3.football.api-sports.io";
export const WORLD_CUP_LEAGUE_ID = 1;
export const WORLD_CUP_SEASON = 2026;

function numericHeader(headers: Headers, names: string[]): number | null {
  for (const name of names) {
    const raw = headers.get(name);
    if (raw != null && raw !== "") {
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

function apiErrorMessage(errors: ApiFootballEnvelope<unknown>["errors"]): string | null {
  if (Array.isArray(errors)) return errors.length ? JSON.stringify(errors) : null;
  const values = Object.values(errors ?? {}).filter(Boolean);
  return values.length ? values.map(String).join("; ") : null;
}

export async function apiFootballGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<ApiFootballResponse<T>> {
  const env = getServerEnv();
  if (!env.API_FOOTBALL_KEY) throw new Error("API_FOOTBALL_NOT_CONFIGURED");

  const url = new URL(path, BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-apisports-key": env.API_FOOTBALL_KEY,
    },
    cache: "no-store",
  });

  const raw = await response.text();
  let data: ApiFootballEnvelope<T>;
  try {
    data = JSON.parse(raw) as ApiFootballEnvelope<T>;
  } catch {
    throw new Error(`API_FOOTBALL_INVALID_RESPONSE:${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`API_FOOTBALL_HTTP_${response.status}:${raw.slice(0, 240)}`);
  }
  const apiError = apiErrorMessage(data.errors);
  if (apiError) throw new Error(`API_FOOTBALL_ERROR:${apiError}`);

  return {
    data,
    quota: {
      dailyRemaining: numericHeader(response.headers, [
        "x-ratelimit-requests-remaining",
        "x-ratelimit-remaining",
      ]),
      minuteRemaining: numericHeader(response.headers, [
        "x-ratelimit-remaining",
        "x-ratelimit-requests-remaining-minute",
      ]),
    },
  };
}

export async function fetchWorldCupFixtures() {
  return apiFootballGet<ApiFootballFixture>("/fixtures", {
    league: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON,
    timezone: "America/Sao_Paulo",
  });
}

function isoDateInSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function fetchWorldCupFixtureWindow(now = new Date()) {
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return apiFootballGet<ApiFootballFixture>("/fixtures", {
    league: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON,
    from: isoDateInSaoPaulo(from),
    to: isoDateInSaoPaulo(to),
    timezone: "America/Sao_Paulo",
  });
}
