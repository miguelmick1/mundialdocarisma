export type ParticipantType = "HUMAN" | "BOT" | "PLACEHOLDER";

export type CompetitionParticipant = {
  id: string;
  displayName: string;
  type: ParticipantType;
  avatarUrl?: string | null;
};

export type GroupAssignment = CompetitionParticipant & {
  groupId: "A" | "B" | "C" | "D";
  slot: 1 | 2 | 3 | 4;
};

export type GroupFixture = {
  id: string;
  groupId: "A" | "B" | "C" | "D";
  round: 1 | 2 | 3;
  homeParticipantId: string;
  awayParticipantId: string;
};

export type ParticipantRoundScore = {
  participantId: string;
  round: 1 | 2 | 3;
  points: number;
  exactHits: number;
};

export type GroupStandingRow = GroupAssignment & {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  tablePoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  exactHits: number;
};

const GROUPS = ["A", "B", "C", "D"] as const;
const ROUND_PAIRINGS: Record<1 | 2 | 3, Array<[1 | 2 | 3 | 4, 1 | 2 | 3 | 4]>> = {
  1: [[1, 4], [2, 3]],
  2: [[1, 3], [4, 2]],
  3: [[1, 2], [3, 4]],
};

export function buildGroupFixtures(assignments: GroupAssignment[]): GroupFixture[] {
  const fixtures: GroupFixture[] = [];
  for (const groupId of GROUPS) {
    const group = assignments.filter((item) => item.groupId === groupId);
    const bySlot = new Map(group.map((item) => [item.slot, item]));
    for (const round of [1, 2, 3] as const) {
      for (const [homeSlot, awaySlot] of ROUND_PAIRINGS[round]) {
        const home = bySlot.get(homeSlot);
        const away = bySlot.get(awaySlot);
        if (!home || !away) continue;
        fixtures.push({
          id: `${groupId}_${round}_${home.id}_${away.id}`,
          groupId,
          round,
          homeParticipantId: home.id,
          awayParticipantId: away.id,
        });
      }
    }
  }
  return fixtures;
}

export function calculateGroupStandings(
  assignments: GroupAssignment[],
  fixtures: GroupFixture[],
  roundScores: ParticipantRoundScore[],
  completedRounds: Set<number>,
): GroupStandingRow[] {
  const scores = new Map(
    roundScores.map((row) => [`${row.participantId}:${row.round}`, row]),
  );
  const rows = new Map<string, GroupStandingRow>();
  for (const assignment of assignments) {
    rows.set(assignment.id, {
      ...assignment,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      tablePoints: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      exactHits: 0,
    });
  }

  for (const fixture of fixtures) {
    if (!completedRounds.has(fixture.round)) continue;
    const home = rows.get(fixture.homeParticipantId);
    const away = rows.get(fixture.awayParticipantId);
    if (!home || !away) continue;
    const homeScore = scores.get(`${home.id}:${fixture.round}`) ?? {
      participantId: home.id,
      round: fixture.round,
      points: 0,
      exactHits: 0,
    };
    const awayScore = scores.get(`${away.id}:${fixture.round}`) ?? {
      participantId: away.id,
      round: fixture.round,
      points: 0,
      exactHits: 0,
    };

    home.played += 1;
    away.played += 1;
    home.pointsFor += homeScore.points;
    home.pointsAgainst += awayScore.points;
    away.pointsFor += awayScore.points;
    away.pointsAgainst += homeScore.points;
    home.exactHits += homeScore.exactHits;
    away.exactHits += awayScore.exactHits;

    if (homeScore.points > awayScore.points) {
      home.wins += 1;
      home.tablePoints += 3;
      away.losses += 1;
    } else if (awayScore.points > homeScore.points) {
      away.wins += 1;
      away.tablePoints += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.tablePoints += 1;
      away.tablePoints += 1;
    }
  }

  for (const row of rows.values()) {
    row.pointDifference = row.pointsFor - row.pointsAgainst;
  }

  return [...rows.values()].sort(compareStandingRows);
}

export function compareStandingRows(a: GroupStandingRow, b: GroupStandingRow) {
  return (
    b.tablePoints - a.tablePoints ||
    b.pointsFor - a.pointsFor ||
    b.pointDifference - a.pointDifference ||
    b.exactHits - a.exactHits ||
    a.displayName.localeCompare(b.displayName, "pt-BR")
  );
}

export function seedParticipants(rows: GroupStandingRow[]) {
  const grouped = GROUPS.flatMap((groupId) => {
    const groupRows = rows.filter((row) => row.groupId === groupId).sort(compareStandingRows);
    return groupRows.map((row, index) => ({ ...row, groupPosition: index + 1 }));
  });
  return grouped.sort((a, b) =>
    a.groupPosition - b.groupPosition || compareStandingRows(a, b),
  );
}

export function selectByeParticipants(rows: GroupStandingRow[]) {
  return GROUPS.map((groupId) =>
    rows.filter((row) => row.groupId === groupId).sort(compareStandingRows)[0],
  )
    .filter((row): row is GroupStandingRow => Boolean(row))
    .sort(compareStandingRows)
    .slice(0, 2);
}
