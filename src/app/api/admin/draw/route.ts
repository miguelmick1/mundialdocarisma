import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomBytes, randomInt, createHash } from "node:crypto";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";

export const runtime = "nodejs";
const schema = z.object({
  contestId: z.string().min(1),
  reason: z.string().min(3).max(200),
  candidates: z.array(z.object({ participantId: z.string().min(1), displayName: z.string().min(1) })).min(2).max(16)
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    const drawRef = adminDb.collection("officialDraws").doc(input.contestId);
    const seed = randomBytes(32).toString("hex");
    const commitmentHash = createHash("sha256").update(seed).digest("hex");
    const winnerIndex = randomInt(0, input.candidates.length);
    const winner = input.candidates[winnerIndex]!;

    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(drawRef);
      if (existing.exists && existing.data()?.status === "COMPLETED") throw new Error("ALREADY_DRAWN");
      tx.set(drawRef, {
        contestId: input.contestId,
        reason: input.reason,
        eligibleParticipants: input.candidates,
        winnerParticipantId: winner.participantId,
        winnerDisplayName: winner.displayName,
        commitmentHash,
        secretSeedRevealed: seed,
        algorithmVersion: "NODE_CRYPTO_RANDOM_INT_V1",
        executedByUid: actor.uid,
        executedAt: FieldValue.serverTimestamp(),
        status: "COMPLETED"
      });
      tx.set(adminDb.collection("auditLogs").doc(), {
        type: "OFFICIAL_DRAW_EXECUTED",
        actorUid: actor.uid,
        contestId: input.contestId,
        winnerParticipantId: winner.participantId,
        commitmentHash,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    return NextResponse.json({ winner, commitmentHash, seed, verificationCode: commitmentHash.slice(0, 12).toUpperCase() });
  } catch (error) {
    if ((error as Error).message === "ALREADY_DRAWN") return NextResponse.json({ error: "Este sorteio já foi realizado." }, { status: 409 });
    if ((error as Error).message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    console.error("draw", error);
    return NextResponse.json({ error: "Não foi possível realizar o sorteio." }, { status: 400 });
  }
}
