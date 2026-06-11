import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { sha256 } from "@/lib/utils/hash";
import { botDisplayName, botGuessMode, botGuessingEnabled } from "@/lib/bots/identities";

export const runtime = "nodejs";

const schema = z.object({
  guessId: z.string().min(1).nullable().optional(),
  matchId: z.string().min(1),
  botId: z.string().min(1),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  reason: z.string().min(10).max(500)
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

    await adminDb.runTransaction(async (tx) => {
      const [guessSnap, sourceSnap, matchSnap, botSnap] = await Promise.all([
        tx.get(guessRef),
        tx.get(sourceRef),
        tx.get(matchRef),
        tx.get(botRef)
      ]);

      if (!matchSnap.exists) throw new Error("NOT_FOUND");
      const match = matchSnap.data()!;
      const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
      if (!kickoff || Date.now() >= kickoff.getTime() || match.status !== "SCHEDULED" || match.teamsResolved === false) {
        throw new Error("MATCH_LOCKED");
      }

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

      if (guessSnap.exists) {
        if (guessSnap.data()!.source === "HUMAN") throw new Error("NOT_BOT");
        tx.update(guessRef, {
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          source: "ADMIN_OVERRIDE",
          overriddenByUid: actor.uid,
          overrideReason: input.reason,
          revision: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        tx.set(guessRef, {
          matchId: input.matchId,
          participantId: input.botId,
          participantName: botName,
          slot: 1,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          source: "ADMIN_OVERRIDE",
          overriddenByUid: actor.uid,
          overrideReason: input.reason,
          revision: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      const automaticPrediction = sourceSnap.exists ? sourceSnap.data()!.automaticPrediction : null;
      const override = {
        ...(automaticPrediction ? { originalPrediction: automaticPrediction } : {}),
        finalPrediction,
        administratorDisplayName: actor.name ?? actor.email ?? "Administrador",
        administratorUid: actor.uid,
        reason: input.reason,
        overriddenAt: FieldValue.serverTimestamp()
      };

      if (sourceSnap.exists) {
        tx.set(sourceRef, {
          effectivePrediction: finalPrediction,
          sourceStatus: "ADMIN_OVERRIDE",
          override
        }, { merge: true });
      } else {
        const inputs = {
          matchId: input.matchId,
          botId: input.botId,
          homeTeam: match.homeTeamName ?? match.homeTeamId,
          awayTeam: match.awayTeamName ?? match.awayTeamId,
          reason: input.reason
        };
        tx.set(sourceRef, {
          guessId,
          matchId: input.matchId,
          botId: input.botId,
          botName,
          botStrategy,
          strategyVersion: "admin-manual-v2",
          guessMode: botMode,
          calculatedAt: FieldValue.serverTimestamp(),
          effectivePrediction: finalPrediction,
          sourceStatus: "ADMIN_OVERRIDE",
          publicExplanation: {
            title: "Palpite informado manualmente",
            summary: botMode === "MANUAL"
              ? "O regulamento determina que este palpite seja informado manualmente pelo administrador antes da partida."
              : "O administrador informou um palpite manual antes da geração automática prevista para este bot.",
            inputs,
            steps: [{
              order: 1,
              label: "Intervenção administrativa",
              value: `${input.homeScore} × ${input.awayScore}`,
              explanation: input.reason
            }],
            sources: []
          },
          override,
          verification: {
            inputHash: sha256(inputs),
            calculationHash: sha256({ inputs, finalPrediction, actorUid: actor.uid })
          }
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
        createdAt: FieldValue.serverTimestamp()
      });
    });

    return NextResponse.json({
      ok: true,
      guessId,
      prediction: finalPrediction,
      source: "ADMIN_OVERRIDE"
    });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (code === "MATCH_LOCKED") return NextResponse.json({ error: "A partida já começou, está bloqueada ou ainda não tem seleções definidas." }, { status: 409 });
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Partida não encontrada." }, { status: 404 });
    if (code === "NOT_BOT") return NextResponse.json({ error: "O participante selecionado não é um bot." }, { status: 400 });
    if (code === "BOT_DISABLED") return NextResponse.json({ error: "Este bot não está habilitado para receber palpites." }, { status: 409 });
    console.error("bot-override", error);
    return NextResponse.json({ error: "Não foi possível alterar o palpite." }, { status: 400 });
  }
}
