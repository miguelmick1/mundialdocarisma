import { FieldValue } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";

export async function upsertUserAndBootstrapAdmin(decoded: DecodedIdToken): Promise<void> {
  const email = decoded.email?.trim().toLowerCase();
  const env = getServerEnv();

  await adminDb.collection("users").doc(decoded.uid).set(
    {
      uid: decoded.uid,
      email: email ?? null,
      displayName: decoded.name ?? email?.split("@")[0] ?? "Participante",
      avatarUrl: decoded.picture ?? null,
      emailVerified: decoded.email_verified === true,
      status: "ACTIVE",
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (!email || !decoded.email_verified) return;
  if (email !== env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()) return;

  await adminDb.collection("admins").doc(decoded.uid).set(
    {
      uid: decoded.uid,
      email,
      displayName: decoded.name ?? "Miguel Mickelberg",
      role: "ADMIN",
      status: "ACTIVE",
      isBootstrapAdmin: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await adminAuth.setCustomUserClaims(decoded.uid, { admin: true, role: "ADMIN" });
}
