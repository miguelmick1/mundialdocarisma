import { describe, expect, it } from "vitest";
import { resolveConfirmedMatchActualScore } from "@/lib/scoring/confirmed-match-score";

describe("recalculate confirmed match scores", () => {
  it("prefers the 90-minute score when 120-minute fields are null", () => {
    expect(resolveConfirmedMatchActualScore({
      homeScore90: 2,
      awayScore90: 1,
      homeScore120: null,
      awayScore120: null,
    })).toEqual({ home: 2, away: 1 });
  });

  it("keeps extra-time scores when they are present", () => {
    expect(resolveConfirmedMatchActualScore({
      homeScore90: 1,
      awayScore90: 1,
      homeScore120: 2,
      awayScore120: 1,
    })).toEqual({ home: 2, away: 1 });
  });

  it("does not silently turn null scores into zero", () => {
    expect(resolveConfirmedMatchActualScore({
      homeScore90: null,
      awayScore90: null,
      homeScore120: null,
      awayScore120: null,
    })).toEqual({ home: null, away: null });
  });
});
