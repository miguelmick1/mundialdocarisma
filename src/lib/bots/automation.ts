import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { generateMariaGuess } from "@/lib/bots/maria";
import { generatePangareGuess } from "@/lib/bots/pangare";
import { BOT_IDENTITIES } from "@/lib/bots/identities";
import type { GeneratedBotGuess } from "@/lib/bots/types";
import { resolvePangareFavoriteSide } from "@/lib/bots/favorite";

const MARIA_ID = "bot-maria";
const PANGARE_ID = "bot-pangare";
const LEASE_MS = 45_000;
const DEFAULT_MATCH_LIMIT = 160;


function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export type BotAutomationSummary = {
  acquired: boolean;
  consideredMatches: number;
  generatedMaria: number;
  generatedPangare: number;
  skippedExisting: number;
  skippedNoHumanGuesses: number;
  skippedUnresolvedTeams: number;
  errors: Array<{ matchId: string; botId: string; message: string }>;
};

async function acquireLease(now: Date) {
  const ref = adminDb.collection("systemLocks").doc("automaticBotGuesses");
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lockedUntil = toDate(snap.data()?.lockedUntil);
    if (lockedUntil && lockedUntil.getTime() > now.getTime()) return false;
    tx.set(ref, {
      lockedUntil: Timestamp.fromMillis(now.getTime() + LEASE_MS),
      lastStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

async function releaseLease(summary: BotAutomationSummary) {
  await adminDb.collection("systemLocks").doc("automaticBotGuesses").set({
    lockedUntil: Timestamp.fromMillis(0),
    lastCompletedAt: FieldValue.serverTimestamp(),
    lastSummary: summary,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function ensureBotParticipants() {
  const refs = BOT_IDENTITIES.map((bot) => adminDb.collection("participants").doc(bot.id));
  const snaps = await adminDb.getAll(...refs);
  const batch = adminDb.batch();
  let changed = false;
  BOT_IDENTITIES.forEach((bot, index) => {
    const data = snaps[index]?.data();
    if (data?.type === "BOT" && data.displayName === bot.displayName && data.botStrategy === bot.strategy && data.guessMode === bot.guessMode && data.guessingEnabled === bot.guessingEnabled && data.status === "ACTIVE") return;
    changed = true;
    batch.set(refs[index]!, {
      type: "BOT",
      displayName: bot.displayName,
      botStrategy: bot.strategy,
      guessMode: bot.guessMode,
      guessingEnabled: bot.guessingEnabled,
      status: "ACTIVE",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  if (changed) await batch.commit();
}

async function createAutomaticGuess(params: {
  matchId: string;
  botId: typeof MARIA_ID | typeof PANGARE_ID;
  botName: string;
  generated: GeneratedBotGuess;
  now: Date;
}) {
  const guessId = `${params.matchId}_${params.botId}_1`;
  const guessRef = adminDb.collection("guesses").doc(guessId);
  const sourceRef = adminDb.collection("botGuessSources").doc(guessId);
  const matchRef = adminDb.collection("matches").doc(params.matchId);

  return adminDb.runTransaction(async (tx) => {
    const [guessSnap, matchSnap] = await Promise.all([tx.get(guessRef), tx.get(matchRef)]);
    if (guessSnap.exists) return "EXISTS" as const;
    if (!matchSnap.exists) return "MATCH_MISSING" as const;

    const currentMatch = matchSnap.data()!;
    const kickoff = toDate(currentMatch.kickoffAt);
    const hasStarted = Boolean(kickoff && params.now.getTime() >= kickoff.getTime()) || currentMatch.status !== "SCHEDULED";
    if (!hasStarted || currentMatch.status === "VOID" || currentMatch.scoringStatus === "CALCULATED") {
      return "NOT_ELIGIBLE" as const;
    }
    if (currentMatch.teamsResolved === false) return "UNRESOLVED" as const;

    tx.create(guessRef, {
      matchId: params.matchId,
      participantId: params.botId,
      participantName: params.botName,
      slot: 1,
      homeScore: params.generated.prediction.home,
      awayScore: params.generated.prediction.away,
      source: "BOT_AUTOMATIC",
      revision: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(sourceRef, {
      guessId,
      matchId: params.matchId,
      botId: params.botId,
      botName: params.botName,
      calculatedAt: FieldValue.serverTimestamp(),
      ...params.generated.source,
    });
    tx.set(adminDb.collection("auditLogs").doc(), {
      type: "BOT_GUESS_AUTOMATIC_CREATED",
      botId: params.botId,
      matchId: params.matchId,
      guessId,
      prediction: params.generated.prediction,
      strategyVersion: params.generated.source.strategyVersion,
      createdAt: FieldValue.serverTimestamp(),
    });
    return "CREATED" as const;
  });
}

async function loadDueMatches(now: Date, matchIds?: string[], limit = DEFAULT_MATCH_LIMIT) {
  if (matchIds?.length) {
    const snaps = await Promise.all(matchIds.slice(0, limit).map((id) => adminDb.collection("matches").doc(id).get()));
    return snaps.filter((snap) => snap.exists);
  }
  const snap = await adminDb.collection("matches")
    .where("kickoffAt", "<=", Timestamp.fromDate(now))
    .orderBy("kickoffAt", "asc")
    .limit(limit)
    .get();
  return snap.docs;
}

export async function processAutomaticBotGuesses(options: {
  now?: Date;
  matchIds?: string[];
  force?: boolean;
  limit?: number;
} = {}): Promise<BotAutomationSummary> {
  const now = options.now ?? new Date();
  const summary: BotAutomationSummary = {
    acquired: false,
    consideredMatches: 0,
    generatedMaria: 0,
    generatedPangare: 0,
    skippedExisting: 0,
    skippedNoHumanGuesses: 0,
    skippedUnresolvedTeams: 0,
    errors: [],
  };

  const acquired = options.force || options.matchIds?.length ? true : await acquireLease(now);
  if (!acquired) return summary;
  summary.acquired = true;

  try {
    await ensureBotParticipants();
    const env = getServerEnv();
    const dueMatches = await loadDueMatches(now, options.matchIds, options.limit ?? DEFAULT_MATCH_LIMIT);
    const existingAutomaticSnap = await adminDb.collection("guesses")
      .where("participantId", "in", [MARIA_ID, PANGARE_ID])
      .get();
    const existingByMatch = new Map<string, Set<string>>();
    for (const doc of existingAutomaticSnap.docs) {
      const data = doc.data();
      if (Number(data.slot ?? 1) !== 1 || data.source === "HUMAN") continue;
      const matchId = String(data.matchId ?? "");
      if (!matchId) continue;
      const set = existingByMatch.get(matchId) ?? new Set<string>();
      set.add(String(data.participantId));
      existingByMatch.set(matchId, set);
    }
    let activeHumans: Map<string, string> | null = null;

    for (const matchSnap of dueMatches) {
      const match = matchSnap.data()!;
      if (match.phase === "DEMO" || Number(match.matchNumber ?? 0) <= 0) continue;
      if (match.status === "VOID" || match.scoringStatus === "CALCULATED") continue;
      summary.consideredMatches += 1;

      if (match.teamsResolved === false) {
        summary.skippedUnresolvedTeams += 1;
        continue;
      }

      const knownBotIds = existingByMatch.get(matchSnap.id) ?? new Set<string>();
      if (knownBotIds.has(MARIA_ID) && knownBotIds.has(PANGARE_ID)) {
        summary.skippedExisting += 2;
        continue;
      }

      try {
        const guessesSnap = await adminDb.collection("guesses").where("matchId", "==", matchSnap.id).get();
        const existingBotIds = new Set(
          guessesSnap.docs
            .filter((doc) => Number(doc.data().slot ?? 1) === 1 && doc.data().source !== "HUMAN")
            .map((doc) => String(doc.data().participantId)),
        );

        if (!existingBotIds.has(PANGARE_ID)) {
          const [homeTeamSnap, awayTeamSnap] = await Promise.all([
            adminDb.collection("teams").doc(String(match.homeTeamId ?? "")).get(),
            adminDb.collection("teams").doc(String(match.awayTeamId ?? "")).get(),
          ]);
          const favorite = resolvePangareFavoriteSide({
            matchId: matchSnap.id,
            secret: env.APP_SECRET,
            match: match as Record<string, unknown>,
            homeTeam: homeTeamSnap.exists ? (homeTeamSnap.data() as Record<string, unknown>) : undefined,
            awayTeam: awayTeamSnap.exists ? (awayTeamSnap.data() as Record<string, unknown>) : undefined,
          });
          const generated = generatePangareGuess({
            matchId: matchSnap.id,
            secret: env.APP_SECRET,
            favoriteSide: favorite.side,
            homeTeamName: String(match.homeTeamName ?? match.homeTeamId ?? "Mandante"),
            awayTeamName: String(match.awayTeamName ?? match.awayTeamId ?? "Visitante"),
            favoriteBasis: {
              method: favorite.method,
              explanation: favorite.explanation,
              homePot: favorite.homePot,
              awayPot: favorite.awayPot,
            },
          });
          const result = await createAutomaticGuess({
            matchId: matchSnap.id,
            botId: PANGARE_ID,
            botName: "Pangaré",
            generated,
            now,
          });
          if (result === "CREATED") {
            summary.generatedPangare += 1;
            existingBotIds.add(PANGARE_ID);
          } else if (result === "EXISTS") summary.skippedExisting += 1;
        } else {
          summary.skippedExisting += 1;
        }

        if (!existingBotIds.has(MARIA_ID)) {
          if (!activeHumans) {
            const activeUsersSnap = await adminDb.collection("users").get();
            activeHumans = new Map(
              activeUsersSnap.docs
                .filter((doc) => doc.data().status !== "INACTIVE")
                .map((doc) => {
                  const data = doc.data();
                  const displayName = typeof data.displayName === "string" && data.displayName.trim()
                    ? data.displayName.trim()
                    : typeof data.email === "string" && data.email.trim()
                      ? data.email.trim()
                      : "Participante";
                  return [doc.id, displayName] as const;
                }),
            );
          }
          const humanGuessRows = guessesSnap.docs
            .map((doc) => doc.data())
            .filter((guess) => guess.source === "HUMAN" && Number(guess.slot ?? 1) === 1 && activeHumans!.has(String(guess.participantId)))
            .map((guess) => {
              const participantId = String(guess.participantId);
              return {
                participantId,
                participantName: activeHumans!.get(participantId)
                  ?? (typeof guess.participantName === "string" ? guess.participantName : "Participante"),
                home: Number(guess.homeScore),
                away: Number(guess.awayScore),
              };
            })
            .filter((guess) => Number.isInteger(guess.home) && Number.isInteger(guess.away) && guess.home >= 0 && guess.away >= 0)
            .sort((a, b) => a.participantName.localeCompare(b.participantName, "pt-BR"));

          if (humanGuessRows.length === 0) {
            summary.skippedNoHumanGuesses += 1;
          } else {
            const generated = generateMariaGuess(humanGuessRows);
            generated.source.publicExplanation.inputs = {
              ...generated.source.publicExplanation.inputs,
              homeTeamName: String(match.homeTeamName ?? match.homeTeamId ?? "Mandante"),
              awayTeamName: String(match.awayTeamName ?? match.awayTeamId ?? "Visitante"),
            };
            const result = await createAutomaticGuess({
              matchId: matchSnap.id,
              botId: MARIA_ID,
              botName: "Maria Vai com as Outras",
              generated,
              now,
            });
            if (result === "CREATED") summary.generatedMaria += 1;
            else if (result === "EXISTS") summary.skippedExisting += 1;
          }
        } else {
          summary.skippedExisting += 1;
        }
      } catch (error) {
        summary.errors.push({
          matchId: matchSnap.id,
          botId: "bot-automation",
          message: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }
    return summary;
  } finally {
    if (!options.force && !options.matchIds?.length) {
      await releaseLease(summary).catch((error) => console.error("bot-automation-release", error));
    }
  }
}

export async function processAutomaticBotGuessesSafely(options: Parameters<typeof processAutomaticBotGuesses>[0] = {}) {
  try {
    return await processAutomaticBotGuesses(options);
  } catch (error) {
    console.error("bot-automation", error);
    return null;
  }
}
