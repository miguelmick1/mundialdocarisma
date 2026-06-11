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

  const isCarismaMatch =
    context.carismaTeamId === context.homeTeamId ||
    context.carismaTeamId === context.awayTeamId;
  if (!isCarismaMatch) return base;

  return {
    total: base.total * 2,
    components: [
      ...base.components,
      {
        code: "CARISMA_MULTIPLIER",
        points: base.total,
        label: "Time Carisma: pontuação básica dobrada",
        metadata: { multiplier: 2 }
      }
    ]
  };
}
