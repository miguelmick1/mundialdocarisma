export const GROUP_ROUNDS = ["GROUP_1", "GROUP_2", "GROUP_3"] as const;

export type GroupRoundId = (typeof GROUP_ROUNDS)[number];

export const GROUP_ROUND_LABELS: Record<GroupRoundId, string> = {
  GROUP_1: "Fase de grupos · Rodada 1",
  GROUP_2: "Fase de grupos · Rodada 2",
  GROUP_3: "Fase de grupos · Rodada 3"
};

export const KNOCKOUT_ROUNDS = [
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "THIRD_PLACE",
  "FINAL"
] as const;

export type KnockoutRoundId = (typeof KNOCKOUT_ROUNDS)[number];

export const KNOCKOUT_ROUND_LABELS: Record<KnockoutRoundId, string> = {
  ROUND_OF_32: "16-avos de final",
  ROUND_OF_16: "Oitavas de final",
  QUARTER_FINAL: "Quartas de final",
  SEMI_FINAL: "Semifinais",
  THIRD_PLACE: "Disputa de 3º lugar",
  FINAL: "Grande final"
};

export const CARISMA_ROUNDS = [...GROUP_ROUNDS, ...KNOCKOUT_ROUNDS] as const;
export type CarismaRoundId = (typeof CARISMA_ROUNDS)[number];

export const CARISMA_ROUND_LABELS: Record<CarismaRoundId, string> = {
  ...GROUP_ROUND_LABELS,
  ...KNOCKOUT_ROUND_LABELS
};

export function isGroupRound(value: string): value is GroupRoundId {
  return GROUP_ROUNDS.includes(value as GroupRoundId);
}

export function isKnockoutRound(value: string): value is KnockoutRoundId {
  return KNOCKOUT_ROUNDS.includes(value as KnockoutRoundId);
}

export function isCarismaRound(value: string): value is CarismaRoundId {
  return CARISMA_ROUNDS.includes(value as CarismaRoundId);
}

export function groupRoundNumber(roundId: GroupRoundId): 1 | 2 | 3 {
  return Number(roundId.slice(-1)) as 1 | 2 | 3;
}

export function carismaRoundIdForMatch(
  phase: string,
  groupRound?: number | null
): CarismaRoundId | null {
  if (phase === "GROUP_STAGE") {
    if (groupRound === 1 || groupRound === 2 || groupRound === 3) {
      return `GROUP_${groupRound}` as GroupRoundId;
    }
    return null;
  }
  return isKnockoutRound(phase) ? phase : null;
}

export function matchBelongsToCarismaRound(
  match: { phase?: unknown; groupRound?: unknown },
  roundId: CarismaRoundId
): boolean {
  const phase = typeof match.phase === "string" ? match.phase : "";
  const rawGroupRound = typeof match.groupRound === "number" ? match.groupRound : null;
  return carismaRoundIdForMatch(phase, rawGroupRound) === roundId;
}

export function roundLabel(value: string): string {
  return isCarismaRound(value) ? CARISMA_ROUND_LABELS[value] : value;
}
