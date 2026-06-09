const OUTPUT_SIZE = 512;
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareAvatarFile(file: File): Promise<File> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("A imagem original pode ter no máximo 5 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.max(0, Math.floor((bitmap.width - side) / 2));
  const sourceY = Math.max(0, Math.floor((bitmap.height - side) / 2));
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Não foi possível converter a imagem."))),
      "image/webp",
      0.86,
    );
  });

  return new File([blob], "profile.webp", { type: "image/webp" });
}
