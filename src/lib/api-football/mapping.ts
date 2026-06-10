import type { ApiFootballFixture } from "@/lib/api-football/types";

export type LocalMatchForLink = {
  id: string;
  matchNumber?: number | null;
  phase?: string | null;
  kickoffAt: Date;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  teamsResolved?: boolean;
  apiFootballFixtureId?: number | null;
};

const ALIASES: Record<string, string> = {
  usa: "united states",
  "united states of america": "united states",
  "africa do sul": "south africa",
  "coreia do sul": "south korea",
  "korea republic": "south korea",
  tchequia: "czech republic",
  "czechia": "czech republic",
  "costa do marfim": "ivory coast",
  "cote divoire": "ivory coast",
  "arabia saudita": "saudi arabia",
  "paises baixos": "netherlands",
  "rd congo": "dr congo",
  "democratic republic of the congo": "dr congo",
};

export function normalizeTeamName(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ALIASES[normalized] ?? normalized;
}

export function apiRoundPhase(round: string): string | null {
  const value = round.toLowerCase();
  if (value.includes("group")) return "GROUP_STAGE";
  if (value.includes("round of 32") || value.includes("1/16")) return "ROUND_OF_32";
  if (value.includes("round of 16") || value.includes("1/8")) return "ROUND_OF_16";
  if (value.includes("quarter")) return "QUARTER_FINAL";
  if (value.includes("semi")) return "SEMI_FINAL";
  if (value.includes("third") || value.includes("3rd")) return "THIRD_PLACE";
  if (value === "final" || value.endsWith(" - final")) return "FINAL";
  return null;
}

function teamPairScore(local: LocalMatchForLink, fixture: ApiFootballFixture): number {
  const localHome = normalizeTeamName(local.homeTeamName ?? local.homeTeamId);
  const localAway = normalizeTeamName(local.awayTeamName ?? local.awayTeamId);
  const apiHome = normalizeTeamName(fixture.teams.home.name);
  const apiAway = normalizeTeamName(fixture.teams.away.name);
  if (localHome && localAway && localHome === apiHome && localAway === apiAway) return 90;
  if (localHome && localAway && localHome === apiAway && localAway === apiHome) return 35;
  let score = 0;
  if (localHome && (localHome === apiHome || localHome === apiAway)) score += 25;
  if (localAway && (localAway === apiHome || localAway === apiAway)) score += 25;
  return score;
}

export function fixtureLinkScore(local: LocalMatchForLink, fixture: ApiFootballFixture): number {
  const diffMinutes = Math.abs(local.kickoffAt.getTime() - new Date(fixture.fixture.date).getTime()) / 60000;
  let score = 0;
  if (diffMinutes <= 2) score += 80;
  else if (diffMinutes <= 15) score += 65;
  else if (diffMinutes <= 60) score += 35;
  else if (diffMinutes <= 180) score += 10;
  else return -1;

  score += teamPairScore(local, fixture);
  const apiPhase = apiRoundPhase(fixture.league.round);
  if (apiPhase && apiPhase === local.phase) score += 20;
  if (fixture.league.id === 1 && fixture.league.season === 2026) score += 5;
  return score;
}

export function linkFixturesToLocalMatches(
  locals: LocalMatchForLink[],
  fixtures: ApiFootballFixture[],
): Map<string, ApiFootballFixture> {
  const result = new Map<string, ApiFootballFixture>();
  const usedFixtureIds = new Set<number>();

  for (const local of locals) {
    if (!local.apiFootballFixtureId) continue;
    const exact = fixtures.find((fixture) => fixture.fixture.id === local.apiFootballFixtureId);
    if (exact) {
      result.set(local.id, exact);
      usedFixtureIds.add(exact.fixture.id);
    }
  }

  const candidates = locals
    .filter((local) => !result.has(local.id))
    .flatMap((local) => fixtures
      .filter((fixture) => !usedFixtureIds.has(fixture.fixture.id))
      .map((fixture) => ({ local, fixture, score: fixtureLinkScore(local, fixture) })))
    .filter((candidate) => candidate.score >= 75)
    .sort((a, b) => b.score - a.score);

  const usedLocalIds = new Set(result.keys());
  for (const candidate of candidates) {
    if (usedLocalIds.has(candidate.local.id) || usedFixtureIds.has(candidate.fixture.fixture.id)) continue;
    result.set(candidate.local.id, candidate.fixture);
    usedLocalIds.add(candidate.local.id);
    usedFixtureIds.add(candidate.fixture.fixture.id);
  }

  return result;
}
