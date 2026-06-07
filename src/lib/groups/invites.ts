import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { sha256 } from "@/lib/utils/hash";

export async function acceptInviteToken(uid: string, rawToken: string): Promise<string | null> {
  const tokenHash = sha256(rawToken);
  const snap = await adminDb.collection("groupInvites").where("tokenHash", "==", tokenHash).limit(1).get();
  if (snap.empty) return null;
  const inviteRef = snap.docs[0]!.ref;
  let acceptedGroupId: string | null = null;

  await adminDb.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new Error("INVITE_NOT_FOUND");
    const invite = inviteSnap.data()!;
    if (invite.revokedAt) throw new Error("INVITE_REVOKED");
    if ((invite.expiresAt.toDate() as Date).getTime() <= Date.now()) throw new Error("INVITE_EXPIRED");
    if (invite.useCount >= invite.maxUses) throw new Error("INVITE_EXHAUSTED");
    const memberRef = adminDb.collection("groupMembers").doc(`${invite.groupId}_${uid}`);
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) {
      tx.set(memberRef, {
        groupId: invite.groupId,
        userId: uid,
        role: "MEMBER",
        status: "ACTIVE",
        joinedAt: FieldValue.serverTimestamp(),
        joinedViaInviteId: inviteRef.id
      });
      tx.update(inviteRef, { useCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    }
    acceptedGroupId = invite.groupId;
  });
  return acceptedGroupId;
}
