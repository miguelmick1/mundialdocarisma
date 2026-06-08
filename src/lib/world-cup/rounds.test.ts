import { describe, expect, it } from "vitest";
import {
  carismaRoundIdForMatch,
  matchBelongsToCarismaRound,
  roundLabel
} from "@/lib/world-cup/rounds";

describe("rodadas do Time Carisma", () => {
  it("mapeia as três rodadas da fase de grupos", () => {
    expect(carismaRoundIdForMatch("GROUP_STAGE", 1)).toBe("GROUP_1");
    expect(carismaRoundIdForMatch("GROUP_STAGE", 2)).toBe("GROUP_2");
    expect(carismaRoundIdForMatch("GROUP_STAGE", 3)).toBe("GROUP_3");
  });

  it("mantém as fases eliminatórias", () => {
    expect(carismaRoundIdForMatch("ROUND_OF_16", null)).toBe("ROUND_OF_16");
    expect(carismaRoundIdForMatch("FINAL", null)).toBe("FINAL");
  });

  it("identifica a rodada correta de uma partida", () => {
    expect(matchBelongsToCarismaRound({ phase: "GROUP_STAGE", groupRound: 2 }, "GROUP_2")).toBe(true);
    expect(matchBelongsToCarismaRound({ phase: "GROUP_STAGE", groupRound: 2 }, "GROUP_1")).toBe(false);
  });

  it("exibe rótulos executivos", () => {
    expect(roundLabel("GROUP_1")).toBe("Fase de grupos · Rodada 1");
    expect(roundLabel("ROUND_OF_32")).toBe("16-avos de final");
  });
});
