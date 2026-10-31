import { describe, it, expect } from "vitest";
import { ctaCatalog, ctaKeyFor, nextInRotation, nextLayout } from "./ctas";

describe("rotation", () => {
  it("starts with list and goes list, feature, cards, list", () => {
    expect(nextLayout(null)).toBe("list");
    expect(nextLayout("list")).toBe("feature");
    expect(nextLayout("feature")).toBe("cards");
    expect(nextLayout("cards")).toBe("list");
  });

  it("skips catalog entries with no landing page and wraps", () => {
    const entries = ctaCatalog();
    const usable = (e: { cta: unknown }) => Boolean(e.cta);
    // Without the LinkedIn and book URLs configured, only two entries are live.
    expect(nextInRotation(entries, null, usable)?.key).toBe("conversation");
    expect(nextInRotation(entries, "conversation", usable)?.key).toBe("retreat");
    expect(nextInRotation(entries, "retreat", usable)?.key).toBe("conversation");
  });

  it("recovers the catalog key from a sent letter's button label", () => {
    const retreat = ctaCatalog().find((e) => e.key === "retreat")!.cta;
    expect(ctaKeyFor(retreat)).toBe("retreat");
    expect(ctaKeyFor({ tagline: "x", line: "", label: "Something else", url: "https://x" })).toBeNull();
    expect(ctaKeyFor(null)).toBeNull();
  });
});
