import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [matchesSnap, guessesSnap] = await Promise.all([
      adminDb.collection("matches").orderBy("kickoffAt", "asc").limit(150).get(),
      adminDb.collection("guesses").where("participantId", "==", user.uid).get()
    ]);
    const guessesByMatch = new Map<string, unknown>();
    for (const doc of guessesSnap.docs) {
      const data = doc.data();
      guessesByMatch.set(`${data.matchId}:${data.slot}`, { id: doc.id, ...data, createdAt: undefined, updatedAt: undefined });
    }
    const matches = matchesSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        kickoffAt: data.kickoffAt?.toDate?.().toISOString() ?? data.kickoffAt,
        createdAt: undefined,
        updatedAt: undefined,
        myGuess: guessesByMatch.get(`${doc.id}:1`) ?? null,
        mySecondGuess: guessesByMatch.get(`${doc.id}:2`) ?? null
      };
    });
    return NextResponse.json({ matches, serverTime: new Date().toISOString() });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    console.error("matches-get", error);
    return NextResponse.json({ error: "Falha ao carregar partidas" }, { status: 500 });
  }
}
