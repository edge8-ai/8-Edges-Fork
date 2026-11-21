import { describe, expect, it, vi } from "vitest";

// The brand family is deployment data (a fork stubs it empty), so the test
// brings its own pair and exercises the rule, not the upstream's constant.
vi.mock("./cross-brand", () => ({
  OTHER_BRAND: { "ai-officer": { name: "Edge8", re: /\bedge ?8\b/i } },
}));

import { cardWordFailures, type CardWords } from "./brand-rules";

// The approved Personal LinkedIn post from the "How to make AI video for your
// company" campaign, the post the local runs used.
const POST = `Most founders think a company video costs a week.

Ours takes an afternoon.

Here is the order we do it in at Edge8.

Talk the idea through first. Out loud. With someone.

Write the post. Before any video work.

Pull out the three to five points the video has to hit.

Write the script. This is where quality is won or lost.

Plan the scenes. Explaining lines get motion graphics. Trust lines get a real face.

Run it through a workflow that already knows your brand.

Add a voiceover. Live if the viewer is someone you want to close.

Generate. Watch it once. Ship.

Now the catch.

AI video on its own is average.

Ours is never as good as when our motion designer directs it.

Same tools. Same script. Different result.`;

const check = (words: CardWords, more: Partial<Parameters<typeof cardWordFailures>[0]> = {}) =>
  cardWordFailures({ post: POST, words, arrangement: "headline", format: "single", brand: "edge8", ...more });

describe("cardWordFailures", () => {
  it("passes the post's own words", () => {
    expect(check({ kicker: "Most founders think a company video costs a week.", headline: "Ours takes an afternoon.", accent: "an afternoon." })).toEqual([]);
  });

  it("refuses words that are not in the post", () => {
    expect(check({ headline: "Video in one hour." })).toEqual(['The headline "Video in one hour." is not in the post. Use the post\'s own words.']);
  });

  it("refuses an em dash and the wrong brand casing", () => {
    const post = `${POST}\nOurs takes an afternoon — at EDGE8.`;
    const failures = cardWordFailures({ post, words: { headline: "Ours takes an afternoon — at EDGE8." }, arrangement: "headline", format: "single", brand: "edge8" });
    expect(failures.some((f) => f.includes("em dash"))).toBe(true);
    expect(failures.some((f) => f.includes('"Edge8" exactly'))).toBe(true);
  });

  it("keeps an Institute image from naming Edge8 unless the wording is approved", () => {
    const words = { headline: "Here is the order we do it in at Edge8." };
    const institute = { brand: "ai-officer", arrangement: "steps" as const, format: "carousel-slide" as const };
    const failures = check({ ...words, items: ["Write the post.", "Write the script.", "Plan the scenes."] }, institute);
    expect(failures).toContain('The headline names Edge8; this brand\'s images never do unless the wording is approved.');
    expect(check({ ...words, items: ["Write the post.", "Write the script.", "Plan the scenes."] }, { ...institute, approvedCrossBrand: ["at Edge8"] })).toEqual([]);
  });

  it("caps the headline by arrangement: 8 words, 10 on a Steps slide", () => {
    // "Here is the order we do it in at Edge8." is ten words.
    const nine = { headline: "Here is the order we do it in at Edge8.", items: ["Write the post.", "Write the script.", "Plan the scenes."] };
    expect(check(nine)).toContain("The headline is 10 words; on a headline card it takes 8 at most.");
    expect(check(nine, { arrangement: "steps", format: "carousel-slide" })).toEqual([]);
  });

  it("lets a carousel slide hold eight steps and a single image five", () => {
    const items = ["Talk the idea through first.", "Write the post.", "Pull out the three to five points", "Write the script.", "Plan the scenes.", "Run it through a workflow that already knows your brand.", "Add a voiceover.", "Generate. Watch it once. Ship."];
    const words = { headline: "Here is the order we do it in at Edge8.", items };
    expect(check(words, { arrangement: "steps", format: "carousel-slide" })).toEqual([]);
    expect(check(words, { arrangement: "steps", format: "single" })).toContain("There are 8 items; a single image takes 5 at most.");
  });

  it("wants the accent to end the headline, and two labels for Columns", () => {
    expect(check({ headline: "Ours takes an afternoon.", accent: "Ours takes" })).toContain('The accent "Ours takes" is not the end of the headline.');
    expect(check({ headline: "AI video on its own is average.", labels: ["Same tools"] }, { arrangement: "columns" })).toContain("Columns needs exactly two labels.");
  });
});
