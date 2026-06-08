import { FieldValue } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { resolveDisplayName } from "@/lib/users/display-name";

async function grantBootstrapAdmin(decoded: DecodedIdToken, displayName: string): Promise<void> {
  const email = decoded.email?.trim().toLowerCase();
  if (!email) return;

  const env = getServerEnv();
  if (email !== env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()) return;

  await adminDb.collection("admins").doc(decoded.uid).set(
    {
      uid: decoded.uid,
      email,
      displayName,
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

export async function upsertUserAndBootstrapAdmin(decoded: DecodedIdToken): Promise<void> {
  const email = decoded.email?.trim().toLowerCase();
  const env = getServerEnv();
  const userRef = adminDb.collection("users").doc(decoded.uid);
  const existing = await userRef.get();
  const existingData = existing.data();
  const displayName = resolveDisplayName({
    storedName: existingData?.displayName,
    tokenName: decoded.name,
    email,
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL,
    bootstrapAdminName: env.BOOTSTRAP_ADMIN_NAME
  });

  const userData: Record<string, unknown> = {
    uid: decoded.uid,
    email: email ?? null,
    displayName,
    avatarUrl: decoded.picture ?? existingData?.avatarUrl ?? null,
    emailVerified: decoded.email_verified === true,
    status: "ACTIVE",
    updatedAt: FieldValue.serverTimestamp()
  };

  if (!existing.exists) {
    userData.createdAt = FieldValue.serverTimestamp();
  }

  await userRef.set(userData, { merge: true });
  await grantBootstrapAdmin(decoded, displayName);
}

export async function ensureBootstrapAdmin(decoded: DecodedIdToken): Promise<boolean> {
  const current = await adminDb.collection("admins").doc(decoded.uid).get();
  if (current.exists && current.data()?.status === "ACTIVE") return true;

  const email = decoded.email?.trim().toLowerCase();
  const env = getServerEnv();
  if (!email || email !== env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()) return false;

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const displayName = resolveDisplayName({
    storedName: userSnap.data()?.displayName,
    tokenName: decoded.name,
    email,
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL,
    bootstrapAdminName: env.BOOTSTRAP_ADMIN_NAME
  });

  await adminDb.collection("users").doc(decoded.uid).set(
    { displayName, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await grantBootstrapAdmin(decoded, displayName);
  return true;
}
