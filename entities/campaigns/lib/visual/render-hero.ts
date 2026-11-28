import { createElement as h, type ReactElement } from "react";
import { ImageResponse } from "next/og";
import { FONT_FILES, type FontFamily } from "./looks";
import { readAsset } from "./asset-files";
import { appLogo } from "./brand-kit";
import { HERO_STYLES, heroLayout, type HeroBox, type HeroBrand, type HeroTextBox } from "./hero-layout";
import { HERO_SIZE, type HeroLayout, type HeroWords } from "./hero-shape";
import type { CardInput } from "./render-card";

// Draws a code-drawn hero (spec: "The code-drawn hero", R3.350): the blog hero
// and the email banner, one 1200 x 675 picture. heroLayout places every box;
// this draws exactly those boxes in the brand's hero colours and type, and the
// brand's logo file inside the same render, in a corner no layout writes into.
//
// Written with createElement in a .ts file, like render-card.ts: a renderer
// that paints pixels sets its colours inline. Every colour is the brand
// palette's ground, ink or accent; the dimmer lines are the ink at an opacity,
// so no colour is new (check:tokens).

// A logo file as the renderers take it: the original bytes and their pixels.
type LogoImage = NonNullable<CardInput["logo"]>;

export type HeroInput = {
  words: HeroWords;
  brand: HeroBrand;
  // The brand's logo for a dark ground: an upload, or (without one) the brand
  // kit's file.
  logo?: LogoImage | null;
};

// How strongly each layout's labels are drawn, as the ink's opacity (the
// prototype's): the stat's one label reads nearly as ink, the many labels of a
// row or steps step back.
const LABEL_OPACITY: Record<HeroLayout, number> = { stat: 0.85, pair: 0.78, row: 0.72, steps: 0.72 };
const SOURCE_OPACITY = 0.72;
// A bar that is not the accent, and the rules.
const BAR_OPACITY = 0.16;
const RULE_OPACITY = 0.24;
const KICKER_TRACKING = 0.12;

async function loadFonts(families: FontFamily[]) {
  return Promise.all([...new Set(families)].flatMap((name) => FONT_FILES[name].map(async ({ weight, file }) => ({
    name,
    data: await readAsset(file),
    weight,
    style: "normal" as const,
  }))));
}

async function kitLogo(brand: HeroBrand): Promise<LogoImage> {
  const kit = appLogo(brand, "dark");
  if (!kit) throw new Error(`No logo for a dark ground in the ${brand} brand kit.`);
  return { data: await readAsset(kit.file), mime: kit.mime, width: kit.width, height: kit.height };
}

const at = (box: HeroBox) => ({ position: "absolute" as const, left: box.left, top: box.top, width: box.width });

// One text box: its words wrap inside its width and break a word only when it
// is wider than the line, as heroLayout measured them.
function text(key: string, box: HeroTextBox, style: Record<string, unknown>): ReactElement {
  return h("div", {
    key,
    style: {
      ...at(box),
      display: "flex",
      justifyContent: box.align === "right" ? "flex-end" : "flex-start",
      textAlign: box.align,
      fontSize: box.size,
      lineHeight: box.lineHeight,
      wordBreak: "break-word",
      ...style,
    },
  }, box.text);
}

// next/og reads every style value as text, so a rule with no radius leaves the
// property out rather than passing it undefined, which it cannot draw.
const fill = (key: string, box: HeroBox, colour: string, opacity = 1, radius?: string): ReactElement =>
  h("div", { key, style: { ...at(box), display: "flex", height: box.height, background: colour, opacity, ...(radius ? { borderRadius: radius } : {}) } });

export async function renderHero(input: HeroInput): Promise<Buffer> {
  const { words, brand } = input;
  const style = HERO_STYLES[brand];
  const logo = input.logo ?? (await kitLogo(brand));
  const layout = heroLayout(words, brand, logo);
  if (!layout.fits) throw new Error(`The hero's words do not fit the picture: ${layout.misfits.join(" ")}`);

  const { display, body, small, smallWeight } = style.fonts;
  // The stat and the pair draw their large values a little tighter, as the
  // prototype does.
  const valueTracking = words.layout === "stat" || words.layout === "pair" ? -0.02 : 0;
  const parts: ReactElement[] = [];

  if (layout.kicker) {
    parts.push(text("kicker", layout.kicker, { fontFamily: small, fontWeight: smallWeight, letterSpacing: layout.kicker.size * KICKER_TRACKING, color: style.accent }));
  }
  parts.push(text("headline", layout.headline, { fontFamily: display, fontWeight: 800, letterSpacing: -layout.headline.size * 0.01, color: style.ink }));

  layout.rules.forEach((rule, i) => parts.push(fill(`rule-${i}`, rule, style.ink, RULE_OPACITY)));
  layout.figures.forEach((f, i) => {
    if (f.rule) parts.push(fill(`col-rule-${i}`, f.rule, f.accent ? style.accent : style.ink, f.accent ? 1 : RULE_OPACITY));
    if (f.bar) parts.push(fill(`bar-${i}`, f.bar, f.accent ? style.accent : style.ink, f.accent ? 1 : BAR_OPACITY, "3px 3px 0 0"));
    parts.push(text(`value-${i}`, f.value, {
      fontFamily: display,
      fontWeight: 800,
      whiteSpace: "nowrap",
      letterSpacing: f.value.size * valueTracking,
      color: f.accent ? style.accent : style.ink,
    }));
    parts.push(text(`label-${i}`, f.label, { fontFamily: body, fontWeight: 500, color: style.ink, opacity: LABEL_OPACITY[words.layout] }));
  });

  if (layout.source) {
    parts.push(text("source", layout.source, { fontFamily: body, fontWeight: 500, color: style.ink, opacity: SOURCE_OPACITY }));
  }

  // The logo file unchanged, at the box heroLayout kept clear for it.
  const src = `data:${logo.mime};base64,${logo.data.toString("base64")}`;
  parts.push(h("img", { key: "logo", src, width: layout.logo.width, height: layout.logo.height, style: { position: "absolute", left: layout.logo.left, top: layout.logo.top, width: layout.logo.width, height: layout.logo.height } }));

  const picture = h("div", {
    style: { position: "relative", display: "flex", width: HERO_SIZE.width, height: HERO_SIZE.height, background: style.ground, fontFamily: body, color: style.ink },
  }, ...parts);

  const res = new ImageResponse(picture, { width: HERO_SIZE.width, height: HERO_SIZE.height, fonts: await loadFonts([display, body, small]) });
  return Buffer.from(await res.arrayBuffer());
}
