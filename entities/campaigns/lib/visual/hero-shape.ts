// The words a code-drawn hero is drawn from (spec: "The code-drawn hero",
// R3.350), shared by the two halves that meet here: the model call that
// writes them (../ai/hero-words.ts) and the layout that draws them
// (./hero-layout.ts). Neither half imports the other, so this one plain module
// holds the shape and the caps both rely on.
//
// The caps are what the layout is proven to fit: the layout test draws the
// longest words these caps allow in every layout, for both brands, and checks
// no text box reaches the logo corner. Raising a cap means that test must still
// pass at the new length.
//
// Pure, with no imports, so the browser and plain node can read it too.

export const HERO_LAYOUTS = ["stat", "pair", "row", "steps"] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

export type HeroFigure = { value: string; label: string };

export type HeroWords = {
  layout: HeroLayout;
  // The small line above the headline, where an event or a source of the
  // numbers is named. Never a caption at the bottom: that corner is the logo's.
  kicker?: string;
  headline: string;
  figures: HeroFigure[];
  // Which figure takes the brand accent, counting from 0; the last when unset.
  accent?: number;
  // The line bottom-right, beside the logo.
  source?: string;
};

// The picture's pixels: the blog hero and the email banner are one drawing.
export const HERO_SIZE = { width: 1200, height: 675 } as const;

// Characters, not words: the layout fits text by its length on the line.
export const HERO_CAPS = {
  kicker: 48,
  headline: 48,
  value: 8,
  label: 32,
  source: 64,
} as const;

// A value the steps layout can draw as a bar: a plain number with an optional
// currency sign in front and an optional percent sign behind. The sign and the
// percent are its unit, which every bar in one picture must share. The words
// check (../ai/hero-words.ts) holds steps values to it and the layout sizes the
// bars by it, so the two read a value the same way.
const NUMBER = /^([$€£]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%?)$/;

/** A figure value as a number and its unit, or null when it does not read as one. */
export function heroFigureNumber(value: string): { n: number; unit: string } | null {
  const m = NUMBER.exec(value.trim());
  if (!m) return null;
  return { n: Number(`${m[2].replace(/,/g, "")}${m[3] ?? ""}`), unit: `${m[1]}|${m[4]}` };
}

// How many figures each layout draws. Stat is one large figure, pair two side
// by side, row and steps two to four; steps draws its values as bars, so they
// must share a unit.
export const HERO_FIGURE_COUNTS: Record<HeroLayout, { min: number; max: number }> = {
  stat: { min: 1, max: 1 },
  pair: { min: 2, max: 2 },
  row: { min: 2, max: 4 },
  steps: { min: 2, max: 4 },
};
