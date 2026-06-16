import { describe, expect, it } from "vitest";
import { competitionGroupLabel } from "@/lib/competition/group-names";

describe("competition group names", () => {
  it("maps participant groups to the custom display names", () => {
    expect(competitionGroupLabel("A")).toBe("Grupo Julius Buth");
    expect(competitionGroupLabel("B")).toBe("Grupo Viviane Mindf*cker");
    expect(competitionGroupLabel("C")).toBe("Grupo Rosa Norte");
    expect(competitionGroupLabel("D")).toBe("Grupo Metal Dwarf");
  });

  it("falls back safely for missing or unknown groups", () => {
    expect(competitionGroupLabel(null)).toBe("Sem grupo");
    expect(competitionGroupLabel("Z")).toBe("Grupo Z");
  });
});
