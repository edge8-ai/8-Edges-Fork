// Browser-side: makes a picked photo small enough to send through a server
// action. A server action's body goes through a Vercel function, and Vercel
// refuses a request over about 4.5 MB before the function runs; a 12–48 MP
// phone photo is often bigger, so the upload failed with no message (M1.2 in
// the mobile plan). Redrawing the photo at a sensible size as a JPEG keeps it
// well under the limit, and decoding through the browser also turns an iPhone
// HEIC into a JPEG wherever the browser can read HEIC.
//
// A file the browser cannot decode (a PDF, a HEIC in Chrome) comes back
// unchanged, so the caller still checks the size against
// ACTION_UPLOAD_MAX_BYTES and says plainly when it is too large.

/** What a server action can be sent with room for the form's other fields. */
export const ACTION_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

const KEPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The size to draw at: the long edge capped at `maxEdge`, the shape kept. */
export function scaledSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Whether a decoded photo has to be redrawn: it is larger than wanted, too
 * heavy to send, or in a format the server does not take (HEIC).
 */
export function needsRedraw(file: { type: string; size: number }, width: number, height: number, maxEdge: number): boolean {
  return Math.max(width, height) > maxEdge || file.size > ACTION_UPLOAD_MAX_BYTES || !KEPT_TYPES.has(file.type);
}

export async function shrinkImage(file: File, opts: { maxEdge: number; quality?: number }): Promise<File> {
  const looksLikeImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
  if (!looksLikeImage || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    if (!needsRedraw(file, bitmap.width, bitmap.height, opts.maxEdge)) return file;
    const { width, height } = scaledSize(bitmap.width, bitmap.height, opts.maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no transparency: a transparent PNG would otherwise turn black.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", opts.quality ?? 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
