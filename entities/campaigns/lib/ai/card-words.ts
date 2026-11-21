import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { cardWordFailures, type Arrangement, type CardFormat, type CardWords } from "@/entities/campaigns/lib/visual/brand-rules";
import { channelImageSet, type ImageCount } from "@/entities/campaigns/lib/visual/channel-sizes";
import { OTHER_BRAND } from "@/entities/campaigns/lib/visual/cross-brand";
import type { SlideRole } from "@/entities/campaigns/lib/visual/slide-roles";
import { CARD_WORDS_PROMPT } from "./card-words.prompt";
import { z } from "zod/v4";

// The words and roles for one post's campaign images (plan: "Campaign images
// that follow the visual direction skill", Mk.2 PR B). It reads the finished
// post when Marketing presses Generate images, so nothing about Draft all
// changes. Every line is checked against the post and the brand rules before
// it is returned; the failures go back to the model once, the way the
// writer's checked steps retry. Nothing is stored here: PR C keeps the result
// on each image version's `card`.

// The words go onto published images: class A, like the post itself.
export const CARD_WORDS_CLASS: AiDataClass = "A";
const AI = aiSite({ site: "card-words", dataClass: CARD_WORDS_CLASS, tier: "standard" });
const MODEL = AI.model;

const ARRANGEMENTS = ["headline", "steps", "columns", "single-idea"] as const satisfies readonly Arrangement[];
const ROLES = ["hook", "key", "support", "close"] as const satisfies readonly SlideRole[];

export const cardWordsOutput = z.object({
  slides: z
    .array(
      z.object({
        role: z.enum(ROLES).describe("hook, key, support or close."),
        arrangement: z.enum(ARRANGEMENTS),
        why: z.string().describe("One short line: why this arrangement fits this part of the post."),
        kicker: z.string().optional().describe("Headline arrangement only: the small line above the headline."),
        headline: z.string(),
        accent: z.string().optional().describe("The exact last words of the headline, drawn in the brand colour."),
        items: z.array(z.string()).optional().describe("Steps arrangement only: the numbered items."),
        note: z.string().optional().describe("Steps only: one short note under one item."),
        note_on_item: z.number().int().optional().describe("Steps only: which item the note sits under, counting from 0."),
        sub: z.string().optional().describe("Columns only: the support line under the headline."),
        labels: z.array(z.string()).optional().describe("Columns only: exactly the two things compared."),
        under: z.string().optional().describe("Columns only: the line under the two labels."),
      }),
    )
    .describe("The images, in order."),
});
type RawSlide = z.infer<typeof cardWordsOutput>["slides"][number];

export type CardSlide = { role: SlideRole; arrangement: Arrangement; why: string; words: CardWords; noteOnItem?: number };
export type CardSet = { count: ImageCount; format: CardFormat; slides: CardSlide[] };

const OUTPUT_SCHEMA = jsonSchemaFor(cardWordsOutput);

export function toCardSlide(s: RawSlide): CardSlide {
  const words: CardWords = { headline: s.headline.trim() };
  for (const key of ["kicker", "accent", "note", "sub", "under"] as const) {
    const v = s[key]?.trim();
    if (v) words[key] = v;
  }
  if (s.items?.length) words.items = s.items.map((x) => x.trim());
  if (s.labels?.length) words.labels = s.labels.map((x) => x.trim());
  return { role: s.role, arrangement: s.arrangement, why: s.why.trim(), words, ...(s.note_on_item !== undefined ? { noteOnItem: s.note_on_item } : {}) };
}

/**
 * Every problem with a returned set, named so one retry can fix them all: the
 * count, the roles, each slide's words against the post and the brand rules,
 * and a note pointing at an item that exists.
 */
export function cardSetFailures(input: { post: string; brand: string; count: ImageCount; format: CardFormat; slides: CardSlide[] }): string[] {
  const { post, brand, count, format, slides } = input;
  const failures: string[] = [];
  if (slides.length !== count) failures.push(`There are ${slides.length} images; the set takes exactly ${count}.`);
  const roles = slides.map((s) => s.role);
  if (roles[0] !== "hook") failures.push("The first image must be the hook.");
  if (roles.filter((r) => r === "hook").length > 1) failures.push("Only one image may be the hook.");
  if (count >= 2 && roles.filter((r) => r === "key").length !== 1) failures.push("Exactly one image must be the key point.");
  if (count === 4 && roles[3] !== "close") failures.push("The fourth image must be the close.");
  slides.forEach((s, i) => {
    const label = `Image ${i + 1} (${s.role}, ${s.arrangement})`;
    for (const f of cardWordFailures({ post, words: s.words, arrangement: s.arrangement, format, brand })) failures.push(`${label}: ${f}`);
    if (s.noteOnItem !== undefined) {
      if (s.arrangement !== "steps" || !s.words.note) failures.push(`${label}: a note's item is set without a Steps note.`);
      else if (s.noteOnItem < 0 || s.noteOnItem >= (s.words.items?.length ?? 0)) failures.push(`${label}: the note points at item ${s.noteOnItem}, which is not in the list.`);
    }
    if (s.words.note && s.noteOnItem === undefined) failures.push(`${label}: the note needs note_on_item.`);
  });
  return failures;
}

const CHANNEL_NAME: Record<string, string> = { linkedin: "LinkedIn", facebook: "Facebook", twitter: "X", blog: "Blog", email: "Email" };

type Entry = { id: string; title: string; channel: string; brand_id: string | null; copy_md: string | null };

/**
 * The words for an entry's image set. `count` overrides the channel's default
 * (Regenerate's Layout 4 / 2 / 1); the format follows the count, so a set of
 * more than one is checked under a carousel slide's caps.
 */
export async function writeCardWords(
  entryId: string,
  opts?: { count?: ImageCount },
): Promise<{ ok: true; set: CardSet } | { ok: false; error: string }> {
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const { data, error } = await companyOs.from("marketing_content").select("id, title, channel, brand_id, copy_md").eq("id", entryId).maybeSingle();
    if (error) return { ok: false, error: error.message };
    const entry = data as Entry | null;
    if (!entry) return { ok: false, error: "Entry not found." };
    const post = entry.copy_md?.trim();
    if (!post) return { ok: false, error: "This post has no text yet; draft it before making its images." };
    if (!entry.brand_id) return { ok: false, error: "Set a brand on this post first, so its images take the brand's rules." };
    const profile = await getBrandProfile(entry.brand_id);
    if (!profile) return { ok: false, error: "Brand not found." };

    const count = opts?.count ?? channelImageSet(entry.channel).images;
    const format: CardFormat = count > 1 ? "carousel-slide" : "single";
    const P = CARD_WORDS_PROMPT;
    const otherBrand = Object.hasOwn(OTHER_BRAND, profile.brandSlug) ? OTHER_BRAND[profile.brandSlug].name : "any other brand";
    const system = fillPrompt(P.system, { otherBrand, maxItems: String(format === "single" ? 5 : 8), count: String(count) });
    const user = fillPrompt(P.user, {
      brand: profile.brandName,
      channel: CHANNEL_NAME[entry.channel] ?? entry.channel,
      count: String(count),
      format: format === "single" ? "one image" : "a set, checked as carousel slides",
      title: entry.title,
      post,
    });

    let failures: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const content = attempt === 0 ? user : user + fillPrompt(P.parts.retry, { failures: failures.map((f) => `- ${f}`).join("\n") });
      const response = await llm.messages.create({
        prompt: CARD_WORDS_PROMPT,
        model: MODEL,
        max_tokens: 4000,
        system,
        output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content }],
      });
      const out = readStructuredOutput("card-words", MODEL, response, cardWordsOutput, "The model declined to choose the image words.");
      if (!out.ok) return { ok: false, error: out.error };
      const slides = out.data.slides.map(toCardSlide);
      failures = cardSetFailures({ post, brand: profile.brandSlug, count, format, slides });
      if (!failures.length) return { ok: true, set: { count, format, slides } };
    }
    return { ok: false, error: `The image words still break the rules after one retry: ${failures.slice(0, 3).join(" ")}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[card-words] failed:", msg);
    return { ok: false, error: msg };
  }
}
