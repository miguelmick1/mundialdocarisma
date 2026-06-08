import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { getServerEnv } from "@/lib/env";
import { resolveDisplayName } from "@/lib/users/display-name";

export const runtime = "nodejs";

const schema = z.object({
  matchId: z.string().min(1),
  slot: z.union([z.literal(1), z.literal(2)]).default(1),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  idempotencyKey: z.string().uuid()
});

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const guessId = `${input.matchId}_${user.uid}_${input.slot}`;
    const idempotencyRef = adminDb.collection("idempotencyRequests").doc(`${user.uid}_${input.idempotencyKey}`);
    const matchRef = adminDb.collection("matches").doc(input.matchId);
    const guessRef = adminDb.collection("guesses").doc(guessId);
    const historyRef = adminDb.collection("guessHistory").doc();
    const userRef = adminDb.collection("users").doc(user.uid);

    const result = await adminDb.runTransaction(async (tx) => {
      const prior = await tx.get(idempotencyRef);
      if (prior.exists) return prior.data()?.response;

      const [matchSnap, guessSnap, userSnap] = await Promise.all([
        tx.get(matchRef),
        tx.get(guessRef),
        tx.get(userRef)
      ]);
      if (!matchSnap.exists) throw new Error("MATCH_NOT_FOUND");
      const match = matchSnap.data()!;
      const kickoff = match.kickoffAt.toDate() as Date;
      const now = new Date();
      if (match.status !== "SCHEDULED" || now.getTime() >= kickoff.getTime()) {
        throw new Error("MATCH_LOCKED");
      }
      if (input.slot === 2 && !(match.allowSecondGuessParticipantIds ?? []).includes(user.uid)) {
        throw new Error("SECOND_SLOT_NOT_ALLOWED");
      }

      const revision = guessSnap.exists ? Number(guessSnap.data()?.revision ?? 0) + 1 : 1;
      const env = getServerEnv();
      const participantName = resolveDisplayName({
        storedName: userSnap.data()?.displayName,
        tokenName: user.name,
        email: user.email,
        bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL,
        bootstrapAdminName: env.BOOTSTRAP_ADMIN_NAME
      });
      const payload = {
        matchId: input.matchId,
        participantId: user.uid,
        participantName,
        slot: input.slot,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        source: "HUMAN",
        revision,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: guessSnap.exists ? guessSnap.data()?.createdAt : FieldValue.serverTimestamp()
      };
      tx.set(guessRef, payload, { merge: true });
      tx.set(historyRef, {
        guessId,
        ...payload,
        changedByUid: user.uid,
        changeSource: "HUMAN",
        createdAt: FieldValue.serverTimestamp()
      });
      const response = { guessId, revision, status: "SAVED", savedAt: now.toISOString() };
      tx.set(idempotencyRef, {
        userId: user.uid,
        response,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: FieldValue.serverTimestamp()
      });
      return response;
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = (error as Error).message;
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (code === "MATCH_LOCKED") return NextResponse.json({ error: "Palpites encerrados para esta partida." }, { status: 409 });
    if (code === "SECOND_SLOT_NOT_ALLOWED") return NextResponse.json({ error: "Segundo palpite não autorizado." }, { status: 403 });
    if (code === "MATCH_NOT_FOUND") return NextResponse.json({ error: "Partida não encontrada." }, { status: 404 });
    console.error("guess-save", error);
    return NextResponse.json({ error: "Não foi possível salvar o palpite." }, { status: 400 });
  }
}
