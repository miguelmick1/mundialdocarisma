import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { deleteAvatarFile, saveAvatarFile } from "@/lib/users/avatar-storage";
import { propagateParticipantIdentity } from "@/lib/users/profile-updates";

export const runtime = "nodejs";

const actionSchema = z.object({
  action: z.enum(["USE_GOOGLE", "REMOVE"]),
});

function errorResponse(error: unknown) {
  const code = (error as Error).message;
  if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (code === "AVATAR_INVALID_FORMAT") return NextResponse.json({ error: "A imagem preparada não está em formato WebP válido." }, { status: 400 });
  if (code === "AVATAR_TOO_LARGE") return NextResponse.json({ error: "A imagem final excedeu o limite de 1,5 MB." }, { status: 400 });
  console.error("profile-avatar", error);
  return NextResponse.json({ error: "Não foi possível atualizar a foto. Verifique se o Firebase Storage está ativo." }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
    }
    if (file.type !== "image/webp") {
      return NextResponse.json({ error: "A imagem deve ser preparada em formato WebP." }, { status: 400 });
    }

    const current = await adminDb.collection("users").doc(user.uid).get();
    const oldPath = current.data()?.avatarStoragePath;
    const saved = await saveAvatarFile(user.uid, Buffer.from(await file.arrayBuffer()));
    await adminAuth.updateUser(user.uid, { photoURL: saved.avatarUrl });
    await propagateParticipantIdentity({
      participantId: user.uid,
      participantKind: "HUMAN",
      avatarUrl: saved.avatarUrl,
      avatarSource: "CUSTOM",
      avatarStoragePath: saved.avatarStoragePath,
    });
    if (typeof oldPath === "string" && oldPath !== saved.avatarStoragePath) {
      await deleteAvatarFile(oldPath);
    }

    return NextResponse.json({ ok: true, avatarUrl: saved.avatarUrl, avatarSource: "CUSTOM" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = actionSchema.parse(await request.json());
    const snap = await adminDb.collection("users").doc(user.uid).get();
    const data = snap.data() ?? {};
    const oldPath = typeof data.avatarStoragePath === "string" ? data.avatarStoragePath : null;

    if (input.action === "USE_GOOGLE") {
      const googleAvatarUrl =
        (typeof data.googleAvatarUrl === "string" && data.googleAvatarUrl) ||
        user.picture ||
        null;
      if (!googleAvatarUrl) {
        return NextResponse.json({ error: "Esta conta não possui foto do Google disponível." }, { status: 409 });
      }
      await adminAuth.updateUser(user.uid, { photoURL: googleAvatarUrl });
      await propagateParticipantIdentity({
        participantId: user.uid,
        participantKind: "HUMAN",
        avatarUrl: googleAvatarUrl,
        avatarSource: "GOOGLE",
        googleAvatarUrl,
        avatarStoragePath: null,
      });
      await deleteAvatarFile(oldPath);
      return NextResponse.json({ ok: true, avatarUrl: googleAvatarUrl, avatarSource: "GOOGLE" });
    }

    await adminAuth.updateUser(user.uid, { photoURL: null });
    await propagateParticipantIdentity({
      participantId: user.uid,
      participantKind: "HUMAN",
      avatarUrl: null,
      avatarSource: "INITIALS",
      avatarStoragePath: null,
    });
    await deleteAvatarFile(oldPath);
    return NextResponse.json({ ok: true, avatarUrl: null, avatarSource: "INITIALS" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
