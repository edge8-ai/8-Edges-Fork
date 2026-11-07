// A small square copy of an uploaded image, for faces drawn at a few dozen
// pixels. Avatars are stored as uploaded, often straight off a phone camera:
// on 19 Oct 2026 the 12 faces on one team Home render weighed 6.58 MB, up to
// 1.87 MB for a single 56px circle, and on a phone they showed as empty
// circles until the originals arrived (TH.24). Supabase Storage serves a
// resized copy of a public object under /render/image/ instead of /object/;
// at 112px those 12 faces came to 34.6 KB.
//
// Resizing is a paid Supabase feature, so it is opt-in: set
// NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS=on where the project has it. Unset,
// every URL comes back unchanged, so a fork on a plan without it keeps working
// faces instead of broken ones. The variable is read as a literal property at
// call time, which Next inlines into browser bundles and a test can still set.

const OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

/**
 * The URL of a `px`-square, cover-cropped copy of a public Supabase Storage
 * image, or the URL unchanged when resizing is off or the URL is not a public
 * Storage object (a Google profile photo, a data URI, a relative path).
 */
export function thumbSrc(url: string, px: number): string {
  if ((process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS ?? "").trim() !== "on") return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.pathname.startsWith(OBJECT_PATH)) return url;
  const size = String(Math.max(1, Math.round(px)));
  parsed.pathname = RENDER_PATH + parsed.pathname.slice(OBJECT_PATH.length);
  parsed.searchParams.set("width", size);
  parsed.searchParams.set("height", size);
  parsed.searchParams.set("resize", "cover");
  return parsed.toString();
}
