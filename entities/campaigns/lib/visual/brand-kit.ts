import { z } from "zod/v4";
import { CHANNEL_IMAGE_SETS, type ImageCount } from "./channel-sizes";
import type { AssetFile } from "./asset-files";
import { lookFor } from "./looks";

// Each brand's logo files and default image templates (plan: "Campaign images
// that follow the visual direction skill", Mk.2, 18 Nov 2026; logo rules from
// Marketing's visual direction skill, section 4). The brand page's Logo and
// Templates cards edit what is stored on brand_profiles; whatever is not
// stored falls back to these.
//
// Logos are immutable assets: the original files, never redrawn or recoloured,
// one file per ground (a logo cannot sit on both navy and white), and a PNG is
// never drawn larger than its native pixels. The Institute's logo reads
// "AI Officer"; nothing adds "Institute" to it.

export type Ground = "dark" | "light";

export type LogoFile = {
  // Path under public/ in the app.
  file: AssetFile;
  mime: "image/png" | "image/svg+xml";
  // Native pixels for a PNG (the most it may be drawn at), or the viewBox for
  // an SVG, which scales freely.
  width: number;
  height: number;
};

export const BRAND_LOGOS: Record<string, Record<Ground, LogoFile>> = {
  edge8: {
    dark: { file: "public/logo-white.png", mime: "image/png", width: 196, height: 96 },
    light: { file: "public/logo.png", mime: "image/png", width: 196, height: 96 },
  },
  "ai-officer": {
    dark: { file: "public/brands/ai-officer/logo-on-dark.png", mime: "image/png", width: 2048, height: 381 },
    light: { file: "public/brands/ai-officer/logo-on-light.svg", mime: "image/svg+xml", width: 557.24, height: 103.69 },
  },
};

export function appLogo(brandSlug: string | null | undefined, ground: Ground): LogoFile | null {
  if (!brandSlug || !Object.hasOwn(BRAND_LOGOS, brandSlug)) return null;
  return BRAND_LOGOS[brandSlug][ground];
}

// The app file's public URL ("public/logo.png" is served at "/logo.png").
export function appLogoUrl(logo: LogoFile): string {
  return logo.file.replace(/^public/, "");
}

// The three styles taken from Marketing's samples, the looks the marketer
// picks. Which a brand has is per brand (builtStyles): the looks table
// (looks.ts) is the one record of what is drawn.
export const STYLES = [
  { key: "signature", label: "Signature", sample: "Sample 4" },
  { key: "editorial", label: "Editorial", sample: "Sample 1" },
  { key: "campaign-set", label: "Campaign set", sample: "Sample 2" },
] as const;
export type StyleKey = (typeof STYLES)[number]["key"];
const STYLE_KEYS = STYLES.map((s) => s.key) as [StyleKey, ...StyleKey[]];

// The looks this brand has drawn, in the brand kit's order. A brand with no
// looks (a client's) has none.
export function builtStyles(brandSlug: string | null | undefined): StyleKey[] {
  return STYLE_KEYS.filter((k) => lookFor(brandSlug, k) !== null);
}

// Why the brand's other looks are greyed, in one line, or null when it has
// them all. Named so the marketer knows they are coming, not broken.
export function unbuiltLooksNote(brandSlug: string | null | undefined, brandName: string): string | null {
  const built = builtStyles(brandSlug);
  const missing = STYLES.filter((s) => !built.includes(s.key)).map((s) => s.label);
  if (missing.length === 0) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `${list} ${missing.length === 1 ? "is" : "are"} not available for ${brandName} yet.`;
}

export const TEMPLATE_CHANNELS = ["blog", "linkedin", "facebook", "twitter", "email"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

// The blog hero and the email banner are one image each; the social channels
// take 1, 2 or 4.
export function imageChoices(channel: TemplateChannel): ImageCount[] {
  return channel === "blog" || channel === "email" ? [1] : [4, 2, 1];
}

export type ChannelTemplate = { images: ImageCount; style: StyleKey };
export type ResolvedTemplate = ChannelTemplate & { from: "brand" | "default" };

export function defaultTemplate(channel: TemplateChannel): ChannelTemplate {
  return { images: CHANNEL_IMAGE_SETS[channel].images, style: "signature" };
}

// What may be stored in brand_profiles.channel_templates. The database holds
// only that it is an object; this is the shape.
const storedTemplate = z.object({ images: z.union([z.literal(1), z.literal(2), z.literal(4)]), style: z.enum(STYLE_KEYS) }).strict();
export const channelTemplatesSchema = z
  .object({
    blog: storedTemplate.optional(),
    linkedin: storedTemplate.optional(),
    facebook: storedTemplate.optional(),
    twitter: storedTemplate.optional(),
    email: storedTemplate.optional(),
  })
  .strict();
export type StoredTemplates = z.infer<typeof channelTemplatesSchema>;

// Why a template cannot be stored for this brand, or null when it can. The
// default look is always storable, so a brand with no looks drawn yet (a
// client's) can still save its counts; any other look must be one the brand
// has.
export function templateError(channel: TemplateChannel, t: ChannelTemplate, brandSlug: string | null | undefined): string | null {
  if (!imageChoices(channel).includes(t.images)) return `${channel} takes ${imageChoices(channel).join(" or ")} image${t.images === 1 ? "" : "s"}.`;
  const style = STYLES.find((s) => s.key === t.style);
  if (!style) return `Unknown style "${t.style}".`;
  const built = builtStyles(brandSlug);
  if (t.style === defaultTemplate(channel).style || built.includes(t.style)) return null;
  // Name the looks the brand has, so the advice is true for a brand with one,
  // several or none.
  const has = STYLES.filter((s) => built.includes(s.key)).map((s) => s.label);
  if (has.length === 0) return `The ${style.label} look is not built for this brand yet, and no other look is either.`;
  return `The ${style.label} look is not built for this brand yet; ${has.join(" and ")} ${has.length === 1 ? "is" : "are"}.`;
}

// Every channel's template for this brand: its stored choice where it is
// valid, the default otherwise. A stored value that no longer fits (a look the
// brand has not got, a count a channel cannot take) reads as the default
// rather than breaking.
export function resolveTemplates(stored: unknown, brandSlug: string | null | undefined): Record<TemplateChannel, ResolvedTemplate> {
  const parsed = channelTemplatesSchema.safeParse(stored ?? {});
  const brand: StoredTemplates = parsed.success ? parsed.data : {};
  return Object.fromEntries(
    TEMPLATE_CHANNELS.map((c) => {
      const t = brand[c];
      return [c, t && !templateError(c, t, brandSlug) ? { ...t, from: "brand" } : { ...defaultTemplate(c), from: "default" }];
    }),
  ) as Record<TemplateChannel, ResolvedTemplate>;
}

// Where an uploaded logo is kept in the public `marketing` bucket.
export function logoStoragePath(brandId: string, ground: Ground, id: string): string {
  return `brands/${brandId}/logo-on-${ground}-${id}.png`;
}

// An uploaded logo must be a PNG with a transparent-capable header and sane
// pixels: wide enough to read at a card's logo size, small enough to store.
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIN_WIDTH = 150;

export function uploadedLogoError(bytes: Uint8Array): string | null {
  if (bytes.length > LOGO_MAX_BYTES) return "The logo file is over 2 MB.";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || png.some((b, i) => bytes[i] !== b)) return "Upload the logo as a PNG (the original file from the brand kit).";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < LOGO_MIN_WIDTH) return `The logo is ${width} px wide; it needs at least ${LOGO_MIN_WIDTH} px to stay sharp on a card.`;
  if (height < 1 || width / height > 12 || height / width > 4) return "That does not look like a logo's shape.";
  return null;
}
