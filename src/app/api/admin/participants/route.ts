import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/http";
import { normalizeAvatarSource } from "@/lib/users/avatar";
import { botDisplayName } from "@/lib/bots/identities";
import { propagateParticipantIdentity } from "@/lib/users/profile-updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  participantId: z.string().min(2),
  participantKind: z.enum(["HUMAN", "BOT"]),
  displayName: z.string().trim().min(2).max(60),
});

export async function GET() {
  try {
    await requireAdmin();
    const [usersSnap, botsSnap, assignmentsSnap, allocationsSnap] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("participants").get(),
      adminDb.collection("participantGroupAssignments").get(),
      adminDb.collection("carismaAllocations").get(),
    ]);
    const groups = new Map(assignmentsSnap.docs.map((doc) => [doc.id, doc.data().groupId ?? null]));
    const allocations = new Map(allocationsSnap.docs.map((doc) => [doc.id, doc.data().teams ?? []]));
    const authByUid = new Map<string, UserRecord>();
    if (usersSnap.docs.length) {
      const authUsers = await adminAuth.getUsers(
        usersSnap.docs.map((doc) => ({ uid: doc.id })),
      );
      authUsers.users.forEach((user) => authByUid.set(user.uid, user));
    }

    const humans = usersSnap.docs
      .filter((doc) => doc.data().status !== "INACTIVE")
      .map((doc) => {
        const data = doc.data();
        const authUser = authByUid.get(doc.id);
        const googleProviderPhoto = authUser?.providerData.find((provider) => provider.providerId === "google.com")?.photoURL ?? null;
        return {
          id: doc.id,
          kind: "HUMAN" as const,
          displayName: data.displayName ?? authUser?.displayName ?? data.email ?? "Participante",
          email: data.email ?? authUser?.email ?? null,
          avatarUrl: data.avatarUrl ?? authUser?.photoURL ?? googleProviderPhoto,
          avatarSource: normalizeAvatarSource(data.avatarSource ?? (googleProviderPhoto ? "GOOGLE" : "INITIALS")),
          googleAvatarUrl: data.googleAvatarUrl ?? googleProviderPhoto,
          groupId: groups.get(doc.id) ?? null,
          carismaTeams: allocations.get(doc.id) ?? [],
        };
      });
    const bots = botsSnap.docs
      .filter((doc) => doc.data().type === "BOT" && doc.data().status !== "INACTIVE")
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          kind: "BOT" as const,
          displayName: botDisplayName({
            id: doc.id,
            strategy: typeof data.botStrategy === "string" ? data.botStrategy : undefined,
            fallback: typeof data.displayName === "string" ? data.displayName : doc.id,
          }),
          email: null,
          avatarUrl: data.avatarUrl ?? null,
          avatarSource: normalizeAvatarSource(data.avatarSource),
          googleAvatarUrl: null,
          groupId: groups.get(doc.id) ?? null,
          carismaTeams: allocations.get(doc.id) ?? [],
        };
      });

    const rows = [...humans, ...bots].sort((a, b) =>
      a.kind.localeCompare(b.kind) || String(a.displayName).localeCompare(String(b.displayName), "pt-BR"),
    );
    return NextResponse.json({ participants: rows });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-participants-get", error);
    return NextResponse.json({ error: "Não foi possível carregar os participantes." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const input = updateSchema.parse(await request.json());
    const displayName = input.displayName.replace(/\s+/g, " ").trim();
    if (input.participantKind === "HUMAN") {
      await adminAuth.updateUser(input.participantId, { displayName });
    }
    await propagateParticipantIdentity({
      participantId: input.participantId,
      participantKind: input.participantKind,
      displayName,
    });
    await adminDb.collection("auditLogs").add({
      type: "PARTICIPANT_NAME_UPDATED",
      participantId: input.participantId,
      participantKind: input.participantKind,
      displayName,
      createdAt: new Date(),
    });
    return NextResponse.json({ ok: true, displayName });
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    console.error("admin-participants-update", error);
    return NextResponse.json({ error: "Não foi possível atualizar o participante." }, { status: 400 });
  }
}
