import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { brandLineFailures, normLine } from "@/entities/campaigns/lib/visual/brand-rules";
import { OTHER_BRAND } from "@/entities/campaigns/lib/visual/cross-brand";
import { HERO_CAPS, HERO_FIGURE_COUNTS, HERO_LAYOUTS, heroFigureNumber, type HeroWords } from "@/entities/campaigns/lib/visual/hero-shape";
import { HERO_WORDS_PROMPT } from "./hero-words.prompt";
import { z } from "zod/v4";

// The words a code-drawn hero is drawn from (spec: "The code-drawn hero",
// R3.350.2). Opus writes them from the post, its image brief and the brand's
// name; the brand kit owns the look, so Style DNA is not read. Every line is
// checked before it is returned and the failures go back to the model once,
// the way the card words retry (./card-words.ts). The caller loads the post
// and records the result; nothing is read or stored here.

// The words go onto a published picture: class A, like the post itself. The
// deep tier because the hero is one picture per post, made on a click, and
// choosing which of a post's numbers carry it is the judgement Sonnet's
// painted heroes got wrong.
export const HERO_WORDS_CLASS: AiDataClass = "A";
const AI = aiSite({ site: "hero-words", dataClass: HERO_WORDS_CLASS, tier: "deep" });
const MODEL = AI.model;

// Counts and caps live in .describe() and in the check after the call, never
// as .max(): the structured-output API refuses array bounds (ADR 0006).
export const heroWordsOutput = z.object({
  layout: z.enum(HERO_LAYOUTS).describe("stat (1 figure), pair (2 figures), row (2 to 4) or steps (2 to 4, drawn as bars in proportion)."),
  kicker: z.string().optional().describe(`The small line above the headline, such as the event or where the numbers come from. At most ${HERO_CAPS.kicker} characters.`),
  headline: z.string().describe(`The one thing the picture says. At most ${HERO_CAPS.headline} characters.`),
  figures: z
    .array(
      z.object({
        value: z.string().describe(`The number exactly as the post states it. At most ${HERO_CAPS.value} characters.`),
        label: z.string().describe(`What the number counts. At most ${HERO_CAPS.label} characters.`),
      }),
    )
    .describe("1 to 4 figures, as many as the layout takes."),
  accent: z.number().int().optional().describe("Which figure takes the brand colour, counting from 0. Leave it out for the last."),
  source: z.string().optional().describe(`The line bottom-right, beside the logo. At most ${HERO_CAPS.source} characters.`),
});
type RawHeroWords = z.infer<typeof heroWordsOutput>;

const OUTPUT_SCHEMA = jsonSchemaFor(heroWordsOutput);

/** The model's answer as the layout reads it: every line trimmed, an empty kicker or source dropped. */
export function toHeroWords(raw: RawHeroWords): HeroWords {
  const words: HeroWords = {
    layout: raw.layout,
    headline: raw.headline.trim(),
    figures: raw.figures.map((f) => ({ value: f.value.trim(), label: f.label.trim() })),
  };
  const kicker = raw.kicker?.trim();
  if (kicker) words.kicker = kicker;
  const source = raw.source?.trim();
  if (source) words.source = source;
  if (raw.accent !== undefined) words.accent = raw.accent;
  return words;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A value is found in the post only as a whole number: "7" is not read out of
// "78", nor "5" out of "1.5", or almost any short value would pass.
function valueInPost(post: string, value: string): boolean {
  const v = escapeRe(normLine(value));
  if (!v) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?<!\\p{N}[.,])${v}(?![\\p{L}\\p{N}])(?![.,]\\p{N})`, "u").test(post);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Every problem with a hero's words, named so one retry can fix them all: the
 * figure count for the layout, each value found in the post, steps values that
 * read as numbers in one unit, the length caps, the brand rules on every line,
 * and an accent that points at a figure. `post` is the text the values must
 * come from (the caller passes the title and the copy); `brand` is its slug.
 */
export function heroWordFailures(input: { post: string; brand: string; words: HeroWords; approvedCrossBrand?: string[] }): string[] {
  const { brand, words: w, approvedCrossBrand } = input;
  const post = normLine(input.post);
  const failures: string[] = [];
  const n = w.figures.length;

  const count = HERO_FIGURE_COUNTS[w.layout];
  if (n < count.min || n > count.max) {
    const takes = count.min === count.max ? plural(count.min, "figure") : `${count.min} to ${count.max} figures`;
    failures.push(`A ${w.layout} hero takes ${takes}; there ${n === 1 ? "is" : "are"} ${n}.`);
  }

  const line = (key: string, text: string, cap: number) => {
    if (text.length > cap) failures.push(`The ${key} is ${text.length} characters; it takes ${cap} at most.`);
    failures.push(...brandLineFailures({ key, text, brand, approvedCrossBrand }));
  };

  if (!w.headline.trim()) failures.push("The headline is empty.");
  line("headline", w.headline, HERO_CAPS.headline);
  if (w.kicker?.trim()) line("kicker", w.kicker, HERO_CAPS.kicker);
  if (w.source?.trim()) line("source", w.source, HERO_CAPS.source);

  w.figures.forEach((f, i) => {
    const at = i + 1;
    if (!f.value.trim()) failures.push(`Figure ${at} has no value.`);
    else if (!valueInPost(post, f.value)) failures.push(`Figure ${at}'s value "${f.value}" is not in the post. Use a number the post states, as it states it.`);
    if (!f.label.trim()) failures.push(`Figure ${at} has no label.`);
    line(`figure ${at} value`, f.value, HERO_CAPS.value);
    line(`figure ${at} label`, f.label, HERO_CAPS.label);
  });

  if (w.layout === "steps") {
    const firstOfUnit = new Map<string, string>();
    w.figures.forEach((f, i) => {
      const num = heroFigureNumber(f.value);
      if (!num) {
        if (f.value.trim()) failures.push(`Figure ${i + 1}'s value "${f.value}" is not a number; steps draws each value as a bar, so every value must be one.`);
      } else if (!firstOfUnit.has(num.unit)) firstOfUnit.set(num.unit, f.value.trim());
    });
    if (firstOfUnit.size > 1) failures.push(`Steps values must share one unit, so their bars compare; these mix ${andList([...firstOfUnit.values()])}.`);
  }

  if (w.accent !== undefined && (w.accent < 0 || w.accent >= n)) failures.push(`The accent points at figure ${w.accent + 1}; there are ${plural(n, "figure")}.`);

  return failures;
}

export type HeroWordsInput = {
  title: string;
  // The post's copy, which every figure value must come from (with the title).
  post: string;
  // The post's image brief, when it has one: Point, Figures and Layout.
  brief?: string | null;
  brandSlug: string;
  brandName: string;
  // Problems only the caller can see, such as words too long for this brand's
  // logo corner. They join this module's checks and the one retry, so words
  // that cannot be drawn go back to the model rather than failing after it was
  // paid. A callback rather than the layout itself keeps this module free of
  // the visual layout (and its logo sizes), as hero-shape.ts keeps the two
  // halves apart.
  layoutFailures?: (words: HeroWords) => string[];
};

/**
 * The checked words for a post's code-drawn hero, and the model that wrote
 * them (the image version records it). A second failed answer is an error and
 * nothing is drawn.
 */
export async function writeHeroWords(input: HeroWordsInput): Promise<{ ok: true; words: HeroWords; model: string } | { ok: false; error: string }> {
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
    const post = input.post.trim();
    if (!post) return { ok: false, error: "This post has no text yet; draft it before making its hero." };

    const P = HERO_WORDS_PROMPT;
    const otherBrand = Object.hasOwn(OTHER_BRAND, input.brandSlug) ? OTHER_BRAND[input.brandSlug].name : "any other brand";
    const system = fillPrompt(P.system, {
      otherBrand,
      kickerCap: HERO_CAPS.kicker,
      headlineCap: HERO_CAPS.headline,
      valueCap: HERO_CAPS.value,
      labelCap: HERO_CAPS.label,
      sourceCap: HERO_CAPS.source,
    });
    const user = fillPrompt(P.user, { brand: input.brandName, title: input.title, brief: input.brief?.trim() || "none", post });
    // The title is part of the post a reader sees, so a number it states counts.
    const source = `${input.title}\n\n${post}`;

    let failures: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const content = attempt === 0 ? user : user + fillPrompt(P.parts.retry, { failures: failures.map((f) => `- ${f}`).join("\n") });
      // Sized like the card words' budget, not yet measured on this site: a
      // short answer plus Opus's thinking at medium effort, and two calls must
      // fit the maker's route together.
      const response = await llm.messages.create({
        prompt: HERO_WORDS_PROMPT,
        model: MODEL,
        max_tokens: 4000,
        system,
        output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content }],
      });
      const out = readStructuredOutput("hero-words", MODEL, response, heroWordsOutput, "The model declined to choose the hero's words.");
      if (!out.ok) return { ok: false, error: out.error };
      const words = toHeroWords(out.data);
      failures = [...heroWordFailures({ post: source, brand: input.brandSlug, words }), ...(input.layoutFailures?.(words) ?? [])];
      if (!failures.length) return { ok: true, words, model: MODEL };
    }
    return { ok: false, error: `The hero words still break the rules after one retry: ${failures.slice(0, 3).join(" ")}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[hero-words] failed:", msg);
    return { ok: false, error: msg };
  }
}
