import palettes from "./brand-palettes.json";
import { appLogo } from "./brand-kit";
import { HERO_FIGURE_COUNTS, HERO_SIZE, heroFigureNumber, type HeroLayout, type HeroWords } from "./hero-shape";
import { COLLAPSED_SPACE, charEm, kickerEm, unmeasured, type Metric } from "./hero-metrics";
import type { BrandSlug, FontFamily } from "./looks";

// Where every part of a code-drawn hero goes (spec: "The code-drawn hero",
// R3.350): the kicker, the headline, each figure's value, label and bar, the
// source line and the logo, as boxes on the 1200 x 675 picture. The renderer
// (render-hero.ts) draws exactly these boxes and nothing else, so the test of
// this function is where the guarantee lives: no text box reaches the logo
// corner, leaves the picture or enters the blog list's crop bands.
//
// Sizes are the approved prototype's (the R3.350 design canvas). Text is fitted
// by an upper bound on its width (hero-metrics.ts), never by drawing it: a
// line measured here is at least as wide as the one the renderer draws, so the
// renderer's text never takes more lines than the box was made for.
//
// Pure: no file is read here. The logo's pixels come from the brand kit's table,
// or from the caller when the brand has uploaded its own file.

export type HeroBrand = BrandSlug;

export type HeroBox = { left: number; top: number; width: number; height: number };

// A text box: the words as drawn (the kicker in capitals), their font size and
// line height, and how many lines they take at that size in that width.
export type HeroTextBox = HeroBox & {
  text: string;
  size: number;
  lineHeight: number;
  lines: number;
  align: "left" | "right";
};

export type HeroFigureBoxes = {
  value: HeroTextBox;
  label: HeroTextBox;
  // Steps draws each value as a bar standing on the rule; the other layouts
  // draw none.
  bar: HeroBox | null;
  // Row draws a rule over each column; the other layouts draw none.
  rule: HeroBox | null;
  // The figure that takes the brand accent.
  accent: boolean;
};

export type HeroLayoutResult = {
  brand: HeroBrand;
  layout: HeroLayout;
  // False when the words cannot be laid out clean, and then `misfits` says
  // why. The renderer refuses such a layout rather than draw it.
  fits: boolean;
  // Each reason the words do not fit, worded for the model that wrote them so
  // the one retry can fix them: a figure count the layout does not draw, a
  // character the width bound is not measured for, a source line taller than
  // the logo it sits beside, or a headline and figures too tall together.
  misfits: string[];
  kicker: HeroTextBox | null;
  headline: HeroTextBox;
  figures: HeroFigureBoxes[];
  // Lines that belong to no one figure: the rule the steps' bars stand on, and
  // the divider between a pair.
  rules: HeroBox[];
  source: HeroTextBox | null;
  logo: HeroBox;
};

// The logo file's own pixels (an SVG's viewBox), from the brand kit or an upload.
export type HeroLogoSize = { width: number; height: number; mime: "image/png" | "image/svg+xml" };

// Each brand's hero colours and type (the spec's table), from the brand
// palettes, so no colour is new. Both draw on navy with white ink; the accent
// is AI Officer's mint and Edge8's blue. The small line is the kicker.
export type HeroStyle = {
  ground: string;
  ink: string;
  accent: string;
  fonts: { display: FontFamily; body: FontFamily; small: FontFamily; smallWeight: 500 | 700 };
};

const aio = palettes["ai-officer"];
const e8 = palettes.edge8;

export const HERO_STYLES: Record<HeroBrand, HeroStyle> = {
  "ai-officer": {
    ground: aio.navy,
    ink: aio.white,
    accent: aio.mint,
    fonts: { display: "Inter", body: "Geist", small: "JetBrains Mono", smallWeight: 500 },
  },
  edge8: {
    ground: e8.navy,
    ink: e8.white,
    accent: e8.blue,
    fonts: { display: "Manrope", body: "Manrope", small: "Manrope", smallWeight: 700 },
  },
};

const W = HERO_SIZE.width;
const H = HERO_SIZE.height;
// The brand margin: the looks keep 80px on a 1080-wide card, the same share
// of the width here (89px).
const MARGIN = Math.round((W * 80) / 1080);
const CONTENT_W = W - 2 * MARGIN;
// The logo's width as a share of the picture's, as the painted heroes had it.
// A PNG is never drawn wider than its own pixels (brand-kit.ts).
const LOGO_SHARE = 0.22;
// An uploaded logo much taller than the kit's files would push the figures up
// into the headline; no logo is drawn taller than Edge8's wordmark.
const LOGO_MAX_HEIGHT = 96;
// The source line starts this far right of the logo (the prototype's x = 393).
const SOURCE_GAP = 40;
// The figures end this far above the logo's top: the prototype's steps rule at
// y = 490 over AI Officer's logo at y = 537.
const FIGURES_ABOVE_LOGO = 47;
// The least room between the headline's last line and the figures.
const HEAD_GAP = 40;

const KICKER = { top: 80, size: 18, lineHeight: 1.3, tracking: 0.12, headlineBelow: 36 };
// The headline starts at 96 without a kicker, 116 under one. Its size steps
// down until it fits two lines, and further only if the figures, already at
// their smallest, still have no room.
const HEADLINE = { top: 96, lineHeight: 1.08, maxLines: 2, sizes: [60, 56, 52, 48, 44, 40, 36, 32, 28] };
// The figures' sizes, as shares of the prototype's, tried largest first.
const SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6];
const SOURCE = { size: 18, lineHeight: 1.3 };
const BAR = { max: 120, min: 6 };

const PROPORTIONAL: Metric = charEm;
const tracked = (metric: Metric, tracking: number): Metric => (c) => metric(c) + tracking;

const emWidth = (text: string, metric: Metric) => [...text].reduce((sum, c) => sum + metric(c), 0);

// Lines the text takes when wrapped greedily between words, as the renderer
// wraps it. A word wider than the line breaks across lines (the renderer sets
// word-break: break-word), so no word runs out of its box.
function countLines(text: string, size: number, width: number, metric: Metric): number {
  const words = text.split(COLLAPSED_SPACE).filter(Boolean);
  const space = metric(" ") * size;
  let lines = 0;
  let used = 0;
  for (const word of words) {
    const w = emWidth(word, metric) * size;
    if (lines > 0 && used + space + w <= width) {
      used += space + w;
      continue;
    }
    lines += 1;
    used = 0;
    if (w <= width) {
      used = w;
      continue;
    }
    for (const c of word) {
      const cw = metric(c) * size;
      if (used > 0 && used + cw > width) {
        lines += 1;
        used = 0;
      }
      used += cw;
    }
  }
  return lines;
}

function textBox(text: string, at: { left: number; top: number; width: number }, size: number, lineHeight: number, metric: Metric, align: "left" | "right" = "left"): HeroTextBox {
  const lines = countLines(text, size, at.width, metric);
  return { text, ...at, height: lines * size * lineHeight, size, lineHeight, lines, align };
}

// A figure value is drawn on one line: at the layout's size, or smaller when
// the widest value would not fit its column at that size.
function valueSize(values: string[], natural: number, width: number): number {
  const widest = Math.max(0, ...values.map((v) => emWidth(v, PROPORTIONAL)));
  return widest > 0 ? Math.min(natural, width / widest) : natural;
}

function valueBox(text: string, left: number, top: number, width: number, size: number, lineHeight: number): HeroTextBox {
  return { text, left, top, width, height: size * lineHeight, size, lineHeight, lines: 1, align: "left" };
}

// The figures at one scale, standing on `bottom`. `top` is the highest point
// any of them reaches, which must clear the headline.
type Block = { top: number; figures: HeroFigureBoxes[]; rules: HeroBox[] };
type Figures = { value: string; label: string; accent: boolean }[];

function stat(figs: Figures, s: number, bottom: number): Block {
  const f = figs[0] ?? { value: "", label: "", accent: true };
  const v = valueSize([f.value], 200 * s, CONTENT_W);
  const vh = v * 0.9;
  const labelSize = 30 * s;
  const lines = countLines(f.label, labelSize, 760, PROPORTIONAL);
  const top = bottom - (vh + 24 * s + lines * labelSize * 1.3);
  return {
    top,
    rules: [],
    figures: figs.slice(0, 1).map(() => ({
      value: valueBox(f.value, MARGIN, top, CONTENT_W, v, 0.9),
      label: textBox(f.label, { left: MARGIN, top: top + vh + 24 * s, width: 760 }, labelSize, 1.3, PROPORTIONAL),
      bar: null,
      rule: null,
      accent: f.accent,
    })),
  };
}

// Two columns either side of a 2px divider, 48px clear of it on each side.
function pair(figs: Figures, s: number, bottom: number): Block {
  const half = CONTENT_W / 2;
  const inner = half - 48 - 2;
  const lefts = [MARGIN, MARGIN + half + 2 + 48];
  const v = valueSize(figs.map((f) => f.value), 112 * s, inner);
  const vh = v * 0.95;
  const labelSize = 26 * s;
  const labelW = Math.min(420, inner);
  const lines = Math.max(0, ...figs.map((f) => countLines(f.label, labelSize, labelW, PROPORTIONAL)));
  const height = vh + 16 * s + lines * labelSize * 1.3;
  const top = bottom - height;
  return {
    top,
    rules: [{ left: MARGIN + half, top, width: 2, height }],
    figures: figs.map((f, i) => ({
      value: valueBox(f.value, lefts[i], top, inner, v, 0.95),
      label: textBox(f.label, { left: lefts[i], top: top + vh + 16 * s, width: labelW }, labelSize, 1.3, PROPORTIONAL),
      bar: null,
      rule: null,
      accent: f.accent,
    })),
  };
}

function columns(n: number, gap: number) {
  const width = (CONTENT_W - gap * (n - 1)) / n;
  return { width, left: (i: number) => MARGIN + i * (width + gap) };
}

// Two to four columns, each under a 3px rule.
function row(figs: Figures, s: number, bottom: number): Block {
  const col = columns(figs.length, 40);
  const v = valueSize(figs.map((f) => f.value), 72 * s, col.width);
  const labelSize = 22 * s;
  const lines = Math.max(0, ...figs.map((f) => countLines(f.label, labelSize, col.width, PROPORTIONAL)));
  const top = bottom - (3 + 24 * s + v + 12 * s + lines * labelSize * 1.3);
  const valueTop = top + 3 + 24 * s;
  return {
    top,
    rules: [],
    figures: figs.map((f, i) => ({
      value: valueBox(f.value, col.left(i), valueTop, col.width, v, 1),
      label: textBox(f.label, { left: col.left(i), top: valueTop + v + 12 * s, width: col.width }, labelSize, 1.3, PROPORTIONAL),
      bar: null,
      rule: { left: col.left(i), top, width: col.width, height: 3 },
      accent: f.accent,
    })),
  };
}

// A value read as a number, for its bar: "1,250" is 1250 and "40%" is 40, by
// the same parser the words check holds steps values to. A value that does not
// read as one (the check refuses it in steps) stands at the shortest bar.
const amount = (value: string) => heroFigureNumber(value)?.n ?? 0;

// Two to four columns standing on a 2px rule: each value over its label over
// a bar in proportion to the largest value, never shorter than 6px.
function steps(figs: Figures, s: number, bottom: number): Block {
  const col = columns(figs.length, 32);
  const v = valueSize(figs.map((f) => f.value), 52 * s, col.width);
  const labelSize = 22 * s;
  const largest = Math.max(0, ...figs.map((f) => amount(f.value)));
  const figures = figs.map((f, i) => {
    const barH = largest > 0 ? Math.max(BAR.min, Math.round((BAR.max * s * amount(f.value)) / largest)) : BAR.min;
    const barTop = bottom - barH;
    const lines = countLines(f.label, labelSize, col.width, PROPORTIONAL);
    const labelTop = barTop - 16 * s - lines * labelSize * 1.3;
    const valueTop = labelTop - 8 * s - v;
    return {
      value: valueBox(f.value, col.left(i), valueTop, col.width, v, 1),
      label: textBox(f.label, { left: col.left(i), top: labelTop, width: col.width }, labelSize, 1.3, PROPORTIONAL),
      bar: { left: col.left(i), top: barTop, width: col.width, height: barH },
      rule: null,
      accent: f.accent,
    };
  });
  return {
    top: Math.min(bottom, ...figures.map((f) => f.value.top)),
    rules: [{ left: MARGIN, top: bottom, width: CONTENT_W, height: 2 }],
    figures,
  };
}

const BLOCKS: Record<HeroLayout, (figs: Figures, s: number, bottom: number) => Block> = { stat, pair, row, steps };

function logoBox(file: HeroLogoSize): HeroBox {
  let width = Math.round(file.mime === "image/png" ? Math.min(W * LOGO_SHARE, file.width) : W * LOGO_SHARE);
  let height = Math.round((width * file.height) / file.width);
  if (height > LOGO_MAX_HEIGHT) {
    height = LOGO_MAX_HEIGHT;
    width = Math.round((height * file.width) / file.height);
  }
  return { left: MARGIN, top: H - MARGIN - height, width, height };
}

export function heroLayout(words: HeroWords, brand: HeroBrand, logoFile?: HeroLogoSize): HeroLayoutResult {
  const style = HERO_STYLES[brand];
  const file = logoFile ?? appLogo(brand, "dark");
  if (!file) throw new Error(`No logo for a dark ground in the ${brand} brand kit.`);
  const logo = logoBox(file);

  const count = HERO_FIGURE_COUNTS[words.layout];
  const shown = words.figures.slice(0, count.max);
  const accent = words.accent !== undefined && Number.isInteger(words.accent) && words.accent >= 0 && words.accent < shown.length ? words.accent : shown.length - 1;
  const figs: Figures = shown.map((f, i) => ({ value: f.value.trim(), label: f.label.trim(), accent: i === accent }));

  const kickerText = words.kicker?.trim().toUpperCase();
  const kicker = kickerText
    ? textBox(kickerText, { left: MARGIN, top: KICKER.top, width: CONTENT_W }, KICKER.size, KICKER.lineHeight, tracked(kickerEm(style.fonts.small), KICKER.tracking))
    : null;
  const headTop = kicker ? KICKER.top + KICKER.headlineBelow + (kicker.lines - 1) * KICKER.size * KICKER.lineHeight : HEADLINE.top;

  // The source sits right of the logo, centred on it, right-aligned.
  const sourceText = words.source?.trim();
  const sourceLeft = logo.left + logo.width + SOURCE_GAP;
  const sourceLines = sourceText ? textBox(sourceText, { left: sourceLeft, top: 0, width: W - MARGIN - sourceLeft }, SOURCE.size, SOURCE.lineHeight, PROPORTIONAL, "right") : null;
  const source = sourceLines ? { ...sourceLines, top: logo.top + (logo.height - sourceLines.height) / 2 } : null;

  const bottom = logo.top - FIGURES_ABOVE_LOGO;
  const headlineText = words.headline.trim();

  // Why the words cannot be drawn as they are, each worded so the model that
  // wrote them can fix it on its one retry.
  const misfits: string[] = [];
  const n = words.figures.length;
  if (n < count.min || n > count.max) {
    const draws = count.min === count.max ? `${count.min} figure${count.min === 1 ? "" : "s"}` : `${count.min} to ${count.max} figures`;
    misfits.push(`A ${words.layout} hero draws ${draws}; the words have ${n}.`);
  }
  const lines: [string, string | undefined][] = [
    // The kicker as drawn, in capitals.
    ["kicker", kickerText],
    ["headline", headlineText],
    ...figs.flatMap((f, i): [string, string][] => [[`figure ${i + 1} value`, f.value], [`figure ${i + 1} label`, f.label]]),
    ["source", sourceText],
  ];
  for (const [name, text] of lines) {
    const c = text ? unmeasured(text) : undefined;
    if (c) misfits.push(`The ${name} has a character the hero cannot measure ("${c}"); use plain letters, numbers and punctuation.`);
  }
  if (source && source.height > logo.height) {
    const room = Math.floor(logo.height / (SOURCE.size * SOURCE.lineHeight));
    const takes = `${source.lines} line${source.lines === 1 ? "" : "s"}`;
    misfits.push(
      room > 0
        ? `The source line takes ${takes} beside this brand's logo, which has room for ${room}; shorten it or leave it out.`
        : `This brand's logo is too short for a source line beside it; leave the source out.`,
    );
  }
  const result = (headline: HeroTextBox, block: Block, extra: string[] = []): HeroLayoutResult => {
    const all = [...misfits, ...extra];
    return { brand, layout: words.layout, fits: all.length === 0, misfits: all, kicker, headline, figures: block.figures, rules: block.rules, source, logo };
  };

  const headlineAt = (size: number) => textBox(headlineText, { left: MARGIN, top: headTop, width: CONTENT_W }, size, HEADLINE.lineHeight, PROPORTIONAL);
  for (const size of HEADLINE.sizes) {
    const headline = headlineAt(size);
    if (headline.lines > HEADLINE.maxLines) continue;
    for (const s of SCALES) {
      const block = BLOCKS[words.layout](figs, s, bottom);
      if (headline.top + headline.height + HEAD_GAP <= block.top) return result(headline, block);
    }
  }
  // Nothing fits: the smallest of everything, marked as not fitting.
  return result(headlineAt(HEADLINE.sizes.at(-1)!), BLOCKS[words.layout](figs, SCALES.at(-1)!, bottom), [
    "The headline and the figures do not fit the picture together; shorten the headline or the figure labels.",
  ]);
}
