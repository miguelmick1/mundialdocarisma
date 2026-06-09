export type AvatarSource = "CUSTOM" | "ADMIN" | "GOOGLE" | "INITIALS";

export interface AvatarState {
  avatarUrl: string | null;
  avatarSource: AvatarSource;
  googleAvatarUrl: string | null;
  avatarStoragePath: string | null;
}

export function normalizeAvatarSource(value: unknown): AvatarSource {
  return value === "CUSTOM" || value === "ADMIN" || value === "GOOGLE"
    ? value
    : "INITIALS";
}

export function resolveAvatarState(input: {
  storedAvatarUrl?: unknown;
  storedAvatarSource?: unknown;
  storedGoogleAvatarUrl?: unknown;
  storedAvatarStoragePath?: unknown;
  tokenPicture?: unknown;
}): AvatarState {
  const storedAvatarUrl =
    typeof input.storedAvatarUrl === "string" && input.storedAvatarUrl.trim()
      ? input.storedAvatarUrl.trim()
      : null;
  const tokenPicture =
    typeof input.tokenPicture === "string" && input.tokenPicture.trim()
      ? input.tokenPicture.trim()
      : null;
  const storedGoogleAvatarUrl =
    typeof input.storedGoogleAvatarUrl === "string" && input.storedGoogleAvatarUrl.trim()
      ? input.storedGoogleAvatarUrl.trim()
      : null;
  const googleAvatarUrl = tokenPicture ?? storedGoogleAvatarUrl;
  const storedSource = normalizeAvatarSource(input.storedAvatarSource);
  const hasExplicitInitialsPreference = input.storedAvatarSource === "INITIALS";
  const avatarStoragePath =
    typeof input.storedAvatarStoragePath === "string" && input.storedAvatarStoragePath.trim()
      ? input.storedAvatarStoragePath.trim()
      : null;

  if ((storedSource === "CUSTOM" || storedSource === "ADMIN") && storedAvatarUrl) {
    return {
      avatarUrl: storedAvatarUrl,
      avatarSource: storedSource,
      googleAvatarUrl,
      avatarStoragePath,
    };
  }

  if (hasExplicitInitialsPreference) {
    return {
      avatarUrl: null,
      avatarSource: "INITIALS",
      googleAvatarUrl,
      avatarStoragePath: null,
    };
  }

  if (googleAvatarUrl) {
    return {
      avatarUrl: googleAvatarUrl,
      avatarSource: "GOOGLE",
      googleAvatarUrl,
      avatarStoragePath: null,
    };
  }

  if (storedAvatarUrl) {
    return {
      avatarUrl: storedAvatarUrl,
      avatarSource: storedSource === "INITIALS" ? "ADMIN" : storedSource,
      googleAvatarUrl,
      avatarStoragePath,
    };
  }

  return {
    avatarUrl: null,
    avatarSource: "INITIALS",
    googleAvatarUrl,
    avatarStoragePath: null,
  };
}
