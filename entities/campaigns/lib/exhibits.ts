import { join } from "node:path";
import { supabase } from "@/kernel/data/supabase";
import { PALETTE } from "@/kernel/config/palette";

// Exhibits are the charts and figures inside a blog post. The model proposes
// them as SVG (a text format it writes well and that a reviewer can read), but
// the `marketing` bucket refuses SVG uploads (415) and the post sanitizer would
// strip an inline <svg> anyway, so the server rasterises each one to PNG with
// resvg and stores the PNG under the entry's folder. Text in the SVG is set in
// Manrope from the bundled OG fonts, never a system font: Vercel functions have
// none, and resvg would otherwise draw every label as empty boxes.

export const EXHIBIT_WIDTH = 1600;

// A PNG file begins with an 8-byte signature followed by the IHDR chunk, whose
// data holds width and height as big-endian 32-bit integers at bytes 16 and 20.
export function pngSize(png: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)) return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function fontFiles(): string[] {
  const root = process.cwd();
  return ["manrope-og-400.ttf", "manrope-og-500.ttf"].map((f) => join(root, "public/fonts", f));
}

// Rasterise one SVG document to a PNG `width` pixels wide (height follows the
// SVG's own aspect ratio). Throws on malformed SVG; callers decide whether a bad
// exhibit fails the step or is skipped.
export async function renderExhibitPng(svg: string, width = EXHIBIT_WIDTH): Promise<Buffer> {
  // Loaded on demand: the campaigns index is imported by most admin pages, and
  // none of them should pay for a native module they never draw with.
  const { Resvg } = await import("@resvg/resvg-js");
  // Fonts go in as file paths, not buffers: resvg-js 2.6 silently ignores
  // `fitTo` whenever `fontBuffers` is set, and the exhibit comes out at the
  // SVG's own size instead of the page width.
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Manrope" },
    background: PALETTE.white,
  });
  return Buffer.from(resvg.render().asPng());
}

export type ExhibitUpload =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; error: string };

// Render and store one exhibit for a content entry. The public URL is what the
// post body's <figure> references.
export async function uploadExhibit(entryId: string, svg: string): Promise<ExhibitUpload> {
  let png: Buffer;
  try {
    png = await renderExhibitPng(svg);
  } catch (err) {
    return { ok: false, error: `Exhibit SVG did not render: ${err instanceof Error ? err.message : String(err)}` };
  }
  const size = pngSize(png);
  if (!size) return { ok: false, error: "Exhibit rendered to an empty image." };

  const path = `entries/${entryId}/exhibits/${crypto.randomUUID()}.png`;
  const { error: upErr } = await supabase.storage
    .from("marketing")
    .upload(path, png, { contentType: "image/png", upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = supabase.storage.from("marketing").getPublicUrl(path);
  return { ok: true, url: pub.publicUrl, ...size };
}
