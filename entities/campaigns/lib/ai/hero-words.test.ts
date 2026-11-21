import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/kernel/data/testing/fake-company-os";
import { fakeJsonMessage } from "@/kernel/ai/testing/fake-message";
import type { HeroWords } from "@/entities/campaigns/lib/visual/hero-shape";

// The words a code-drawn hero is drawn from (spec: "The code-drawn hero",
// R3.350.2). Opus writes them; code checks every one and sends the failures
// back once. Prior art: ./card-words.test.ts.

// Usage logging (kernel/ai/response.ts) reaches the database module on import.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const replies = vi.hoisted(() => [] as unknown[]);
const requests = vi.hoisted(() => [] as { system: string; messages: { content: string }[] }[]);
vi.mock("@/kernel/ai/gateway", () => ({
  aiSite: () => ({
    model: "claude-opus-test",
    clientIfConfigured: () => ({
      messages: {
        create: async (body: { system: string; messages: { content: string }[] }) => {
          requests.push(body);
          return fakeJsonMessage(replies.shift());
        },
      },
    }),
  }),
}));

const { HERO_WORDS_PROMPT } = await import("./hero-words.prompt");
const { heroWordFailures, heroWordsOutput, toHeroWords, writeHeroWords } = await import("./hero-words");

// The production regression the card was opened for: the Ignite figures, with
// the event line as the kicker rather than a caption over the logo corner.
const POST = `We ran the AI Officer checklist live at Ignite last week. 78 people surveyed. 20 started the checklist. 11 finished all nine steps. 3 built a prototype before the session closed. Most of the room stopped before anything was built.`;

const IGNITE: HeroWords = {
  layout: "steps",
  kicker: "Live at Ignite",
  headline: "Most stop before the prototype",
  figures: [
    { value: "78", label: "surveyed" },
    { value: "20", label: "started the checklist" },
    { value: "11", label: "finished all nine steps" },
    { value: "3", label: "built a prototype" },
  ],
  accent: 3,
  source: "AI Officer checklist, Ignite",
};

const check = (words: Partial<HeroWords>, brand = "ai-officer") => heroWordFailures({ post: POST, brand, words: { ...IGNITE, ...words } });

describe("heroWordFailures", () => {
  it("passes the Ignite figures as steps, with the event line as the kicker", () => {
    expect(check({})).toEqual([]);
  });

  it("names a figure value that is not in the post", () => {
    expect(check({ figures: [...IGNITE.figures.slice(0, 3), { value: "40%", label: "built a prototype" }] })).toContain(
      'Figure 4\'s value "40%" is not in the post. Use a number the post states, as it states it.',
    );
  });

  it("finds a value only as a whole number, so 7 is not read out of 78", () => {
    expect(check({ figures: [{ value: "7", label: "surveyed" }, IGNITE.figures[1]] })).toContainEqual(expect.stringMatching(/^Figure 1's value "7" is not in the post/));
    const post = `${POST} Each prototype took 1.5 hours.`;
    const words: HeroWords = { ...IGNITE, layout: "row", figures: [{ value: "5", label: "hours" }, IGNITE.figures[0]], accent: undefined };
    expect(heroWordFailures({ post, brand: "ai-officer", words })).toContainEqual(expect.stringMatching(/^Figure 1's value "5" is not in the post/));
    expect(heroWordFailures({ post, brand: "ai-officer", words: { ...words, figures: [{ value: "1.5", label: "hours" }, IGNITE.figures[0]] } })).toEqual([]);
  });

  it("names a layout with the wrong number of figures", () => {
    expect(check({ layout: "stat" })).toContain("A stat hero takes 1 figure; there are 4.");
    expect(check({ layout: "pair", figures: IGNITE.figures.slice(0, 3), accent: undefined })).toContain("A pair hero takes 2 figures; there are 3.");
    expect(check({ layout: "row", figures: IGNITE.figures.slice(0, 1), accent: undefined })).toContain("A row hero takes 2 to 4 figures; there is 1.");
    expect(check({ figures: [...IGNITE.figures, { value: "78", label: "surveyed" }] })).toContain("A steps hero takes 2 to 4 figures; there are 5.");
  });

  it("passes the counts each layout takes", () => {
    expect(check({ layout: "stat", figures: [IGNITE.figures[0]], accent: undefined })).toEqual([]);
    expect(check({ layout: "pair", figures: IGNITE.figures.slice(0, 2), accent: 1 })).toEqual([]);
    expect(check({ layout: "row", figures: IGNITE.figures.slice(0, 2), accent: undefined })).toEqual([]);
  });

  it("names a steps value that does not read as a number, so no bar can be drawn for it", () => {
    const post = `${POST} Nine steps in all.`;
    const words = { ...IGNITE, figures: [IGNITE.figures[0], { value: "Nine", label: "steps" }], accent: undefined };
    expect(heroWordFailures({ post, brand: "ai-officer", words })).toContain(
      'Figure 2\'s value "Nine" is not a number; steps draws each value as a bar, so every value must be one.',
    );
    // A row draws no bars, so the same words pass there.
    expect(heroWordFailures({ post, brand: "ai-officer", words: { ...words, layout: "row" } })).toEqual([]);
  });

  it("names steps values that do not share a unit, because their bars would not compare", () => {
    const post = `${POST} 45% of them had never opened a model before.`;
    expect(heroWordFailures({ post, brand: "ai-officer", words: { ...IGNITE, figures: [IGNITE.figures[0], { value: "45%", label: "never opened a model" }], accent: undefined } })).toContain(
      "Steps values must share one unit, so their bars compare; these mix 78 and 45%.",
    );
  });

  it("holds every line to the house rules: no em dash, Edge8 cased right, the other brand never named", () => {
    expect(check({ headline: `Most stop ${String.fromCharCode(0x2014)} before the prototype` })).toContainEqual(expect.stringMatching(/^The headline: Contains an em dash/));
    expect(check({ kicker: "Live at Ignite with Edge8" })).toContain("The kicker names Edge8; this brand's images never do unless the wording is approved.");
    expect(check({ source: "EDGE8 checklist" }, "edge8")).toContain('The source: The brand name is written "Edge8" exactly; fix the casing.');
    expect(check({ figures: [IGNITE.figures[0], { value: "20", label: "used the Edge8 checklist" }], accent: undefined })).toContain(
      "The figure 2 label names Edge8; this brand's images never do unless the wording is approved.",
    );
  });

  it("names lines past their caps and empty lines", () => {
    const long = "Most of the room stops well before the prototypes";
    expect(long.length).toBe(49);
    expect(check({ headline: long })).toContain("The headline is 49 characters; it takes 48 at most.");
    expect(check({ figures: [IGNITE.figures[0], { value: "20", label: "" }], accent: undefined })).toContain("Figure 2 has no label.");
    expect(check({ headline: " " })).toContain("The headline is empty.");
  });

  it("names an accent that points past the last figure", () => {
    expect(check({ accent: 4 })).toContain("The accent points at figure 5; there are 4 figures.");
    expect(check({ accent: -1 })).toContain("The accent points at figure 0; there are 4 figures.");
  });
});

describe("toHeroWords", () => {
  it("trims every line and drops an empty kicker or source", () => {
    const raw = heroWordsOutput.parse({ layout: "pair", kicker: "  ", headline: " Two numbers ", figures: [{ value: " 78 ", label: " surveyed " }, { value: "3", label: "built" }], source: "" });
    expect(toHeroWords(raw)).toEqual({ layout: "pair", headline: "Two numbers", figures: [{ value: "78", label: "surveyed" }, { value: "3", label: "built" }] });
  });

  it("refuses a layout the drawing does not know", () => {
    expect(heroWordsOutput.safeParse({ layout: "grid", headline: "x", figures: [] }).success).toBe(false);
  });
});

describe("writeHeroWords, with the model stubbed", () => {
  const input = { title: "What the Ignite room built", post: POST, brief: "Point: most stop before building.", brandSlug: "ai-officer", brandName: "Harbour Learning Institute" };

  beforeEach(() => {
    replies.length = 0;
    requests.length = 0;
  });

  it("returns the checked words and the model that wrote them, after one call", async () => {
    replies.push(IGNITE);
    expect(await writeHeroWords(input)).toEqual({ ok: true, words: IGNITE, model: "claude-opus-test" });
    expect(requests).toHaveLength(1);
    expect(requests[0].messages[0].content).toContain("Point: most stop before building.");
    expect(requests[0].messages[0].content).toContain("Harbour Learning Institute");
  });

  it("finds a value in the post's title as well as its copy", async () => {
    replies.push({ ...IGNITE, layout: "stat", figures: [{ value: "1", label: "room" }], accent: undefined });
    expect(await writeHeroWords({ ...input, title: "1 room, 78 people" })).toMatchObject({ ok: true });
  });

  it("sends every failure back once and returns the fixed answer", async () => {
    replies.push({ ...IGNITE, layout: "stat" }, IGNITE);
    expect(await writeHeroWords(input)).toEqual({ ok: true, words: IGNITE, model: "claude-opus-test" });
    expect(requests).toHaveLength(2);
    expect(requests[1].messages[0].content).toContain("- A stat hero takes 1 figure; there are 4.");
  });

  it("returns an error, with the failures, when the second answer still fails", async () => {
    replies.push({ ...IGNITE, accent: 9 }, { ...IGNITE, accent: 9 });
    const out = await writeHeroWords(input);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/^The hero words still break the rules after one retry: The accent points at figure 10/);
    expect(requests).toHaveLength(2);
  });

  it("says there was no brief when the post has none", async () => {
    replies.push(IGNITE);
    await writeHeroWords({ ...input, brief: null });
    expect(requests[0].messages[0].content).toContain("Image brief: none");
  });
});

describe("HERO_WORDS_PROMPT", () => {
  it("has the slots the call fills", () => {
    for (const slot of ["{{otherBrand}}", "{{kickerCap}}", "{{headlineCap}}", "{{valueCap}}", "{{labelCap}}", "{{sourceCap}}"]) expect(HERO_WORDS_PROMPT.system).toContain(slot);
    for (const slot of ["{{brand}}", "{{title}}", "{{brief}}", "{{post}}"]) expect(HERO_WORDS_PROMPT.user).toContain(slot);
    expect(HERO_WORDS_PROMPT.parts.retry).toContain("{{failures}}");
  });
});
