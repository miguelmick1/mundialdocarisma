import { NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "node:crypto";

export function secureCookieName(base: string): string {
  return process.env.NODE_ENV === "production" ? `__Host-${base}` : base;
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) throw new Error("Origem inválida");
  const parsed = new URL(origin);
  if (parsed.host !== host) throw new Error("Origem não autorizada");
}

export function createCsrfResponse(): NextResponse {
  const token = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ csrfToken: token });
  response.cookies.set(secureCookieName("csrf"), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60
  });
  return response;
}

export function validateCsrf(request: NextRequest, submitted: string): void {
  const cookie = request.cookies.get(secureCookieName("csrf"))?.value;
  if (!cookie || !submitted) throw new Error("CSRF ausente");
  const a = Buffer.from(cookie);
  const b = Buffer.from(submitted);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("CSRF inválido");
  }
}
