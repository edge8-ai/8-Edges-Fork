import type { FontFamily } from "./looks";

// How wide a code-drawn hero's text can draw (spec: "The code-drawn hero",
// R3.350). The hero layout (hero-layout.ts) fits text by an upper bound on each
// character's width, in ems, never by drawing it, so a line it measures is at
// least as wide as the one the renderer draws.
//
// The bound holds over every font file a hero loads (Inter, Geist, JetBrains
// Mono and Manrope, at the weights in looks.ts), so it holds whichever of them
// ends up drawing a character. hero-glyph-widths.test.ts reads the TTFs in
// public/fonts and proves it for every character in HERO_MEASURED_RANGES.
// Kerning is not counted.
//
// Pure: no file is read here.

export type Metric = (c: string) => number;

// The characters the bound is measured for: printable ASCII, Latin-1 and the
// Latin Extended letters, general punctuation and the currency signs. Words
// with any other character (an emoji, another script) do not fit, because
// nothing proves how wide they draw.
export const HERO_MEASURED_RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0x24f],
  [0x2000, 0x206f],
  [0x20a0, 0x20cf],
];

// Whitespace the renderer collapses into one space between words. Any other
// space (a no-break space, an em space) is drawn as a character and measured
// as one.
export const COLLAPSED_SPACE = /[ \t\n\r\f]+/;

const NARROW = new Set([..."iljI"]);
const STOPS = new Set([...".,:;'!|‘’·"]);
const SLIM = new Set([..."ft()[]/"]);
const DASHES = new Set([..."-–"]);
const WIDE_LOWER = new Set([..."mw"]);
const WIDEST = new Set([..."MW%"]);
const MONEY = new Set([..."$&€£"]);

/** The bound on one character's width, in ems, for the hero's proportional text. */
export function charEm(c: string): number {
  if (c === " ") return 0.25;
  if (NARROW.has(c)) return 0.31;
  if (STOPS.has(c)) return 0.39;
  // Geist's slash is the widest of these, at 0.494em.
  if (SLIM.has(c)) return 0.5;
  if (DASHES.has(c)) return 0.6;
  if (WIDE_LOWER.has(c)) return 0.93;
  if (WIDEST.has(c)) return 1.06;
  if (MONEY.has(c)) return 0.75;
  if (c >= "0" && c <= "9") return 0.7;
  if (c >= "a" && c <= "z") return 0.64;
  if (c >= "A" && c <= "Z") return 0.79;
  // Every other ASCII and Latin-1 character: Inter's W, at 1.059em, is the
  // widest of them.
  if (c.codePointAt(0)! <= 0xff) return 1.06;
  // The rest of the measured ranges: digraphs such as Ǳ, the per-ten-thousand
  // sign (Inter's ‱, at 1.794em) and the wide currency signs.
  return 1.8;
}

/**
 * The kicker's bound. JetBrains Mono draws every character it has at 0.6em,
 * curly quotes included, and a character it lacks is drawn by another loaded
 * font, so past Latin-1 it takes the larger of the two.
 */
export function kickerEm(family: FontFamily): Metric {
  if (family !== "JetBrains Mono") return charEm;
  return (c) => (c.codePointAt(0)! <= 0xff ? 0.6 : Math.max(0.6, charEm(c)));
}

/** The first character of the text the bound is not measured for, if any. */
export function unmeasured(text: string): string | undefined {
  return [...text].find((c) => {
    if (COLLAPSED_SPACE.test(c)) return false;
    const cp = c.codePointAt(0)!;
    return !HERO_MEASURED_RANGES.some(([from, to]) => cp >= from && cp <= to);
  });
}
