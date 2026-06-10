import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { CompetitionParticipant } from "@/lib/competition/groups";
import { BOT_IDENTITIES, botDisplayName } from "@/lib/bots/identities";

/**
 * Garante que os quatro bots oficiais existam e estejam ativos no Firestore.
 * A operação é idempotente: documentos existentes são preservados e apenas
 * os campos estruturais necessários são corrigidos.
 */
export async function ensureCompetitionBots(): Promise<void> {
  const refs = BOT_IDENTITIES.map((identity) =>
    adminDb.collection("participants").doc(identity.id),
  );
  const snapshots = await adminDb.getAll(...refs);
  const batch = adminDb.batch();
  let hasWrites = false;

  snapshots.forEach((snapshot, index) => {
    const identity = BOT_IDENTITIES[index]!;
    const data = snapshot.data();
    const needsWrite =
      !snapshot.exists ||
      data?.type !== "BOT" ||
      data?.status !== "ACTIVE" ||
      data?.botStrategy !== identity.strategy ||
      data?.displayName !== identity.displayName;

    if (!needsWrite) return;
    hasWrites = true;
    batch.set(
      snapshot.ref,
      {
        type: "BOT",
        displayName: identity.displayName,
        botStrategy: identity.strategy,
        status: "ACTIVE",
        updatedAt: FieldValue.serverTimestamp(),
        ...(!snapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
  });

  if (hasWrites) await batch.commit();
}

export async function loadCompetitionParticipants(options?: {
  ensureBots?: boolean;
}): Promise<CompetitionParticipant[]> {
  if (options?.ensureBots) await ensureCompetitionBots();

  const [usersSnap, botsSnap] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("participants").get(),
  ]);

  const participants: CompetitionParticipant[] = [];
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.status === "INACTIVE") continue;
    participants.push({
      id: doc.id,
      displayName:
        typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : typeof data.email === "string"
            ? data.email
            : "Participante",
      type: "HUMAN",
      avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    });
  }

  // Somente os quatro bots canônicos participam da competição. Isso evita
  // que documentos antigos ou experimentais alterem a matemática do sorteio.
  const botDocs = new Map(
    botsSnap.docs
      .filter((doc) => doc.data().type === "BOT")
      .map((doc) => [doc.id, doc.data()] as const),
  );

  for (const identity of BOT_IDENTITIES) {
    const data = botDocs.get(identity.id);
    if (data?.status === "INACTIVE") continue;
    participants.push({
      id: identity.id,
      displayName: botDisplayName({
        id: identity.id,
        strategy:
          typeof data?.botStrategy === "string"
            ? data.botStrategy
            : identity.strategy,
        fallback:
          typeof data?.displayName === "string"
            ? data.displayName
            : identity.displayName,
      }),
      type: "BOT",
      avatarUrl: typeof data?.avatarUrl === "string" ? data.avatarUrl : null,
    });
  }

  return participants;
}
