import { validateBlogForPublish } from "@/entities/campaigns/lib/blog-publish";
import { parseSeoMd } from "@/entities/campaigns/lib/seo";
import { qualityErrors } from "./checks";
import { loadBlogAsset, slugTaken } from "./data";
import { wordRangeFrom } from "./profile-rules";
import type { StepRunner } from "./types";

// Step 8: the publish gate plus the process checks, run once more on the
// assembled body. Zero errors, or the run stops here with every failure listed.
export const runValidate: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  const parsed = parseSeoMd(blog.seoMd);
  const taken = parsed.slug ? await slugTaken(parsed.slug, blog.id) : false;

  const errors = [
    ...validateBlogForPublish(
      { channel: "blog", copy_md: blog.copyMd, seo_md: blog.seoMd, image_url: blog.imageUrl },
      parsed,
      (s) => taken && s === parsed.slug,
    ),
    ...qualityErrors(blog.copyMd ?? "", { primaryKeyword: parsed.primaryKeyword, range: wordRangeFrom(profile) }),
  ];
  const unique = Array.from(new Set(errors));
  if (unique.length) return { ok: false, error: `Validate: ${unique.join(" ")}` };
  return { ok: true, summary: "Every publish and process check passed." };
};
