import type { BotGuessSourceDocument, ScoreInput } from "@/types/domain";

export interface GeneratedBotGuess {
  prediction: ScoreInput;
  source: Omit<BotGuessSourceDocument, "guessId" | "matchId" | "botId" | "botName" | "calculatedAt">;
}
