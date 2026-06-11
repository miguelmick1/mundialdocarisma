import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { sha256 } from "@/lib/utils/hash";
import { botDisplayName, botGuessMode, botGuessingEnabled } from "@/lib/bots/identities";
import { calculateMatchScores } from "@/lib/scoring/match";
import { buildCarismaSelectionIndex } from "@/lib/carisma/selections";
import { carismaRoundIdForMatch, isGroupRound } from "@/lib/world-cup/rounds";
import { recalculateOverallRankings } from "@/lib/scoring/recalculate";

export const runtime = "nodejs";

const schema = z.object({
  guessId: z.string().min(1).nullable().optional(),
  matchId: z.string().min(1),
  botId: z.string().min(1),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  reason: z.string().min(10).max(500),
});

function validScore(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

async function recalculateBotScoreIfNeeded(params: {
  matchId: string;
  botId: string;
  guessId: string;
}) {
  const matchSnap = await adminDb.collection("matches").doc(params.matchId).get();
  if (!matchSnap.exists) return false;
  const match = matchSnap.data()!;
  if (match.status !== "FINISHED" && match.scoringStatus !== "CALCULATED") return false;

  const homeScore90 = validScore(match.homeScore90);
  const awayScore90 = validScore(match.awayScore90);
  const homeScore120 = validScore(match.homeScore120);
  const awayScore120 = validScore(match.awayScore120);
  const actual = {
    home: homeScore120 ?? homeScore90,
    away: awayScore120 ?? awayScore90,
  };
  if (actual.home === null || actual.away === null) return false;

  const [guessesSnap, existingEventsSnap] = await Promise.all([
    adminDb.collection("guesses").where("matchId", "==", params.matchId).get(),
    adminDb.collection("scoreEvents").where("matchId", "==", params.matchId).get(),
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

  const scoredGuesses = calculateMatchScores({
    actual: { home: actual.home, away: actual.away },
    homeTeamId: String(match.homeTeamId ?? ""),
    awayTeamId: String(match.awayTeamId ?? ""),
    guesses: guessesSnap.docs.map((guessDoc) => {
      const guess = guessDoc.data();
      const participantId = String(guess.participantId ?? "");
      return {
        participantId,
        slot: Number(guess.slot ?? 1),
        source: String(guess.source ?? "HUMAN"),
        guess: { home: Number(guess.homeScore), away: Number(guess.awayScore) },
        ...(carismaByParticipant.has(participantId)
          ? { carismaTeamId: carismaByParticipant.get(participantId)! }
          : {}),
      };
    }),
  });

  const targetGuess = guessesSnap.docs.find((doc) => doc.id === params.guessId)
    ?? guessesSnap.docs.find((doc) => String(doc.data().participantId) === params.botId && Number(doc.data().slot ?? 1) === 1);
  if (!targetGuess) return false;
  const targetData = targetGuess.data();
  const slot = Number(targetData.slot ?? 1);
  const scored = scoredGuesses.find((entry) => entry.participantId === params.botId && entry.slot === slot);
  if (!scored) return false;

  const scoreEventId = `${params.matchId}_${params.botId}_${slot}_v2`;
  const batch = adminDb.batch();
  existingEventsSnap.docs
    .filter((doc) => {
      const data = doc.data();
      return data.active === true
        && String(data.participantId) === params.botId
        && Number(data.slot ?? 1) === slot
        && doc.id !== scoreEventId;
    })
    .forEach((doc) => batch.update(doc.ref, {
      active: false,
      supersededAt: FieldValue.serverTimestamp(),
      supersededReason: "BOT_GUESS_ADMIN_CORRECTION",
    }));

  batch.set(adminDb.collection("scoreEvents").doc(scoreEventId), {
    matchId: params.matchId,
    participantId: params.botId,
    participantName: targetData.participantName ?? params.botId,
    guessId: targetGuess.id,
    slot,
    ruleSetVersion: 2,
    baseCode: scored.baseCode,
    totalPoints: scored.result.total,
    components: scored.result.components,
    active: true,
    calculatedAt: FieldValue.serverTimestamp(),
    recalculatedAfterBotOverride: true,
  }, { merge: true });

  await batch.commit();
  await recalculateOverallRankings();
  return true;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    if (!botGuessingEnabled({ id: input.botId })) throw new Error("BOT_DISABLED");
    const guessId = input.guessId ?? `${input.matchId}_${input.botId}_1`;
    const guessRef = adminDb.collection("guesses").doc(guessId);
    const sourceRef = adminDb.collection("botGuessSources").doc(guessId);
    const matchRef = adminDb.collection("matches").doc(input.matchId);
    const botRef = adminDb.collection("participants").doc(input.botId);
    const finalPrediction = { home: input.homeScore, away: input.awayScore };
    let enteredAfterKickoff = false;
    let matchStatusAtOverride = "SCHEDULED";

    await adminDb.runTransaction(async (tx) => {
      const [guessSnap, sourceSnap, matchSnap, botSnap] = await Promise.all([
        tx.get(guessRef),
        tx.get(sourceRef),
        tx.get(matchRef),
        tx.get(botRef),
      ]);

      if (!matchSnap.exists) throw new Error("NOT_FOUND");
      const match = matchSnap.data()!;
      if (match.teamsResolved === false) throw new Error("TEAMS_UNRESOLVED");
      if (match.status === "VOID") throw new Error("MATCH_VOID");

      const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
      enteredAfterKickoff = Boolean(kickoff && Date.now() >= kickoff.getTime()) || match.status !== "SCHEDULED";
      matchStatusAtOverride = String(match.status ?? "SCHEDULED");

      const bot = botSnap.data();
      if (botSnap.exists && bot?.type !== "BOT") throw new Error("NOT_BOT");
      const storedBotStrategy = typeof bot?.botStrategy === "string" ? bot.botStrategy : null;
      const botName = botDisplayName({
        id: input.botId,
        ...(storedBotStrategy ? { strategy: storedBotStrategy } : {}),
        fallback: typeof bot?.displayName === "string" ? bot.displayName : input.botId,
      });
      const botStrategy = storedBotStrategy ?? "ADMIN_MANUAL";
      const botMode = botGuessMode({ id: input.botId, strategy: botStrategy });
      const previous = guessSnap.exists
        ? { home: guessSnap.data()!.homeScore, away: guessSnap.data()!.awayScore }
        : null;

      const commonGuessData = {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        source: "ADMIN_OVERRIDE",
        overriddenByUid: actor.uid,
        overrideReason: input.reason,
        enteredAfterKickoff,
        matchStatusAtOverride,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (guessSnap.exists) {
        if (guessSnap.data()!.source === "HUMAN") throw new Error("NOT_BOT");
        tx.update(guessRef, {
          ...commonGuessData,
          revision: FieldValue.increment(1),
        });
      } else {
        tx.set(guessRef, {
          matchId: input.matchId,
          participantId: input.botId,
          participantName: botName,
          slot: 1,
          ...commonGuessData,
          revision: 1,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      const automaticPrediction = sourceSnap.exists ? sourceSnap.data()!.automaticPrediction : null;
      const override = {
        ...(automaticPrediction ? { originalPrediction: automaticPrediction } : {}),
        finalPrediction,
        administratorDisplayName: actor.name ?? actor.email ?? "Administrador",
        administratorUid: actor.uid,
        reason: input.reason,
        enteredAfterKickoff,
        matchStatusAtOverride,
        overriddenAt: FieldValue.serverTimestamp(),
      };

      if (sourceSnap.exists) {
        tx.set(sourceRef, {
          effectivePrediction: finalPrediction,
          sourceStatus: "ADMIN_OVERRIDE",
          override,
        }, { merge: true });
      } else {
        const inputs = {
          homeTeamName: match.homeTeamName ?? match.homeTeamId ?? "Mandante",
          awayTeamName: match.awayTeamName ?? match.awayTeamId ?? "Visitante",
          enteredAfterKickoff,
          reason: input.reason,
        };
        tx.set(sourceRef, {
          guessId,
          matchId: input.matchId,
          botId: input.botId,
          botName,
          botStrategy,
          strategyVersion: "admin-manual-v3",
          guessMode: botMode,
          calculatedAt: FieldValue.serverTimestamp(),
          effectivePrediction: finalPrediction,
          sourceStatus: "ADMIN_OVERRIDE",
          publicExplanation: {
            title: "Palpite informado pelo administrador",
            summary: enteredAfterKickoff
              ? "O administrador incluiu ou corrigiu este palpite depois do início da partida."
              : "O administrador informou este palpite manualmente.",
            inputs,
            steps: [],
            sources: [],
          },
          override,
          verification: {
            inputHash: sha256(inputs),
            calculationHash: sha256({ inputs, finalPrediction, actorUid: actor.uid }),
          },
        });
      }

      tx.set(adminDb.collection("auditLogs").doc(), {
        type: guessSnap.exists ? "BOT_GUESS_OVERRIDE" : "BOT_GUESS_MANUAL_CREATE",
        actorUid: actor.uid,
        botId: input.botId,
        matchId: input.matchId,
        guessId,
        previous,
        next: finalPrediction,
        reason: input.reason,
        enteredAfterKickoff,
        matchStatusAtOverride,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    let scoreRecalculated = false;
    try {
      scoreRecalculated = await recalculateBotScoreIfNeeded({
        matchId: input.matchId,
        botId: input.botId,
        guessId,
      });
    } catch (recalculationError) {
      console.error("bot-override-score-recalculation", recalculationError);
    }

    return NextResponse.json({
      ok: true,
      guessId,
      prediction: finalPrediction,
      source: "ADMIN_OVERRIDE",
      enteredAfterKickoff,
      scoreRecalculated,
    });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Partida não encontrada." }, { status: 404 });
    if (code === "NOT_BOT") return NextResponse.json({ error: "O participante selecionado não é um bot." }, { status: 400 });
    if (code === "BOT_DISABLED") return NextResponse.json({ error: "Este bot não está habilitado para receber palpites." }, { status: 409 });
    if (code === "TEAMS_UNRESOLVED") return NextResponse.json({ error: "As seleções desta partida ainda não estão definidas." }, { status: 409 });
    if (code === "MATCH_VOID") return NextResponse.json({ error: "Não é possível registrar palpite em uma partida anulada." }, { status: 409 });
    console.error("bot-override", error);
    return NextResponse.json({ error: "Não foi possível alterar o palpite." }, { status: 400 });
  }
}
