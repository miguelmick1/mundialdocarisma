import type { ScoreInput, ScoringResult } from "@/types/domain";

export type Outcome = "HOME" | "DRAW" | "AWAY";

export function outcome(score: ScoreInput): Outcome {
  if (score.home > score.away) return "HOME";
  if (score.home < score.away) return "AWAY";
  return "DRAW";
}

export function calculateBaseScore(guess: ScoreInput, actual: ScoreInput): ScoringResult {
  if (guess.home === actual.home && guess.away === actual.away) {
    const totalGoals = actual.home + actual.away;
    const points = totalGoals === 0 ? 10 : 5 * totalGoals;
    return {
      total: points,
      components: [{
        code: "BASE_EXACT_SCORE",
        points,
        label: totalGoals === 0 ? "Placar exato de 0 × 0" : `Placar exato (${totalGoals} gols × 5)`,
        metadata: { totalGoals, pointsPerGoal: totalGoals === 0 ? null : 5 }
      }]
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
      components: [{ code: "BASE_GOAL_DIFFERENCE", points: 4, label: "Vencedor e diferença de gols" }]
    };
  }

  if (actualOutcome === "DRAW" && guessedOutcome === "DRAW") {
    return {
      total: 4,
      components: [{ code: "BASE_DRAW", points: 4, label: "Empate correto" }]
    };
  }

  if (guessedOutcome === actualOutcome) {
    return {
      total: 3,
      components: [{ code: "BASE_OUTCOME", points: 3, label: "Vencedor correto" }]
    };
  }

  return {
    total: 0,
    components: [{ code: "BASE_MISS", points: 0, label: "Palpite incorreto" }]
  };
}
