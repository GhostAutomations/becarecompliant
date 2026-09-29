/**
 * Make a phone photo small enough to upload. A photo straight off a phone camera is often 4 to 8
 * MB, over what a server action accepts (next.config.ts, 4 MB). Images are redrawn at most
 * `maxSide` pixels on the long side as JPEG; anything that is not a decodable image (a PDF, a HEIC
 * the browser cannot read) is handed back untouched for the caller to size check.
 * Browser only.
 */
export async function shrinkImageFile(file: File, maxSide = 2000, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
