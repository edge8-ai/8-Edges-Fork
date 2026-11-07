import { script } from "@/kernel/data/testing/fake-company-os";

// The outside world the live-edit rule (Y.91, ../blog-live-edit) reads, for
// the suites that drive a real edit path into it: the brand profile (does the
// campaign's brand publish without an approval?) and the campaign's latest
// Publish approval. The post and its campaign come from the house fake of
// company_os, scripted by scriptLivePost. Each suite wires these in with its
// own vi.mock calls, which vitest hoists per file:
//
//   vi.mock("@/entities/campaigns/lib/brand-profiles", async () => (await import("…/testing/live-post-fake")).brandProfilesFake);
//   vi.mock("@/kernel/approvals/waiting", async () => (await import("…/testing/live-post-fake")).waitingFake);

export const liveGate = {
  /** Brands whose switch publishes without an approval (decision Y.53). */
  autoPublishBrands: new Set<string>(),
  /** The campaign's latest Publish approval, or null for no history. */
  latest: null as null | { state: string; metadata: Record<string, unknown> },
  approvalsFail: false,
  approvalReads: 0,
};

export function resetLiveGate(): void {
  liveGate.autoPublishBrands.clear();
  liveGate.latest = null;
  liveGate.approvalsFail = false;
  liveGate.approvalReads = 0;
}

export const brandProfilesFake = {
  getBrandProfile: async (brandId: string) => ({ brandId, autoPublish: liveGate.autoPublishBrands.has(brandId) }),
};

export const waitingFake = {
  latestApproval: async () => {
    liveGate.approvalReads += 1;
    if (liveGate.approvalsFail) throw new Error("approvals down");
    return liveGate.latest ? { id: "ap-1", decidedBy: null, decidedAt: null, ...liveGate.latest } : null;
  },
};

/** A blog post live on campaign c-1, as the rule reads it. */
export const LIVE_POST = {
  channel: "blog",
  status: "published",
  campaign_id: "c-1" as string | null,
  brand_id: "brand-1",
  title: "How to delegate",
  copy_md: "Body.",
  seo_md: "slug: how-to-delegate",
  image_url: "https://img.example/1.png",
  publish_date: "2026-10-09",
};

/**
 * Script the rule's reads for one edit: the post, then (for a live blog on a
 * campaign) the campaign's brand, which `campaignBrand` sets; null scripts a
 * campaign with no brand.
 */
export function scriptLivePost(row: Partial<typeof LIVE_POST> = {}, campaignBrand: string | null = "brand-1"): void {
  const post = { ...LIVE_POST, ...row };
  script("marketing_content", { data: post });
  if (post.channel === "blog" && post.status === "published" && post.campaign_id) script("marketing_campaigns", { data: { brand_id: campaignBrand } });
}
