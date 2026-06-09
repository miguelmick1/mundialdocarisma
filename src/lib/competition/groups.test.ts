import { describe, expect, it } from "vitest";
import { buildGroupFixtures, calculateGroupStandings, type GroupAssignment } from "./groups";

const assignments: GroupAssignment[] = [
  { id: "a", displayName: "A", type: "HUMAN", groupId: "A", slot: 1 },
  { id: "b", displayName: "B", type: "HUMAN", groupId: "A", slot: 2 },
  { id: "c", displayName: "C", type: "HUMAN", groupId: "A", slot: 3 },
  { id: "d", displayName: "D", type: "BOT", groupId: "A", slot: 4 },
];

describe("participant groups", () => {
  it("creates round-robin fixtures", () => {
    const fixtures = buildGroupFixtures(assignments);
    expect(fixtures).toHaveLength(6);
    expect(fixtures.filter((row) => row.round === 1)).toHaveLength(2);
  });

  it("assigns 3-1-0 points using round scores", () => {
    const standings = calculateGroupStandings(
      assignments,
      buildGroupFixtures(assignments),
      [
        { participantId: "a", round: 1, points: 20, exactHits: 2 },
        { participantId: "d", round: 1, points: 10, exactHits: 1 },
        { participantId: "b", round: 1, points: 15, exactHits: 0 },
        { participantId: "c", round: 1, points: 15, exactHits: 1 },
      ],
      new Set([1]),
    );
    expect(standings.find((row) => row.id === "a")?.tablePoints).toBe(3);
    expect(standings.find((row) => row.id === "b")?.tablePoints).toBe(1);
    expect(standings.find((row) => row.id === "c")?.tablePoints).toBe(1);
  });
});
