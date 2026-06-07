import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { calculateLocalStandings, fetchApiFootballStandings } from "@/lib/world-cup/standings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const apiKey = process.env.API_FOOTBALL_KEY?.trim();
    if (apiKey) {
      try {
        return NextResponse.json(await fetchApiFootballStandings(apiKey));
      } catch (error) {
        const local = await calculateLocalStandings(adminDb);
        return NextResponse.json({
          ...local,
          warning: `A fonte externa não respondeu; exibindo cálculo local. ${error instanceof Error ? error.message : ""}`.trim()
        });
      }
    }
    return NextResponse.json(await calculateLocalStandings(adminDb));
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    console.error("standings-get", error);
    return NextResponse.json({ error: "Não foi possível carregar a classificação." }, { status: 500 });
  }
}
