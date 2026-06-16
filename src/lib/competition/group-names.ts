const COMPETITION_GROUP_NAMES = {
  A: "Grupo Julius Buth",
  B: "Grupo Viviane Mindf*cker",
  C: "Grupo Rosa Norte",
  D: "Grupo Metal Dwarf",
} as const;

export type CompetitionGroupId = keyof typeof COMPETITION_GROUP_NAMES;

export function isCompetitionGroupId(value: string): value is CompetitionGroupId {
  return value in COMPETITION_GROUP_NAMES;
}

export function competitionGroupLabel(groupId?: string | null): string {
  if (!groupId) return "Sem grupo";
  return isCompetitionGroupId(groupId)
    ? COMPETITION_GROUP_NAMES[groupId]
    : `Grupo ${groupId}`;
}
