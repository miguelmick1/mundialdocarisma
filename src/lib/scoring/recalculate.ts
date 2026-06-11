import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

type RankingAccumulator = {
  displayName: string;
  totalPoints: number;
  exactHits: number;
};

export async function recalculateOverallRankings(): Promise<void> {
  const snap = await adminDb.collection("scoreEvents").where("active", "==", true).get();
  const bestByMatchParticipant = new Map<string, Record<string, unknown>>();

  for (const doc of snap.docs) {
    const event = doc.data() as Record<string, unknown>;
    const matchId = String(event.matchId ?? "").trim();
    const participantId = String(event.participantId ?? "").trim();
    const totalPoints = Number(event.totalPoints ?? 0);
    if (!matchId || !participantId || !Number.isFinite(totalPoints)) continue;

    const key = `${matchId}:${participantId}`;
    const current = bestByMatchParticipant.get(key);
    if (!current || totalPoints > Number(current.totalPoints ?? 0)) {
      bestByMatchParticipant.set(key, event);
    }
  }

  const totals = new Map<string, RankingAccumulator>();
  for (const event of bestByMatchParticipant.values()) {
    const participantId = String(event.participantId ?? "").trim();
    if (!participantId) continue;
    const storedName = typeof event.participantName === "string" ? event.participantName.trim() : "";
    const row = totals.get(participantId) ?? {
      displayName: storedName || participantId,
      totalPoints: 0,
      exactHits: 0
    };
    row.totalPoints += Number(event.totalPoints ?? 0);
    if (event.baseCode === "BASE_EXACT_SCORE") row.exactHits += 1;
    totals.set(participantId, row);
  }

  const existing = await adminDb.collection("rankings").where("competitionId", "==", "overall").get();
  const previous = new Map(existing.docs.map((doc) => [String(doc.data().participantId), doc.data().position]));
  const sorted = [...totals.entries()].sort(
    (a, b) => b[1].totalPoints - a[1].totalPoints || b[1].exactHits - a[1].exactHits
  );

  if (!sorted.length) return;

  const batch = adminDb.batch();
  sorted.forEach(([participantId, row], index) => batch.set(
    adminDb.collection("rankings").doc(`overall_${participantId}`),
    {
      competitionId: "overall",
      participantId,
      displayName: row.displayName,
      totalPoints: row.totalPoints,
      exactHits: row.exactHits,
      position: index + 1,
      previousPosition: previous.get(participantId) ?? null,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  ));
  await batch.commit();
}
