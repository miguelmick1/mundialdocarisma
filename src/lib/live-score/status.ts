export const LIVE_SHORT_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
export const FINISHED_SHORT_STATUSES = new Set(["FT", "AET", "PEN"]);
export const REVIEW_SHORT_STATUSES = new Set(["PST", "CANC", "ABD", "SUSP", "AWD", "WO"]);

export function localStatusForApi(short: string): "SCHEDULED" | "LIVE" | "HALFTIME" | "EXTRA_TIME" | "FINISHED_PROVISIONAL" | null {
  if (short === "NS" || short === "TBD") return "SCHEDULED";
  if (short === "HT") return "HALFTIME";
  if (["ET", "BT", "P"].includes(short)) return "EXTRA_TIME";
  if (["1H", "2H", "LIVE", "INT"].includes(short)) return "LIVE";
  if (FINISHED_SHORT_STATUSES.has(short)) return "FINISHED_PROVISIONAL";
  return null;
}
