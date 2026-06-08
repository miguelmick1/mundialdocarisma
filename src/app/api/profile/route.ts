import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";

export const runtime = "nodejs";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "O nome precisa ter ao menos 2 caracteres.")
    .max(60, "O nome pode ter no máximo 60 caracteres.")
});

async function commitInChunks(
  updates: Array<{ ref: DocumentReference; data: Record<string, unknown> }>
) {
  for (let start = 0; start < updates.length; start += 400) {
    const batch = adminDb.batch();
    for (const update of updates.slice(start, start + 400)) {
      batch.set(update.ref, update.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const snap = await adminDb.collection("users").doc(user.uid).get();
    const data = snap.data();

    return NextResponse.json({
      uid: user.uid,
      email: data?.email ?? user.email ?? null,
      displayName:
        data?.displayName ??
        user.name ??
        user.email?.split("@")[0] ??
        "Participante"
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    console.error("profile-get", error);
    return NextResponse.json({ error: "Não foi possível carregar o perfil." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { displayName } = schema.parse(await request.json());
    const normalizedName = displayName.replace(/\s+/g, " ").trim();
    const now = FieldValue.serverTimestamp();

    await adminAuth.updateUser(user.uid, { displayName: normalizedName });

    const [guesses, rankings, scoreEvents, adminSnap] = await Promise.all([
      adminDb.collection("guesses").where("participantId", "==", user.uid).get(),
      adminDb.collection("rankings").where("participantId", "==", user.uid).get(),
      adminDb.collection("scoreEvents").where("participantId", "==", user.uid).get(),
      adminDb.collection("admins").doc(user.uid).get()
    ]);

    const updates: Array<{
      ref: DocumentReference;
      data: Record<string, unknown>;
    }> = [
      {
        ref: adminDb.collection("users").doc(user.uid),
        data: { displayName: normalizedName, updatedAt: now }
      },
      ...guesses.docs.map((doc) => ({
        ref: doc.ref,
        data: { participantName: normalizedName, updatedAt: now }
      })),
      ...rankings.docs.map((doc) => ({
        ref: doc.ref,
        data: { displayName: normalizedName, updatedAt: now }
      })),
      ...scoreEvents.docs.map((doc) => ({
        ref: doc.ref,
        data: { participantName: normalizedName, updatedAt: now }
      }))
    ];

    if (adminSnap.exists) {
      updates.push({
        ref: adminSnap.ref,
        data: { displayName: normalizedName, updatedAt: now }
      });
    }

    await commitInChunks(updates);

    return NextResponse.json({
      ok: true,
      displayName: normalizedName,
      message: "Nome atualizado com sucesso."
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Nome inválido." },
        { status: 400 }
      );
    }
    console.error("profile-update", error);
    return NextResponse.json({ error: "Não foi possível atualizar o nome." }, { status: 400 });
  }
}
