import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { secureCookieName } from "@/lib/security/http";
import { ensureBootstrapAdmin } from "@/lib/auth/bootstrap";
import { getServerEnv } from "@/lib/env";
import { resolveDisplayName } from "@/lib/users/display-name";
import { resolveAvatarState, type AvatarSource } from "@/lib/users/avatar";

export interface CurrentUserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  avatarSource: AvatarSource;
  googleAvatarUrl: string | null;
}

export async function getCurrentUser(): Promise<DecodedIdToken | null> {
  const store = await cookies();
  const session = store.get(secureCookieName("session"))?.value;
  if (!session) return null;
  try {
    return await adminAuth.verifySessionCookie(session, true);
  } catch {
    return null;
  }
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const snap = await adminDb.collection("users").doc(user.uid).get();
  const data = snap.data();
  const email =
    (typeof data?.email === "string" && data.email) ||
    user.email ||
    null;
  const env = getServerEnv();
  const displayName = resolveDisplayName({
    storedName: data?.displayName,
    tokenName: user.name,
    email,
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL,
    bootstrapAdminName: env.BOOTSTRAP_ADMIN_NAME
  });

  const avatar = resolveAvatarState({
    storedAvatarUrl: data?.avatarUrl,
    storedAvatarSource: data?.avatarSource,
    storedGoogleAvatarUrl: data?.googleAvatarUrl,
    storedAvatarStoragePath: data?.avatarStoragePath,
    tokenPicture: user.picture,
  });

  return {
    uid: user.uid,
    email,
    displayName,
    avatarUrl: avatar.avatarUrl,
    avatarSource: avatar.avatarSource,
    googleAvatarUrl: avatar.googleAvatarUrl,
  };
}

export async function requireUser(): Promise<DecodedIdToken> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function isAdmin(uid: string): Promise<boolean> {
  const snap = await adminDb.collection("admins").doc(uid).get();
  return snap.exists && snap.data()?.status === "ACTIVE";
}

export async function isAdminUser(user: DecodedIdToken): Promise<boolean> {
  if (await isAdmin(user.uid)) return true;
  return ensureBootstrapAdmin(user);
}

export async function requireAdmin(): Promise<DecodedIdToken> {
  const user = await requireUser();
  if (!(await isAdminUser(user))) throw new Error("FORBIDDEN");
  return user;
}
