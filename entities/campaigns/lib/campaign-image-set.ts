import { supabase, companyOs } from "@/kernel/data/supabase";
import { readBrandProfile, type BrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { liveEditRefusal } from "@/entities/campaigns/lib/blog-live-edit";
import { recordAssetImage } from "@/entities/campaigns/lib/marketing-images";
import { writeCardWords } from "@/entities/campaigns/lib/ai/card-words";
import { brandLogoFile } from "@/entities/campaigns/lib/brand-logos";
import type { StyleKey } from "@/entities/campaigns/lib/visual/brand-kit";
import type { ImageCount } from "@/entities/campaigns/lib/visual/channel-sizes";
import { accentFor, counterFor, type Look } from "@/entities/campaigns/lib/visual/looks";
import { planImages } from "@/entities/campaigns/lib/image-router";
import { brandArt } from "@/entities/campaigns/lib/visual/brand-art";
import { renderCard, type CardInput } from "@/entities/campaigns/lib/visual/render-card";
import { ART_FOR_ROLE } from "@/entities/campaigns/lib/visual/slide-roles";
import { carouselPdf } from "@/entities/campaigns/lib/visual/carousel-pdf";
import type { SetCard } from "@/entities/campaigns/lib/visual/image-card";

// Generate images for one post (plan: "Campaign images that follow the visual
// direction skill", Mk.2 PR C). The brand's template says which look and how
// many images (or the asset page's Look and Number of images do); the words
// come from the finished post, checked (ai/card-words.ts); every slide is
// drawn by code in that look, with its art, its colours and its real logo
// file; a LinkedIn set is
// also joined into a carousel PDF. The set is saved as one image version, so
// it can be switched back to like any other. No image model is called.

// The plan (which look, how many images, what size) comes from the image
// router's social branch (image-router.ts); this file draws it.

// The brand's logo for the look's ground: Marketing's upload when there is one,
// the brand kit's file otherwise (brand-logos.ts). A card is drawn around its
// logo, so a brand with none cannot have a set.
async function logoFor(profile: BrandProfile, look: Look): Promise<{ input: NonNullable<CardInput["logo"]>; source: string } | { error: string }> {
  const file = await brandLogoFile(profile, look.groundKind);
  if (!file.ok) return { error: file.error };
  if (!file.logo || !file.source) return { error: "This brand has no logo file yet." };
  return { input: file.logo, source: file.source };
}

async function upload(path: string, body: Buffer, contentType: string): Promise<{ url: string } | { error: string }> {
  const { error } = await supabase.storage.from("marketing").upload(path, body, { contentType, upsert: false });
  if (error) return { error: error.message };
  return { url: supabase.storage.from("marketing").getPublicUrl(path).data.publicUrl };
}

export async function generateImageSet(
  entryId: string,
  opts?: { count?: ImageCount; look?: StyleKey; createdBy?: string | null },
): Promise<{ ok: true; card: SetCard } | { ok: false; error: string }> {
  try {
    const { data, error } = await companyOs.from("marketing_content").select("id, channel, brand_id").eq("id", entryId).maybeSingle();
    if (error) return { ok: false, error: error.message };
    const entry = data as { id: string; channel: string; brand_id: string | null } | null;
    if (!entry) return { ok: false, error: "Post not found." };
    if (!entry.brand_id) return { ok: false, error: "Set a brand on this post first, so its images take the brand's look." };
    // Asked before any work, so a live post on a gated campaign (Y.91) costs
    // nothing; recordAssetImage asks again before the selection moves.
    const live = await liveEditRefusal(entryId);
    if (live) return { ok: false, error: live };

    // A failed read is the read's error: "Brand not found" would have the
    // marketer look for a brand that is there.
    const read = await readBrandProfile(entry.brand_id);
    if (!read.ok) return { ok: false, error: read.error };
    const profile = read.profile;
    if (!profile) return { ok: false, error: "Brand not found." };
    const planned = planImages({ channel: entry.channel, brandSlug: profile.brandSlug, channelTemplates: profile.channelTemplates, look: opts?.look, count: opts?.count });
    if (!planned.ok) return planned;
    const plan = planned.plan;
    if (plan.engine !== "code-drawn-set") return { ok: false, error: "The blog and email take one code-drawn hero from Generate image, not a set." };
    const { look, count, width, height } = plan;

    const logo = await logoFor(profile, look);
    if ("error" in logo) return { ok: false, error: logo.error };

    const words = await writeCardWords(entryId, { count });
    if (!words.ok) return words;

    const setId = crypto.randomUUID();
    const pngs: Buffer[] = [];
    const slides: SetCard["slides"] = [];
    for (const [i, s] of words.set.slides.entries()) {
      const png = await renderCard({
        look,
        arrangement: s.arrangement,
        words: s.words,
        width,
        height,
        art: await brandArt(profile.brandSlug, ART_FOR_ROLE[s.role], width, height, plan.style),
        counter: counterFor(look, i, count),
        cover: i === 0,
        noteOnItem: s.noteOnItem,
        logo: logo.input,
        accent: accentFor(look, s.role),
      });
      const up = await upload(`entries/${entryId}/sets/${setId}/slide-${i + 1}.png`, png, "image/png");
      if ("error" in up) return { ok: false, error: up.error };
      pngs.push(png);
      slides.push({ url: up.url, role: s.role, arrangement: s.arrangement, why: s.why, words: s.words, ...(s.noteOnItem !== undefined ? { noteOnItem: s.noteOnItem } : {}) });
    }

    // LinkedIn's swipeable document post: the slides as one PDF, made with
    // the images (Marketing, 19 Nov).
    let pdfUrl: string | null = null;
    if (entry.channel === "linkedin" && pngs.length > 1) {
      const up = await upload(`entries/${entryId}/sets/${setId}/carousel.pdf`, carouselPdf(pngs), "application/pdf");
      if ("error" in up) return { ok: false, error: up.error };
      pdfUrl = up.url;
    }

    const card: SetCard = {
      kind: "set",
      brand: profile.brandSlug,
      channel: entry.channel,
      style: plan.style,
      count,
      format: plan.format,
      width,
      height,
      chosenAt: plan.chosenAt,
      logo: logo.source,
      art: "code",
      slides,
      pdfUrl,
    };
    const rec = await recordAssetImage({
      entryId,
      url: slides[0].url,
      promptUsed: null,
      model: `code (${look.name}) + card-words`,
      createdBy: opts?.createdBy ?? null,
      card,
    });
    if (!rec.ok) return { ok: false, error: rec.error };
    return { ok: true, card };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[campaign-image-set] failed:", msg);
    return { ok: false, error: msg };
  }
}
