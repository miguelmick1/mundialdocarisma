export const BOT_IDENTITIES = [
  { order: 1, id: "bot-oddmestre", displayName: "OddMestre", strategy: "ODD_MASTER" },
  { order: 2, id: "bot-maria", displayName: "Maria Vai com as Outras", strategy: "HUMAN_AVERAGE" },
  { order: 3, id: "bot-faria", displayName: "Faria Limmer", strategy: "FARIA_LIMMER" },
  { order: 4, id: "bot-pangare", displayName: "Pangaré", strategy: "PANGARE" },
] as const;

export function botDisplayName(input: { id?: string; strategy?: string; fallback?: string }, fallbackIndex?: number) {
  const match = BOT_IDENTITIES.find(
    (bot) => bot.id === input.id || bot.strategy === input.strategy,
  );
  if (match) return match.displayName;
  if (fallbackIndex !== undefined && BOT_IDENTITIES[fallbackIndex]) {
    return BOT_IDENTITIES[fallbackIndex]!.displayName;
  }
  return input.fallback || input.id || "Bot";
}
