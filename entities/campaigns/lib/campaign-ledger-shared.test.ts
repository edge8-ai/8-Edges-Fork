import { describe, expect, it } from "vitest";
import { keywordTakenError, ledgerLines, repeatsLastError, styleCeilingError, type LedgerRow } from "./campaign-ledger-shared";

const row = (n: number, over: Partial<LedgerRow>): LedgerRow => ({
  campaignId: `c${n}`, campaignName: `Post ${n}`, brandId: "b", brandName: "Edge8", date: `2026-09-0${n}`, status: "done", blogStatus: "published",
  slug: `post-${n}`, postedUrl: null, title: `Post ${n}`, primaryKeyword: `keyword ${n}`, primaryQuestion: `What is keyword ${n}?`,
  blogType: "thesis", imageStyle: "data-diagram", social: [{ channel: "linkedin", socialStyle: "hot-take", imageStyle: "typographic-splash" }],
  ...over,
});

describe("styleCeilingError", () => {
  const recent = [row(4, {}), row(3, { blogType: "listicle" }), row(2, {}), row(1, { blogType: "listicle" }), row(0, { blogType: "listicle" })];
  it("allows a style that fewer than two of the last four posts used, and anything when nothing was chosen", () => {
    expect(styleCeilingError(recent, "blogType", "framework")).toBeNull();
    expect(styleCeilingError(recent, "blogType", null)).toBeNull();
    expect(styleCeilingError([], "blogType", "thesis")).toBeNull();
  });
  it("refuses a style two of the last four already carry, and only looks at the last four", () => {
    expect(styleCeilingError(recent, "blogType", "thesis")).toMatch(/blog type "thesis" already carries 2 of the brand's last 4 posts/);
    // listicle is on posts 3, 1 and 0: two inside the window, one outside; still refused.
    expect(styleCeilingError(recent, "blogType", "listicle")).toMatch(/carries 2/);
    expect(styleCeilingError(recent.slice(0, 3), "blogType", "listicle")).toBeNull();
  });
  it("reads a social style per channel", () => {
    expect(styleCeilingError(recent, "socialStyle", "hot-take", "linkedin")).toMatch(/linkedin style "hot-take"/);
    expect(styleCeilingError(recent, "socialStyle", "hot-take", "facebook")).toBeNull();
    expect(styleCeilingError(recent, "imageStyle", "data-diagram")).toMatch(/image style/);
  });
});

describe("keywordTakenError", () => {
  it("matches the keyword regardless of case and spacing, and names the post that owns it", () => {
    const recent = [row(1, { primaryKeyword: "AI workflow redesign" })];
    expect(keywordTakenError(recent, "ai  workflow redesign")).toMatch(/already the keyword of "Post 1" \(\/post\/post-1\/\)/);
    expect(keywordTakenError(recent, "AI workflow")).toBeNull();
    expect(keywordTakenError(recent, null)).toBeNull();
  });
});

describe("ledgerLines", () => {
  it("renders one line per post with every choice, and says so when there are none", () => {
    expect(ledgerLines([])).toBe("(no earlier posts)");
    expect(ledgerLines([row(1, {})])).toBe(
      "2026-09-01 | /post/post-1/ | keyword: keyword 1 | question: What is keyword 1? | blog: thesis | image: data-diagram | social: linkedin=hot-take",
    );
  });
});

describe("repeatsLastError", () => {
  it("refuses only the style the most recent post used", () => {
    const recent = [row(2, { imageStyle: "data-diagram" }), row(1, { imageStyle: "pop-art" })];
    expect(repeatsLastError(recent, "imageStyle", "data-diagram")).toMatch(/last post used/);
    expect(repeatsLastError(recent, "imageStyle", "pop-art")).toBeNull();
    expect(repeatsLastError([], "imageStyle", "data-diagram")).toBeNull();
  });
});
