import {
  CARISMA_ROUNDS,
  CARISMA_ROUND_LABELS,
  carismaRoundIdForMatch,
  type CarismaRoundId,
} from "@/lib/world-cup/rounds";

const LIVE_STATUSES = new Set(["LIVE", "HALFTIME", "EXTRA_TIME", "FINISHED_PROVISIONAL"]);

export type InsightParticipant = {
  id: string;
  displayName: string;
  participantType: "HUMAN" | "BOT";
  avatarUrl: string | null;
};

export type InsightGuess = {
  guessId: string;
  matchId: string;
  participantId: string;
  slot: number;
  homeScore: number;
  awayScore: number;
  administrativelyEntered: boolean;
};

export type InsightScoreComponent = {
  code: string;
  label: string;
  points: number;
};

export type InsightScoreEvent = {
  matchId: string;
  participantId: string;
  slot: number;
  totalPoints: number;
  baseCode: string | null;
  components: InsightScoreComponent[];
};

export type InsightMatch = {
  id: string;
  matchNumber: number;
  phase: string;
  group?: string | null;
  groupRound?: number | null;
  kickoffAt: string | null;
  status: string;
  scoringStatus: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamIso2?: string | null;
  venue?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  resultCalculated: boolean;
  isVoid: boolean;
};

export type RoundCell = {
  matchId: string;
  guessText: string;
  guesses: InsightGuess[];
  points: number | null;
  basePoints: number | null;
  baseCode: string | null;
  revealed: boolean;
  resultCalculated: boolean;
  isVoid: boolean;
  isOnlyScorer: boolean;
  isOnlyExact: boolean;
  isOnlyZero: boolean;
  audacityScore: number | null;
};

export type RoundParticipantRow = InsightParticipant & {
  participantId: string;
  totalPoints: number;
  totalBasePoints: number;
  exactHits: number;
  guessedMatches: number;
  scoredMatches: number;
  cells: RoundCell[];
};

export type RoundMatchSummary = InsightMatch & {
  roundId: CarismaRoundId;
  roundLabel: string;
  phaseLabel: string;
  revealed: boolean;
};

export type RoundMeta = {
  id: CarismaRoundId;
  label: string;
  matchCount: number;
  revealedCount: number;
  calculatedCount: number;
  liveCount: number;
  startsAt: string | null;
  endsAt: string | null;
};

export type RoundSummary = {
  roundId: CarismaRoundId;
  roundLabel: string;
  matches: RoundMatchSummary[];
  participants: RoundParticipantRow[];
  currentTime: string;
};

export type RoundInsightsPayload = {
  rounds: RoundMeta[];
  defaultRoundId: CarismaRoundId;
};

type BestEvent = InsightScoreEvent & {
  basePoints: number;
};

function sortParticipants(a: InsightParticipant, b: InsightParticipant) {
  return (
    Number(a.participantType === "BOT") - Number(b.participantType === "BOT") ||
    a.displayName.localeCompare(b.displayName, "pt-BR")
  );
}

function guessText(guesses: InsightGuess[]) {
  if (!guesses.length) return "Sem palpite";
  return guesses.map((guess) => `${guess.homeScore} x ${guess.awayScore}`).join(" / ");
}

function nonBonusPoints(components: InsightScoreComponent[], totalPoints: number) {
  if (!components.length) return totalPoints;
  return components.reduce((sum, component) => (
    component.code.startsWith("BONUS_") ? sum : sum + component.points
  ), 0);
}

function phaseLabel(match: InsightMatch) {
  if (match.phase === "GROUP_STAGE") return `Grupo ${match.group ?? "-"} · Rodada ${match.groupRound ?? "-"}`;
  const labels: Record<string, string> = {
    ROUND_OF_32: "16-avos de final",
    ROUND_OF_16: "Oitavas de final",
    QUARTER_FINAL: "Quartas de final",
    SEMI_FINAL: "Semifinais",
    THIRD_PLACE: "Disputa de 3º lugar",
    FINAL: "Final",
  };
  return labels[match.phase] ?? match.phase;
}

function bestEventByMatchParticipant(events: InsightScoreEvent[]) {
  const best = new Map<string, BestEvent>();
  for (const event of events) {
    const key = `${event.matchId}:${event.participantId}`;
    const current = best.get(key);
    if (
      !current ||
      event.totalPoints > current.totalPoints ||
      (event.totalPoints === current.totalPoints && event.slot < current.slot)
    ) {
      best.set(key, {
        ...event,
        basePoints: nonBonusPoints(event.components, event.totalPoints),
      });
    }
  }
  return best;
}

function guessesByMatchParticipant(guesses: InsightGuess[]) {
  const mapped = new Map<string, InsightGuess[]>();
  for (const guess of guesses) {
    const key = `${guess.matchId}:${guess.participantId}`;
    const rows = mapped.get(key) ?? [];
    rows.push(guess);
    rows.sort((a, b) => a.slot - b.slot);
    mapped.set(key, rows);
  }
  return mapped;
}

function matchesByRound(matches: InsightMatch[], now: number) {
  const grouped = new Map<CarismaRoundId, RoundMatchSummary[]>();
  for (const match of matches) {
    const roundId = carismaRoundIdForMatch(match.phase, match.groupRound);
    if (!roundId) continue;
    const kickoffTime = match.kickoffAt ? new Date(match.kickoffAt).getTime() : Number.POSITIVE_INFINITY;
    const revealed = Number.isFinite(kickoffTime)
      ? now >= kickoffTime || match.status !== "SCHEDULED"
      : match.status !== "SCHEDULED";
    const rows = grouped.get(roundId) ?? [];
    rows.push({
      ...match,
      roundId,
      roundLabel: CARISMA_ROUND_LABELS[roundId],
      phaseLabel: phaseLabel(match),
      revealed,
    });
    grouped.set(roundId, rows);
  }

  grouped.forEach((rows, roundId) => {
    rows.sort((a, b) => (
      Number(a.kickoffAt ? new Date(a.kickoffAt).getTime() : 0) -
      Number(b.kickoffAt ? new Date(b.kickoffAt).getTime() : 0) ||
      a.matchNumber - b.matchNumber
    ));
    grouped.set(roundId, rows);
  });
  return grouped;
}

export function buildRoundCatalog(matches: InsightMatch[], now = Date.now()): RoundInsightsPayload {
  const grouped = matchesByRound(matches, now);
  const rounds = CARISMA_ROUNDS
    .map((roundId) => {
      const roundMatches = grouped.get(roundId) ?? [];
      if (!roundMatches.length) return null;
      const kickoffTimes = roundMatches
        .map((match) => match.kickoffAt ? new Date(match.kickoffAt).getTime() : null)
        .filter((value): value is number => value != null && Number.isFinite(value));
      return {
        id: roundId,
        label: CARISMA_ROUND_LABELS[roundId],
        matchCount: roundMatches.length,
        revealedCount: roundMatches.filter((match) => match.revealed).length,
        calculatedCount: roundMatches.filter((match) => match.resultCalculated).length,
        liveCount: roundMatches.filter((match) => LIVE_STATUSES.has(match.status)).length,
        startsAt: kickoffTimes.length ? new Date(Math.min(...kickoffTimes)).toISOString() : null,
        endsAt: kickoffTimes.length ? new Date(Math.max(...kickoffTimes)).toISOString() : null,
      } satisfies RoundMeta;
    })
    .filter((row): row is RoundMeta => Boolean(row));

  const liveRound = rounds.find((round) => round.liveCount > 0)?.id;
  const nextRound = rounds
    .filter((round) => round.startsAt && new Date(round.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())[0]?.id;
  const recentRound = [...rounds]
    .sort((a, b) => new Date(b.endsAt ?? 0).getTime() - new Date(a.endsAt ?? 0).getTime())[0]?.id;

  return {
    rounds,
    defaultRoundId: liveRound ?? nextRound ?? recentRound ?? "GROUP_1",
  };
}

export function buildRoundSummary(
  roundId: CarismaRoundId,
  participants: InsightParticipant[],
  matches: InsightMatch[],
  guesses: InsightGuess[],
  scoreEvents: InsightScoreEvent[],
  now = Date.now(),
): RoundSummary {
  const roundMatches = matchesByRound(matches, now).get(roundId) ?? [];
  const sortedParticipants = [...participants].sort(sortParticipants);
  const eventIndex = bestEventByMatchParticipant(scoreEvents);
  const guessIndex = guessesByMatchParticipant(guesses);
  const audacityByMatchParticipant = new Map<string, number>();

  for (const match of roundMatches) {
    const guessedRows = sortedParticipants.map((participant) => ({
      participantId: participant.id,
      guesses: guessIndex.get(`${match.id}:${participant.id}`) ?? [],
    }));
    const withGuesses = guessedRows.filter((row) => row.guesses.length > 0);
    if (!withGuesses.length) continue;
    const avgHome = withGuesses.reduce((sum, row) => sum + row.guesses[0]!.homeScore, 0) / withGuesses.length;
    const avgAway = withGuesses.reduce((sum, row) => sum + row.guesses[0]!.awayScore, 0) / withGuesses.length;
    for (const row of withGuesses) {
      const firstGuess = row.guesses[0]!;
      const score = Math.abs(firstGuess.homeScore - avgHome) + Math.abs(firstGuess.awayScore - avgAway);
      audacityByMatchParticipant.set(`${match.id}:${row.participantId}`, Number(score.toFixed(2)));
    }
  }

  const cellsByParticipant = new Map<string, RoundCell[]>();
  for (const participant of sortedParticipants) {
    cellsByParticipant.set(participant.id, []);
  }

  for (const match of roundMatches) {
    const rows = sortedParticipants.map((participant) => {
      const guessesForParticipant = guessIndex.get(`${match.id}:${participant.id}`) ?? [];
      const event = eventIndex.get(`${match.id}:${participant.id}`) ?? null;
      return {
        participantId: participant.id,
        guesses: guessesForParticipant,
        points: match.resultCalculated && !match.isVoid ? event?.totalPoints ?? 0 : null,
        basePoints: match.resultCalculated && !match.isVoid ? event?.basePoints ?? 0 : null,
        baseCode: match.resultCalculated && !match.isVoid ? event?.baseCode ?? null : null,
      };
    });

    const positiveRows = rows.filter((row) => row.points != null && row.points > 0);
    const exactRows = rows.filter((row) => row.baseCode === "BASE_EXACT_SCORE");
    const zeroRows = rows.filter((row) => row.points != null && row.points === 0);

    for (const row of rows) {
      cellsByParticipant.get(row.participantId)?.push({
        matchId: match.id,
        guessText: guessText(row.guesses),
        guesses: row.guesses,
        points: row.points,
        basePoints: row.basePoints,
        baseCode: row.baseCode,
        revealed: match.revealed,
        resultCalculated: match.resultCalculated,
        isVoid: match.isVoid,
        isOnlyScorer: row.points != null && row.points > 0 && positiveRows.length === 1,
        isOnlyExact: row.baseCode === "BASE_EXACT_SCORE" && exactRows.length === 1,
        isOnlyZero: row.points === 0 && zeroRows.length === 1,
        audacityScore: audacityByMatchParticipant.get(`${match.id}:${row.participantId}`) ?? null,
      });
    }
  }

  const participantRows = sortedParticipants.map((participant) => {
    const cells = cellsByParticipant.get(participant.id) ?? [];
    return {
      ...participant,
      participantId: participant.id,
      totalPoints: cells.reduce((sum, cell) => sum + (cell.points ?? 0), 0),
      totalBasePoints: cells.reduce((sum, cell) => sum + (cell.basePoints ?? 0), 0),
      exactHits: cells.filter((cell) => cell.baseCode === "BASE_EXACT_SCORE").length,
      guessedMatches: cells.filter((cell) => cell.guesses.length > 0).length,
      scoredMatches: cells.filter((cell) => (cell.points ?? 0) > 0).length,
      cells,
    } satisfies RoundParticipantRow;
  });

  return {
    roundId,
    roundLabel: CARISMA_ROUND_LABELS[roundId],
    matches: roundMatches,
    participants: participantRows,
    currentTime: new Date(now).toISOString(),
  };
}
