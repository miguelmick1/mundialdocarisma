import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, secureCookieName } from "@/lib/security/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(secureCookieName("session"), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0)
  });
  return response;
}
