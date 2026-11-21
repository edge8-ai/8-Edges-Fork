import palettes from "./brand-palettes.json";
import type { SlideRole } from "./slide-roles";
import type { AssetFile } from "./asset-files";
import type { StyleKey } from "./brand-kit";

// A look is the brand frame every image sits in: the ground, the ink, the one
// accent, where the logo goes and where the words go. Plan: "Campaign images
// that follow the visual direction skill", D2 (per brand: looks, palette,
// fonts and logo). The brand is never chosen here; it comes from the post's
// brand_id, and the look (the brand kit's style key) from the post, the
// brand's channel template or Signature, in that order.
//
// The table is keyed by brand and look, so what a brand has built is exactly
// what is drawn here (brand-kit.ts builtStyles reads it). Edge8 has all three:
// Signature, Editorial and Campaign set (the anatomy in
// docs/marketing/visual-direction.md). The Institute has Signature, drawn in
// straight lines only, as Marketing's skill says (Marketing, 19 Nov); its
// Editorial and Campaign set wait on the decision about diagonals.
//
// Colours live in brand-palettes.json: the design-token gate allows raw colours
// only in tokens.css and JSON palettes, and these are the social brand kit's
// values (navy 04102D, blue 287BE8), not the website's.

export type BrandSlug = keyof typeof palettes;

// Where a look puts the parts every card has: the logo (on every image, or
// only on the cover, the first image of a set), the counter (and whether it
// reads "02 / 04" or the slide number alone), and the short accent rule
// (Signature's bar bottom-left, Editorial's rule above the headline, or none).
export type Anatomy = {
  logo: { at: "top-left" | "top-right" | "bottom-left"; on: "every" | "cover" };
  counter: { at: "top-left" | "top-right"; form: "of" | "number"; colour: "faint" | "accent" };
  rule: "bar" | "above-headline" | "none";
};

export type Look = {
  brand: BrandSlug;
  style: StyleKey;
  name: string;
  anatomy: Anatomy;
  ground: string;
  ink: string;
  accent: string;
  textDim: string;
  textFaint: string;
  rail: string;
  outline: string;
  // Text on a filled accent shape (a step number, a filled circle's label).
  onAccent: string;
  // Which ground the look sits on, so the brand kit's logo for that ground is
  // used (visual/brand-kit.ts).
  groundKind: "dark" | "light";
  // The logo file for this ground, at its native pixels, and the width it is
  // drawn at on a 1080-wide canvas. A PNG is never drawn wider than its file.
  logo: { file: AssetFile; width: number; height: number; drawWidth: number };
  // Font families: the headline, the running lines, and labels and counters.
  fonts: { display: FontFamily; body: FontFamily; mono: FontFamily };
  // An accent per slide role, where the brand's colour carries meaning (the
  // Institute: magenta for the problem, blue for the method, dark mint for the
  // answer). Roles not named take `accent`.
  accentFor?: Partial<Record<SlideRole, string>>;
  // Side margin, and the top of the text zone, on a 1080-wide canvas.
  margin: number;
  textTop: number;
  bar: { width: number; height: number; bottom: number };
};

export type FontFamily = "Manrope" | "Inter" | "Geist" | "JetBrains Mono";

// The TTFs in public/fonts the renderer loads for each family (next/og reads
// TTF, not WOFF2). Each ships with its OFL licence beside it.
export const FONT_FILES: Record<FontFamily, { weight: 500 | 700 | 800; file: AssetFile }[]> = {
  Manrope: [
    { weight: 500, file: "public/fonts/manrope-og-500.ttf" },
    { weight: 700, file: "public/fonts/manrope-og-700.ttf" },
    { weight: 800, file: "public/fonts/manrope-og-800.ttf" },
  ],
  Inter: [
    { weight: 700, file: "public/fonts/inter-og-700.ttf" },
    { weight: 800, file: "public/fonts/inter-og-800.ttf" },
  ],
  Geist: [{ weight: 500, file: "public/fonts/geist-og-500.ttf" }],
  "JetBrains Mono": [{ weight: 500, file: "public/fonts/jetbrains-mono-og-500.ttf" }],
};

const e8 = palettes.edge8;
const aio = palettes["ai-officer"];

// Signature's anatomy, for both brands: the logo top-left on every image, the
// counter top-right, the bar bottom-left.
const SIGNATURE: Anatomy = {
  logo: { at: "top-left", on: "every" },
  counter: { at: "top-right", form: "of", colour: "faint" },
  rule: "bar",
};

// Edge8's frame, the same in every one of its looks: navy ground, white ink,
// the blue accent, the white wordmark, Manrope throughout.
const EDGE8_FRAME = {
  brand: "edge8",
  ground: e8.navy,
  ink: e8.white,
  accent: e8.blue,
  textDim: e8.textDim,
  textFaint: e8.textFaint,
  rail: e8.rail,
  outline: e8.outline,
  onAccent: e8.white,
  groundKind: "dark",
  logo: { file: "public/logo-white.png", width: 196, height: 96, drawWidth: 150 },
  fonts: { display: "Manrope", body: "Manrope", mono: "Manrope" },
  margin: 80,
  bar: { width: 96, height: 7, bottom: 96 },
} as const satisfies Partial<Look>;

export const LOOKS: Partial<Record<BrandSlug, Partial<Record<StyleKey, Look>>>> = {
  edge8: {
    signature: {
      ...EDGE8_FRAME,
      style: "signature",
      name: "Signature",
      anatomy: SIGNATURE,
      textTop: 230,
    },
    // Editorial (Marketing's Sample 1): the slide number top-left, the logo
    // top-right on the cover only, a short blue rule above the headline (the
    // bar's size), and the brand art crossed by a blue diagonal. The words
    // start a little lower than Signature's to give the rule its own line.
    editorial: {
      ...EDGE8_FRAME,
      style: "editorial",
      name: "Editorial",
      anatomy: {
        logo: { at: "top-right", on: "cover" },
        counter: { at: "top-left", form: "number", colour: "faint" },
        rule: "above-headline",
      },
      textTop: 260,
    },
    // Campaign set (Marketing's Sample 2): the counter top-left in blue, the
    // logo bottom-left on every image and a corner wedge bottom-right, so a
    // campaign's posts read as one set. No bar: the logo holds that corner.
    "campaign-set": {
      ...EDGE8_FRAME,
      style: "campaign-set",
      name: "Campaign set",
      anatomy: {
        logo: { at: "bottom-left", on: "every" },
        counter: { at: "top-left", form: "of", colour: "accent" },
        rule: "none",
      },
      textTop: 230,
    },
  },
  // The Institute's Signature: white ground, navy ink, Inter headlines, Geist
  // running lines, JetBrains Mono counters, the navy logo, and the accent by
  // meaning. Gridded and stepped, never diagonal (the skill's cover-the-logo
  // test keeps the two brands apart without their logos).
  "ai-officer": {
    signature: {
      brand: "ai-officer",
      style: "signature",
      name: "Signature",
      anatomy: SIGNATURE,
      ground: aio.white,
      ink: aio.navy,
      accent: aio.blue,
      textDim: aio.ink2,
      textFaint: aio.muted,
      rail: aio.line,
      outline: aio.ink2,
      onAccent: aio.white,
      groundKind: "light",
      logo: { file: "public/brands/ai-officer/logo-on-light.svg", width: 557.24, height: 103.69, drawWidth: 300 },
      fonts: { display: "Inter", body: "Geist", mono: "JetBrains Mono" },
      accentFor: { hook: aio.magenta, key: aio.blue, support: aio.blue, close: aio.mintDark },
      margin: 80,
      textTop: 230,
      bar: { width: 96, height: 7, bottom: 96 },
    },
  },
};

// The accent a slide with this role takes in this look.
export function accentFor(look: Look, role: SlideRole | null | undefined): string {
  return (role && look.accentFor?.[role]) || look.accent;
}

// The brand's look for a style, or null where the brand has not got it.
export function lookFor(brand: string | null | undefined, style: StyleKey = "signature"): Look | null {
  if (!brand || !Object.hasOwn(LOOKS, brand)) return null;
  const looks = LOOKS[brand as BrandSlug] ?? {};
  return Object.hasOwn(looks, style) ? (looks[style] ?? null) : null;
}

// What the counter reads on image i (from 0) of n in this look: "02 / 04", or
// "02" where the look numbers its slides. Nothing on a single image, which has
// no set to count.
export function counterFor(look: Look, i: number, n: number): string | null {
  if (n <= 1) return null;
  const pad = (k: number) => String(k).padStart(2, "0");
  return look.anatomy.counter.form === "number" ? pad(i + 1) : `${pad(i + 1)} / ${pad(n)}`;
}
