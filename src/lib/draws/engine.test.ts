import { describe, expect, it } from "vitest";
import { buildCarismaDraw, buildGroupDraw, rehearsalParticipants } from "./engine";

const participants = [
  ...Array.from({ length: 12 }, (_, index) => ({ id: `h${index}`, displayName: `Humano ${index}`, type: "HUMAN" as const })),
  ...Array.from({ length: 4 }, (_, index) => ({ id: `b${index}`, displayName: `Bot ${index}`, type: "BOT" as const })),
];

describe("draw engine", () => {
  it("places one bot and three humans in every group", () => {
    const { assignments } = buildGroupDraw(participants);
    for (const groupId of ["A", "B", "C", "D"]) {
      const group = assignments.filter((item) => item.groupId === groupId);
      expect(group).toHaveLength(4);
      expect(group.filter((item) => item.type === "BOT")).toHaveLength(1);
    }
  });

  it("uses the official bot names in rehearsal mode", () => {
    const rehearsal = rehearsalParticipants([]);
    expect(rehearsal.filter((row) => row.type === "BOT").map((row) => row.displayName)).toEqual([
      "Betinho Everyday",
      "Maria Vai com as Outras",
      "Faria Limmer",
      "Pangaré",
    ]);
  });

  it("allocates one team from each pot", () => {
    const teams = [1, 2, 3].flatMap((pot) => Array.from({ length: 16 }, (_, index) => ({ id: `${pot}-${index}`, name: `Time ${pot}-${index}`, pot: pot as 1 | 2 | 3 })));
    const { allocations } = buildCarismaDraw(participants, teams);
    expect(allocations.get("h0")).toHaveLength(3);
    expect(new Set(allocations.get("h0")?.map((team) => team.pot))).toEqual(new Set([1, 2, 3]));
  });
});
