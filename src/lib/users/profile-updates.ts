import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export type ParticipantKind = "HUMAN" | "BOT";

async function commitInChunks(
  updates: Array<{ ref: DocumentReference; data: Record<string, unknown> }>,
) {
  for (let start = 0; start < updates.length; start += 400) {
    const batch = adminDb.batch();
    for (const update of updates.slice(start, start + 400)) {
      batch.set(update.ref, update.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function propagateParticipantIdentity(input: {
  participantId: string;
  participantKind: ParticipantKind;
  displayName?: string;
  avatarUrl?: string | null;
  avatarSource?: string;
  googleAvatarUrl?: string | null;
  avatarStoragePath?: string | null;
}) {
  const now = FieldValue.serverTimestamp();
  const rootData: Record<string, unknown> = { updatedAt: now };
  const denormalizedData: Record<string, unknown> = { updatedAt: now };

  if (input.displayName !== undefined) {
    rootData.displayName = input.displayName;
    denormalizedData.participantName = input.displayName;
    denormalizedData.displayName = input.displayName;
  }
  if (input.avatarUrl !== undefined) {
    rootData.avatarUrl = input.avatarUrl;
    denormalizedData.avatarUrl = input.avatarUrl;
  }
  if (input.avatarSource !== undefined) rootData.avatarSource = input.avatarSource;
  if (input.googleAvatarUrl !== undefined) rootData.googleAvatarUrl = input.googleAvatarUrl;
  if (input.avatarStoragePath !== undefined) rootData.avatarStoragePath = input.avatarStoragePath;

  const rootRef =
    input.participantKind === "HUMAN"
      ? adminDb.collection("users").doc(input.participantId)
      : adminDb.collection("participants").doc(input.participantId);

  const [guesses, rankings, scoreEvents, assignments, adminSnap] = await Promise.all([
    adminDb.collection("guesses").where("participantId", "==", input.participantId).get(),
    adminDb.collection("rankings").where("participantId", "==", input.participantId).get(),
    adminDb.collection("scoreEvents").where("participantId", "==", input.participantId).get(),
    adminDb.collection("participantGroupAssignments").where("participantId", "==", input.participantId).get(),
    input.participantKind === "HUMAN"
      ? adminDb.collection("admins").doc(input.participantId).get()
      : Promise.resolve(null),
  ]);

  const updates: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [
    { ref: rootRef, data: rootData },
    ...guesses.docs.map((doc) => ({ ref: doc.ref, data: denormalizedData })),
    ...rankings.docs.map((doc) => ({ ref: doc.ref, data: denormalizedData })),
    ...scoreEvents.docs.map((doc) => ({ ref: doc.ref, data: denormalizedData })),
    ...assignments.docs.map((doc) => ({
      ref: doc.ref,
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        updatedAt: now,
      },
    })),
  ];

  if (adminSnap?.exists) {
    updates.push({
      ref: adminSnap.ref,
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        updatedAt: now,
      },
    });
  }

  await commitInChunks(updates);
}
