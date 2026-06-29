import type { GuessSource, ScoreInput, ScoringResult } from "@/types/domain";
import { calculateScoreWithCarisma } from "@/lib/scoring/carisma";

export const MATCH_SCORING_RULE_SET_VERSION = 4;

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
  const hasSoloHumanExact = humanExactScorers.size === 1;
  const hasAnyHumanExact = humanExactScorers.size > 0;

  return preliminary.map((entry) => {
    const scored = (entry.result.components[0]?.points ?? 0) > 0;
    const exact = entry.baseCode === "BASE_EXACT_SCORE";
    const onlyHumanToScore = scored && humanScorers.size === 1 && humanScorers.has(entry.participantId);
    const onlyHumanExact = exact && hasSoloHumanExact && humanExactScorers.has(entry.participantId);
    const botExactEligible = entry.source !== "HUMAN" && exact && !hasAnyHumanExact;

    let bonus = 0;
    let code = "";
    let label = "";

    if (entry.source === "HUMAN" && onlyHumanToScore && onlyHumanExact) {
      bonus = 30;
      code = "BONUS_SOLO_TOTAL";
      label = "Acerto sozinho total";
    } else if (entry.source === "HUMAN" && (onlyHumanToScore || onlyHumanExact)) {
      bonus = 15;
      code = "BONUS_SOLO_PARTIAL";
      label = "Acerto sozinho parcial";
    } else if (botExactEligible) {
      bonus = 30;
      code = "BONUS_SOLO_TOTAL";
      label = "Acerto sozinho total";
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
              botExactEligible,
              humanExactScorers: humanExactScorers.size,
              excludedBots: entry.source === "HUMAN",
              doubledByCarisma: false
            }
          }
        ]
      }
    };
  });
}
