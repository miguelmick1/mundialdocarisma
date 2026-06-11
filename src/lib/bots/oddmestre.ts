import type { GeneratedBotGuess } from "@/lib/bots/types";
import { sha256 } from "@/lib/utils/hash";

export interface CorrectScoreOdd {
  home: number;
  away: number;
  odd: number;
  liquidity?: number;
}

export function generateOddMestreGuess(
  odds: CorrectScoreOdd[],
  provider: string,
  capturedAtIso: string,
  sourceUrl?: string
): GeneratedBotGuess {
  const valid = odds.filter((item) => item.odd > 1 && Number.isFinite(item.odd));
  if (valid.length === 0) {
    throw new Error("BOT_ODDS_MARKET_NOT_AVAILABLE");
  }
  valid.sort((a, b) => a.odd - b.odd || (b.liquidity ?? 0) - (a.liquidity ?? 0));
  const selected = valid[0]!;
  const prediction = { home: selected.home, away: selected.away };
  return {
    prediction,
    source: {
      botStrategy: "ODD_MASTER",
      strategyVersion: "1.0.0",
      automaticPrediction: prediction,
      effectivePrediction: prediction,
      sourceStatus: "AUTOMATIC",
      publicExplanation: {
        title: "Como o Betinho Everyday calculou este palpite",
        summary: "Foi escolhido o placar exato com a menor odd válida na captura feita 24 horas antes do jogo.",
        inputs: { provider, capturedAtIso, consideredOdds: valid.slice(0, 10) },
        steps: [
          { order: 1, label: "Filtrar cotações válidas", value: valid.length, explanation: "Foram descartadas cotações inválidas ou indisponíveis." },
          { order: 2, label: "Ordenar por menor odd", formula: "odd crescente; liquidez decrescente no empate", value: selected.odd, explanation: "Menor odd indica o placar considerado mais provável pelo mercado." },
          { order: 3, label: "Palpite selecionado", value: `${prediction.home} x ${prediction.away}`, explanation: "O snapshot fica congelado e auditável." }
        ],
        sources: [{ name: provider, referenceDate: capturedAtIso, datasetVersion: "snapshot-24h", sourceUrl }]
      },
      verification: {
        inputHash: sha256({ odds: valid, provider, capturedAtIso }),
        calculationHash: sha256({ odds: valid, provider, capturedAtIso, prediction, version: "1.0.0" })
      }
    }
  };
}
