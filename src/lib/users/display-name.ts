interface ResolveDisplayNameInput {
  storedName?: unknown;
  tokenName?: string;
  email?: string | null;
  bootstrapAdminEmail?: string;
  bootstrapAdminName?: string;
}

export function resolveDisplayName({
  storedName,
  tokenName,
  email,
  bootstrapAdminEmail,
  bootstrapAdminName
}: ResolveDisplayNameInput): string {
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const localPart = normalizedEmail?.split("@")[0] ?? null;
  const stored = typeof storedName === "string" ? storedName.trim() : "";
  const token = tokenName?.trim() ?? "";
  const isBootstrapAdmin =
    Boolean(normalizedEmail) &&
    normalizedEmail === bootstrapAdminEmail?.trim().toLowerCase();
  const storedLooksAutomatic =
    !stored || stored === normalizedEmail || stored === localPart;

  if (isBootstrapAdmin && storedLooksAutomatic && bootstrapAdminName?.trim()) {
    return bootstrapAdminName.trim();
  }

  return stored || token || localPart || "Participante";
}
