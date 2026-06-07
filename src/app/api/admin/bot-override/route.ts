import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";

export const runtime = "nodejs";
const schema = z.object({
  guessId: z.string().min(1),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  reason: z.string().min(10).max(500)
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    const guessRef = adminDb.collection("guesses").doc(input.guessId);
    const sourceRef = adminDb.collection("botGuessSources").doc(input.guessId);

    await adminDb.runTransaction(async (tx) => {
      const [guessSnap, sourceSnap] = await Promise.all([tx.get(guessRef), tx.get(sourceRef)]);
      if (!guessSnap.exists || !sourceSnap.exists) throw new Error("NOT_FOUND");
      const guess = guessSnap.data()!;
      const matchSnap = await tx.get(adminDb.collection("matches").doc(guess.matchId));
      if (!matchSnap.exists) throw new Error("NOT_FOUND");
      if (Date.now() >= (matchSnap.data()!.kickoffAt.toDate() as Date).getTime()) throw new Error("MATCH_LOCKED");
      if (guess.source === "HUMAN") throw new Error("NOT_BOT");

      const finalPrediction = { home: input.homeScore, away: input.awayScore };
      tx.update(guessRef, {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        source: "ADMIN_OVERRIDE",
        overriddenByUid: actor.uid,
        overrideReason: input.reason,
        revision: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      });
      tx.update(sourceRef, {
        effectivePrediction: finalPrediction,
        sourceStatus: "ADMIN_OVERRIDE",
        override: {
          originalPrediction: sourceSnap.data()!.automaticPrediction,
          finalPrediction,
          administratorDisplayName: actor.name ?? actor.email ?? "Administrador",
          administratorUid: actor.uid,
          reason: input.reason,
          overriddenAt: FieldValue.serverTimestamp()
        }
      });
      tx.set(adminDb.collection("auditLogs").doc(), {
        type: "BOT_GUESS_OVERRIDE",
        actorUid: actor.uid,
        guessId: input.guessId,
        previous: { home: guess.homeScore, away: guess.awayScore },
        next: finalPrediction,
        reason: input.reason,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "MATCH_LOCKED") return NextResponse.json({ error: "A partida já começou." }, { status: 409 });
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Palpite não encontrado." }, { status: 404 });
    console.error("bot-override", error);
    return NextResponse.json({ error: "Não foi possível alterar o palpite." }, { status: 400 });
  }
}
