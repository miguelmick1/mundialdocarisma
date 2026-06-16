import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { loadLatestUnreadPublishedBulletin } from "@/lib/bulletin/round-bulletin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const bulletin = await loadLatestUnreadPublishedBulletin(user.uid);
    return NextResponse.json({ bulletin });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("round-bulletin-current", error);
    return NextResponse.json({ error: "Não foi possível carregar o boletim." }, { status: 500 });
  }
}
