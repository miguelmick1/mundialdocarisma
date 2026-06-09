import { getDownloadURL } from "firebase-admin/storage";
import { adminStorage } from "@/lib/firebase/admin";

export const AVATAR_MAX_BYTES = 1_500_000;

export function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

export async function saveAvatarFile(participantId: string, buffer: Buffer) {
  if (!isWebp(buffer)) throw new Error("AVATAR_INVALID_FORMAT");
  if (buffer.length > AVATAR_MAX_BYTES) throw new Error("AVATAR_TOO_LARGE");

  const path = `avatars/${participantId}/profile.webp`;
  const file = adminStorage.bucket().file(path);
  await file.save(buffer, {
    resumable: false,
    contentType: "image/webp",
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        participantId,
        purpose: "profile-avatar",
      },
    },
  });

  return {
    avatarUrl: await getDownloadURL(file),
    avatarStoragePath: path,
  };
}

export async function deleteAvatarFile(path: string | null | undefined) {
  if (!path || !path.startsWith("avatars/")) return;
  await adminStorage.bucket().file(path).delete({ ignoreNotFound: true });
}
