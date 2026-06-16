import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { loadRoundInsightsData } from "@/lib/competition/round-insights-server";
import { buildRoundCatalog, buildRoundSummary } from "@/lib/competition/round-insights";
import { parseBulletinRound } from "@/lib/bulletin/round-bulletin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const roundIdQuery = request.nextUrl.searchParams.get("roundId");
    const data = await loadRoundInsightsData();
    const catalog = buildRoundCatalog(data.matches);
    const roundId = parseBulletinRound(roundIdQuery) ?? catalog.defaultRoundId;
    const summary = buildRoundSummary(roundId, data.participants, data.matches, data.guesses, data.scoreEvents);
    return NextResponse.json({
      rounds: catalog.rounds,
      selectedRoundId: roundId,
      summary,
    });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("round-summary-get", error);
    return NextResponse.json({ error: "Não foi possível carregar o resumo da rodada." }, { status: 500 });
  }
}
