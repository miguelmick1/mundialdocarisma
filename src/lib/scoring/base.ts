import type { ScoreInput, ScoringResult } from "@/types/domain";

export type Outcome = "HOME" | "DRAW" | "AWAY";

export function outcome(score: ScoreInput): Outcome {
  if (score.home > score.away) return "HOME";
  if (score.home < score.away) return "AWAY";
  return "DRAW";
}

export function calculateBaseScore(guess: ScoreInput, actual: ScoreInput): ScoringResult {
  if (guess.home === actual.home && guess.away === actual.away) {
    return {
      total: 5,
      components: [{ code: "BASE_EXACT_SCORE", points: 5, label: "Placar exato" }]
    };
  }

  const actualOutcome = outcome(actual);
  const guessedOutcome = outcome(guess);
  const actualDifference = actual.home - actual.away;
  const guessedDifference = guess.home - guess.away;

  if (
    actualOutcome !== "DRAW" &&
    guessedOutcome === actualOutcome &&
    guessedDifference === actualDifference
  ) {
    return {
      total: 4,
      components: [{ code: "BASE_GOAL_DIFFERENCE", points: 4, label: "Vencedor e saldo exato" }]
    };
  }

  if (guessedOutcome === actualOutcome) {
    return {
      total: 3,
      components: [{ code: "BASE_OUTCOME", points: 3, label: "Resultado correto" }]
    };
  }

  return {
    total: 0,
    components: [{ code: "BASE_MISS", points: 0, label: "Palpite incorreto" }]
  };
}
