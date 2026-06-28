export const ADVANCING_PHASES = ["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL"] as const;

export function isAdvancingPhase(phase: unknown): boolean {
  return typeof phase === "string" && ADVANCING_PHASES.includes(phase as (typeof ADVANCING_PHASES)[number]);
}

export function isUnresolvedTeamId(value: unknown): boolean {
  return typeof value === "string" && (/^W\d+$/.test(value) || /^L\d+$/.test(value) || /^[123][A-Z/]+$/.test(value));
}

export function resolveQualifiedTeamId(
  match: { homeTeamId?: unknown; awayTeamId?: unknown },
  actual: { home: number; away: number },
  requestedTeamId?: string
) {
  const homeTeamId = String(match.homeTeamId ?? "");
  const awayTeamId = String(match.awayTeamId ?? "");
  if (requestedTeamId) {
    if (requestedTeamId !== homeTeamId && requestedTeamId !== awayTeamId) {
      throw new Error("INVALID_QUALIFIED_TEAM");
    }
    return requestedTeamId;
  }
  if (actual.home > actual.away) return homeTeamId;
  if (actual.away > actual.home) return awayTeamId;
  throw new Error("QUALIFIED_TEAM_REQUIRED");
}
