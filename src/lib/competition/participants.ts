import { adminDb } from "@/lib/firebase/admin";
import type { CompetitionParticipant } from "@/lib/competition/groups";

export async function loadCompetitionParticipants(): Promise<CompetitionParticipant[]> {
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
  for (const doc of botsSnap.docs) {
    const data = doc.data();
    if (data.type !== "BOT" || data.status === "INACTIVE") continue;
    participants.push({
      id: doc.id,
      displayName: typeof data.displayName === "string" ? data.displayName : doc.id,
      type: "BOT",
      avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    });
  }
  return participants;
}
