import { createCsrfResponse } from "@/lib/security/http";

export const runtime = "nodejs";

export async function GET() {
  return createCsrfResponse();
}
