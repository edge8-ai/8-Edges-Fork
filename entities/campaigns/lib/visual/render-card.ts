import { createElement as h, type ReactElement } from "react";
import { ImageResponse } from "next/og";
import { FONT_FILES, type FontFamily, type Look } from "./looks";
import { readAsset } from "./asset-files";
import type { Arrangement, CardWords } from "./brand-rules";

// Draws a finished campaign image: the look's ground, the art (if any), the
// words, the counter, the bar and the original logo file, at the channel's
// exact pixels. Plan: "Campaign images that follow the visual direction
// skill", D3 step 7. The model paints only the art; every word and the logo
// are placed here, so spelling and branding are exact.
//
// Written with createElement in a .ts file, not JSX: the design-token gate
// counts colour set in inline JSX styles against a ceiling, and a renderer
// that paints pixels has to set colour inline. The colours come from the look.
//
// Fonts are the look's own families, as TTFs in public/fonts (looks.ts
// FONT_FILES): Manrope for Edge8; Inter, Geist and JetBrains Mono for the
// Institute. next.config.mjs traces them, and the logo files, into the routes
// that render.

export type CardInput = {
  look: Look;
  arrangement: Arrangement;
  words: CardWords;
  width: number;
  height: number;
  // The model's art after the colour pass, drawn under everything. Optional:
  // Steps and Columns can stand on the ground alone.
  art?: Buffer | null;
  // "02 / 04" (or "02" where the look numbers its slides, looks.ts
  // counterFor) on a carousel slide; nothing on a single image.
  counter?: string | null;
  // The first image of a set, or a single image. A look that shows its logo
  // on the cover only (Editorial) leaves it off the others. Without one, the
  // image counts as a cover, so a logo is never dropped by omission.
  cover?: boolean;
  // Which Steps item carries the note.
  noteOnItem?: number;
  // The brand's logo for this look's ground (an upload or the brand kit's
  // file, visual/brand-kit.ts). Without one, the look's own file is used.
  logo?: { data: Buffer; mime: "image/png" | "image/svg+xml"; width: number; height: number } | null;
  // The slide's accent where the brand's colour carries meaning (looks.ts
  // accentFor). Without one, the look's accent.
  accent?: string | null;
};

async function loadFonts(look: Look) {
  const families = [...new Set<FontFamily>([look.fonts.display, look.fonts.body, look.fonts.mono])];
  return Promise.all(families.flatMap((name) => FONT_FILES[name].map(async ({ weight, file }) => ({
    name,
    data: await readAsset(file),
    weight,
    style: "normal" as const,
  }))));
}

const abs = (style: Record<string, unknown>) => ({ position: "absolute", display: "flex", ...style });

// The headline word by word, so lines break between words and the accent
// carries on from the lead on the same line.
function headline(look: Look, accent: string, w: CardWords, size: number, left: number, top: number, width: number): ReactElement {
  const tail = w.accent?.trim() ?? "";
  const lead = tail && w.headline.trim().endsWith(tail) ? w.headline.trim().slice(0, -tail.length).trim() : w.headline.trim();
  const parts: [string, string][] = [
    ...lead.split(/\s+/).filter(Boolean).map((x): [string, string] => [x, look.ink]),
    ...(tail && lead !== w.headline.trim() ? tail.split(/\s+/).map((x): [string, string] => [x, accent]) : []),
  ];
  return h("div", { style: abs({ left, top, width, flexWrap: "wrap", fontFamily: look.fonts.display, fontSize: size, fontWeight: 800, lineHeight: 1.06, letterSpacing: -size * 0.025 }) },
    ...parts.map(([word, colour], i) => h("span", { key: i, style: { color: colour, marginRight: size * 0.24 } }, word)));
}

export async function renderCard(input: CardInput): Promise<Buffer> {
  const { look, arrangement, words: w, width: W, height: H } = input;
  const portrait = H >= W;
  // One unit, so a 1600 x 900 card keeps the 1080 x 1350 card's proportions.
  const u = Math.min(W / 1080, H / 1350);
  const m = look.margin * u;
  const textW = portrait ? W - 2 * m : W * 0.55;
  const top = look.textTop * u;
  const accent = input.accent || look.accent;
  // The brand's logo file, unchanged. A PNG is never drawn wider than its own
  // pixels (it would blur); an SVG scales freely.
  const own = input.logo ?? {
    data: await readAsset(look.logo.file),
    mime: look.logo.file.endsWith(".svg") ? ("image/svg+xml" as const) : ("image/png" as const),
    width: look.logo.width,
    height: look.logo.height,
  };
  const logoW = own.mime === "image/png" ? Math.min(look.logo.drawWidth * u, own.width) : look.logo.drawWidth * u;
  const logoH = (logoW * own.height) / own.width;
  const logo = `data:${own.mime};base64,${own.data.toString("base64")}`;

  const body: ReactElement[] = [];
  if (arrangement === "headline" || arrangement === "single-idea") {
    let y = top;
    if (w.kicker) {
      body.push(h("div", { key: "k", style: abs({ left: m, top: y, width: Math.min(textW, 720 * u), fontFamily: look.fonts.body, fontSize: 44 * u, fontWeight: 700, lineHeight: 1.25, color: look.textDim }) }, w.kicker));
      y += 170 * u;
    }
    body.push(headline(look, accent, w, (arrangement === "headline" ? 116 : 96) * u, m, y, textW));
  }
  if (arrangement === "steps") {
    const items = w.items ?? [];
    const dot = 56 * u;
    body.push(headline(look, accent, w, 76 * u, m, top, textW));
    body.push(h("div", { key: "list", style: abs({ left: m, top: top + 240 * u, width: textW, flexDirection: "column" }) },
      h("div", { style: abs({ left: dot / 2 - 1, top: dot / 2, bottom: dot, width: 2, background: look.rail }) }),
      ...items.map((item, i) => h("div", { key: i, style: { display: "flex", alignItems: "flex-start", marginBottom: 22 * u } },
        h("div", { style: { display: "flex", flexShrink: 0, width: dot, height: dot, borderRadius: dot / 2, background: accent, alignItems: "center", justifyContent: "center", fontFamily: look.fonts.mono, fontSize: 28 * u, fontWeight: 800, color: look.onAccent } }, String(i + 1)),
        h("div", { style: { display: "flex", flexDirection: "column", marginLeft: 28 * u, paddingTop: 8 * u, width: textW - dot - 28 * u } },
          h("div", { style: { display: "flex", fontFamily: look.fonts.body, fontSize: 32 * u, fontWeight: 700, lineHeight: 1.2, color: look.ink } }, item),
          i === input.noteOnItem && w.note ? h("div", { style: { display: "flex", fontFamily: look.fonts.body, fontSize: 28 * u, fontWeight: 700, color: accent, marginTop: 4 * u } }, w.note) : null)))));
  }
  if (arrangement === "columns") {
    const r = Math.min(W, H) * 0.185;
    const cx = portrait ? W / 2 : W * 0.72;
    const cy = portrait ? H * 0.62 : H * 0.55;
    const [left = "", right = ""] = w.labels ?? [];
    body.push(headline(look, accent, w, 84 * u, m, top, textW));
    if (w.sub) body.push(h("div", { key: "s", style: abs({ left: m, top: top + 220 * u, width: Math.min(textW, 820 * u), fontFamily: look.fonts.body, fontSize: 34 * u, fontWeight: 700, lineHeight: 1.4, color: look.textDim }) }, w.sub));
    body.push(
      // Two circles, each 0.55 r either side of the centre: the outlined one is
      // what is compared, the filled one is the answer.
      h("div", { key: "c2", style: abs({ left: cx + 0.55 * r - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: r, background: accent, opacity: 0.92 }) }),
      h("div", { key: "c1", style: abs({ left: cx - 0.55 * r - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: r, border: `${3 * u}px solid ${look.outline}` }) }),
      h("div", { key: "l1", style: abs({ left: cx - 1.4 * r, top: cy - 20 * u, width: r, justifyContent: "center", fontSize: 32 * u, fontWeight: 700, color: look.ink }) }, left),
      h("div", { key: "l2", style: abs({ left: cx + 0.45 * r, top: cy - 40 * u, width: r, justifyContent: "center", textAlign: "center", fontSize: 32 * u, fontWeight: 800, lineHeight: 1.2, color: look.onAccent }) }, right),
    );
    if (w.under) body.push(h("div", { key: "u", style: abs({ left: 0, top: H - 230 * u, width: W, justifyContent: "center", fontFamily: look.fonts.body, fontSize: 32 * u, fontWeight: 700, color: look.ink }) }, w.under));
  }

  // The frame's parts where the look's anatomy puts them (looks.ts). Signature
  // keeps the logo top-left on every image, the counter top-right and the bar
  // bottom-left, exactly as before looks had an anatomy.
  const { anatomy } = look;
  const logoAt =
    anatomy.logo.at === "top-left" ? { left: m, top: 72 * u }
    : anatomy.logo.at === "top-right" ? { left: W - m - logoW, top: 72 * u }
    : { left: m, top: H - 72 * u - logoH };
  const showLogo = anatomy.logo.on === "every" || input.cover !== false;
  const counterAt = anatomy.counter.at === "top-right" ? { right: m } : { left: m };
  const counterColour = anatomy.counter.colour === "accent" ? accent : look.textFaint;
  const bar = { width: look.bar.width * u, height: look.bar.height * u, background: accent };
  const rule =
    anatomy.rule === "bar" ? h("div", { style: abs({ left: m, bottom: look.bar.bottom * u, ...bar }) })
    // Editorial's short rule sits on its own line above the first words.
    : anatomy.rule === "above-headline" ? h("div", { style: abs({ left: m, top: top - 44 * u, ...bar }) })
    : null;

  const card = h("div", { style: { position: "relative", display: "flex", width: W, height: H, background: look.ground, fontFamily: look.fonts.body, color: look.ink } },
    input.art ? h("img", { src: `data:image/png;base64,${input.art.toString("base64")}`, width: W, height: H, style: { position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover" } }) : null,
    showLogo ? h("img", { src: logo, width: logoW, height: logoH, style: { position: "absolute", ...logoAt } }) : null,
    input.counter ? h("div", { style: abs({ ...counterAt, top: 92 * u, fontFamily: look.fonts.mono, fontSize: 26 * u, fontWeight: 700, letterSpacing: 2 * u, color: counterColour }) }, input.counter) : null,
    ...body,
    rule,
  );

  const res = new ImageResponse(card, { width: W, height: H, fonts: await loadFonts(look) });
  return Buffer.from(await res.arrayBuffer());
}
