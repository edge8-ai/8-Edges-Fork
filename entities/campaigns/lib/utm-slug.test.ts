import { describe, expect, it, vi } from "vitest";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => ({}) } }));

import { utmSlug } from "./marketing-campaigns";

// The slug a campaign is known by in a link.
describe("utmSlug", () => {
  it("lowercases, hyphenates and trims", () => {
    expect(utmSlug("Autumn Letter — 2026!")).toBe("autumn-letter-2026");
    expect(utmSlug("  ")).toBe("");
    expect(utmSlug("a".repeat(100)).length).toBe(80);
  });
});
