import type { GeneratedBotGuess } from "@/lib/bots/types";
import { hmacSha256, sha256 } from "@/lib/utils/hash";

interface WeightedScore { home: number; away: number; weight: number; }

const UNDERDOG: WeightedScore[] = [
  { home: 2, away: 1, weight: 10 }, { home: 3, away: 1, weight: 15 },
  { home: 3, away: 2, weight: 25 }, { home: 4, away: 2, weight: 20 },
  { home: 4, away: 3, weight: 15 }, { home: 5, away: 2, weight: 10 },
  { home: 5, away: 3, weight: 5 },
];
const DRAWS: WeightedScore[] = [
  { home: 2, away: 2, weight: 20 }, { home: 3, away: 3, weight: 55 }, { home: 4, away: 4, weight: 25 },
];
const FESTIVAL: WeightedScore[] = [
  { home: 4, away: 0, weight: 10 }, { home: 4, away: 1, weight: 20 },
  { home: 4, away: 2, weight: 25 }, { home: 5, away: 0, weight: 10 },
  { home: 5, away: 1, weight: 15 }, { home: 5, away: 2, weight: 15 },
  { home: 6, away: 2, weight: 5 },
];

const MODE_COPY = {
  UNDERDOG: {
    label: "Zebra",
    explanation: "O Pangaré decidiu que o azarão venceria a partida.",
  },
  CHAOTIC_DRAW: {
    label: "Empate caótico",
    explanation: "O Pangaré escolheu um empate com muitos gols.",
  },
  GOAL_FEST: {
    label: "Festival de gols",
    explanation: "O Pangaré apostou em vitória do favorito em um jogo cheio de gols.",
  },
} as const;

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
  homeTeamName?: string;
  awayTeamName?: string;
  favoriteBasis?: {
    method: string;
    explanation: string;
    homePot?: number | null;
    awayPot?: number | null;
  };
}): GeneratedBotGuess {
  const digest = hmacSha256(params.secret, `${params.matchId}:PANGARE:1.2.0`);
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

  const homeTeamName = params.homeTeamName || "Mandante";
  const awayTeamName = params.awayTeamName || "Visitante";
  const favoriteTeamName = params.favoriteSide === "HOME" ? homeTeamName : awayTeamName;
  const underdogTeamName = params.favoriteSide === "HOME" ? awayTeamName : homeTeamName;
  const modeCopy = MODE_COPY[mode];
  const publicSeed = sha256(`${params.matchId}:PANGARE:1.2.0`);

  return {
    prediction,
    source: {
      botStrategy: "PANGARE",
      strategyVersion: "1.2.0",
      automaticPrediction: prediction,
      effectivePrediction: prediction,
      sourceStatus: "AUTOMATIC",
      publicExplanation: {
        title: "Como o Pangaré fez este palpite",
        summary: "O Pangaré identifica favorito e azarão, sorteia uma de suas três personalidades e, dentro dela, escolhe um placar possível.",
        inputs: {
          homeTeamName,
          awayTeamName,
          favoriteSide: params.favoriteSide,
          favoriteTeamName,
          underdogTeamName,
          favoriteBasis: params.favoriteBasis ?? null,
          selectedMode: mode,
          selectedModeLabel: modeCopy.label,
          selectedModeExplanation: modeCopy.explanation,
          prediction,
          modeProbabilities: {
            UNDERDOG: 50,
            CHAOTIC_DRAW: 30,
            GOAL_FEST: 20,
          },
        },
        steps: [
          {
            order: 1,
            label: "Favorito da partida",
            value: favoriteTeamName,
            explanation: params.favoriteBasis?.explanation ?? "O favorito foi definido antes do sorteio do palpite.",
          },
          {
            order: 2,
            label: `Personalidade sorteada: ${modeCopy.label}`,
            value: modeCopy.label,
            explanation: modeCopy.explanation,
          },
          {
            order: 3,
            label: "Palpite final",
            value: `${prediction.home} × ${prediction.away}`,
            explanation: `O placar foi sorteado entre as opções previstas para o modo ${modeCopy.label.toLocaleLowerCase("pt-BR")}.`,
          },
        ],
        sources: [],
      },
      verification: {
        inputHash: sha256({ matchId: params.matchId, favoriteSide: params.favoriteSide, favoriteBasis: params.favoriteBasis ?? null, publicSeed }),
        calculationHash: sha256({ matchId: params.matchId, favoriteSide: params.favoriteSide, favoriteBasis: params.favoriteBasis ?? null, mode, selected, prediction, version: "1.2.0" }),
      },
    },
  };
}
