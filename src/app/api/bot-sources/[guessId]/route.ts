import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { botDisplayName } from "@/lib/bots/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ guessId: string }> }) {
  try {
    await requireUser();
    const { guessId } = await context.params;
    const sourceSnap = await adminDb.collection("botGuessSources").doc(guessId).get();
    if (!sourceSnap.exists) return NextResponse.json({ error: "Memória de cálculo não encontrada." }, { status: 404 });
    const source = sourceSnap.data()!;
    const matchSnap = await adminDb.collection("matches").doc(source.matchId).get();
    if (!matchSnap.exists) return NextResponse.json({ error: "Partida não encontrada." }, { status: 404 });
    const kickoff = matchSnap.data()!.kickoffAt.toDate() as Date;
    if (Date.now() < kickoff.getTime()) {
      return NextResponse.json({ error: "A memória será liberada quando os palpites fecharem." }, { status: 403 });
    }
    const publicBotName = botDisplayName({
      id: typeof source.botId === "string" ? source.botId : undefined,
      strategy: typeof source.botStrategy === "string" ? source.botStrategy : undefined,
      fallback: typeof source.botName === "string" ? source.botName : undefined,
    });
    const publicExplanation = source.publicExplanation ? {
      ...source.publicExplanation,
      title: typeof source.publicExplanation.title === "string"
        ? source.publicExplanation.title.replace(/OddMestre/g, "Betinho Everyday").replace(/Faria Limmer/g, "Transbot")
        : source.publicExplanation.title,
    } : source.publicExplanation;
    return NextResponse.json({
      ...source,
      botName: publicBotName,
      publicExplanation,
      calculatedAt: source.calculatedAt?.toDate?.().toISOString() ?? null,
      override: source.override ? {
        ...source.override,
        overriddenAt: source.override.overriddenAt?.toDate?.().toISOString() ?? null
      } : undefined
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("bot-source", error);
    return NextResponse.json({ error: "Falha ao carregar a memória de cálculo." }, { status: 500 });
  }
}
