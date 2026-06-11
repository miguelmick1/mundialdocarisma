import type { GeneratedBotGuess } from "@/lib/bots/types";
import { hmacSha256, sha256 } from "@/lib/utils/hash";

interface WeightedScore { home: number; away: number; weight: number; }

const UNDERDOG: WeightedScore[] = [
  { home: 2, away: 1, weight: 10 }, { home: 3, away: 1, weight: 15 },
  { home: 3, away: 2, weight: 25 }, { home: 4, away: 2, weight: 20 },
  { home: 4, away: 3, weight: 15 }, { home: 5, away: 2, weight: 10 },
  { home: 5, away: 3, weight: 5 }
];
const DRAWS: WeightedScore[] = [
  { home: 2, away: 2, weight: 20 }, { home: 3, away: 3, weight: 55 }, { home: 4, away: 4, weight: 25 }
];
const FESTIVAL: WeightedScore[] = [
  { home: 4, away: 0, weight: 10 }, { home: 4, away: 1, weight: 20 },
  { home: 4, away: 2, weight: 25 }, { home: 5, away: 0, weight: 10 },
  { home: 5, away: 1, weight: 15 }, { home: 5, away: 2, weight: 15 },
  { home: 6, away: 2, weight: 5 }
];

function numberFromHex(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 8), 16) / 0xffffffff;
}

function pickWeighted(items: WeightedScore[], random: number): WeightedScore {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items.at(-1)!;
}

export function generatePangareGuess(params: {
  matchId: string;
  secret: string;
  favoriteSide: "HOME" | "AWAY";
  favoriteBasis?: {
    method: string;
    explanation: string;
    homePot?: number | null;
    awayPot?: number | null;
  };
}): GeneratedBotGuess {
  const digest = hmacSha256(params.secret, `${params.matchId}:PANGARE:1.1.0`);
  const modeRandom = numberFromHex(digest, 0);
  const scoreRandom = numberFromHex(digest, 8);
  const mode = modeRandom < 0.5 ? "UNDERDOG" : modeRandom < 0.8 ? "CHAOTIC_DRAW" : "GOAL_FEST";
  const selected = pickWeighted(mode === "UNDERDOG" ? UNDERDOG : mode === "CHAOTIC_DRAW" ? DRAWS : FESTIVAL, scoreRandom);

  let prediction = { home: selected.home, away: selected.away };
  if (mode === "UNDERDOG") {
    const underdogIsHome = params.favoriteSide === "AWAY";
    prediction = underdogIsHome ? prediction : { home: selected.away, away: selected.home };
  } else if (mode === "GOAL_FEST" && params.favoriteSide === "AWAY") {
    prediction = { home: selected.away, away: selected.home };
  }

  const publicSeed = sha256(`${params.matchId}:PANGARE:1.1.0`);
  return {
    prediction,
    source: {
      botStrategy: "PANGARE",
      strategyVersion: "1.1.0",
      automaticPrediction: prediction,
      effectivePrediction: prediction,
      sourceStatus: "AUTOMATIC",
      publicExplanation: {
        title: "Como o Pangaré chegou a este palpite",
        summary: "Um modo caótico e um placar foram escolhidos por distribuição ponderada e geração determinística auditável.",
        inputs: {
          modeProbabilities: { UNDERDOG: 0.5, CHAOTIC_DRAW: 0.3, GOAL_FEST: 0.2 },
          selectedMode: mode,
          favoriteSide: params.favoriteSide,
          favoriteBasis: params.favoriteBasis ?? null,
          scoreDistributions: { UNDERDOG, CHAOTIC_DRAW: DRAWS, GOAL_FEST: FESTIVAL },
          publicSeed
        },
        steps: [
          { order: 1, label: "Favorito e azarão", value: params.favoriteSide === "HOME" ? "Mandante favorito" : "Visitante favorito", explanation: params.favoriteBasis?.explanation ?? "O lado favorito foi informado à estratégia." },
          { order: 2, label: "Modo sorteado", value: mode, explanation: "50% zebra, 30% empate caótico e 20% festival de gols." },
          { order: 3, label: "Placar ponderado", value: `${prediction.home} x ${prediction.away}`, explanation: "O placar foi escolhido dentro da distribuição do modo." },
          { order: 4, label: "Verificação", value: publicSeed, explanation: "A mesma partida e a mesma versão sempre mantêm o mesmo compromisso público." }
        ],
        sources: [{ name: "Distribuição histórica e regra Pangaré", datasetVersion: "1.1.0" }]
      },
      verification: {
        inputHash: sha256({ matchId: params.matchId, favoriteSide: params.favoriteSide, favoriteBasis: params.favoriteBasis ?? null, publicSeed }),
        calculationHash: sha256({ matchId: params.matchId, favoriteSide: params.favoriteSide, favoriteBasis: params.favoriteBasis ?? null, mode, selected, prediction, version: "1.1.0" })
      }
    }
  };
}
