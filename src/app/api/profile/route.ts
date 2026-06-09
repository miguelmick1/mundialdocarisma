import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { resolveAvatarState } from "@/lib/users/avatar";
import { propagateParticipantIdentity } from "@/lib/users/profile-updates";

export const runtime = "nodejs";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "O nome precisa ter ao menos 2 caracteres.")
    .max(60, "O nome pode ter no máximo 60 caracteres.")
});

export async function GET() {
  try {
    const user = await requireUser();
    const snap = await adminDb.collection("users").doc(user.uid).get();
    const data = snap.data();
    const avatar = resolveAvatarState({
      storedAvatarUrl: data?.avatarUrl,
      storedAvatarSource: data?.avatarSource,
      storedGoogleAvatarUrl: data?.googleAvatarUrl,
      storedAvatarStoragePath: data?.avatarStoragePath,
      tokenPicture: user.picture,
    });

    return NextResponse.json({
      uid: user.uid,
      email: data?.email ?? user.email ?? null,
      displayName:
        data?.displayName ??
        user.name ??
        user.email?.split("@")[0] ??
        "Participante",
      avatarUrl: avatar.avatarUrl,
      avatarSource: avatar.avatarSource,
      googleAvatarUrl: avatar.googleAvatarUrl,
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

    await adminAuth.updateUser(user.uid, { displayName: normalizedName });
    await propagateParticipantIdentity({
      participantId: user.uid,
      participantKind: "HUMAN",
      displayName: normalizedName,
    });

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
