import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { recalculateConfirmedMatchScores } from "@/lib/scoring/recalculate-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  participantId: z.string().trim().min(1).max(128),
  matchId: z.string().trim().min(1).max(128),
  slot: z.union([z.literal(1), z.literal(2)]).default(1),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  reason: z.string().trim().min(10).max(500),
});

export async function GET() {
  try {
    await requireAdmin();
    const [usersSnap, matchesSnap, guessesSnap] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(160).get(),
      adminDb.collection("guesses").get(),
    ]);
    const guesses = new Map<string, FirebaseFirestore.DocumentData>();
    guessesSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.source === "HUMAN" && Number(data.slot ?? 1) === 1) {
        guesses.set(`${data.matchId}:${data.participantId}`, { id: doc.id, ...data });
      }
    });
    return NextResponse.json({
      participants: usersSnap.docs
        .filter((doc) => doc.data().status !== "INACTIVE")
        .map((doc) => ({ id: doc.id, displayName: doc.data().displayName ?? doc.data().email ?? doc.id }))
        .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "pt-BR")),
      matches: matchesSnap.docs
        .filter((doc) => doc.data().status !== "VOID" && doc.data().teamsResolved !== false)
        .map((doc) => {
          const data = doc.data();
          const kickoff = data.kickoffAt?.toDate?.() as Date | undefined;
          return {
            id: doc.id,
            matchNumber: Number(data.matchNumber ?? 0),
            homeTeamName: data.homeTeamName ?? data.homeTeamId ?? "Mandante",
            awayTeamName: data.awayTeamName ?? data.awayTeamId ?? "Visitante",
            kickoffAt: kickoff?.toISOString() ?? null,
            status: data.status ?? "SCHEDULED",
          };
        }),
      guesses: [...guesses.entries()].map(([key, data]) => ({
        key,
        homeScore: Number(data.homeScore),
        awayScore: Number(data.awayScore),
        overrideReason: data.overrideReason ?? null,
      })),
    });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-participant-guesses-get", error);
    return NextResponse.json({ error: "Não foi possível carregar os palpites." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    const guessId = `${input.matchId}_${input.participantId}_${input.slot}`;
    const guessRef = adminDb.collection("guesses").doc(guessId);
    const historyRef = adminDb.collection("guessHistory").doc();
    const matchRef = adminDb.collection("matches").doc(input.matchId);
    const userRef = adminDb.collection("users").doc(input.participantId);

    await adminDb.runTransaction(async (tx) => {
      const [matchSnap, userSnap, guessSnap] = await Promise.all([
        tx.get(matchRef),
        tx.get(userRef),
        tx.get(guessRef),
      ]);
      if (!matchSnap.exists) throw new Error("MATCH_NOT_FOUND");
      if (!userSnap.exists || userSnap.data()?.status === "INACTIVE") throw new Error("PARTICIPANT_NOT_FOUND");
      const match = matchSnap.data()!;
      if (match.status === "VOID") throw new Error("MATCH_VOID");
      if (match.teamsResolved === false) throw new Error("TEAMS_UNRESOLVED");
      if (input.slot === 2 && !(match.allowSecondGuessParticipantIds ?? []).includes(input.participantId)) {
        throw new Error("SECOND_SLOT_NOT_ALLOWED");
      }

      const previous = guessSnap.exists
        ? { home: guessSnap.data()!.homeScore, away: guessSnap.data()!.awayScore }
        : null;
      const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
      const enteredAfterKickoff = Boolean(kickoff && Date.now() >= kickoff.getTime()) || match.status !== "SCHEDULED";
      const revision = guessSnap.exists ? Number(guessSnap.data()?.revision ?? 0) + 1 : 1;
      const payload = {
        matchId: input.matchId,
        participantId: input.participantId,
        participantName: userSnap.data()?.displayName ?? userSnap.data()?.email ?? input.participantId,
        slot: input.slot,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        source: "HUMAN",
        revision,
        overriddenByUid: actor.uid,
        overrideReason: input.reason,
        enteredAfterKickoff,
        matchStatusAtOverride: String(match.status ?? "SCHEDULED"),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: guessSnap.exists ? guessSnap.data()?.createdAt : FieldValue.serverTimestamp(),
      };
      tx.set(guessRef, payload, { merge: true });
      tx.set(historyRef, {
        guessId,
        ...payload,
        previous,
        changedByUid: actor.uid,
        changeSource: "ADMIN_FOR_HUMAN",
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(adminDb.collection("auditLogs").doc(), {
        type: guessSnap.exists ? "HUMAN_GUESS_ADMIN_OVERRIDE" : "HUMAN_GUESS_ADMIN_CREATE",
        actorUid: actor.uid,
        participantId: input.participantId,
        matchId: input.matchId,
        guessId,
        previous,
        next: { home: input.homeScore, away: input.awayScore },
        reason: input.reason,
        enteredAfterKickoff,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const scoreRecalculated = await recalculateConfirmedMatchScores(
      input.matchId,
      "ADMINISTRATIVE_GUESS_CORRECTION",
    );
    return NextResponse.json({ ok: true, guessId, scoreRecalculated });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (code === "MATCH_NOT_FOUND") return NextResponse.json({ error: "Partida não encontrada." }, { status: 404 });
    if (code === "PARTICIPANT_NOT_FOUND") return NextResponse.json({ error: "Participante não encontrado." }, { status: 404 });
    if (code === "MATCH_VOID") return NextResponse.json({ error: "Partidas anuladas não aceitam palpites." }, { status: 409 });
    if (code === "TEAMS_UNRESOLVED") return NextResponse.json({ error: "As seleções ainda não estão definidas." }, { status: 409 });
    if (code === "SECOND_SLOT_NOT_ALLOWED") return NextResponse.json({ error: "Segundo palpite não autorizado." }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    console.error("admin-participant-guesses-put", error);
    return NextResponse.json({ error: "Não foi possível salvar o palpite." }, { status: 500 });
  }
}
