import { describe, expect, it } from "vitest";
import { defaultPredictionFilterForDate } from "@/lib/world-cup/prediction-filter";

describe("defaultPredictionFilterForDate", () => {
  it("selects 16-avos through July 3 in Sao Paulo", () => {
    expect(defaultPredictionFilterForDate(new Date("2026-07-01T12:00:00-03:00"))).toBe("ROUND_OF_32");
    expect(defaultPredictionFilterForDate(new Date("2026-07-03T23:59:00-03:00"))).toBe("ROUND_OF_32");
  });

  it("selects each knockout phase on the requested date windows", () => {
    expect(defaultPredictionFilterForDate(new Date("2026-07-04T00:00:00-03:00"))).toBe("ROUND_OF_16");
    expect(defaultPredictionFilterForDate(new Date("2026-07-08T00:00:00-03:00"))).toBe("QUARTER_FINAL");
    expect(defaultPredictionFilterForDate(new Date("2026-07-12T00:00:00-03:00"))).toBe("SEMI_FINAL");
    expect(defaultPredictionFilterForDate(new Date("2026-07-16T00:00:00-03:00"))).toBe("FINALS");
  });
});
