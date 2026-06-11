export type BotGuessMode = "AUTOMATIC" | "MANUAL";

export const BOT_IDENTITIES = [
  { order: 1, id: "bot-oddmestre", displayName: "Betinho Everyday", strategy: "ODD_MASTER", guessMode: "MANUAL", guessingEnabled: true },
  { order: 2, id: "bot-maria", displayName: "Maria Vai com as Outras", strategy: "HUMAN_AVERAGE", guessMode: "AUTOMATIC", guessingEnabled: true },
  { order: 3, id: "bot-faria", displayName: "Transbot", strategy: "FARIA_LIMMER", guessMode: "MANUAL", guessingEnabled: true },
  { order: 4, id: "bot-pangare", displayName: "Pangaré", strategy: "PANGARE", guessMode: "AUTOMATIC", guessingEnabled: true },
] as const satisfies ReadonlyArray<{
  order: number;
  id: string;
  displayName: string;
  strategy: string;
  guessMode: BotGuessMode;
  guessingEnabled: boolean;
}>;

export function botIdentity(input: { id?: string; strategy?: string }) {
  return BOT_IDENTITIES.find(
    (bot) => bot.id === input.id || bot.strategy === input.strategy,
  );
}

export function botDisplayName(input: { id?: string; strategy?: string; fallback?: string }, fallbackIndex?: number) {
  const match = botIdentity(input);
  if (match) return match.displayName;
  if (fallbackIndex !== undefined && BOT_IDENTITIES[fallbackIndex]) {
    return BOT_IDENTITIES[fallbackIndex]!.displayName;
  }
  return input.fallback || input.id || "Bot";
}

export function botGuessMode(input: { id?: string; strategy?: string }): BotGuessMode {
  return botIdentity(input)?.guessMode ?? "MANUAL";
}

export function botGuessingEnabled(input: { id?: string; strategy?: string }) {
  return botIdentity(input)?.guessingEnabled === true;
}
