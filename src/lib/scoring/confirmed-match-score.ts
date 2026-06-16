function validStoredScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function resolveConfirmedMatchActualScore(match: {
  homeScore90?: unknown;
  awayScore90?: unknown;
  homeScore120?: unknown;
  awayScore120?: unknown;
}) {
  const homeScore90 = validStoredScore(match.homeScore90);
  const awayScore90 = validStoredScore(match.awayScore90);
  const homeScore120 = validStoredScore(match.homeScore120);
  const awayScore120 = validStoredScore(match.awayScore120);
  return {
    home: homeScore120 ?? homeScore90,
    away: awayScore120 ?? awayScore90,
  };
}
