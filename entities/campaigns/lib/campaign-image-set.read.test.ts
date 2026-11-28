import { describe, expect, it, vi } from "vitest";

// A failed read of the post's brand stops the set with the read's error. It is
// not a brand that was not found, and not a post without a brand: either would
// send the marketer to fix something that is not broken. The database is the
// outside world here; the set's drawing has its own suite
// (campaign-image-set.test.ts).
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      select: () => ({ eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: { id, channel: "linkedin", brand_id: "brand-1" }, error: null }) }) }),
    }),
  },
  supabase: { storage: { from: () => ({}) } },
}));
vi.mock("@/entities/campaigns/lib/brand-profiles", () => ({
  readBrandProfile: async () => ({ ok: false, error: "connection reset" }),
  getBrandProfile: async () => null,
}));
vi.mock("@/entities/campaigns/lib/blog-live-edit", () => ({ liveEditRefusal: async () => null }));
const words = vi.hoisted(() => ({ asked: 0 }));
vi.mock("@/entities/campaigns/lib/ai/card-words", () => ({ writeCardWords: async () => (words.asked++, { ok: false, error: "not reached" }) }));
vi.mock("@/entities/campaigns/lib/marketing-images", () => ({ recordAssetImage: async () => ({ ok: true }) }));

import { generateImageSet } from "./campaign-image-set";

describe("generateImageSet with a failed brand read", () => {
  it("returns the read's error, not a missing brand", async () => {
    expect(await generateImageSet("entry-1")).toEqual({ ok: false, error: "connection reset" });
    expect(words.asked).toBe(0);
  });
});
