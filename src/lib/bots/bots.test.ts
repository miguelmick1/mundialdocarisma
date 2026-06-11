import { describe, expect, it } from "vitest";
import { generateMariaGuess, roundHalfUp } from "@/lib/bots/maria";
import { generateFariaLimmerGuess } from "@/lib/bots/faria-limmer";
import { generatePangareGuess } from "@/lib/bots/pangare";


describe("bots", () => {
  it("Maria arredonda 0,5 para cima", () => {
    expect(roundHalfUp(1.5)).toBe(2);
    expect(generateMariaGuess([{home:1,away:0},{home:2,away:1}]).prediction).toEqual({home:2,away:1});
  });

  it("Maria preserva os nomes dos participantes na explicação pública", () => {
    const generated = generateMariaGuess([
      { participantId: "u1", participantName: "Ana", home: 2, away: 1 },
      { participantId: "u2", participantName: "Bruno", home: 1, away: 0 },
    ]);
    expect(generated.source.publicExplanation.inputs.humanPredictions).toEqual([
      { participantId: "u1", participantName: "Ana", home: 2, away: 1 },
      { participantId: "u2", participantName: "Bruno", home: 1, away: 0 },
    ]);
  });

  it("Transbot favorece o maior índice", () => {
    const bounds={minLogGdp:Math.log(5000),maxLogGdp:Math.log(100000),minHdi:0.5,maxHdi:0.95};
    const guess=generateFariaLimmerGuess(
      {countryName:"A",gdpPerCapitaPpp:90000,gdpYear:2025,hdi:0.94,hdiYear:2024},
      {countryName:"B",gdpPerCapitaPpp:10000,gdpYear:2025,hdi:0.60,hdiYear:2024},
      bounds
    ).prediction;
    expect(guess.home).toBeGreaterThan(guess.away);
  });

  it("Pangaré é determinístico para a mesma partida e segredo", () => {
    const a=generatePangareGuess({matchId:"m1",secret:"x".repeat(40),favoriteSide:"HOME"});
    const b=generatePangareGuess({matchId:"m1",secret:"x".repeat(40),favoriteSide:"HOME"});
    expect(a.prediction).toEqual(b.prediction);
    expect(a.source.verification.calculationHash).toBe(b.source.verification.calculationHash);
  });
});
