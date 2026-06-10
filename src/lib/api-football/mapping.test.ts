import { describe, expect, it } from "vitest";
import { apiRoundPhase, fixtureLinkScore, normalizeTeamName } from "./mapping";
import type { ApiFootballFixture } from "./types";

function fixture(overrides: Partial<ApiFootballFixture> = {}): ApiFootballFixture {
  return {
    fixture: {
      id: 123,
      date: "2026-06-11T16:00:00-03:00",
      timestamp: 0,
      status: { long: "Not Started", short: "NS", elapsed: null },
    },
    league: { id: 1, name: "World Cup", season: 2026, round: "Group Stage - 1" },
    teams: {
      home: { id: 1, name: "Mexico" },
      away: { id: 2, name: "South Africa" },
    },
    goals: { home: null, away: null },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
    ...overrides,
  };
}

describe("API-Football fixture mapping", () => {
  it("normalizes Portuguese aliases", () => {
    expect(normalizeTeamName("Tchéquia")).toBe("czech republic");
    expect(normalizeTeamName("Coreia do Sul")).toBe("south korea");
  });

  it("maps round labels to internal phases", () => {
    expect(apiRoundPhase("Group Stage - 2")).toBe("GROUP_STAGE");
    expect(apiRoundPhase("Round of 32")).toBe("ROUND_OF_32");
    expect(apiRoundPhase("Semi-finals")).toBe("SEMI_FINAL");
  });

  it("strongly matches same kickoff and teams", () => {
    const score = fixtureLinkScore({
      id: "m1",
      phase: "GROUP_STAGE",
      kickoffAt: new Date("2026-06-11T16:00:00-03:00"),
      homeTeamName: "México",
      awayTeamName: "África do Sul",
    }, fixture());
    expect(score).toBeGreaterThanOrEqual(190);
  });
});
