import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/entities/contacts", () => ({
  activeBrandProfiles: vi.fn(),
  brandProfileBySlug: vi.fn(),
  brandProfileOf: vi.fn(),
}));

import { brandProfileOf } from "@/entities/contacts";
import { getBrandProfile, readBrandProfile } from "./brand-profiles";

// readBrandProfile exists so a failed read reaches the person as an error and
// not as a brand with no profile (R3.343.3): the post's image panel would
// otherwise say Style DNA decided nothing.
describe("readBrandProfile", () => {
  beforeEach(() => vi.mocked(brandProfileOf).mockReset());

  it("returns the read's error rather than an empty profile", async () => {
    vi.mocked(brandProfileOf).mockResolvedValue({ data: null, error: { message: "connection reset" } });
    expect(await readBrandProfile("b1")).toEqual({ ok: false, error: "connection reset" });
  });

  it("returns null for a brand that does not exist", async () => {
    vi.mocked(brandProfileOf).mockResolvedValue({ data: null, error: null });
    expect(await readBrandProfile("b1")).toEqual({ ok: true, profile: null });
  });

  it("returns the brand's Style DNA from its profile, as one row or a one-row array", async () => {
    const profile = { image_style_md: "## Fixed\n- Palette: Navy ground." };
    for (const brand_profiles of [profile, [profile]]) {
      vi.mocked(brandProfileOf).mockResolvedValue({
        data: { id: "b1", slug: "edge8", name: "Edge8", brand_profiles } as never,
        error: null,
      });
      const r = await readBrandProfile("b1");
      expect(r).toMatchObject({ ok: true, profile: { brandId: "b1", brandSlug: "edge8", imageStyleMd: "## Fixed\n- Palette: Navy ground." } });
    }
  });
});

// getBrandProfile is readBrandProfile for callers where no profile is a fine
// answer: a failed read is logged and reads as a brand with no profile.
describe("getBrandProfile", () => {
  beforeEach(() => vi.mocked(brandProfileOf).mockReset());

  it("logs a failed read and answers null", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(brandProfileOf).mockResolvedValue({ data: null, error: { message: "connection reset" } });
    expect(await getBrandProfile("b1")).toBeNull();
    expect(log).toHaveBeenCalledWith("[company-os/campaigns] brands", "connection reset");
    log.mockRestore();
  });

  it("answers the profile on a good read", async () => {
    vi.mocked(brandProfileOf).mockResolvedValue({
      data: { id: "b1", slug: "edge8", name: "Edge8", brand_profiles: { image_style_md: "Navy ground." } } as never,
      error: null,
    });
    expect(await getBrandProfile("b1")).toMatchObject({ brandId: "b1", imageStyleMd: "Navy ground." });
  });
});
