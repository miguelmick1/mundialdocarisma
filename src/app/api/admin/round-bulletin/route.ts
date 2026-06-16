import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { loadAdminRoundBulletin, saveRoundBulletin } from "@/lib/bulletin/round-bulletin-server";
import {
  BULLETIN_FIELD_ORDER,
  emptyBulletinFields,
  normalizeBulletinFields,
  parseBulletinRound,
} from "@/lib/bulletin/round-bulletin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldsSchema = z.object(
  Object.fromEntries(BULLETIN_FIELD_ORDER.map((key) => [key, z.string().trim().max(5000)])) as Record<
    string,
    z.ZodString
  >,
);

const payloadSchema = z.object({
  roundId: z.string().trim().min(1),
  action: z.enum(["SAVE", "PUBLISH"]),
  fields: fieldsSchema.default(emptyBulletinFields()),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const roundId = request.nextUrl.searchParams.get("roundId");
    const payload = await loadAdminRoundBulletin(roundId);
    return NextResponse.json(payload);
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-round-bulletin-get", error);
    return NextResponse.json({ error: "Não foi possível carregar o boletim da rodada." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = payloadSchema.parse(await request.json());
    const roundId = parseBulletinRound(input.roundId);
    if (!roundId) {
      return NextResponse.json({ error: "Rodada inválida." }, { status: 400 });
    }

    const result = await saveRoundBulletin({
      roundId,
      fields: normalizeBulletinFields(input.fields),
      actorUid: actor.uid,
      publish: input.action === "PUBLISH",
    });

    return NextResponse.json({ ok: true, publicationId: result.publicationId });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    console.error("admin-round-bulletin-put", error);
    return NextResponse.json({ error: "Não foi possível salvar o boletim da rodada." }, { status: 500 });
  }
}
