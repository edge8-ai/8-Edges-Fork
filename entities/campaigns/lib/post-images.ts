import { companyOs } from "@/kernel/data/supabase";
import { generateHero, redrawHero } from "@/entities/campaigns/lib/campaign-hero";
import type { HeroWords } from "@/entities/campaigns/lib/visual/hero-shape";
import { generateImageSet } from "@/entities/campaigns/lib/campaign-image-set";
import { imageEngine, planImages } from "@/entities/campaigns/lib/image-router";
import type { StyleKey } from "@/entities/campaigns/lib/visual/brand-kit";
import type { ImageCount } from "@/entities/campaigns/lib/visual/channel-sizes";

// The one server-side maker for a post's images (spec: "Marketing images and
// publishing", the image router). The calendar drawer, the asset page and the
// writer all come here rather than to an engine, so the router alone decides
// whether a post gets a code-drawn set or a code-drawn hero (spec: "The
// code-drawn hero", R3.350).

export type PostRef = { id: string; channel: string | null };

export type PostImagesOptions = {
  // A choice made on the post; without one the brand's template decides.
  look?: StyleKey;
  count?: ImageCount;
  createdBy?: string | null;
};

export type PostImagesResult = { ok: true; url: string } | { ok: false; error: string };

export async function makePostImages(post: PostRef, opts: PostImagesOptions = {}): Promise<PostImagesResult> {
  const engine = imageEngine(post.channel);
  if (engine === "code-drawn-set") {
    const r = await generateImageSet(post.id, { look: opts.look, count: opts.count, createdBy: opts.createdBy });
    if (!r.ok) return r;
    return { ok: true, url: r.card.slides[0].url };
  }
  // A hero takes neither a look nor a count; the plan refuses them, and a post
  // with no images at all.
  const planned = planImages({ channel: post.channel, look: opts.look, count: opts.count });
  if (!planned.ok) return planned;
  const r = await generateHero(post.id, { createdBy: opts.createdBy });
  if (!r.ok) return r;
  return { ok: true, url: r.url };
}

// Redraws a blog's or an email's hero from words a marketer edited (R3.351).
// Only a hero has editable words; a social post's set is made again instead.
export async function redrawPostHero(
  post: PostRef,
  words: HeroWords,
  opts: { createdBy?: string | null } = {},
): Promise<PostImagesResult | { ok: false; error: string; failures: string[] }> {
  if (imageEngine(post.channel) !== "code-drawn-hero") return { ok: false, error: "Only a blog post's or an email's hero has words to edit." };
  const r = await redrawHero(post.id, words, { createdBy: opts.createdBy });
  if (!r.ok) return r;
  return { ok: true, url: r.url };
}

// The post's channel, for a caller that holds only its id. A failed read is
// an error, not a post without a channel: guessing would pick the wrong engine.
export async function loadPostRef(entryId: string): Promise<{ ok: true; post: PostRef } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("marketing_content").select("id, channel").eq("id", entryId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Post not found." };
  const row = data as { id: string; channel: string | null };
  return { ok: true, post: { id: row.id, channel: row.channel } };
}
