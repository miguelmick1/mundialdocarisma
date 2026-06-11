import type { ScoreInput } from "@/types/domain";
import type { GeneratedBotGuess } from "@/lib/bots/types";
import { sha256 } from "@/lib/utils/hash";

export type MariaHumanGuess = ScoreInput & {
  participantId?: string;
  participantName?: string;
};

export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function generateMariaGuess(humanGuesses: MariaHumanGuess[]): GeneratedBotGuess {
  if (humanGuesses.length === 0) throw new Error("Não há palpites humanos válidos");

  const homeAverage = humanGuesses.reduce((sum, guess) => sum + guess.home, 0) / humanGuesses.length;
  const awayAverage = humanGuesses.reduce((sum, guess) => sum + guess.away, 0) / humanGuesses.length;
  const prediction = { home: roundHalfUp(homeAverage), away: roundHalfUp(awayAverage) };
  const humanPredictions = humanGuesses.map((guess, index) => ({
    participantId: guess.participantId ?? null,
    participantName: guess.participantName?.trim() || `Participante ${index + 1}`,
    home: guess.home,
    away: guess.away,
  }));

  return {
    prediction,
    source: {
      botStrategy: "HUMAN_AVERAGE",
      strategyVersion: "1.1.0",
      automaticPrediction: prediction,
      effectivePrediction: prediction,
      sourceStatus: "AUTOMATIC",
      publicExplanation: {
        title: "Como a Maria Vai com as Outras fez este palpite",
        summary: "A Maria reuniu os palpites principais da turma, calculou a média de gols de cada seleção e arredondou o resultado para chegar ao placar final.",
        inputs: {
          humanPredictions,
          numberOfHumans: humanPredictions.length,
          homeAverage,
          awayAverage,
          roundedPrediction: prediction,
        },
        steps: [
          {
            order: 1,
            label: "Palpites considerados",
            value: `${humanPredictions.length} participantes`,
            explanation: "Foi usado um palpite principal de cada participante humano ativo.",
          },
          {
            order: 2,
            label: "Média da turma",
            value: `${homeAverage.toFixed(2)} × ${awayAverage.toFixed(2)}`,
            explanation: "A média foi calculada separadamente para os gols de cada seleção.",
          },
          {
            order: 3,
            label: "Palpite final",
            value: `${prediction.home} × ${prediction.away}`,
            explanation: "A Maria arredonda para o inteiro mais próximo; quando termina em 0,5, arredonda para cima.",
          },
        ],
        sources: [],
      },
      verification: {
        inputHash: sha256(humanPredictions),
        calculationHash: sha256({ humanPredictions, prediction, version: "1.1.0" }),
      },
    },
  };
}
