import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ teamId: z.string().min(1), pot: z.union([z.literal(1), z.literal(2), z.literal(3)]) });

export async function GET() {
  try {
    await requireAdmin();
    const snap = await adminDb.collection("teams").where("active", "==", true).get();
    const teams = snap.docs.map((doc) => ({ id: doc.id, name: doc.data().name ?? doc.id, iso2: doc.data().iso2 ?? null, group: doc.data().group ?? null, pot: [1,2,3].includes(Number(doc.data().carismaPot)) ? Number(doc.data().carismaPot) : null })).sort((a,b)=>String(a.name).localeCompare(String(b.name),"pt-BR"));
    const counts = { 1: teams.filter((team)=>team.pot===1).length, 2: teams.filter((team)=>team.pot===2).length, 3: teams.filter((team)=>team.pot===3).length, pending: teams.filter((team)=>team.pot==null).length };
    return NextResponse.json({ teams, counts });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    return NextResponse.json({ error: "Não foi possível carregar os potes." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    await adminDb.collection("teams").doc(input.teamId).set({ carismaPot: input.pot, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await adminDb.collection("auditLogs").add({ type: "CARISMA_POT_UPDATED", actorUid: actor.uid, teamId: input.teamId, pot: input.pot, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code=(error as Error).message;
    if(code==="FORBIDDEN") return NextResponse.json({error:"Acesso negado"},{status:403});
    if(code==="UNAUTHENTICATED") return NextResponse.json({error:"Não autenticado"},{status:401});
    return NextResponse.json({error:"Não foi possível atualizar o pote."},{status:400});
  }
}
