import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { assertSameOrigin } from "@/lib/security/http";
import { buildCarismaDraw, buildGroupDraw, rehearsalParticipants, type CarismaTeam, type DrawEvent } from "@/lib/draws/engine";
import { buildGroupFixtures, type GroupAssignment } from "@/lib/competition/groups";
import { loadCompetitionParticipants } from "@/lib/competition/participants";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CREATE"), kind: z.enum(["GROUPS", "CARISMA"]), mode: z.enum(["REHEARSAL", "OFFICIAL"]) }),
  z.object({ action: z.literal("REVEAL_NEXT"), sessionId: z.string().min(8) }),
  z.object({ action: z.literal("RESET_REHEARSAL"), sessionId: z.string().min(8) }),
]);

function defaultPot(index: number): 1 | 2 | 3 {
  if (index < 16) return 1;
  if (index < 32) return 2;
  return 3;
}

async function createSession(kind: "GROUPS" | "CARISMA", mode: "REHEARSAL" | "OFFICIAL", actorUid: string) {
  const realParticipants = await loadCompetitionParticipants();
  const participants = mode === "REHEARSAL" ? rehearsalParticipants(realParticipants) : realParticipants;
  let events: DrawEvent[] = [];
  let payload: Record<string, unknown> = {};

  if (kind === "GROUPS") {
    const built = buildGroupDraw(participants);
    events = built.events;
    payload = { assignments: built.assignments };
  } else {
    const teamsSnap = await adminDb.collection("teams").where("active", "==", true).get();
    type OrderedTeam = {
      id: string;
      name?: string;
      iso2?: string | null;
      carismaPot?: number | null;
      [key: string]: unknown;
    };

    const orderedTeams: OrderedTeam[] = teamsSnap.docs
      .map((doc): OrderedTeam => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "pt-BR"));
    if (mode === "OFFICIAL" && orderedTeams.length !== 48) throw new Error("CARISMA_REQUIRES_48_TEAMS");
    while (orderedTeams.length < 48) {
      const number = orderedTeams.length + 1;
      orderedTeams.push({ id: `demo-team-${number}`, name: `Seleção ${number}`, iso2: null, carismaPot: defaultPot(orderedTeams.length) });
    }
    const teams: CarismaTeam[] = orderedTeams.slice(0, 48).map((team: any, index) => {
      const configuredPot = [1, 2, 3].includes(Number(team.carismaPot)) ? Number(team.carismaPot) as 1 | 2 | 3 : null;
      if (mode === "OFFICIAL" && configuredPot == null) throw new Error("CARISMA_POTS_NOT_CONFIGURED");
      return {
        id: String(team.id),
        name: String(team.name ?? team.id),
        iso2: typeof team.iso2 === "string" ? team.iso2 : null,
        pot: configuredPot ?? defaultPot(index),
      };
    });
    const built = buildCarismaDraw(participants, teams);
    events = built.events;
    payload = { allocations: Object.fromEntries(built.allocations) };
  }

  const id = `${kind.toLowerCase()}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await adminDb.collection("drawSessions").doc(id).set({
    kind,
    mode,
    status: "READY",
    title: kind === "GROUPS" ? "Sorteio dos grupos" : "Sorteio dos Times Carisma",
    currentIndex: -1,
    events,
    payload,
    actorUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return id;
}

async function finalizeOfficialSession(data: FirebaseFirestore.DocumentData) {
  if (data.mode !== "OFFICIAL") return;
  if (data.kind === "GROUPS") {
    const assignments = (data.payload?.assignments ?? []) as GroupAssignment[];
    const [oldAssignments, oldFixtures] = await Promise.all([
      adminDb.collection("participantGroupAssignments").get(),
      adminDb.collection("participantGroupFixtures").get(),
    ]);
    const batch = adminDb.batch();
    oldAssignments.docs.forEach((doc) => batch.delete(doc.ref));
    oldFixtures.docs.forEach((doc) => batch.delete(doc.ref));
    assignments.forEach((assignment) => {
      batch.set(adminDb.collection("participantGroupAssignments").doc(assignment.id), {
        ...assignment,
        participantId: assignment.id,
        assignedAt: FieldValue.serverTimestamp(),
      });
    });
    buildGroupFixtures(assignments).forEach((fixture) => {
      batch.set(adminDb.collection("participantGroupFixtures").doc(fixture.id), fixture);
    });
    batch.set(adminDb.collection("competitionConfig").doc("main"), {
      name: "Mundial Snickers do Carisma",
      groupDrawCompleted: true,
      groupDrawCompletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }
  if (data.kind === "CARISMA") {
    const allocations = data.payload?.allocations ?? {};
    const oldAllocations = await adminDb.collection("carismaAllocations").get();
    const batch = adminDb.batch();
    oldAllocations.docs.forEach((doc) => batch.delete(doc.ref));
    Object.entries(allocations).forEach(([participantId, teams]) => {
      batch.set(adminDb.collection("carismaAllocations").doc(participantId), {
        participantId,
        teams,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    batch.set(adminDb.collection("competitionConfig").doc("main"), {
      carismaDrawCompleted: true,
      carismaDrawCompletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    if (input.action === "CREATE") {
      const sessionId = await createSession(input.kind, input.mode, actor.uid);
      return NextResponse.json({ ok: true, sessionId });
    }

    const ref = adminDb.collection("drawSessions").doc(input.sessionId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Sorteio não encontrado." }, { status: 404 });
    const data = snap.data()!;

    if (input.action === "RESET_REHEARSAL") {
      if (data.mode !== "REHEARSAL") return NextResponse.json({ error: "Somente ensaios podem ser reiniciados." }, { status: 409 });
      await ref.update({ currentIndex: -1, status: "READY", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true });
    }

    const events = Array.isArray(data.events) ? data.events : [];
    const nextIndex = Number(data.currentIndex ?? -1) + 1;
    if (nextIndex >= events.length) return NextResponse.json({ error: "O sorteio já terminou." }, { status: 409 });
    const completed = nextIndex === events.length - 1;
    await ref.update({
      currentIndex: nextIndex,
      status: completed ? "COMPLETED" : "RUNNING",
      updatedAt: FieldValue.serverTimestamp(),
      ...(completed ? { completedAt: FieldValue.serverTimestamp() } : {}),
    });
    if (completed) await finalizeOfficialSession(data);
    await adminDb.collection("auditLogs").add({
      type: "DRAW_EVENT_REVEALED",
      actorUid: actor.uid,
      sessionId: input.sessionId,
      eventIndex: nextIndex,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, currentIndex: nextIndex, completed });
  } catch (error) {
    const code = (error as Error).message;
    const messages: Record<string, string> = {
      GROUP_DRAW_REQUIRES_16: "O sorteio oficial exige exatamente 16 participantes ativos.",
      GROUP_DRAW_REQUIRES_12_PLUS_4: "O sorteio oficial exige 12 humanos e 4 bots.",
      CARISMA_DRAW_REQUIRES_16: "O sorteio oficial dos Times Carisma exige 16 participantes.",
      CARISMA_REQUIRES_48_TEAMS: "O sorteio oficial dos Times Carisma exige 48 seleções ativas.",
      CARISMA_POTS_NOT_CONFIGURED: "Defina o pote de todas as 48 seleções antes do sorteio oficial.",
      CARISMA_POT_1_REQUIRES_16: "O Pote 1 precisa ter 16 seleções.",
      CARISMA_POT_2_REQUIRES_16: "O Pote 2 precisa ter 16 seleções.",
      CARISMA_POT_3_REQUIRES_16: "O Pote 3 precisa ter 16 seleções.",
    };
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (code === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("admin-draws", error);
    return NextResponse.json({ error: messages[code] ?? "Não foi possível processar o sorteio." }, { status: 400 });
  }
}
