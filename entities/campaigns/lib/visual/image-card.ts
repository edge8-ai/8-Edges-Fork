import { z } from "zod/v4";
import { HERO_LAYOUTS } from "./hero-shape";

// What one generated image version records on its row
// (marketing_asset_images.card, a jsonb object), so a version can be shown,
// downloaded and switched back to as one. Two shapes, told apart by `kind`:
//
// - A set (a social post's code-drawn images): the row's own `url` is the
//   first slide, which marketing_content.image_url mirrors when the version is
//   selected; every slide, its words and the carousel PDF live here.
// - A hero (the blog's and the email's code-drawn hero, R3.350): one picture,
//   the row's `url`, and the checked words it was drawn from, so it can be
//   redrawn without asking the model again.
//
// The column is jsonb, so a new shape needs no migration: the parser learns it.

const words = z.object({
  kicker: z.string().optional(),
  headline: z.string(),
  accent: z.string().optional(),
  items: z.array(z.string()).optional(),
  note: z.string().optional(),
  sub: z.string().optional(),
  labels: z.array(z.string()).optional(),
  under: z.string().optional(),
});

const setCardSchema = z.object({
  kind: z.literal("set"),
  brand: z.string(),
  channel: z.string(),
  style: z.string(),
  count: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  format: z.enum(["single", "carousel-slide"]),
  width: z.number(),
  height: z.number(),
  // Where the count came from: the brand's template, the default, or a
  // Regenerate choice on the post.
  chosenAt: z.enum(["brand", "default", "regenerate"]),
  // The logo used: "brand kit" or the uploaded file's path in the bucket.
  logo: z.string(),
  art: z.literal("code"),
  slides: z.array(
    z.object({
      url: z.string(),
      role: z.enum(["hook", "key", "support", "close"]),
      arrangement: z.enum(["headline", "steps", "columns", "single-idea"]),
      why: z.string(),
      words,
      noteOnItem: z.number().int().optional(),
    }),
  ),
  pdfUrl: z.string().nullable(),
});

// The words as visual/hero-shape.ts defines them, checked before they were
// stored (ai/hero-words.ts).
const heroWords = z.object({
  layout: z.enum(HERO_LAYOUTS),
  kicker: z.string().optional(),
  headline: z.string(),
  figures: z.array(z.object({ value: z.string(), label: z.string() })),
  accent: z.number().int().optional(),
  source: z.string().optional(),
});

const heroCardSchema = z.object({
  kind: z.literal("hero"),
  brand: z.string(),
  channel: z.string(),
  width: z.number(),
  height: z.number(),
  // The logo used: "brand kit" or the uploaded file's path in the bucket.
  logo: z.string(),
  art: z.literal("code"),
  words: heroWords,
});

const imageCardSchema = z.discriminatedUnion("kind", [setCardSchema, heroCardSchema]);

export type SetCard = z.infer<typeof setCardSchema>;
export type HeroCard = z.infer<typeof heroCardSchema>;
export type ImageCard = z.infer<typeof imageCardSchema>;

// A stored card, or null for older versions (a single painted image) and for
// anything that is not a card this code wrote.
export function parseImageCard(value: unknown): ImageCard | null {
  const r = imageCardSchema.safeParse(value);
  return r.success ? r.data : null;
}

// A version's slides when it is a set, or null for a hero or a single image.
export function setSlides(card: ImageCard | null | undefined): SetCard["slides"] | null {
  return card?.kind === "set" ? card.slides : null;
}
