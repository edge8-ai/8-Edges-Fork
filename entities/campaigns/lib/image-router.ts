import { builtStyles, resolveTemplates, STYLES, TEMPLATE_CHANNELS, type StyleKey, type TemplateChannel } from "@/entities/campaigns/lib/visual/brand-kit";
import { channelImageSize, type ImageAspectRatio, type ImageCount, type ImageSize } from "@/entities/campaigns/lib/visual/channel-sizes";
import { lookFor, type Look } from "@/entities/campaigns/lib/visual/looks";
import type { SetCard } from "@/entities/campaigns/lib/visual/image-card";
import { HERO_STYLES, type HeroBrand } from "@/entities/campaigns/lib/visual/hero-layout";
import { HERO_SIZE } from "@/entities/campaigns/lib/visual/hero-shape";
import { channelLabel } from "@/entities/campaigns/lib/marketing-calendar-shared";

// The image router (spec: "Marketing images and publishing", seam 1). One pure
// decision, per post, of how its images are made, so every screen and the
// writer make a post's images the same way:
//
// - LinkedIn, Facebook and X get a code-drawn set: the brand's look, its real
//   logo file, at the channel's size.
// - The blog hero and the email banner get a code-drawn hero: Opus writes its
//   words from the post, and code draws them in the brand's hero colours with
//   the real logo (R3.350). One 1200 x 675 picture serves both.
//
// Pure and free of server imports, so the calendar drawer reads the same
// decision (and the size line) in the browser that the server acts on.

// The social channels that take a code-drawn set.
export const SET_CHANNELS = ["linkedin", "facebook", "twitter"] as const;
// The channels whose one image is a code-drawn hero.
export const HERO_CHANNELS = ["blog", "email"] as const;

export type ImageEngine = "code-drawn-set" | "code-drawn-hero";

// The hero's shape: the blog list crops it to its card, and the email shows it
// across the 600px column.
const HERO_RATIO: ImageAspectRatio = "16:9";

/** Which engine makes a channel's images, or null for a channel with none. */
export function imageEngine(channel: string | null | undefined): ImageEngine | null {
  if (!channel) return null;
  if ((SET_CHANNELS as readonly string[]).includes(channel)) return "code-drawn-set";
  if ((HERO_CHANNELS as readonly string[]).includes(channel)) return "code-drawn-hero";
  return null;
}

// The social channels' posts that a set can be made for.
export function setChannel(channel: string): boolean {
  return imageEngine(channel) === "code-drawn-set" && (TEMPLATE_CHANNELS as readonly string[]).includes(channel);
}

// Whether a hero can be drawn for a brand: only a brand with hero colours and
// type (visual/hero-layout.ts) has one. Any other brand, such as a client on a
// fork, has none yet.
export function heroBrand(brandSlug: string | null | undefined): brandSlug is HeroBrand {
  return typeof brandSlug === "string" && Object.hasOwn(HERO_STYLES, brandSlug);
}

export type SetPlan = {
  look: Look;
  count: ImageCount;
  format: "single" | "carousel-slide";
  width: number;
  height: number;
  // The look's key in the brand kit (signature, editorial, campaign-set).
  style: StyleKey;
  chosenAt: SetCard["chosenAt"];
};

export type HeroPlan = {
  aspectRatio: ImageAspectRatio;
  width: number;
  height: number;
};

export type ImagePlan = ({ engine: "code-drawn-set" } & SetPlan) | ({ engine: "code-drawn-hero" } & HeroPlan);

type Planned<P> = { ok: true; plan: P } | { ok: false; error: string };

/**
 * The social branch: what a code-drawn set for this post will be, or why it
 * cannot be made. A look or a count passed in is a choice made on the post and
 * wins over the brand's template for the channel. Pure.
 */
export function planImageSet(input: {
  channel: string;
  brandSlug: string;
  channelTemplates: unknown;
  look?: StyleKey;
  count?: ImageCount;
}): Planned<SetPlan> {
  const { channel, brandSlug } = input;
  if (imageEngine(channel) !== "code-drawn-set") {
    return { ok: false, error: channel === "blog" ? "The blog keeps its hero image: use Generate image on the post." : `There is no image set for ${channel} posts.` };
  }
  // A brand with no looks at all is a different answer from a look it lacks.
  if (builtStyles(brandSlug).length === 0) return { ok: false, error: "This brand has no look yet." };
  const template = resolveTemplates(input.channelTemplates, brandSlug)[channel as TemplateChannel];
  const styleKey = input.look ?? template.style;
  const look = lookFor(brandSlug, styleKey);
  if (!look) return { ok: false, error: `The ${STYLES.find((s) => s.key === styleKey)?.label ?? styleKey} look is not built for this brand yet; choose Signature.` };
  const size = channelImageSize(channel);
  if (!size) return { ok: false, error: `There is no image size for ${channel}.` };
  const count = input.count ?? template.images;
  return {
    ok: true,
    plan: {
      look,
      count,
      format: count > 1 ? "carousel-slide" : "single",
      width: size.width,
      height: size.height,
      style: styleKey,
      chosenAt: input.count || input.look ? "regenerate" : template.from,
    },
  };
}

/**
 * How one post's images are made: a code-drawn set for a social post, a
 * code-drawn hero for the blog and the email, or why there are none. Pure.
 */
export function planImages(input: {
  channel: string | null | undefined;
  brandSlug?: string | null;
  channelTemplates?: unknown;
  look?: StyleKey;
  count?: ImageCount;
}): Planned<ImagePlan> {
  const engine = imageEngine(input.channel);
  const channel = input.channel ?? "";
  if (engine === "code-drawn-set") {
    if (!input.brandSlug) return { ok: false, error: "Set a brand on this post first, so its images take the brand's look." };
    const set = planImageSet({ channel, brandSlug: input.brandSlug, channelTemplates: input.channelTemplates, look: input.look, count: input.count });
    return set.ok ? { ok: true, plan: { engine, ...set.plan } } : set;
  }
  if (engine === "code-drawn-hero") {
    // A look and a number of images describe a code-drawn set; the blog and
    // email take one picture, so a choice of either here is a caller's mistake.
    if (input.look || input.count) return { ok: false, error: "The blog and email take one image; a look and a number of images are for social posts." };
    return { ok: true, plan: { engine, aspectRatio: HERO_RATIO, width: HERO_SIZE.width, height: HERO_SIZE.height } };
  }
  return { ok: false, error: input.channel ? `There are no images for ${input.channel} posts.` : "Choose the post's channel first." };
}

/**
 * The size line shown under a post's images, e.g. "LinkedIn · 4:5 · 1080×1350",
 * with the set's number of images and look once a set is made. The blog and
 * the email read the hero's, "Blog · 16:9 · 1200×675". Null for a channel with
 * no images.
 */
export function imageSizeLine(channel: string | null | undefined, set?: { count: number; style: string } | null): string | null {
  const engine = imageEngine(channel);
  if (!engine || !channel) return null;
  const size: ImageSize | null = engine === "code-drawn-hero" ? { aspectRatio: HERO_RATIO, ...HERO_SIZE } : channelImageSize(channel);
  if (!size) return null;
  const parts = [channelLabel(channel), size.aspectRatio, `${size.width}×${size.height}`];
  if (engine === "code-drawn-set" && set) {
    parts.push(`${set.count} image${set.count === 1 ? "" : "s"}`);
    parts.push(STYLES.find((s) => s.key === set.style)?.label ?? set.style);
  }
  return parts.join(" · ");
}
