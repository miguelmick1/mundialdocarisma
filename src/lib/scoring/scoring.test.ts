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

  it("atribui 10 pontos ao placar exato de 0 x 0", () => {
    expect(calculateBaseScore({ home: 0, away: 0 }, { home: 0, away: 0 }).total).toBe(10);
  });

  it("dá 4 para vencedor e diferença exata sem placar exato", () => {
    expect(calculateBaseScore({ home: 3, away: 1 }, { home: 2, away: 0 }).total).toBe(4);
  });

  it("dá 4 para empate correto com placar diferente", () => {
    expect(calculateBaseScore({ home: 1, away: 1 }, { home: 2, away: 2 }).total).toBe(4);
  });

  it("dá 3 para vencedor correto sem diferença exata", () => {
    expect(calculateBaseScore({ home: 2, away: 0 }, { home: 3, away: 2 }).total).toBe(3);
  });

  it("dobra somente a pontuação básica do Time Carisma", () => {
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
  it("dá 30 pontos ao único participante que pontua e acerta o placar exato", () => {
    const rows = calculateMatchScores({
      actual: { home: 2, away: 1 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 2, away: 1 } },
        { participantId: "h2", participantName: "Humano 2", participantType: "HUMAN", slot: 1, guess: { home: 0, away: 0 } },
        { participantId: "bot", participantName: "Bot", participantType: "BOT", slot: 1, guess: { home: 0, away: 2 } }
      ]
    });
    const human = rows.find((row) => row.participantId === "h1")!;
    expect(human.basicPoints).toBe(15);
    expect(human.uniquenessBonus).toBe(30);
    expect(human.result.total).toBe(45);
  });

  it("não dobra o bônus de 30 pontos pelo Time Carisma", () => {
    const rows = calculateMatchScores({
      actual: { home: 2, away: 1 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 2, away: 1 }, carismaTeamId: "BRA" },
        { participantId: "h2", participantName: "Humano 2", participantType: "HUMAN", slot: 1, guess: { home: 0, away: 0 } }
      ]
    });
    const human = rows.find((row) => row.participantId === "h1")!;
    expect(human.basicPoints).toBe(15);
    expect(human.carismaPoints).toBe(15);
    expect(human.uniquenessBonus).toBe(30);
    expect(human.result.total).toBe(60);
  });

  it("dá 15 ao único participante a pontuar sem placar exato", () => {
    const rows = calculateMatchScores({
      actual: { home: 2, away: 0 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 3, away: 1 } },
        { participantId: "h2", participantName: "Humano 2", participantType: "HUMAN", slot: 1, guess: { home: 0, away: 1 } }
      ]
    });
    const human = rows.find((row) => row.participantId === "h1")!;
    expect(human.basicPoints).toBe(4);
    expect(human.uniquenessBonus).toBe(15);
    expect(human.result.total).toBe(19);
  });

  it("dá 15 ao único participante com placar exato quando outros participantes também pontuam", () => {
    const rows = calculateMatchScores({
      actual: { home: 2, away: 1 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 2, away: 1 } },
        { participantId: "h2", participantName: "Humano 2", participantType: "HUMAN", slot: 1, guess: { home: 3, away: 2 } }
      ]
    });
    const exact = rows.find((row) => row.participantId === "h1")!;
    const other = rows.find((row) => row.participantId === "h2")!;
    expect(exact.uniquenessBonus).toBe(15);
    expect(exact.result.total).toBe(30);
    expect(other.result.total).toBe(4);
  });

  it("considera bots na exclusividade e não concede bônus quando humano e bot acertam juntos", () => {
    const rows = calculateMatchScores({
      actual: { home: 1, away: 0 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 1, away: 0 } },
        { participantId: "bot", participantName: "Bot", participantType: "BOT", slot: 1, guess: { home: 1, away: 0 } }
      ]
    });
    expect(rows.find((row) => row.participantId === "h1")!.uniquenessBonus).toBe(0);
    expect(rows.find((row) => row.participantId === "bot")!.uniquenessBonus).toBe(0);
  });

  it("dá 30 pontos ao bot quando ele é o único participante a pontuar e acerta o placar exato", () => {
    const rows = calculateMatchScores({
      actual: { home: 2, away: 1 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 0, away: 0 } },
        { participantId: "bot", participantName: "OddMestre", participantType: "BOT", slot: 1, guess: { home: 2, away: 1 } }
      ]
    });
    const bot = rows.find((row) => row.participantId === "bot")!;
    expect(bot.basicPoints).toBe(15);
    expect(bot.uniquenessBonus).toBe(30);
    expect(bot.result.total).toBe(45);
  });

  it("dá 15 pontos ao bot quando ele é o único participante a pontuar sem placar exato", () => {
    const rows = calculateMatchScores({
      actual: { home: 2, away: 0 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 0, away: 1 } },
        { participantId: "bot", participantName: "Faria Limmer", participantType: "BOT", slot: 1, guess: { home: 3, away: 1 } }
      ]
    });
    const bot = rows.find((row) => row.participantId === "bot")!;
    expect(bot.basicPoints).toBe(4);
    expect(bot.uniquenessBonus).toBe(15);
    expect(bot.result.total).toBe(19);
  });

  it("dá 15 pontos ao bot quando ele é o único no placar exato e outro participante também pontua", () => {
    const rows = calculateMatchScores({
      actual: { home: 2, away: 1 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 3, away: 2 } },
        { participantId: "bot", participantName: "Pangaré", participantType: "BOT", slot: 1, guess: { home: 2, away: 1 } }
      ]
    });
    const bot = rows.find((row) => row.participantId === "bot")!;
    expect(bot.basicPoints).toBe(15);
    expect(bot.uniquenessBonus).toBe(15);
    expect(bot.result.total).toBe(30);
  });

  it("não concede bônus quando dois participantes acertam o placar exato", () => {
    const rows = calculateMatchScores({
      actual: { home: 1, away: 1 },
      homeTeamId: "BRA",
      awayTeamId: "FRA",
      guesses: [
        { participantId: "h1", participantName: "Humano 1", participantType: "HUMAN", slot: 1, guess: { home: 1, away: 1 } },
        { participantId: "h2", participantName: "Humano 2", participantType: "HUMAN", slot: 1, guess: { home: 1, away: 1 } }
      ]
    });
    expect(rows.every((row) => row.uniquenessBonus === 0)).toBe(true);
  });
});

describe("Wild Card", () => {
  it("usa o melhor resultado e não soma", () => {
    expect(bestOfWildcard([{ total: 15, components: [] }, { total: 4, components: [] }]).total).toBe(15);
  });
});
