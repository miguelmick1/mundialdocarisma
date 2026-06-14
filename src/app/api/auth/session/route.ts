import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getServerEnv } from "@/lib/env";
import { assertSameOrigin, secureCookieName, validateCsrf } from "@/lib/security/http";
import { upsertUserAndBootstrapAdmin } from "@/lib/auth/bootstrap";
import { acceptInviteToken } from "@/lib/groups/invites";
import { canCreateServerSession } from "@/lib/auth/registration";

export const runtime = "nodejs";

const schema = z.object({
  idToken: z.string().min(20),
  csrfToken: z.string().min(20)
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = schema.parse(await request.json());
    validateCsrf(request, body.csrfToken);

    const decoded = await adminAuth.verifyIdToken(body.idToken, true);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!decoded.auth_time || nowSeconds - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Faça login novamente para criar uma sessão segura." }, { status: 401 });
    }
    if (!decoded.email) {
      return NextResponse.json(
        { error: "Não foi possível identificar o e-mail da conta." },
        { status: 403 }
      );
    }

    const env = getServerEnv();
    if (!env.REGISTRATION_OPEN) {
      const existingUser = await adminDb.collection("users").doc(decoded.uid).get();
      if (!canCreateServerSession({
        registrationOpen: env.REGISTRATION_OPEN,
        userExists: existingUser.exists,
        userStatus: existingUser.data()?.status,
      })) {
        return NextResponse.json({ error: "As inscrições para o bolão estão encerradas." }, { status: 403 });
      }
    }

    await upsertUserAndBootstrapAdmin(decoded);
    const pendingInvite = request.cookies.get(secureCookieName("pending-invite"))?.value;
    const acceptedGroupId = pendingInvite ? await acceptInviteToken(decoded.uid, pendingInvite).catch(() => null) : null;

    const expiresIn = env.SESSION_DAYS * 24 * 60 * 60 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(body.idToken, { expiresIn });
    const response = NextResponse.json({ ok: true, acceptedGroupId });
    response.cookies.set(secureCookieName("session"), sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: env.SESSION_DAYS * 24 * 60 * 60
    });
    response.cookies.delete(secureCookieName("csrf"));
    response.cookies.delete(secureCookieName("pending-invite"));
    return response;
  } catch (error) {
    console.error("session-create", error);
    return NextResponse.json({ error: "Não foi possível criar a sessão." }, { status: 400 });
  }
}
