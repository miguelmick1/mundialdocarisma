import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { deleteAvatarFile, saveAvatarFile } from "@/lib/users/avatar-storage";
import { propagateParticipantIdentity } from "@/lib/users/profile-updates";

export const runtime = "nodejs";

const actionSchema = z.object({
  participantId: z.string().min(2),
  participantKind: z.enum(["HUMAN", "BOT"]),
  action: z.enum(["USE_GOOGLE", "REMOVE"]),
});

function rootRef(participantId: string, participantKind: "HUMAN" | "BOT") {
  return participantKind === "HUMAN"
    ? adminDb.collection("users").doc(participantId)
    : adminDb.collection("participants").doc(participantId);
}

function errorResponse(error: unknown) {
  const code = (error as Error).message;
  if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (code === "AVATAR_INVALID_FORMAT") return NextResponse.json({ error: "A imagem preparada não está em formato WebP válido." }, { status: 400 });
  if (code === "AVATAR_TOO_LARGE") return NextResponse.json({ error: "A imagem final excedeu o limite de 1,5 MB." }, { status: 400 });
  console.error("admin-participant-avatar", error);
  return NextResponse.json({ error: "Não foi possível atualizar a foto. Verifique se o Firebase Storage está ativo." }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const form = await request.formData();
    const participantId = String(form.get("participantId") ?? "");
    const participantKind = String(form.get("participantKind") ?? "");
    const file = form.get("file");
    if (!participantId || !["HUMAN", "BOT"].includes(participantKind)) {
      return NextResponse.json({ error: "Participante inválido." }, { status: 400 });
    }
    if (!(file instanceof File) || file.type !== "image/webp") {
      return NextResponse.json({ error: "Selecione uma imagem válida." }, { status: 400 });
    }

    const kind = participantKind as "HUMAN" | "BOT";
    const current = await rootRef(participantId, kind).get();
    if (!current.exists) return NextResponse.json({ error: "Participante não encontrado." }, { status: 404 });
    const oldPath = current.data()?.avatarStoragePath;
    const saved = await saveAvatarFile(participantId, Buffer.from(await file.arrayBuffer()));
    if (kind === "HUMAN") await adminAuth.updateUser(participantId, { photoURL: saved.avatarUrl });
    await propagateParticipantIdentity({
      participantId,
      participantKind: kind,
      avatarUrl: saved.avatarUrl,
      avatarSource: "ADMIN",
      avatarStoragePath: saved.avatarStoragePath,
    });
    if (typeof oldPath === "string" && oldPath !== saved.avatarStoragePath) await deleteAvatarFile(oldPath);
    await adminDb.collection("auditLogs").add({
      type: "PARTICIPANT_AVATAR_UPDATED",
      actorUid: actor.uid,
      participantId,
      participantKind: kind,
      source: "ADMIN",
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, avatarUrl: saved.avatarUrl, avatarSource: "ADMIN" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = actionSchema.parse(await request.json());
    const ref = rootRef(input.participantId, input.participantKind);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Participante não encontrado." }, { status: 404 });
    const data = snap.data() ?? {};
    const oldPath = typeof data.avatarStoragePath === "string" ? data.avatarStoragePath : null;

    if (input.action === "USE_GOOGLE") {
      if (input.participantKind !== "HUMAN") {
        return NextResponse.json({ error: "Bots não possuem foto do Google." }, { status: 409 });
      }
      const authUser = await adminAuth.getUser(input.participantId);
      const googleAvatarUrl =
        (typeof data.googleAvatarUrl === "string" && data.googleAvatarUrl) ||
        authUser.providerData.find((provider) => provider.providerId === "google.com")?.photoURL ||
        null;
      if (!googleAvatarUrl) return NextResponse.json({ error: "O participante não possui foto do Google disponível." }, { status: 409 });
      await adminAuth.updateUser(input.participantId, { photoURL: googleAvatarUrl });
      await propagateParticipantIdentity({
        participantId: input.participantId,
        participantKind: "HUMAN",
        avatarUrl: googleAvatarUrl,
        avatarSource: "GOOGLE",
        googleAvatarUrl,
        avatarStoragePath: null,
      });
      await deleteAvatarFile(oldPath);
      return NextResponse.json({ ok: true, avatarUrl: googleAvatarUrl, avatarSource: "GOOGLE" });
    }

    if (input.participantKind === "HUMAN") await adminAuth.updateUser(input.participantId, { photoURL: null });
    await propagateParticipantIdentity({
      participantId: input.participantId,
      participantKind: input.participantKind,
      avatarUrl: null,
      avatarSource: "INITIALS",
      avatarStoragePath: null,
    });
    await deleteAvatarFile(oldPath);
    await adminDb.collection("auditLogs").add({
      type: "PARTICIPANT_AVATAR_REMOVED",
      actorUid: actor.uid,
      participantId: input.participantId,
      participantKind: input.participantKind,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, avatarUrl: null, avatarSource: "INITIALS" });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return errorResponse(error);
  }
}
