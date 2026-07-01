import type { CarismaRoundId } from "@/lib/world-cup/rounds";

export type TimedPredictionFilter = CarismaRoundId | "FINALS";

const ROUND_OF_16_START = Date.UTC(2026, 6, 4, 3);
const QUARTER_FINAL_START = Date.UTC(2026, 6, 8, 3);
const SEMI_FINAL_START = Date.UTC(2026, 6, 12, 3);
const FINALS_START = Date.UTC(2026, 6, 16, 3);

export function defaultPredictionFilterForDate(value: Date): TimedPredictionFilter {
  const time = value.getTime();
  if (time >= FINALS_START) return "FINALS";
  if (time >= SEMI_FINAL_START) return "SEMI_FINAL";
  if (time >= QUARTER_FINAL_START) return "QUARTER_FINAL";
  if (time >= ROUND_OF_16_START) return "ROUND_OF_16";
  return "ROUND_OF_32";
}
