import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { processAutomaticBotGuesses } from "@/lib/bots/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = getServerEnv().CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const summary = await processAutomaticBotGuesses({ force: true });
    return NextResponse.json({ ok: true, summary, processedAt: new Date().toISOString() });
  } catch (error) {
    console.error("cron-bot-guesses", error);
    return NextResponse.json({ error: "Falha ao processar os palpites automáticos." }, { status: 500 });
  }
}
