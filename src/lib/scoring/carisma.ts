import type { ScoreInput, ScoringResult } from "@/types/domain";
import { calculateBaseScore } from "@/lib/scoring/base";

export interface CarismaContext {
  guess: ScoreInput;
  actual: ScoreInput;
  homeTeamId: string;
  awayTeamId: string;
  carismaTeamId?: string;
}

export function calculateScoreWithCarisma(context: CarismaContext): ScoringResult {
  const base = calculateBaseScore(context.guess, context.actual);
  if (!context.carismaTeamId) return base;

  const isHome = context.carismaTeamId === context.homeTeamId;
  const isAway = context.carismaTeamId === context.awayTeamId;
  if (!isHome && !isAway) return base;

  const carismaGoals = isHome ? context.actual.home : context.actual.away;
  const opponentGoals = isHome ? context.actual.away : context.actual.home;
  const bonus = carismaGoals > opponentGoals ? 3 : carismaGoals === opponentGoals ? 1 : 0;

  return {
    total: base.total * 2 + bonus,
    components: [
      ...base.components,
      {
        code: "CARISMA_MULTIPLIER",
        points: base.total,
        label: "Multiplicador do Time Carisma",
        metadata: { multiplier: 2 }
      },
      {
        code: bonus === 3 ? "CARISMA_REAL_WIN" : bonus === 1 ? "CARISMA_REAL_DRAW" : "CARISMA_REAL_LOSS",
        points: bonus,
        label: "Bônus pelo resultado real do Time Carisma"
      }
    ]
  };
}
