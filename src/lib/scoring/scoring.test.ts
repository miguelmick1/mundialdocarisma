import { describe, expect, it } from "vitest";
import { calculateBaseScore } from "@/lib/scoring/base";
import { calculateScoreWithCarisma } from "@/lib/scoring/carisma";
import { calculateMatchScores } from "@/lib/scoring/match";
import { bestOfWildcard } from "@/lib/scoring/wildcard";

describe("pontuação básica", () => {
  it("multiplica o placar exato pelo total de gols", () => {
    expect(calculateBaseScore({ home: 2, away: 1 }, { home: 2, away: 1 }).total).toBe(15);
    expect(calculateBaseScore({ home: 3, away: 2 }, { home: 3, away: 2 }).total).toBe(25);
  });

  it("dá 10 pontos para o placar exato de 0 a 0", () => {
    expect(calculateBaseScore({ home: 0, away: 0 }, { home: 0, away: 0 }).total).toBe(10);
  });

  it("dá 4 para vencedor e diferença de gols corretos", () => {
    expect(calculateBaseScore({ home: 3, away: 1 }, { home: 2, away: 0 }).total).toBe(4);
  });

  it("dá 4 para empate correto com placar diferente", () => {
    expect(calculateBaseScore({ home: 1, away: 1 }, { home: 2, away: 2 }).total).toBe(4);
  });

  it("dá 3 para apenas o vencedor correto", () => {
    expect(calculateBaseScore({ home: 1, away: 0 }, { home: 3, away: 1 }).total).toBe(3);
  });
});

describe("Time Carisma", () => {
  it("dobra somente a pontuação básica", () => {
    const result = calculateScoreWithCarisma({
      guess: { home: 2, away: 0 },
      actual: { home: 3, away: 1 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      carismaTeamId: "BRA"
    });
    expect(result.total).toBe(8);
    expect(result.components.map((component) => component.code)).toEqual([
      "BASE_GOAL_DIFFERENCE",
      "CARISMA_MULTIPLIER"
    ]);
  });
});

describe("bônus de acerto sozinho", () => {
  const context = {
    actual: { home: 2, away: 1 },
    homeTeamId: "BRA",
    awayTeamId: "FRA"
  };

  it("dá 30 quando o mesmo humano é o único a pontuar e o único a acertar o placar", () => {
    const rows = calculateMatchScores({
      ...context,
      guesses: [
        { participantId: "h1", slot: 1, source: "HUMAN", guess: { home: 2, away: 1 }, carismaTeamId: "BRA" },
        { participantId: "h2", slot: 1, source: "HUMAN", guess: { home: 0, away: 1 } },
        { participantId: "bot", slot: 1, source: "BOT_AUTOMATIC", guess: { home: 2, away: 1 } }
      ]
    });
    const human = rows.find((row) => row.participantId === "h1")!;
    expect(human.result.total).toBe(60); // 15 básicos × 2 do Carisma + 30 sem duplicação
    expect(human.result.components.at(-1)?.code).toBe("BONUS_SOLO_TOTAL");
    expect(rows.find((row) => row.participantId === "bot")?.result.total).toBe(15);
  });

  it("dá 15 quando é o único humano a acertar o placar, mas outros humanos pontuam", () => {
    const rows = calculateMatchScores({
      ...context,
      guesses: [
        { participantId: "h1", slot: 1, source: "HUMAN", guess: { home: 2, away: 1 } },
        { participantId: "h2", slot: 1, source: "HUMAN", guess: { home: 3, away: 2 } }
      ]
    });
    expect(rows[0]?.result.total).toBe(30);
    expect(rows[0]?.result.components.at(-1)?.code).toBe("BONUS_SOLO_PARTIAL");
    expect(rows[1]?.result.total).toBe(4);
  });

  it("dá 15 quando é o único humano a pontuar sem acertar o placar", () => {
    const rows = calculateMatchScores({
      ...context,
      guesses: [
        { participantId: "h1", slot: 1, source: "HUMAN", guess: { home: 3, away: 2 } },
        { participantId: "h2", slot: 1, source: "HUMAN", guess: { home: 0, away: 1 } }
      ]
    });
    expect(rows[0]?.result.total).toBe(19);
    expect(rows[0]?.result.components.at(-1)?.code).toBe("BONUS_SOLO_PARTIAL");
  });

  it("concede bônus ao bot exato quando nenhum humano acerta o placar exato", () => {
    const rows = calculateMatchScores({
      ...context,
      guesses: [
        { participantId: "h1", slot: 1, source: "HUMAN", guess: { home: 1, away: 0 } },
        { participantId: "bot", slot: 1, source: "BOT_AUTOMATIC", guess: { home: 2, away: 1 } }
      ]
    });
    expect(rows[0]?.result.total).toBe(19); // 4 + 15
    expect(rows[1]?.result.total).toBe(45);
    expect(rows[1]?.result.components.at(-1)?.code).toBe("BONUS_SOLO_TOTAL");
  });

  it("não concede bônus ao bot exato quando um humano é o único humano com placar exato", () => {
    const rows = calculateMatchScores({
      ...context,
      guesses: [
        { participantId: "h1", slot: 1, source: "HUMAN", guess: { home: 2, away: 1 } },
        { participantId: "bot", slot: 1, source: "BOT_AUTOMATIC", guess: { home: 2, away: 1 } }
      ]
    });
    expect(rows.find((row) => row.participantId === "h1")?.result.components.at(-1)?.code).toBe("BONUS_SOLO_TOTAL");
    expect(rows.find((row) => row.participantId === "bot")?.result.total).toBe(15);
    expect(rows.find((row) => row.participantId === "bot")?.result.components.some((component) => component.code.startsWith("BONUS_SOLO"))).toBe(false);
  });

  it("concede bônus a todos os bots com placar exato quando não existe humano exato sozinho", () => {
    const rows = calculateMatchScores({
      ...context,
      guesses: [
        { participantId: "h1", slot: 1, source: "HUMAN", guess: { home: 0, away: 1 } },
        { participantId: "bot-automatico", slot: 1, source: "BOT_AUTOMATIC", guess: { home: 2, away: 1 } },
        { participantId: "bot-manual", slot: 1, source: "ADMIN_OVERRIDE", guess: { home: 2, away: 1 } }
      ]
    });
    expect(rows.find((row) => row.participantId === "bot-automatico")?.result.total).toBe(45);
    expect(rows.find((row) => row.participantId === "bot-manual")?.result.total).toBe(45);
  });

  it("mantém correções administrativas de humanos elegíveis ao bônus quando gravadas como HUMAN", () => {
    const rows = calculateMatchScores({
      ...context,
      guesses: [
        { participantId: "humano-corrigido", slot: 1, source: "HUMAN", guess: { home: 2, away: 1 } },
        { participantId: "outro-humano", slot: 1, source: "HUMAN", guess: { home: 0, away: 1 } },
      ],
    });
    expect(rows[0]?.result.components.at(-1)?.code).toBe("BONUS_SOLO_TOTAL");
  });
});

describe("Wild Card", () => {
  it("usa o melhor palpite e não soma", () => {
    expect(bestOfWildcard([{ total: 15, components: [] }, { total: 3, components: [] }]).total).toBe(15);
  });
});
