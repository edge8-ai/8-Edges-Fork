import { supabase } from "@/kernel/data/supabase";
import { appLogo, appLogoUrl, type Ground } from "@/entities/campaigns/lib/visual/brand-kit";
import { readAsset } from "@/entities/campaigns/lib/visual/asset-files";
import { pngDimensions } from "@/entities/campaigns/lib/visual/png-dimensions";
import type { CardInput } from "@/entities/campaigns/lib/visual/render-card";
import type { BrandProfile } from "@/entities/campaigns/lib/brand-profiles";

// A logo file as the renderers take it: the original bytes and their pixels.
type LogoImage = NonNullable<CardInput["logo"]>;

// The logo a brand's images use on each ground, for the brand page to show:
// Marketing's upload when there is one, the brand kit's file in the app when
// not, and nothing for a brand the kit does not know (its cards then say so).

export type ShownLogo = { url: string; uploaded: boolean } | null;

type LogoSource = Pick<BrandProfile, "brandSlug" | "logoOnDarkPath" | "logoOnLightPath">;

// How long an uploaded logo may take to arrive. It is a small file on our own
// storage, so one slower than this is broken, and a picture should not wait on it.
const LOGO_FETCH_MS = 10_000;

export function brandLogos(profile: LogoSource): Record<Ground, ShownLogo> {
  const shown = (ground: Ground, path: string | null): ShownLogo => {
    if (path) return { url: supabase.storage.from("marketing").getPublicUrl(path).data.publicUrl, uploaded: true };
    const file = appLogo(profile.brandSlug, ground);
    return file ? { url: appLogoUrl(file), uploaded: false } : null;
  };
  return { dark: shown("dark", profile.logoOnDarkPath), light: shown("light", profile.logoOnLightPath) };
}

async function uploadedLogo(path: string): Promise<{ ok: true; logo: LogoImage } | { ok: false; error: string }> {
  const unread = (why: string) => ({ ok: false as const, error: `The uploaded logo could not be read (${why}). Replace it, or use the brand kit file, on the brand's Visuals tab.` });
  const url = supabase.storage.from("marketing").getPublicUrl(path).data.publicUrl;
  let data: Buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGO_FETCH_MS) });
    if (!res.ok) return unread(String(res.status));
    data = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return unread(err instanceof Error && err.name === "TimeoutError" ? "it took too long" : err instanceof Error ? err.message : String(err));
  }
  const dims = pngDimensions(data);
  if (!dims) return { ok: false, error: "The uploaded logo is not a PNG. Replace it on the brand's Visuals tab." };
  return { ok: true, logo: { data, mime: "image/png", ...dims } };
}

async function kitLogo(profile: LogoSource, ground: Ground): Promise<{ logo: LogoImage | null; source: string | null }> {
  const kit = appLogo(profile.brandSlug, ground);
  if (!kit) return { logo: null, source: null };
  return { logo: { data: await readAsset(kit.file), mime: kit.mime, width: kit.width, height: kit.height }, source: "brand kit" };
}

// The same choice as the file itself, for the code-drawn set
// (campaign-image-set.ts) and the code-drawn hero (campaign-hero.ts), each
// drawn on one known ground. The file is passed through unchanged. `logo` is
// null for a brand with no file for the ground; an upload that cannot be read
// is an error, not a missing logo, so a broken upload is replaced rather than
// quietly dropped.
export async function brandLogoFile(
  profile: LogoSource,
  ground: Ground,
): Promise<{ ok: true; logo: LogoImage | null; source: string | null } | { ok: false; error: string }> {
  const path = ground === "dark" ? profile.logoOnDarkPath : profile.logoOnLightPath;
  if (!path) return { ok: true, ...(await kitLogo(profile, ground)) };
  const upload = await uploadedLogo(path);
  return upload.ok ? { ok: true, logo: upload.logo, source: path } : upload;
}
