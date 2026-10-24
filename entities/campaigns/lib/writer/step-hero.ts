import { generateEntryImage, HERO_ASPECT_RATIO } from "@/entities/campaigns/lib/ai/brand-image";
import { loadBlogAsset } from "./data";
import { WRITER_ACTOR, type StepRunner } from "./types";

// Step 5: the hero, 16:9 with the subject in the middle third, from the image
// brief the draft wrote and the brand's image style. Passes when the new
// version is recorded and mirrored onto the entry as its selected image.
export const runHero: StepRunner = async ({ campaign }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.imageBriefMd?.trim()) return { ok: false, error: "Hero: the blog asset has no image brief; the draft step should have written one." };

  const r = await generateEntryImage(blog.id, { createdBy: WRITER_ACTOR, aspectRatio: HERO_ASPECT_RATIO });
  if (!r.ok) return { ok: false, error: `Hero: ${r.error}` };

  const after = await loadBlogAsset(campaign.id);
  if (!after.ok) return after;
  if (after.data.imageUrl !== r.url) return { ok: false, error: "Hero: the image was generated but is not the entry's selected image." };
  return { ok: true, summary: `Hero generated at ${HERO_ASPECT_RATIO}.` };
};
