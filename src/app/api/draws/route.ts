import { NextResponse } from "next/server";
import { requireReadOnlyUser } from "@/lib/auth/session";
import { loadPublicDrawSessions } from "@/lib/draws/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireReadOnlyUser();
    const { sessions, currentSessionId } = await loadPublicDrawSessions();
    return NextResponse.json(
      {
        sessions,
        currentSessionId,
        serverTime: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      },
    );
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "Sua sessão expirou. Entre novamente para acompanhar o sorteio." },
        { status: 401 },
      );
    }
    console.error("draws-get", error);
    return NextResponse.json(
      { error: "Não foi possível carregar a transmissão do sorteio." },
      { status: 500 },
    );
  }
}
