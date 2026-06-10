import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { syncLiveScores } from "@/lib/live-score/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireUser();
    const result = await syncLiveScores({
      trigger: "VIEWER",
      freshnessMs: 20_000,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (message === "API_FOOTBALL_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Integração ainda não configurada." }, { status: 503 });
    }
    console.error("live-score-refresh", error);
    return NextResponse.json({ error: "Não foi possível atualizar o placar agora." }, { status: 500 });
  }
}
