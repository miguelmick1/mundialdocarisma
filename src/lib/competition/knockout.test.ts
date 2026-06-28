import { describe, expect, it } from "vitest";
import { buildKnockoutBracket, seedKnockoutParticipants, type PointsRaceRow } from "./knockout";
import type { GroupStandingRow } from "./groups";

function row(
  id: string,
  groupId: "A" | "B" | "C" | "D",
  tablePoints: number,
  pointsFor: number,
): GroupStandingRow {
  return {
    id,
    displayName: id.toUpperCase(),
    type: "HUMAN",
    groupId,
    slot: 1,
    played: 3,
    wins: tablePoints / 3,
    draws: 0,
    losses: 0,
    tablePoints,
    pointsFor,
    pointsAgainst: 0,
    pointDifference: pointsFor,
    exactHits: 0,
  };
}

const standings: GroupStandingRow[] = [
  row("a1", "A", 9, 100), row("a2", "A", 6, 80), row("a3", "A", 3, 60), row("a4", "A", 0, 40),
  row("b1", "B", 9, 90), row("b2", "B", 6, 70), row("b3", "B", 3, 65), row("b4", "B", 0, 45),
  row("c1", "C", 9, 95), row("c2", "C", 6, 75), row("c3", "C", 3, 55), row("c4", "C", 0, 35),
  row("d1", "D", 9, 85), row("d2", "D", 6, 72), row("d3", "D", 3, 50), row("d4", "D", 0, 30),
];

describe("competition knockout bracket", () => {
  it("orders each group-position pool by total betting points", () => {
    const seeds = seedKnockoutParticipants(standings);
    expect(seeds.filter((seed) => seed.groupPosition === 1).map((seed) => seed.id)).toEqual(["a1", "c1", "b1", "d1"]);
    expect(seeds.filter((seed) => seed.groupPosition === 4).map((seed) => seed.id)).toEqual(["b4", "a4", "c4", "d4"]);
  });

  it("connects best first versus worst fourth to worst second versus best third", () => {
    const pointsRace: Array<PointsRaceRow<GroupStandingRow>> = standings.map((participant, index) => ({
      ...participant,
      totalPoints: 200 - index,
      exactHits: 0,
      racePosition: index + 1,
    }));
    const bracket = buildKnockoutBracket(standings, [], pointsRace);
    expect(bracket.opening[0]?.home.participant?.id).toBe("a1");
    expect(bracket.opening[0]?.away.participant?.id).toBe("d4");
    expect(bracket.opening[1]?.home.participant?.id).toBe("b2");
    expect(bracket.opening[1]?.away.participant?.id).toBe("b3");
    expect(bracket.quarterFinals[0]?.home.sourceLabel).toBe("Vencedor 16-avos 1");
    expect(bracket.quarterFinals[0]?.away.sourceLabel).toBe("Vencedor 16-avos 2");
  });
});
