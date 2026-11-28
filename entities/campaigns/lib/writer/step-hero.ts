import { makePostImages } from "@/entities/campaigns/lib/post-images";
import { heroBrand } from "@/entities/campaigns/lib/image-router";
import { HERO_SIZE } from "@/entities/campaigns/lib/visual/hero-shape";
import { loadBlogAsset } from "./data";
import { WRITER_ACTOR, type StepRunner } from "./types";

// Step 5: the blog's code-drawn hero, through the image router as every screen
// makes it (../post-images.ts): Opus writes its words from the post, and its
// image brief when the draft wrote one, and code draws them at 1200 x 675.
// Passes when the new version is recorded and mirrored onto the entry as its
// selected image. A brand with no hero colours yet (any brand on a fork, until
// it gets them) has no hero drawn: the step says so and the campaign carries
// on, because a missing picture should not stop a campaign (R3.350 review).
export const runHero: StepRunner = async ({ campaign, profile }) => {
  if (!heroBrand(profile.brandSlug)) return { ok: true, summary: "No hero drawn: this brand has no hero colours yet." };

  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;

  const r = await makePostImages({ id: blog.id, channel: "blog" }, { createdBy: WRITER_ACTOR });
  if (!r.ok) return { ok: false, error: `Hero: ${r.error}` };

  const after = await loadBlogAsset(campaign.id);
  if (!after.ok) return after;
  if (after.data.imageUrl !== r.url) return { ok: false, error: "Hero: the image was generated but is not the entry's selected image." };
  return { ok: true, summary: `Hero drawn at ${HERO_SIZE.width}×${HERO_SIZE.height}.` };
};
