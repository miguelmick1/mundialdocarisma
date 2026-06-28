import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { calculateMatchScores, MATCH_SCORING_RULE_SET_VERSION } from "@/lib/scoring/match";
import { recalculateOverallRankings } from "@/lib/scoring/recalculate";
import { resolveConfirmedMatchActualScore } from "@/lib/scoring/confirmed-match-score";
import { carismaRoundIdForMatch, isGroupRound } from "@/lib/world-cup/rounds";

type NormalizedGuess = {
  doc: FirebaseFirestore.QueryDocumentSnapshot;
  participantId: string;
  participantName: string;
  slot: number;
  source: string;
  guess: { home: number; away: number };
};

type PlannedScoreEvent = {
  id: string;
  matchId: string;
  participantId: string;
  participantName: string;
  guessId: string;
  slot: number;
  ruleSetVersion: number;
  baseCode: string;
  totalPoints: number;
  components: Array<{ code: string; label: string; points: number; metadata?: Record<string, unknown> }>;
  active: true;
  recalculatedAfterAdministrativeGuess: true;
};

export type MatchScoreRepairChange = {
  eventId: string;
  participantId: string;
  participantName: string;
  slot: number;
  kind: "CREATE" | "UPDATE" | "REMOVE";
  before: {
    totalPoints: number | null;
    baseCode: string | null;
    components: unknown[] | null;
  } | null;
  after: {
    totalPoints: number | null;
    baseCode: string | null;
    components: unknown[] | null;
  } | null;
};

function normalizeGuessScore(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeGuesses(guessesSnap: FirebaseFirestore.QuerySnapshot) {
  return guessesSnap.docs.flatMap((doc) => {
    const guess = doc.data();
    const participantId = typeof guess.participantId === "string" ? guess.participantId.trim() : "";
    const home = normalizeGuessScore(guess.homeScore);
    const away = normalizeGuessScore(guess.awayScore);
    const slot = Number(guess.slot ?? 1);
    if (!participantId || home === null || away === null || !Number.isInteger(slot)) return [];
    return [{
      doc,
      participantId,
      participantName: typeof guess.participantName === "string" && guess.participantName.trim()
        ? guess.participantName.trim()
        : participantId,
      slot,
      source: String(guess.source ?? (participantId.startsWith("bot-") ? "BOT_AUTOMATIC" : "HUMAN")),
      guess: { home, away },
    } satisfies NormalizedGuess];
  });
}

async function buildConfirmedMatchRecalculationPlan(matchId: string) {
  const matchSnap = await adminDb.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) throw new Error("MATCH_NOT_FOUND");
  const match = matchSnap.data()!;
  if (match.status !== "FINISHED" && match.scoringStatus !== "CALCULATED") {
    return null;
  }

  const actual = resolveConfirmedMatchActualScore(match);
  if (actual.home === null || actual.away === null) throw new Error("MATCH_SCORE_MISSING");

  const [guessesSnap, existingEventsSnap] = await Promise.all([
    adminDb.collection("guesses").where("matchId", "==", matchId).get(),
    adminDb.collection("scoreEvents").where("matchId", "==", matchId).get(),
  ]);

  const roundId = match.competitionRoundId ?? carismaRoundIdForMatch(match.phase, match.groupRound);
  const carismaByParticipant = new Map<string, string>();
  if (roundId) {
    const selections = isGroupRound(roundId)
      ? await adminDb.collection("carismaSelections").where("roundId", "in", ["GROUP_1", "GROUP_2", "GROUP_3"]).get()
      : await adminDb.collection("carismaSelections").where("roundId", "==", roundId).get();
    const selectionIndex = buildCarismaSelectionIndex(selections.docs.map((doc) => doc.data()));
    for (const [key, selection] of selectionIndex.byRoundParticipant) {
      if (key.startsWith(`${roundId}:`)) carismaByParticipant.set(selection.participantId, selection.teamId);
    }
  }

  const normalizedGuesses = normalizeGuesses(guessesSnap);
  const scored = calculateMatchScores({
    actual: { home: actual.home, away: actual.away },
    homeTeamId: String(match.homeTeamId ?? ""),
    awayTeamId: String(match.awayTeamId ?? ""),
    guesses: normalizedGuesses.map((entry) => ({
      participantId: entry.participantId,
      slot: entry.slot,
      source: entry.source,
      guess: entry.guess,
      ...(carismaByParticipant.has(entry.participantId)
        ? { carismaTeamId: carismaByParticipant.get(entry.participantId)! }
        : {}),
    })),
  });
  const scoreByGuess = new Map(scored.map((entry) => [`${entry.participantId}:${entry.slot}`, entry]));
  const plannedEvents = new Map<string, PlannedScoreEvent>();

  for (const entry of normalizedGuesses) {
    const result = scoreByGuess.get(`${entry.participantId}:${entry.slot}`);
    if (!result) continue;
    const id = `${matchId}_${entry.participantId}_${entry.slot}_v2`;
    plannedEvents.set(id, {
      id,
      matchId,
      participantId: entry.participantId,
      participantName: entry.participantName,
      guessId: entry.doc.id,
      slot: entry.slot,
      ruleSetVersion: MATCH_SCORING_RULE_SET_VERSION,
      baseCode: result.baseCode,
      totalPoints: result.result.total,
      components: result.result.components,
      active: true,
      recalculatedAfterAdministrativeGuess: true,
    });
  }

  return {
    match,
    actual,
    existingEventsSnap,
    plannedEvents,
  };
}

function comparableEvent(data: FirebaseFirestore.DocumentData | PlannedScoreEvent | null) {
  if (!data) return null;
  return {
    totalPoints: Number(data.totalPoints ?? 0),
    baseCode: typeof data.baseCode === "string" ? data.baseCode : null,
    components: Array.isArray(data.components) ? data.components : null,
  };
}

function sameEventPayload(
  current: FirebaseFirestore.DocumentData | undefined,
  planned: PlannedScoreEvent,
) {
  if (!current) return false;
  return JSON.stringify(comparableEvent(current)) === JSON.stringify(comparableEvent(planned));
}

export async function previewRecalculatedConfirmedMatchScores(matchId: string) {
  const plan = await buildConfirmedMatchRecalculationPlan(matchId);
  if (!plan) return { applies: false as const, matchId, changes: [] as MatchScoreRepairChange[] };

  const activeExisting = new Map(
    plan.existingEventsSnap.docs
      .filter((doc) => doc.data().active === true)
      .map((doc) => [doc.id, doc.data()]),
  );
  const changes: MatchScoreRepairChange[] = [];

  for (const [eventId, current] of activeExisting.entries()) {
    const planned = plan.plannedEvents.get(eventId);
    if (!planned) {
      changes.push({
        eventId,
        participantId: String(current.participantId ?? ""),
        participantName: typeof current.participantName === "string" ? current.participantName : String(current.participantId ?? ""),
        slot: Number(current.slot ?? 1),
        kind: "REMOVE",
        before: comparableEvent(current),
        after: null,
      });
      continue;
    }
    if (!sameEventPayload(current, planned)) {
      changes.push({
        eventId,
        participantId: planned.participantId,
        participantName: planned.participantName,
        slot: planned.slot,
        kind: "UPDATE",
        before: comparableEvent(current),
        after: comparableEvent(planned),
      });
    }
  }

  for (const [eventId, planned] of plan.plannedEvents.entries()) {
    if (activeExisting.has(eventId)) continue;
    changes.push({
      eventId,
      participantId: planned.participantId,
      participantName: planned.participantName,
      slot: planned.slot,
      kind: "CREATE",
      before: null,
      after: comparableEvent(planned),
    });
  }

  return {
    applies: true as const,
    matchId,
    actual: plan.actual,
    changes,
  };
}

export async function recalculateConfirmedMatchScores(
  matchId: string,
  supersededReason: string,
): Promise<boolean> {
  const plan = await buildConfirmedMatchRecalculationPlan(matchId);
  if (!plan) return false;
  const targetEventIds = new Set(plan.plannedEvents.keys());

  const batch = adminDb.batch();
  plan.existingEventsSnap.docs
    .filter((doc) => doc.data().active === true && !targetEventIds.has(doc.id))
    .forEach((doc) => batch.update(doc.ref, {
      active: false,
      supersededAt: FieldValue.serverTimestamp(),
      supersededReason,
    }));

  for (const planned of plan.plannedEvents.values()) {
    batch.set(adminDb.collection("scoreEvents").doc(planned.id), {
      matchId: planned.matchId,
      participantId: planned.participantId,
      participantName: planned.participantName,
      guessId: planned.guessId,
      slot: planned.slot,
      ruleSetVersion: planned.ruleSetVersion,
      baseCode: planned.baseCode,
      totalPoints: planned.totalPoints,
      components: planned.components,
      active: planned.active,
      calculatedAt: FieldValue.serverTimestamp(),
      recalculatedAfterAdministrativeGuess: planned.recalculatedAfterAdministrativeGuess,
    });
  }

  await batch.commit();
  await recalculateOverallRankings();
  return true;
}
