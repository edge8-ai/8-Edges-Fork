import { brandNameError, emDashError } from "@/entities/campaigns/lib/writer/checks";
import { OTHER_BRAND } from "./cross-brand";

// The words an image carries, checked before anything is drawn. Plan: "Campaign
// images that follow the visual direction skill", D3 step 3. Every line must be
// the post's own words, the house rules hold (no em dash, "Edge8" cased right),
// one brand never names the other unless the wording is approved, and the
// lengths fit the arrangement. A failure names every problem, so the writer's
// one retry can fix them all.

export type Arrangement = "headline" | "steps" | "columns" | "single-idea";
export type CardFormat = "single" | "carousel-slide";

export type CardWords = {
  // Small line above the headline (Headline arrangement).
  kicker?: string;
  headline: string;
  // The end of the headline drawn in the accent colour.
  accent?: string;
  // Numbered items (Steps) and the note under one of them.
  items?: string[];
  note?: string;
  // Support line, the two column labels and the line under them (Columns).
  sub?: string;
  labels?: string[];
  under?: string;
};

const CAPS = {
  headline: { headline: 8, steps: 10, columns: 8, "single-idea": 8 } satisfies Record<Arrangement, number>,
  kicker: 12,
  item: 12,
  items: { single: 5, "carousel-slide": 8 } satisfies Record<CardFormat, number>,
};

// How a line is compared with the post: spacing collapsed, trailing
// punctuation dropped, case ignored. The hero words (../ai/hero-words.ts) find
// their figure values in the post the same way.
export const normLine = (s: string) => s.replace(/\s+/g, " ").trim().replace(/[.,:;!?]+$/, "").toLowerCase();
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * The house rules every drawn line keeps, wherever its words come from: no em
 * dash, brand names cased right, and the other brand never named unless the
 * wording is approved. `key` names the line in each failure.
 */
export function brandLineFailures(input: { key: string; text: string; brand: string; approvedCrossBrand?: string[] }): string[] {
  const { key, text, brand } = input;
  const failures: string[] = [];
  // hasOwn, so a slug such as "constructor" reads as no family rather than as
  // Object's own property.
  const other = Object.hasOwn(OTHER_BRAND, brand) ? OTHER_BRAND[brand] : undefined;
  const approved = (input.approvedCrossBrand ?? []).map(normLine);
  const dash = emDashError(text);
  if (dash) failures.push(`The ${key}: ${dash}`);
  const casing = brandNameError(text);
  if (casing) failures.push(`The ${key}: ${casing}`);
  if (other?.re.test(text) && !approved.some((a) => normLine(text).includes(a))) {
    failures.push(`The ${key} names ${other.name}; this brand's images never do unless the wording is approved.`);
  }
  return failures;
}

function lines(w: CardWords): [string, string][] {
  const out: [string, string][] = [];
  for (const key of ["kicker", "headline", "accent", "note", "sub", "under"] as const) {
    const v = w[key];
    if (v?.trim()) out.push([key, v]);
  }
  w.items?.forEach((v, i) => out.push([`item ${i + 1}`, v]));
  w.labels?.forEach((v, i) => out.push([`label ${i + 1}`, v]));
  return out;
}

export function cardWordFailures(input: {
  post: string;
  words: CardWords;
  arrangement: Arrangement;
  format: CardFormat;
  brand: string;
  // Exact wordings the brand has approved for naming the other brand.
  approvedCrossBrand?: string[];
}): string[] {
  const { words: w, arrangement, format, brand } = input;
  const post = ` ${normLine(input.post)} `;
  const failures: string[] = [];

  for (const [key, text] of lines(w)) {
    if (!post.includes(normLine(text))) failures.push(`The ${key} "${text}" is not in the post. Use the post's own words.`);
    failures.push(...brandLineFailures({ key, text, brand, approvedCrossBrand: input.approvedCrossBrand }));
  }

  const headlineCap = CAPS.headline[arrangement];
  if (words(w.headline) > headlineCap) failures.push(`The headline is ${words(w.headline)} words; on a ${arrangement} card it takes ${headlineCap} at most.`);
  if (w.accent && !normLine(w.headline).endsWith(normLine(w.accent))) failures.push(`The accent "${w.accent}" is not the end of the headline.`);
  if (w.kicker && words(w.kicker) > CAPS.kicker) failures.push(`The kicker is ${words(w.kicker)} words; it takes ${CAPS.kicker} at most.`);

  if (arrangement === "steps") {
    const items = w.items ?? [];
    const cap = CAPS.items[format];
    if (items.length < 3) failures.push(`Steps needs 3 items or more; there are ${items.length}.`);
    if (items.length > cap) failures.push(`There are ${items.length} items; ${format === "single" ? "a single image" : "a carousel slide"} takes ${cap} at most.`);
    items.forEach((it, i) => {
      if (words(it) > CAPS.item) failures.push(`Item ${i + 1} is ${words(it)} words; an item takes ${CAPS.item} at most.`);
    });
  }
  if (arrangement === "columns" && (w.labels?.length ?? 0) !== 2) failures.push("Columns needs exactly two labels.");

  return failures;
}
