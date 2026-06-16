import { adminDb } from "@/lib/firebase/admin";
import { botDisplayName } from "@/lib/bots/identities";
import { processAutomaticBotGuessesSafely } from "@/lib/bots/automation";
import type {
  InsightGuess,
  InsightMatch,
  InsightParticipant,
  InsightScoreComponent,
  InsightScoreEvent,
} from "@/lib/competition/round-insights";

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionalScore(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeComponents(value: unknown): InsightScoreComponent[] {
  if (!Array.isArray(value)) return [];
  return value.map((component) => ({
    code: typeof component?.code === "string" ? component.code : "",
    label: typeof component?.label === "string" ? component.label : "Pontuação",
    points: safeNumber(component?.points),
  }));
}

export async function loadRoundInsightsData(): Promise<{
  participants: InsightParticipant[];
  matches: InsightMatch[];
  guesses: InsightGuess[];
  scoreEvents: InsightScoreEvent[];
}> {
  await processAutomaticBotGuessesSafely();

  const [matchesSnap, usersSnap, botsSnap, guessesSnap, scoreEventsSnap] = await Promise.all([
    adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get(),
    adminDb.collection("users").get(),
    adminDb.collection("participants").get(),
    adminDb.collection("guesses").get(),
    adminDb.collection("scoreEvents").where("active", "==", true).get(),
  ]);

  const participants = new Map<string, InsightParticipant>();
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.status === "INACTIVE") continue;
    participants.set(doc.id, {
      id: doc.id,
      displayName: typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName.trim()
        : typeof data.email === "string" ? data.email : "Participante",
      participantType: "HUMAN",
      avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    });
  }

  for (const doc of botsSnap.docs) {
    const data = doc.data();
    if (data.type !== "BOT" || data.status === "INACTIVE") continue;
    participants.set(doc.id, {
      id: doc.id,
      displayName: botDisplayName({
        id: doc.id,
        strategy: typeof data.botStrategy === "string" ? data.botStrategy : undefined,
        fallback: typeof data.displayName === "string" ? data.displayName : doc.id,
      }),
      participantType: "BOT",
      avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    });
  }

  const guesses: InsightGuess[] = [];
  for (const doc of guessesSnap.docs) {
    const data = doc.data();
    const matchId = typeof data.matchId === "string" ? data.matchId : "";
    const participantId = typeof data.participantId === "string" ? data.participantId : "";
    if (!matchId || !participantId) continue;
    if (!participants.has(participantId)) {
      participants.set(participantId, {
        id: participantId,
        displayName: typeof data.participantName === "string" ? data.participantName : participantId,
        participantType: data.source === "HUMAN" ? "HUMAN" : "BOT",
        avatarUrl: null,
      });
    }
    guesses.push({
      guessId: doc.id,
      matchId,
      participantId,
      slot: safeNumber(data.slot ?? 1),
      homeScore: safeNumber(data.homeScore),
      awayScore: safeNumber(data.awayScore),
      administrativelyEntered: typeof data.overriddenByUid === "string" && Boolean(data.overriddenByUid),
    });
  }

  const scoreEvents: InsightScoreEvent[] = [];
  for (const doc of scoreEventsSnap.docs) {
    const data = doc.data();
    const matchId = typeof data.matchId === "string" ? data.matchId : "";
    const participantId = typeof data.participantId === "string" ? data.participantId : "";
    if (!matchId || !participantId) continue;
    scoreEvents.push({
      matchId,
      participantId,
      slot: safeNumber(data.slot ?? 1),
      totalPoints: safeNumber(data.totalPoints),
      baseCode: typeof data.baseCode === "string" ? data.baseCode : null,
      components: normalizeComponents(data.components),
    });
  }

  const matches = matchesSnap.docs
    .filter((doc) => doc.data().phase !== "DEMO" && Number(doc.data().matchNumber ?? 0) > 0)
    .map((doc) => {
      const data = doc.data();
      const kickoff = data.kickoffAt?.toDate?.() as Date | undefined;
      const isVoid = data.status === "VOID" || data.scoringStatus === "VOID";
      const resultCalculated = data.status === "FINISHED" || data.scoringStatus === "CALCULATED";
      return {
        id: doc.id,
        matchNumber: safeNumber(data.matchNumber),
        phase: String(data.phase ?? ""),
        group: typeof data.group === "string" ? data.group : null,
        groupRound: typeof data.groupRound === "number" ? data.groupRound : null,
        kickoffAt: kickoff?.toISOString() ?? null,
        status: String(data.status ?? "SCHEDULED"),
        scoringStatus: String(data.scoringStatus ?? "PENDING"),
        homeTeamId: String(data.homeTeamId ?? ""),
        awayTeamId: String(data.awayTeamId ?? ""),
        homeTeamName: String(data.homeTeamName ?? data.homeTeamId ?? "Mandante"),
        awayTeamName: String(data.awayTeamName ?? data.awayTeamId ?? "Visitante"),
        homeTeamIso2: typeof data.homeTeamIso2 === "string" ? data.homeTeamIso2 : null,
        awayTeamIso2: typeof data.awayTeamIso2 === "string" ? data.awayTeamIso2 : null,
        venue: typeof data.venue === "string" ? data.venue : null,
        homeScore: isVoid ? null : optionalScore(data.homeScore120 ?? data.homeScore90 ?? data.liveHomeScore),
        awayScore: isVoid ? null : optionalScore(data.awayScore120 ?? data.awayScore90 ?? data.liveAwayScore),
        resultCalculated,
        isVoid,
      } satisfies InsightMatch;
    });

  return {
    participants: [...participants.values()],
    matches,
    guesses,
    scoreEvents,
  };
}
