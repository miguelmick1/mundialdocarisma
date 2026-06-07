import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { secureCookieName } from "@/lib/security/http";

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

export async function requireUser(): Promise<DecodedIdToken> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function isAdmin(uid: string): Promise<boolean> {
  const snap = await adminDb.collection("admins").doc(uid).get();
  return snap.exists && snap.data()?.status === "ACTIVE";
}

export async function requireAdmin(): Promise<DecodedIdToken> {
  const user = await requireUser();
  if (!(await isAdmin(user.uid))) throw new Error("FORBIDDEN");
  return user;
}
