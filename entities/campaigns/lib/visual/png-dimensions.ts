// Width and height from a PNG's header, or null when the bytes are not a PNG.
// An uploaded logo is read this way (../brand-logos.ts), so the renderers can
// size it without decoding the picture.
export function pngDimensions(png: Buffer): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || signature.some((b, i) => png[i] !== b)) return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
