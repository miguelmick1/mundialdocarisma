import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { botDisplayName } from "@/lib/bots/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const snap = await adminDb.collection("drawSessions").orderBy("createdAt", "desc").limit(6).get();
    const sessions = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        kind: data.kind,
        mode: data.mode,
        status: data.status,
        currentIndex: Number(data.currentIndex ?? -1),
        events: Array.isArray(data.events) ? data.events.map((event: any) => event?.participantType === "BOT"
          ? { ...event, participantName: botDisplayName({ id: event.participantId, fallback: event.participantName }) }
          : event) : [],
        title: data.title ?? "Sorteio",
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        completedAt: data.completedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });
    return NextResponse.json({ sessions, serverTime: new Date().toISOString() });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("draws-get", error);
    return NextResponse.json({ error: "Não foi possível carregar os sorteios." }, { status: 500 });
  }
}
