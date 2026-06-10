import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { linkAllWorldCupFixtures } from "@/lib/live-score/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const result = await linkAllWorldCupFixtures();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (message === "API_FOOTBALL_NOT_CONFIGURED") {
      return NextResponse.json({ error: "API_FOOTBALL_KEY não configurada." }, { status: 503 });
    }
    console.error("api-football-link", error);
    return NextResponse.json({ error: "Não foi possível vincular os jogos da API-Football." }, { status: 500 });
  }
}
