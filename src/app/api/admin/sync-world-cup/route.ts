import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { assertSameOrigin } from "@/lib/security/http";
import { syncWorldCupSchedule } from "@/lib/world-cup/schedule";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const result = await syncWorldCupSchedule(adminDb);
    await adminDb.collection("auditLogs").add({
      type: "WORLD_CUP_SCHEDULE_SYNCED",
      actorUid: actor.uid,
      matches: result.matches,
      teams: result.teams,
      createdAt: FieldValue.serverTimestamp()
    });
    return NextResponse.json({
      ok: true,
      message: `${result.matches} partidas e ${result.teams} seleções sincronizadas com sucesso.`
    });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    console.error("world-cup-sync", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível sincronizar o calendário." },
      { status: 502 }
    );
  }
}
