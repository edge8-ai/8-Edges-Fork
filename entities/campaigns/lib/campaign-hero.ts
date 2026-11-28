import { supabase, companyOs } from "@/kernel/data/supabase";
import { readBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { liveEditRefusal } from "@/entities/campaigns/lib/blog-live-edit";
import { recordAssetImage } from "@/entities/campaigns/lib/marketing-images";
import { heroWordFailures, heroWordsSource, writeHeroWords } from "@/entities/campaigns/lib/ai/hero-words";
import { brandLogoFile } from "@/entities/campaigns/lib/brand-logos";
import { heroBrand, planImages, type ImagePlan } from "@/entities/campaigns/lib/image-router";
import { renderHero } from "@/entities/campaigns/lib/visual/render-hero";
import { heroLayout, type HeroBrand } from "@/entities/campaigns/lib/visual/hero-layout";
import type { HeroWords } from "@/entities/campaigns/lib/visual/hero-shape";
import type { HeroCard } from "@/entities/campaigns/lib/visual/image-card";

// Makes one post's code-drawn hero (spec: "The code-drawn hero", R3.350): the
// blog hero or the email banner, one 1200 x 675 picture. Opus writes the words
// from the post and its brief, checked (ai/hero-words.ts); code lays them out
// and draws them in the brand's hero colours with its real logo, in a corner no
// words reach (visual/render-hero.ts). The picture is kept as a new selected
// version, its words on the version's card. No image model is called.
//
// A marketer can also edit the selected hero's words and redraw them
// (R3.351): the same refusals, the same checks and the same drawing, with the
// model call taken out. Both makers share the steps before and after the words.
//
// Reached only through the image router's maker (post-images.ts), as the code-
// drawn set is.

type Entry = {
  id: string;
  title: string;
  channel: string | null;
  brand_id: string | null;
  copy_md: string | null;
  image_brief_md: string | null;
};

type Fail = { ok: false; error: string };
export type HeroResult = { ok: true; url: string; card: HeroCard } | Fail;
// A redraw refused by the checks names every failure, so the marketer can fix
// them all at once; `error` alone reads as one sentence.
export type RedrawResult = HeroResult | (Fail & { failures: string[] });

// What both makers need before any words are written or drawn: the post, its
// plan, its brand and the logo the drawing will carry.
type HeroContext = {
  entry: Entry;
  plan: Extract<ImagePlan, { engine: "code-drawn-hero" }>;
  brand: HeroBrand;
  brandName: string;
  logo: Extract<Awaited<ReturnType<typeof brandLogoFile>>, { ok: true }>;
};

async function heroContext(entryId: string): Promise<{ ok: true; ctx: HeroContext } | Fail> {
  const { data, error } = await companyOs.from("marketing_content").select("id, title, channel, brand_id, copy_md, image_brief_md").eq("id", entryId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const entry = data as Entry | null;
  if (!entry) return { ok: false, error: "Post not found." };
  const planned = planImages({ channel: entry.channel });
  if (!planned.ok) return planned;
  const plan = planned.plan;
  if (plan.engine !== "code-drawn-hero") return { ok: false, error: "A social post's images are a code-drawn set: use Make images." };

  // Every refusal comes before the model is paid for, or a picture is drawn.
  if (!entry.brand_id) return { ok: false, error: "Set a brand on this post first, so its hero takes the brand's colours." };
  // A live post on a gated campaign keeps its hero (Y.91); recordAssetImage
  // asks again before the selection moves.
  const live = await liveEditRefusal(entryId);
  if (live) return { ok: false, error: live };
  // A failed read is the read's error: "Brand not found" would have the
  // marketer look for a brand that is there.
  const read = await readBrandProfile(entry.brand_id);
  if (!read.ok) return { ok: false, error: read.error };
  const profile = read.profile;
  if (!profile) return { ok: false, error: "Brand not found." };
  const brand = profile.brandSlug;
  if (!heroBrand(brand)) return { ok: false, error: `${profile.brandName} has no hero colours yet, so its blog and email heroes cannot be drawn.` };
  // The hero is drawn on navy, so it takes the logo for a dark ground: the
  // brand's upload, or the brand kit's file. A broken upload is the
  // marketer's to replace, not a file quietly swapped (brand-logos.ts).
  const logo = await brandLogoFile(profile, "dark");
  if (!logo.ok) return { ok: false, error: logo.error };
  return { ok: true, ctx: { entry, plan, brand, brandName: profile.brandName, logo } };
}

// Draws checked words, uploads the picture and keeps it as the new selected
// version. renderHero lays the words out against the same logo the checks
// used, so it draws only words heroLayout accepted; it still refuses words that
// do not fit, and that refusal is returned as an error, never drawn.
async function drawAndKeep(
  ctx: HeroContext,
  words: HeroWords,
  version: { promptUsed: string | null; model: string | null; createdBy: string | null },
): Promise<HeroResult> {
  const { entry, plan, brand, logo } = ctx;
  let png: Buffer;
  try {
    png = await renderHero({ words, brand, logo: logo.logo });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const path = `entries/${entry.id}/hero/${crypto.randomUUID()}.png`;
  const { error: upErr } = await supabase.storage.from("marketing").upload(path, png, { contentType: "image/png", upsert: false });
  if (upErr) return { ok: false, error: upErr.message };
  const url = supabase.storage.from("marketing").getPublicUrl(path).data.publicUrl;

  const card: HeroCard = {
    kind: "hero",
    brand,
    channel: entry.channel ?? "",
    width: plan.width,
    height: plan.height,
    logo: logo.source ?? "brand kit",
    art: "code",
    words,
  };
  const rec = await recordAssetImage({ entryId: entry.id, url, ...version, card });
  if (!rec.ok) return { ok: false, error: rec.error };
  return { ok: true, url, card };
}

export async function generateHero(entryId: string, opts?: { createdBy?: string | null }): Promise<HeroResult> {
  try {
    const loaded = await heroContext(entryId);
    if (!loaded.ok) return loaded;
    const { ctx } = loaded;
    const { entry, brand, logo } = ctx;

    const brief = entry.image_brief_md?.trim() ?? "";
    // The words are laid out against this brand's logo, the file the render
    // will draw, before they are accepted: words that do not fit go back to
    // Opus with the reason, on the one retry.
    const words = await writeHeroWords({
      title: entry.title,
      post: entry.copy_md ?? "",
      brief: brief || null,
      brandSlug: brand,
      brandName: ctx.brandName,
      layoutFailures: (w) => heroLayout(w, brand, logo.logo ?? undefined).misfits,
    });
    if (!words.ok) return words;

    // The version records the brief Opus was given as its prompt (empty when
    // the post had none), and the model that wrote the words.
    return await drawAndKeep(ctx, words.words, { promptUsed: brief, model: words.model, createdBy: opts?.createdBy ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[campaign-hero] failed:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Redraws a post's hero from words a marketer edited (R3.351). The words pass
 * the checks the model's words pass, against the same post text and the same
 * logo, before anything is drawn: every figure value from the post, the caps,
 * the brand rules and the layout's fit. The picture is kept as a new selected
 * version, so the one it was edited from stays in the tray. No model is
 * called, so the version records neither a prompt nor a model.
 */
export async function redrawHero(entryId: string, words: HeroWords, opts?: { createdBy?: string | null }): Promise<RedrawResult> {
  try {
    const loaded = await heroContext(entryId);
    if (!loaded.ok) return loaded;
    const { ctx } = loaded;
    const { entry, brand, logo } = ctx;

    const failures = [
      ...heroWordFailures({ post: heroWordsSource(entry.title, entry.copy_md ?? ""), brand, words }),
      ...heroLayout(words, brand, logo.logo ?? undefined).misfits,
    ];
    if (failures.length) return { ok: false, error: "These words were not drawn: fix the problems listed.", failures };

    return await drawAndKeep(ctx, words, { promptUsed: null, model: null, createdBy: opts?.createdBy ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[campaign-hero] redraw failed:", msg);
    return { ok: false, error: msg };
  }
}
