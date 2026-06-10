import { adminDb } from "@/lib/firebase/admin";

export type PublicDrawSession = {
  id: string;
  kind: "GROUPS" | "CARISMA";
  mode: "REHEARSAL" | "OFFICIAL";
  status: string;
  currentIndex: number;
  events: unknown[];
  title: string;
  createdAt: string | null;
  completedAt: string | null;
};

function serializeSession(
  doc: FirebaseFirestore.DocumentSnapshot,
): PublicDrawSession | null {
  if (!doc.exists) return null;
  const data = doc.data() ?? {};
  if (data.kind !== "GROUPS" && data.kind !== "CARISMA") return null;
  if (data.mode !== "REHEARSAL" && data.mode !== "OFFICIAL") return null;
  return {
    id: doc.id,
    kind: data.kind,
    mode: data.mode,
    status: typeof data.status === "string" ? data.status : "READY",
    currentIndex: Number(data.currentIndex ?? -1),
    events: Array.isArray(data.events) ? data.events : [],
    title: typeof data.title === "string" ? data.title : "Sorteio",
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() ?? null,
  };
}

/**
 * Carrega as sessões recentes e garante que a sessão atualmente transmitida
 * seja sempre devolvida, mesmo quando já há muitos ensaios no histórico.
 */
export async function loadPublicDrawSessions(): Promise<{
  sessions: PublicDrawSession[];
  currentSessionId: string | null;
}> {
  const [broadcastSnap, recentSnap] = await Promise.all([
    adminDb.collection("drawBroadcast").doc("main").get(),
    adminDb
      .collection("drawSessions")
      .orderBy("createdAt", "desc")
      .limit(12)
      .get(),
  ]);

  let currentSessionId =
    typeof broadcastSnap.data()?.currentSessionId === "string"
      ? broadcastSnap.data()!.currentSessionId
      : null;

  const byId = new Map<string, PublicDrawSession>();
  for (const doc of recentSnap.docs) {
    const session = serializeSession(doc);
    if (session) byId.set(session.id, session);
  }

  if (currentSessionId && !byId.has(currentSessionId)) {
    const currentSnap = await adminDb
      .collection("drawSessions")
      .doc(currentSessionId)
      .get();
    const current = serializeSession(currentSnap);
    if (current) byId.set(current.id, current);
  }

  const recentSessions = [...byId.values()].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  );

  if (!currentSessionId || !byId.has(currentSessionId)) {
    currentSessionId =
      recentSessions.find((session) => session.status !== "COMPLETED")?.id ??
      recentSessions[0]?.id ??
      null;
  }

  const sessions = recentSessions.sort((a, b) => {
    if (a.id === currentSessionId) return -1;
    if (b.id === currentSessionId) return 1;
    return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
  });

  return { sessions, currentSessionId };
}
