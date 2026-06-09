import { randomInt } from "node:crypto";
import type { CompetitionParticipant, GroupAssignment } from "@/lib/competition/groups";

export type DrawKind = "GROUPS" | "CARISMA";
export type DrawMode = "REHEARSAL" | "OFFICIAL";

export type GroupDrawEvent = {
  index: number;
  kind: "GROUP_ASSIGNMENT";
  participantId: string;
  participantName: string;
  participantType: CompetitionParticipant["type"];
  avatarUrl?: string | null;
  groupId: "A" | "B" | "C" | "D";
  slot: 1 | 2 | 3 | 4;
};

export type CarismaDrawEvent = {
  index: number;
  kind: "CARISMA_ASSIGNMENT";
  participantId: string;
  participantName: string;
  teamId: string;
  teamName: string;
  teamIso2?: string | null;
  pot: 1 | 2 | 3;
};

export type DrawEvent = GroupDrawEvent | CarismaDrawEvent;

function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function buildGroupDraw(participants: CompetitionParticipant[]): {
  assignments: GroupAssignment[];
  events: GroupDrawEvent[];
} {
  if (participants.length !== 16) throw new Error("GROUP_DRAW_REQUIRES_16");
  const bots = secureShuffle(participants.filter((item) => item.type === "BOT"));
  const humans = secureShuffle(participants.filter((item) => item.type !== "BOT"));
  if (bots.length !== 4 || humans.length !== 12) throw new Error("GROUP_DRAW_REQUIRES_12_PLUS_4");

  const groups = ["A", "B", "C", "D"] as const;
  const assignments: GroupAssignment[] = [];
  groups.forEach((groupId, groupIndex) => {
    assignments.push({ ...bots[groupIndex]!, groupId, slot: 1 });
  });
  humans.forEach((participant, index) => {
    const groupId = groups[index % 4]!;
    const slot = (Math.floor(index / 4) + 2) as 2 | 3 | 4;
    assignments.push({ ...participant, groupId, slot });
  });

  const events = secureShuffle(assignments).map((assignment, index) => ({
    index,
    kind: "GROUP_ASSIGNMENT" as const,
    participantId: assignment.id,
    participantName: assignment.displayName,
    participantType: assignment.type,
    avatarUrl: assignment.avatarUrl ?? null,
    groupId: assignment.groupId,
    slot: assignment.slot,
  }));
  return { assignments, events };
}

export type CarismaTeam = {
  id: string;
  name: string;
  iso2?: string | null;
  pot: 1 | 2 | 3;
};

export function buildCarismaDraw(
  participants: CompetitionParticipant[],
  teams: CarismaTeam[],
): { allocations: Map<string, CarismaTeam[]>; events: CarismaDrawEvent[] } {
  if (participants.length !== 16) throw new Error("CARISMA_DRAW_REQUIRES_16");
  const pots = new Map<1 | 2 | 3, CarismaTeam[]>();
  for (const pot of [1, 2, 3] as const) {
    const rows = secureShuffle(teams.filter((team) => team.pot === pot));
    if (rows.length !== 16) throw new Error(`CARISMA_POT_${pot}_REQUIRES_16`);
    pots.set(pot, rows);
  }

  const orderedParticipants = secureShuffle(participants);
  const allocations = new Map<string, CarismaTeam[]>();
  const events: CarismaDrawEvent[] = [];
  for (const pot of [1, 2, 3] as const) {
    const teamsInPot = pots.get(pot)!;
    orderedParticipants.forEach((participant, index) => {
      const team = teamsInPot[index]!;
      const current = allocations.get(participant.id) ?? [];
      current.push(team);
      allocations.set(participant.id, current);
      events.push({
        index: events.length,
        kind: "CARISMA_ASSIGNMENT",
        participantId: participant.id,
        participantName: participant.displayName,
        teamId: team.id,
        teamName: team.name,
        teamIso2: team.iso2 ?? null,
        pot,
      });
    });
  }
  return { allocations, events };
}

export function rehearsalParticipants(realParticipants: CompetitionParticipant[]) {
  const bots = realParticipants.filter((item) => item.type === "BOT").slice(0, 4);
  const humans = realParticipants.filter((item) => item.type === "HUMAN").slice(0, 12);
  while (bots.length < 4) {
    const number = bots.length + 1;
    bots.push({ id: `demo-bot-${number}`, displayName: `Bot ${number}`, type: "BOT" });
  }
  while (humans.length < 12) {
    const number = humans.length + 1;
    humans.push({ id: `demo-human-${number}`, displayName: `Participante ${number}`, type: "PLACEHOLDER" });
  }
  return [...humans, ...bots];
}
