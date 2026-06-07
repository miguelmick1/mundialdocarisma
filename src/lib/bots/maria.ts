import type { ScoreInput } from "@/types/domain";
import type { GeneratedBotGuess } from "@/lib/bots/types";
import { sha256 } from "@/lib/utils/hash";

export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function generateMariaGuess(humanGuesses: ScoreInput[]): GeneratedBotGuess {
  if (humanGuesses.length === 0) throw new Error("Não há palpites humanos válidos");
  const homeAverage = humanGuesses.reduce((sum, guess) => sum + guess.home, 0) / humanGuesses.length;
  const awayAverage = humanGuesses.reduce((sum, guess) => sum + guess.away, 0) / humanGuesses.length;
  const prediction = { home: roundHalfUp(homeAverage), away: roundHalfUp(awayAverage) };
  return {
    prediction,
    source: {
      botStrategy: "HUMAN_AVERAGE",
      strategyVersion: "1.0.0",
      automaticPrediction: prediction,
      effectivePrediction: prediction,
      sourceStatus: "AUTOMATIC",
      publicExplanation: {
        title: "Como a Maria Vai Com as Outras calculou este palpite",
        summary: "Foi calculada a média exata dos palpites humanos, com valores terminados em 0,5 arredondados para cima.",
        inputs: { humanGuesses, numberOfHumans: humanGuesses.length },
        steps: [
          { order: 1, label: "Média de gols do mandante", formula: "soma ÷ participantes", value: homeAverage.toFixed(2), explanation: "Média dos palpites humanos após o fechamento." },
          { order: 2, label: "Média de gols do visitante", formula: "soma ÷ participantes", value: awayAverage.toFixed(2), explanation: "Média dos palpites humanos após o fechamento." },
          { order: 3, label: "Arredondamento", formula: "floor(valor + 0,5)", value: `${prediction.home} x ${prediction.away}`, explanation: "Empates em 0,5 são arredondados para cima." }
        ],
        sources: [{ name: "Palpites dos participantes humanos", datasetVersion: "snapshot-no-fechamento" }]
      },
      verification: {
        inputHash: sha256(humanGuesses),
        calculationHash: sha256({ humanGuesses, prediction, version: "1.0.0" })
      }
    }
  };
}
