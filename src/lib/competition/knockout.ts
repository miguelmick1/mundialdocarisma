import { compareStandingRows, type GroupStandingRow } from "@/lib/competition/groups";

export type KnockoutPhaseId = "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL";

export type ParticipantPhaseScore = {
  participantId: string;
  phase: KnockoutPhaseId;
  points: number;
  exactHits: number;
};

export type PointsRaceRow<TParticipant> = TParticipant & {
  totalPoints: number;
  exactHits: number;
  racePosition: number;
};

export type SeededParticipant = GroupStandingRow & {
  groupPosition: 1 | 2 | 3 | 4;
  positionSeed: 1 | 2 | 3 | 4;
  seedLabel: string;
};

export type KnockoutEntrant = {
  sourceLabel: string;
  participant: SeededParticipant | null;
};

export type KnockoutDuel = {
  id: string;
  round: "OPENING" | "QUARTER_FINAL" | "SEMI_FINAL";
  label: string;
  scoringLabel: string;
  scoringPhases: KnockoutPhaseId[];
  home: KnockoutEntrant;
  away: KnockoutEntrant;
  homePoints: number | null;
  awayPoints: number | null;
  winner: SeededParticipant | null;
};

export type KnockoutBracket<TParticipant> = {
  seeds: SeededParticipant[];
  opening: KnockoutDuel[];
  quarterFinals: KnockoutDuel[];
  semiFinals: KnockoutDuel[];
  final: {
    scoringLabel: string;
    scoringPhases: KnockoutPhaseId[];
    finalists: Array<SeededParticipant | null>;
    pointsRaceWildcard: PointsRaceRow<TParticipant> | null;
  };
};

const GROUP_POSITIONS = [1, 2, 3, 4] as const;

function ordinal(value: number) {
  return `${value}º`;
}

function sortPositionPool(rows: GroupStandingRow[]) {
  return [...rows].sort((a, b) =>
    b.pointsFor - a.pointsFor ||
    b.exactHits - a.exactHits ||
    b.pointDifference - a.pointDifference ||
    a.displayName.localeCompare(b.displayName, "pt-BR")
  );
}

export function seedKnockoutParticipants(rows: GroupStandingRow[]): SeededParticipant[] {
  const positioned = rows.flatMap((row) => {
    const groupRows = rows.filter((candidate) => candidate.groupId === row.groupId).sort(compareStandingRows);
    const groupPosition = groupRows.findIndex((candidate) => candidate.id === row.id) + 1;
    if (!GROUP_POSITIONS.includes(groupPosition as 1 | 2 | 3 | 4)) return [];
    return [{ row, groupPosition: groupPosition as 1 | 2 | 3 | 4 }];
  });

  return GROUP_POSITIONS.flatMap((groupPosition) => {
    const pool = sortPositionPool(positioned.filter((entry) => entry.groupPosition === groupPosition).map((entry) => entry.row));
    return pool.map((row, index) => ({
      ...row,
      groupPosition,
      positionSeed: (index + 1) as 1 | 2 | 3 | 4,
      seedLabel: `${ordinal(index + 1)} melhor ${ordinal(groupPosition)} colocado`
    }));
  });
}

function seedByPosition(seeds: SeededParticipant[], groupPosition: 1 | 2 | 3 | 4, positionSeed: 1 | 2 | 3 | 4) {
  return seeds.find((seed) => seed.groupPosition === groupPosition && seed.positionSeed === positionSeed) ?? null;
}

function scoreForPhases(
  participantId: string | undefined,
  scores: ParticipantPhaseScore[],
  phases: KnockoutPhaseId[]
) {
  if (!participantId) return null;
  return scores
    .filter((score) => score.participantId === participantId && phases.includes(score.phase))
    .reduce((total, score) => total + score.points, 0);
}

function winner(home: SeededParticipant | null, away: SeededParticipant | null, homePoints: number | null, awayPoints: number | null) {
  if (!home || !away || homePoints === null || awayPoints === null || homePoints === awayPoints) return null;
  return homePoints > awayPoints ? home : away;
}

function buildDuel(
  id: string,
  round: KnockoutDuel["round"],
  label: string,
  scoringLabel: string,
  scoringPhases: KnockoutPhaseId[],
  home: KnockoutEntrant,
  away: KnockoutEntrant,
  scores: ParticipantPhaseScore[]
): KnockoutDuel {
  const homePoints = scoreForPhases(home.participant?.id, scores, scoringPhases);
  const awayPoints = scoreForPhases(away.participant?.id, scores, scoringPhases);
  return {
    id,
    round,
    label,
    scoringLabel,
    scoringPhases,
    home,
    away,
    homePoints,
    awayPoints,
    winner: winner(home.participant, away.participant, homePoints, awayPoints)
  };
}

function entrant(sourceLabel: string, participant: SeededParticipant | null): KnockoutEntrant {
  return { sourceLabel, participant };
}

export function buildKnockoutBracket<TParticipant extends { id: string }>(
  standings: GroupStandingRow[],
  scores: ParticipantPhaseScore[],
  pointsRace: Array<PointsRaceRow<TParticipant>>
): KnockoutBracket<TParticipant> {
  const seeds = seedKnockoutParticipants(standings);
  const openingPairs: Array<[string, SeededParticipant | null, string, SeededParticipant | null]> = [
    ["1º melhor 1º", seedByPosition(seeds, 1, 1), "4º melhor 4º", seedByPosition(seeds, 4, 4)],
    ["4º melhor 2º", seedByPosition(seeds, 2, 4), "1º melhor 3º", seedByPosition(seeds, 3, 1)],
    ["2º melhor 1º", seedByPosition(seeds, 1, 2), "3º melhor 4º", seedByPosition(seeds, 4, 3)],
    ["3º melhor 2º", seedByPosition(seeds, 2, 3), "2º melhor 3º", seedByPosition(seeds, 3, 2)],
    ["3º melhor 1º", seedByPosition(seeds, 1, 3), "2º melhor 4º", seedByPosition(seeds, 4, 2)],
    ["2º melhor 2º", seedByPosition(seeds, 2, 2), "3º melhor 3º", seedByPosition(seeds, 3, 3)],
    ["4º melhor 1º", seedByPosition(seeds, 1, 4), "1º melhor 4º", seedByPosition(seeds, 4, 1)],
    ["1º melhor 2º", seedByPosition(seeds, 2, 1), "4º melhor 3º", seedByPosition(seeds, 3, 4)]
  ];
  const opening = openingPairs.map(([homeLabel, home, awayLabel, away], index) =>
    buildDuel(
      `opening-${index + 1}`,
      "OPENING",
      `16-avos ${index + 1}`,
      "16-avos + oitavas",
      ["ROUND_OF_32", "ROUND_OF_16"],
      entrant(homeLabel, home),
      entrant(awayLabel, away),
      scores
    )
  );

  const quarterFinals = [0, 2, 4, 6].map((openingIndex, index) =>
    buildDuel(
      `quarter-${index + 1}`,
      "QUARTER_FINAL",
      `Quartas ${index + 1}`,
      "Quartas de final",
      ["QUARTER_FINAL"],
      entrant(`Vencedor ${opening[openingIndex]?.label ?? "-"}`, opening[openingIndex]?.winner ?? null),
      entrant(`Vencedor ${opening[openingIndex + 1]?.label ?? "-"}`, opening[openingIndex + 1]?.winner ?? null),
      scores
    )
  );

  const semiFinals = [0, 2].map((quarterIndex, index) =>
    buildDuel(
      `semi-${index + 1}`,
      "SEMI_FINAL",
      `Semifinal ${index + 1}`,
      "Semifinais",
      ["SEMI_FINAL"],
      entrant(`Vencedor ${quarterFinals[quarterIndex]?.label ?? "-"}`, quarterFinals[quarterIndex]?.winner ?? null),
      entrant(`Vencedor ${quarterFinals[quarterIndex + 1]?.label ?? "-"}`, quarterFinals[quarterIndex + 1]?.winner ?? null),
      scores
    )
  );

  const finalists = semiFinals.map((duel) => duel.winner);
  const finalistIds = new Set(finalists.flatMap((row) => row?.id ?? []));
  const pointsRaceWildcard = pointsRace.find((row) => !finalistIds.has(row.id)) ?? null;

  return {
    seeds,
    opening,
    quarterFinals,
    semiFinals,
    final: {
      scoringLabel: "Final",
      scoringPhases: ["FINAL"],
      finalists,
      pointsRaceWildcard
    }
  };
}
