import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The brand questions and commands contacts' door answers (A.64). Each row is
// the query a caller in campaigns built by hand before A.64.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom }, companyOsUntyped: { from: recordingFrom } }));

import {
  activeBrandProfiles,
  activeBrands,
  brandAudiencePage,
  brandIdBySlug,
  brandNames,
  brandProfileBySlug,
  brandProfileOf,
  brandSlugOf,
  writeBrandProfile,
} from "./brands";

beforeEach(() => resetQueries());

const BY_NAME = { ascending: true };
const PROFILE =
  "id, slug, name, brand_profiles(positioning, audience, offer, primary_cta, author_md, voice_md, rules_md, channels_md, process_md, blog_styles_md, editing_lens_md, seo_lens_md, image_style_md, preferred_blog_types, preferred_image_styles, preferred_social_styles, auto_publish)";

const reads: [string, () => Promise<unknown>, string, Step[]][] = [
  // marketing calendar's brand picker: active only.
  ["activeBrands", () => activeBrands(), "brands", [["select", "id, name, slug"], ["eq", "active", true], ["order", "name", BY_NAME]]],
  // email schedule: every brand, inactive ones too.
  ["brandNames", () => brandNames(), "brands", [["select", "id, name"]]],
  // brand audience and the auto-publish switch.
  ["brandSlugOf", () => brandSlugOf("b1"), "brands", [["select", "slug"], ["eq", "id", "b1"], ["maybeSingle"]]],
  // series template: our own brand's latest post.
  ["brandIdBySlug", () => brandIdBySlug("our-brand"), "brands", [["select", "id"], ["eq", "slug", "our-brand"], ["maybeSingle"]]],
  // brand profiles: the list, by id, by slug.
  ["activeBrandProfiles", () => activeBrandProfiles(), "brands", [["select", PROFILE], ["eq", "active", true], ["order", "name", BY_NAME]]],
  ["brandProfileOf", () => brandProfileOf("b1"), "brands", [["select", PROFILE], ["eq", "id", "b1"], ["maybeSingle"]]],
  ["brandProfileBySlug", () => brandProfileBySlug("our-brand"), "brands", [["select", PROFILE], ["eq", "slug", "our-brand"], ["maybeSingle"]]],
  // a guest brand's audience, a page at a time.
  [
    "brandAudiencePage",
    () => brandAudiencePage("b1", 0, 999),
    "brand_contacts",
    [["select", "person_id"], ["eq", "brand_id", "b1"], ["order", "person_id", { ascending: true }], ["range", 0, 999]],
  ],
];

describe("brand questions (A.64)", () => {
  it.each(reads)("%s asks exactly what its callers asked", async (_name, ask, table, steps) => {
    await ask();
    expect(queries).toEqual([{ table, steps }]);
  });
});

describe("brand commands (A.64)", () => {
  it("writeBrandProfile upserts the row on its brand", async () => {
    const row = { brand_id: "b1", auto_publish: true };
    await writeBrandProfile(row);
    expect(queries).toEqual([{ table: "brand_profiles", steps: [["upsert", row, { onConflict: "brand_id" }]] }]);
  });
});
