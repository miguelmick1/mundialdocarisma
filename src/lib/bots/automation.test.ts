import { describe, expect, it } from "vitest";
import { resolvePangareFavoriteSide } from "@/lib/bots/favorite";

describe("automação dos bots", () => {
  it("usa o time do pote mais forte como favorito do Pangaré", () => {
    const result = resolvePangareFavoriteSide({
      matchId: "m1",
      secret: "x".repeat(40),
      match: {},
      homeTeam: { carismaPot: 1 },
      awayTeam: { carismaPot: 3 },
    });
    expect(result.side).toBe("HOME");
    expect(result.method).toBe("CARISMA_POT");
  });

  it("mantém o desempate do favorito determinístico", () => {
    const input = {
      matchId: "m2",
      secret: "y".repeat(40),
      match: {},
      homeTeam: { carismaPot: 2 },
      awayTeam: { carismaPot: 2 },
    };
    expect(resolvePangareFavoriteSide(input)).toEqual(resolvePangareFavoriteSide(input));
  });

  it("respeita uma configuração explícita da partida", () => {
    const result = resolvePangareFavoriteSide({
      matchId: "m3",
      secret: "z".repeat(40),
      match: { pangareFavoriteSide: "AWAY" },
      homeTeam: { carismaPot: 1 },
      awayTeam: { carismaPot: 3 },
    });
    expect(result.side).toBe("AWAY");
    expect(result.method).toBe("EXPLICIT_MATCH_CONFIG");
  });
});
