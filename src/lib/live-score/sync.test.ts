import { describe, expect, it } from "vitest";
import { localStatusForApi } from "./status";

describe("API-Football status mapping", () => {
  it("maps live and final statuses", () => {
    expect(localStatusForApi("1H")).toBe("LIVE");
    expect(localStatusForApi("HT")).toBe("HALFTIME");
    expect(localStatusForApi("ET")).toBe("EXTRA_TIME");
    expect(localStatusForApi("FT")).toBe("FINISHED_PROVISIONAL");
    expect(localStatusForApi("PEN")).toBe("FINISHED_PROVISIONAL");
  });

  it("does not automatically void abnormal matches", () => {
    expect(localStatusForApi("PST")).toBeNull();
    expect(localStatusForApi("ABD")).toBeNull();
  });
});
