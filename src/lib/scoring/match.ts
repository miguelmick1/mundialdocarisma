import type { GuessSource, ScoreInput, ScoringResult } from "@/types/domain";
import { calculateScoreWithCarisma } from "@/lib/scoring/carisma";

export interface MatchGuessScoringInput {
  participantId: string;
  slot: number;
  source: GuessSource | string;
  guess: ScoreInput;
  carismaTeamId?: string;
}

export interface MatchGuessScoringResult extends MatchGuessScoringInput {
  result: ScoringResult;
  baseCode: string;
}

interface MatchScoringContext {
  actual: ScoreInput;
  homeTeamId: string;
  awayTeamId: string;
  guesses: MatchGuessScoringInput[];
}

export function calculateMatchScores(context: MatchScoringContext): MatchGuessScoringResult[] {
  const preliminary = context.guesses.map((entry) => {
    const result = calculateScoreWithCarisma({
      guess: entry.guess,
      actual: context.actual,
      homeTeamId: context.homeTeamId,
      awayTeamId: context.awayTeamId,
      carismaTeamId: entry.carismaTeamId
    });
    return {
      ...entry,
      result,
      baseCode: result.components[0]?.code ?? "BASE_MISS"
    };
  });

  const humanScorers = new Set(
    preliminary
      .filter((entry) => entry.source === "HUMAN" && (entry.result.components[0]?.points ?? 0) > 0)
      .map((entry) => entry.participantId)
  );
  const humanExactScorers = new Set(
    preliminary
      .filter((entry) => entry.source === "HUMAN" && entry.baseCode === "BASE_EXACT_SCORE")
      .map((entry) => entry.participantId)
  );

  return preliminary.map((entry) => {
    if (entry.source !== "HUMAN") return entry;

    const scored = (entry.result.components[0]?.points ?? 0) > 0;
    const exact = entry.baseCode === "BASE_EXACT_SCORE";
    const onlyHumanToScore = scored && humanScorers.size === 1 && humanScorers.has(entry.participantId);
    const onlyHumanExact = exact && humanExactScorers.size === 1 && humanExactScorers.has(entry.participantId);

    let bonus = 0;
    let code = "";
    let label = "";

    if (onlyHumanToScore && onlyHumanExact) {
      bonus = 30;
      code = "BONUS_SOLO_TOTAL";
      label = "Acerto sozinho total";
    } else if (onlyHumanToScore || onlyHumanExact) {
      bonus = 15;
      code = "BONUS_SOLO_PARTIAL";
      label = "Acerto sozinho parcial";
    }

    if (!bonus) return entry;

    return {
      ...entry,
      result: {
        total: entry.result.total + bonus,
        components: [
          ...entry.result.components,
          {
            code,
            points: bonus,
            label,
            metadata: {
              onlyHumanToScore,
              onlyHumanExact,
              excludedBots: true,
              doubledByCarisma: false
            }
          }
        ]
      }
    };
  });
}
