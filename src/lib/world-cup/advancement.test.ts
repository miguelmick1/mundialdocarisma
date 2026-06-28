import { describe, expect, it } from "vitest";
import { isUnresolvedTeamId, resolveQualifiedTeamId } from "./advancement";

describe("world cup advancement", () => {
  const match = { homeTeamId: "BRA", awayTeamId: "ARG" };

  it("infers the qualified team from a non-tied result", () => {
    expect(resolveQualifiedTeamId(match, { home: 2, away: 1 })).toBe("BRA");
    expect(resolveQualifiedTeamId(match, { home: 0, away: 3 })).toBe("ARG");
  });

  it("requires an explicit qualified team after a draw", () => {
    expect(() => resolveQualifiedTeamId(match, { home: 1, away: 1 })).toThrow("QUALIFIED_TEAM_REQUIRED");
    expect(resolveQualifiedTeamId(match, { home: 1, away: 1 }, "ARG")).toBe("ARG");
  });

  it("rejects teams that are not in the match", () => {
    expect(() => resolveQualifiedTeamId(match, { home: 1, away: 1 }, "FRA")).toThrow("INVALID_QUALIFIED_TEAM");
  });

  it("detects unresolved winner and placement placeholders", () => {
    expect(isUnresolvedTeamId("W73")).toBe(true);
    expect(isUnresolvedTeamId("1A")).toBe(true);
    expect(isUnresolvedTeamId("3A/B/C")).toBe(true);
    expect(isUnresolvedTeamId("BRA")).toBe(false);
  });
});
