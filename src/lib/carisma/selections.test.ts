import { describe, expect, it } from "vitest";
import { buildCarismaSelectionIndex } from "./selections";

describe("carisma group selection index", () => {
  it("mirrors GROUP_1 across all three group rounds", () => {
    const index = buildCarismaSelectionIndex([
      { roundId: "GROUP_1", participantId: "p1", teamId: "BRA", teamName: "Brasil" },
    ]);
    expect(index.byRoundParticipant.get("GROUP_2:p1")?.teamId).toBe("BRA");
    expect(index.byRoundParticipant.get("GROUP_3:p1")?.teamId).toBe("BRA");
  });

  it("supports legacy choices that only exist in a later group round", () => {
    const index = buildCarismaSelectionIndex([
      { roundId: "GROUP_2", participantId: "p1", teamId: "ARG" },
    ]);
    expect(index.byRoundParticipant.get("GROUP_1:p1")?.teamId).toBe("ARG");
    expect(index.canonicalGroupByParticipant.get("p1")?.teamId).toBe("ARG");
  });

  it("prefers GROUP_1 when legacy rows disagree", () => {
    const index = buildCarismaSelectionIndex([
      { roundId: "GROUP_1", participantId: "p1", teamId: "BRA" },
      { roundId: "GROUP_2", participantId: "p1", teamId: "FRA" },
    ]);
    expect(index.byRoundParticipant.get("GROUP_2:p1")?.teamId).toBe("BRA");
  });
});
