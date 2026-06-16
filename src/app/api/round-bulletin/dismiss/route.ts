import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { dismissPublishedBulletin } from "@/lib/bulletin/round-bulletin-server";

export const runtime = "nodejs";

const schema = z.object({
  publicationId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    await dismissPublishedBulletin(user.uid, input.publicationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (code === "BULLETIN_NOT_FOUND") return NextResponse.json({ error: "Boletim não encontrado." }, { status: 404 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    console.error("round-bulletin-dismiss", error);
    return NextResponse.json({ error: "Não foi possível marcar o boletim como lido." }, { status: 500 });
  }
}
