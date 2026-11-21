import { supabase, companyOs } from "@/kernel/data/supabase";
import { readBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { liveEditRefusal } from "@/entities/campaigns/lib/blog-live-edit";
import { recordAssetImage } from "@/entities/campaigns/lib/marketing-images";
import { writeHeroWords } from "@/entities/campaigns/lib/ai/hero-words";
import { brandLogoFile } from "@/entities/campaigns/lib/brand-logos";
import { heroBrand, planImages } from "@/entities/campaigns/lib/image-router";
import { renderHero } from "@/entities/campaigns/lib/visual/render-hero";
import { heroLayout } from "@/entities/campaigns/lib/visual/hero-layout";
import type { HeroCard } from "@/entities/campaigns/lib/visual/image-card";

// Makes one post's code-drawn hero (spec: "The code-drawn hero", R3.350): the
// blog hero or the email banner, one 1200 x 675 picture. Opus writes the words
// from the post and its brief, checked (ai/hero-words.ts); code lays them out
// and draws them in the brand's hero colours with its real logo, in a corner no
// words reach (visual/render-hero.ts). The picture is kept as a new selected
// version, its words on the version's card. No image model is called.
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

export async function generateHero(
  entryId: string,
  opts?: { createdBy?: string | null },
): Promise<{ ok: true; url: string; card: HeroCard } | { ok: false; error: string }> {
  try {
    const { data, error } = await companyOs.from("marketing_content").select("id, title, channel, brand_id, copy_md, image_brief_md").eq("id", entryId).maybeSingle();
    if (error) return { ok: false, error: error.message };
    const entry = data as Entry | null;
    if (!entry) return { ok: false, error: "Post not found." };
    const planned = planImages({ channel: entry.channel });
    if (!planned.ok) return planned;
    const plan = planned.plan;
    if (plan.engine !== "code-drawn-hero") return { ok: false, error: "A social post's images are a code-drawn set: use Make images." };

    // Every refusal comes before the model is paid for.
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
    const logoFile = logo.logo ?? undefined;

    const brief = entry.image_brief_md?.trim() ?? "";
    // The words are laid out against this brand's logo, the file the render
    // will draw, before they are accepted: words that do not fit go back to
    // Opus with the reason, on the one retry.
    const words = await writeHeroWords({
      title: entry.title,
      post: entry.copy_md ?? "",
      brief: brief || null,
      brandSlug: brand,
      brandName: profile.brandName,
      layoutFailures: (w) => heroLayout(w, brand, logoFile).misfits,
    });
    if (!words.ok) return words;

    // renderHero lays the same words out against the same logo, so it draws
    // only words heroLayout just accepted. It still refuses words that do not
    // fit, and that refusal is returned as an error, never drawn.
    let png: Buffer;
    try {
      png = await renderHero({ words: words.words, brand, logo: logo.logo });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const path = `entries/${entryId}/hero/${crypto.randomUUID()}.png`;
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
      words: words.words,
    };
    // The version records the brief Opus was given as its prompt (empty when
    // the post had none), and the model that wrote the words.
    const rec = await recordAssetImage({ entryId, url, promptUsed: brief, model: words.model, createdBy: opts?.createdBy ?? null, card });
    if (!rec.ok) return { ok: false, error: rec.error };
    return { ok: true, url, card };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[campaign-hero] failed:", msg);
    return { ok: false, error: msg };
  }
}
