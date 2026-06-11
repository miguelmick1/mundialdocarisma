import { GROUP_ROUNDS, type GroupRoundId } from "@/lib/world-cup/rounds";

export type CarismaSelectionLike = {
  roundId?: unknown;
  participantId?: unknown;
  teamId?: unknown;
  teamName?: unknown;
  teamIso2?: unknown;
  lockAt?: unknown;
  selectedAt?: unknown;
  updatedAt?: unknown;
};

export type NormalizedCarismaSelection = {
  roundId: string;
  participantId: string;
  teamId: string;
  teamName: string | null;
  teamIso2: string | null;
  raw: CarismaSelectionLike;
};

function normalize(row: CarismaSelectionLike): NormalizedCarismaSelection | null {
  const roundId = typeof row.roundId === "string" ? row.roundId : "";
  const participantId = typeof row.participantId === "string" ? row.participantId : "";
  const teamId = typeof row.teamId === "string" ? row.teamId : "";
  if (!roundId || !participantId || !teamId) return null;
  return {
    roundId,
    participantId,
    teamId,
    teamName: typeof row.teamName === "string" ? row.teamName : null,
    teamIso2: typeof row.teamIso2 === "string" ? row.teamIso2 : null,
    raw: row,
  };
}

/**
 * Builds a lookup for scoring and display. During the group stage, GROUP_1 is
 * the canonical choice and is mirrored across all three group rounds. Legacy
 * data that only has GROUP_2 or GROUP_3 is still supported.
 */
export function buildCarismaSelectionIndex(rows: CarismaSelectionLike[]) {
  const direct = new Map<string, NormalizedCarismaSelection>();
  const groupByParticipant = new Map<string, Partial<Record<GroupRoundId, NormalizedCarismaSelection>>>();

  for (const row of rows) {
    const normalized = normalize(row);
    if (!normalized) continue;
    direct.set(`${normalized.roundId}:${normalized.participantId}`, normalized);
    if (GROUP_ROUNDS.includes(normalized.roundId as GroupRoundId)) {
      const perRound = groupByParticipant.get(normalized.participantId) ?? {};
      perRound[normalized.roundId as GroupRoundId] = normalized;
      groupByParticipant.set(normalized.participantId, perRound);
    }
  }

  const canonicalGroupByParticipant = new Map<string, NormalizedCarismaSelection>();
  for (const [participantId, perRound] of groupByParticipant) {
    const canonical = perRound.GROUP_1 ?? perRound.GROUP_2 ?? perRound.GROUP_3;
    if (!canonical) continue;
    canonicalGroupByParticipant.set(participantId, canonical);
    for (const roundId of GROUP_ROUNDS) {
      direct.set(`${roundId}:${participantId}`, { ...canonical, roundId });
    }
  }

  return { byRoundParticipant: direct, canonicalGroupByParticipant };
}
