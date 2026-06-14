import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { sha256 } from "@/lib/utils/hash";
import { botDisplayName, botGuessMode, botGuessingEnabled } from "@/lib/bots/identities";
import { recalculateConfirmedMatchScores } from "@/lib/scoring/recalculate-match";

export const runtime = "nodejs";

const schema = z.object({
  guessId: z.string().min(1).nullable().optional(),
  matchId: z.string().min(1),
  botId: z.string().min(1),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  reason: z.string().min(10).max(500),
});

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
      scoreRecalculated = await recalculateConfirmedMatchScores(
        input.matchId,
        "BOT_GUESS_ADMIN_CORRECTION",
      );
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
