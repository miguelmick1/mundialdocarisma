import { describe, expect, it } from "vitest";
import { calculateBaseScore } from "@/lib/scoring/base";
import { calculateScoreWithCarisma } from "@/lib/scoring/carisma";
import { bestOfWildcard } from "@/lib/scoring/wildcard";


describe("pontuação-base", () => {
  it("dá 5 para placar exato", () => {
    expect(calculateBaseScore({home:2,away:1},{home:2,away:1}).total).toBe(5);
  });

  it("dá 4 para vencedor e saldo exato", () => {
    expect(calculateBaseScore({home:3,away:1},{home:2,away:0}).total).toBe(4);
  });

  it("dá 3 para empate correto com placar diferente", () => {
    expect(calculateBaseScore({home:1,away:1},{home:2,away:2}).total).toBe(3);
  });

  it("duplica a base e soma bônus real do carisma", () => {
    const result=calculateScoreWithCarisma({guess:{home:2,away:0},actual:{home:3,away:1},homeTeamId:"BRA",awayTeamId:"FRA",carismaTeamId:"BRA"});
    expect(result.total).toBe(11); // 4*2 + 3
  });

  it("Wild Card usa o melhor e não soma", () => {
    expect(bestOfWildcard([{total:5,components:[]},{total:3,components:[]}]).total).toBe(5);
  });
});
