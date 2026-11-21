import { describe, expect, it } from "vitest";
import { CARD_WORDS_PROMPT } from "./card-words.prompt";
import { cardSetFailures, cardWordsOutput, toCardSlide, type CardSlide } from "./card-words";

// The "Video in an afternoon" LinkedIn post the Mk.2 samples were made from.
const POST = `Most founders think a company video costs a week. Ours takes an afternoon. Here is the order we do it in at Edge8. Talk the idea through first. Out loud. With someone. Write the post. Before any video work. Pull out the three to five points the video has to hit. Write the script. This is where quality is won or lost. Plan the scenes. Run it through a workflow that already knows your brand. Add a voiceover. Generate. Watch it once. Ship. Now the catch. AI video on its own is average. Ours is never as good as when our motion designer directs it. Same tools. Same script. Different result. The tool is never the thing. The person directing it is the thing.`;

const HOOK: CardSlide = { role: "hook", arrangement: "headline", why: "the claim", words: { kicker: "Most founders think a company video costs a week.", headline: "Ours takes an afternoon.", accent: "an afternoon." } };
const STEPS: CardSlide = {
  role: "support", arrangement: "steps", why: "the post lists the steps", noteOnItem: 3,
  words: {
    headline: "Here is the order we do it in at Edge8.", accent: "at Edge8.", note: "This is where quality is won or lost.",
    items: ["Talk the idea through first.", "Write the post.", "Pull out the three to five points", "Write the script.", "Plan the scenes.", "Run it through a workflow that already knows your brand.", "Add a voiceover.", "Generate. Watch it once. Ship."],
  },
};
const KEY: CardSlide = { role: "key", arrangement: "columns", why: "a contrast", words: { headline: "AI video on its own is average.", accent: "is average.", labels: ["Same tools", "Different result"], under: "Same script." } };
const CLOSE: CardSlide = { role: "close", arrangement: "headline", why: "lands it", words: { kicker: "The tool is never the thing.", headline: "The person directing it is the thing.", accent: "is the thing." } };

const check = (slides: CardSlide[], count: 1 | 2 | 4 = 4, brand = "edge8") =>
  cardSetFailures({ post: POST, brand, count, format: count > 1 ? "carousel-slide" : "single", slides });

describe("cardSetFailures", () => {
  it("passes a good four-image carousel", () => {
    expect(check([HOOK, STEPS, KEY, CLOSE])).toEqual([]);
  });

  it("passes Layout 2 (hook and key point) and Layout 1 (the hook)", () => {
    expect(check([HOOK, KEY], 2)).toEqual([]);
    expect(check([HOOK], 1)).toEqual([]);
  });

  it("names a wrong count and wrong roles", () => {
    const f = check([STEPS, HOOK, CLOSE]);
    expect(f).toContain("There are 3 images; the set takes exactly 4.");
    expect(f).toContain("The first image must be the hook.");
    expect(f).toContain("Exactly one image must be the key point.");
    expect(check([HOOK, STEPS, KEY, { ...CLOSE, role: "support" }])).toContain("The fourth image must be the close.");
  });

  it("refuses words that are not in the post, with the image they are on", () => {
    const made = { ...HOOK, words: { headline: "Video in one afternoon." } };
    expect(check([made], 1)).toContainEqual(expect.stringMatching(/^Image 1 \(hook, headline\): The headline "Video in one afternoon\." is not in the post/));
  });

  it("refuses an Institute card that names Edge8", () => {
    expect(check([HOOK, STEPS, KEY, CLOSE], 4, "ai-officer")).toContainEqual(expect.stringMatching(/names Edge8/));
  });

  it("holds a single image to 5 steps and a set to 8", () => {
    expect(cardSetFailures({ post: POST, brand: "edge8", count: 1, format: "single", slides: [{ ...STEPS, role: "hook" }] })).toContainEqual(
      expect.stringMatching(/a single image takes 5 at most/),
    );
  });

  it("checks the note points at an item that exists", () => {
    expect(check([HOOK, { ...STEPS, noteOnItem: 9 }, KEY, CLOSE])).toContainEqual(expect.stringMatching(/item 9, which is not in the list/));
    expect(check([HOOK, { ...STEPS, noteOnItem: undefined }, KEY, CLOSE])).toContainEqual(expect.stringMatching(/needs note_on_item/));
  });
});

describe("toCardSlide", () => {
  it("maps the model's fields to the renderer's words and drops empty ones", () => {
    const raw = cardWordsOutput.parse({
      slides: [{ role: "support", arrangement: "steps", why: " steps ", headline: " Here is the order ", accent: "", items: [" A ", "B"], note: "N", note_on_item: 1, sub: "  " }],
    }).slides[0];
    expect(toCardSlide(raw)).toEqual({ role: "support", arrangement: "steps", why: "steps", words: { headline: "Here is the order", items: ["A", "B"], note: "N" }, noteOnItem: 1 });
  });

  it("refuses a role or arrangement the renderer does not know", () => {
    expect(cardWordsOutput.safeParse({ slides: [{ role: "intro", arrangement: "headline", why: "", headline: "x" }] }).success).toBe(false);
    expect(cardWordsOutput.safeParse({ slides: [{ role: "hook", arrangement: "grid", why: "", headline: "x" }] }).success).toBe(false);
  });
});

describe("CARD_WORDS_PROMPT", () => {
  it("has the slots the step fills", () => {
    for (const slot of ["{{otherBrand}}", "{{maxItems}}", "{{count}}"]) expect(CARD_WORDS_PROMPT.system).toContain(slot);
    for (const slot of ["{{brand}}", "{{channel}}", "{{count}}", "{{format}}", "{{title}}", "{{post}}"]) expect(CARD_WORDS_PROMPT.user).toContain(slot);
    expect(CARD_WORDS_PROMPT.parts.retry).toContain("{{failures}}");
  });
});
