import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import palettes from "./brand-palettes.json";

// The art behind an Edge8 Signature card, drawn by code instead of the image
// model (Mk.2 of "Campaign images that follow the visual direction skill",
// 18 Nov 2026: code first, Gemini only where texture matters). No model call,
// so it costs nothing and has nothing to colour-correct: it can only use the
// brand's navy, blue and white, and it never reaches the text zone.
//
// Three compositions from the Signature kit, chosen by the slide's role:
//   hook   a building bottom-right with an angular blue cut across the corner
//   close  the building crossed by a bold blue diagonal band
//   corner a small blue wedge in the bottom-right corner, for slides whose
//          words fill the frame (steps, comparisons)
// Drawn in a 1080 x 1350 frame, then scaled by the renderer's unit and pinned
// to the bottom-right corner, so a 1080 x 1080 or 1200 x 1200 card keeps the
// same proportions as the portrait one and the art stays below the words.

export type ArtComposition = "hook" | "close" | "corner";

const { navy: NAVY, blue: BLUE, white: WHITE } = palettes.edge8;

type Pt = [number, number];
export type Face = { tl: Pt; tr: Pt; br: Pt; bl: Pt };

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const r = (n: number) => Math.round(n * 10) / 10;
const pts = (f: Face) => [f.tl, f.tr, f.br, f.bl].map((p) => p.join(",")).join(" ");

// Floors get slightly closer towards the top, which reads as height.
function grid(f: Face, floors: number, cols: number): string {
  let d = "";
  for (let k = 1; k < floors; k++) {
    const t = Math.pow(k / floors, 0.92);
    const a = lerp(f.tl, f.bl, t), b = lerp(f.tr, f.br, t);
    d += `M${r(a[0])} ${r(a[1])}L${r(b[0])} ${r(b[1])}`;
  }
  for (let c = 1; c < cols; c++) {
    const t = c / cols, a = lerp(f.tl, f.tr, t), b = lerp(f.bl, f.br, t);
    d += `M${r(a[0])} ${r(a[1])}L${r(b[0])} ${r(b[1])}`;
  }
  return d;
}

// A building of two faces, its floors and its lit edge. Editorial's art
// (edge8-looks-art.ts) draws the same building.
export function tower(L: Face, R: Face): string {
  return [
    `<polygon points="${pts(L)}" fill="${WHITE}" fill-opacity="0.07"/>`,
    `<polygon points="${pts(R)}" fill="${WHITE}" fill-opacity="0.03"/>`,
    `<path d="${grid(L, 24, 6)}" stroke="${WHITE}" stroke-opacity="0.42" stroke-width="1.6" fill="none"/>`,
    `<path d="${grid(R, 24, 7)}" stroke="${WHITE}" stroke-opacity="0.32" stroke-width="1.6" fill="none"/>`,
    `<path d="M${L.bl.join(" ")}L${L.tl.join(" ")}L${R.tl.join(" ")}L${R.tr.join(" ")}L${R.br.join(" ")}" stroke="${WHITE}" stroke-opacity="0.7" stroke-width="2.2" fill="none" stroke-linejoin="round"/>`,
    `<line x1="${L.tr[0]}" y1="${L.tr[1]}" x2="${L.tr[0]}" y2="1350" stroke="${WHITE}" stroke-opacity="0.9" stroke-width="3"/>`,
  ].join("");
}

// Tower tops sit at y 700 (hook) and y 840 (close, whose headline can run to
// three lines); text on a Signature card ends above both on the portrait frame.
export const COMPOSITIONS: Record<ArtComposition, string> = {
  hook:
    tower({ tl: [628, 770], tr: [800, 700], br: [800, 1350], bl: [606, 1350] }, { tl: [800, 700], tr: [984, 762], br: [1010, 1350], bl: [800, 1350] }) +
    `<polygon points="500,1350 1080,1350 1080,980" fill="${BLUE}" fill-opacity="0.92"/>`,
  close:
    tower({ tl: [700, 898], tr: [846, 840], br: [846, 1350], bl: [680, 1350] }, { tl: [846, 840], tr: [1004, 896], br: [1026, 1350], bl: [846, 1350] }) +
    `<polygon points="360,1350 540,1350 1080,1010 1080,850" fill="${BLUE}" fill-opacity="0.95"/>`,
  corner: `<polygon points="840,1350 1080,1350 1080,1160" fill="${BLUE}"/>`,
};

// Edge8's art frame for every one of its looks: the navy ground, and the
// composition drawn in 1080 x 1350, scaled and pinned bottom-right.
export function edge8ArtSvg(body: string, width: number, height: number): string {
  const u = Math.min(width / 1080, height / 1350);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${NAVY}"/>` +
    `<g transform="translate(${r(width - 1080 * u)} ${r(height - 1350 * u)}) scale(${u})">${body}</g></svg>`;
}

export function signatureArtSvg(composition: ArtComposition, width: number, height: number): string {
  return edge8ArtSvg(COMPOSITIONS[composition], width, height);
}

// The art as a PNG at the card's exact pixels, ready for renderCard's `art`.
export async function signatureArt(composition: ArtComposition, width: number, height: number): Promise<Buffer> {
  const src = `data:image/svg+xml;base64,${Buffer.from(signatureArtSvg(composition, width, height)).toString("base64")}`;
  const res = new ImageResponse(h("img", { src, width, height }), { width, height });
  return Buffer.from(await res.arrayBuffer());
}
