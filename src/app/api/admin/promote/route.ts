import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().email() });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { email } = schema.parse(await request.json());
    const target = await adminAuth.getUserByEmail(email.trim().toLowerCase());
    const env = getServerEnv();

    await adminDb.runTransaction(async (tx) => {
      const active = await tx.get(adminDb.collection("admins").where("status", "==", "ACTIVE"));
      if (!active.docs.some((doc) => doc.id === target.uid) && active.size >= env.MAX_ACTIVE_ADMINS) {
        throw new Error("ADMIN_LIMIT");
      }
      tx.set(adminDb.collection("admins").doc(target.uid), {
        uid: target.uid,
        email: target.email,
        displayName: target.displayName ?? target.email,
        role: "ADMIN",
        status: "ACTIVE",
        isBootstrapAdmin: false,
        grantedByUid: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      tx.set(adminDb.collection("auditLogs").doc(), {
        type: "ADMIN_GRANTED",
        actorUid: actor.uid,
        targetUid: target.uid,
        targetEmail: target.email,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    await adminAuth.setCustomUserClaims(target.uid, { admin: true, role: "ADMIN" });
    return NextResponse.json({ ok: true, message: "Administrador adicionado. Ele deve entrar novamente para atualizar a sessão." });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if ((error as Error).message === "ADMIN_LIMIT") return NextResponse.json({ error: "O limite de administradores ativos foi atingido." }, { status: 409 });
    console.error("admin-promote", error);
    return NextResponse.json({ error: "Não foi possível adicionar o administrador." }, { status: 400 });
  }
}
