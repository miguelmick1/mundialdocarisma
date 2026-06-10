import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { getLiveSyncState, syncLiveScores } from "@/lib/live-score/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function schedulerAuthorized(request: NextRequest): boolean {
  const secret = getServerEnv().LIVE_SCORE_CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  const custom = request.headers.get("x-live-score-secret");
  return bearer === `Bearer ${secret}` || custom === secret;
}

export async function GET() {
  try {
    await requireAdmin();
    const env = getServerEnv();
    return NextResponse.json({
      configured: Boolean(env.API_FOOTBALL_KEY),
      schedulerSecretConfigured: Boolean(env.LIVE_SCORE_CRON_SECRET),
      state: await getLiveSyncState(),
    });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    return NextResponse.json({ error: "Não foi possível consultar a integração." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const byScheduler = schedulerAuthorized(request);
    if (!byScheduler) {
      assertSameOrigin(request);
      await requireAdmin();
    }
    const body = await request.json().catch(() => ({})) as { force?: boolean; fullSchedule?: boolean };
    const result = await syncLiveScores({
      trigger: byScheduler ? "SCHEDULER" : "ADMIN",
      force: body.force === true,
      fullSchedule: body.fullSchedule === true,
      freshnessMs: byScheduler ? 45_000 : 0,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (message === "API_FOOTBALL_NOT_CONFIGURED") {
      return NextResponse.json({ error: "API_FOOTBALL_KEY não configurada." }, { status: 503 });
    }
    console.error("live-score-sync", error);
    return NextResponse.json({ error: "Falha ao sincronizar o placar ao vivo." }, { status: 500 });
  }
}
