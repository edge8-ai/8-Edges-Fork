import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import palettes from "./brand-palettes.json";
import { signatureArtSvg, type ArtComposition } from "./signature-art";
import { edge8LookArtSvg } from "./edge8-looks-art";
import type { StyleKey } from "./brand-kit";

// The art behind a card, drawn by code for each brand (Mk.2: code first, no
// model call). Edge8's is the Signature kit in signature-art.ts: a building,
// angular cuts, a diagonal band; its Editorial and Campaign set art is in
// edge8-looks-art.ts. The Institute brand's is the opposite on
// purpose, so the two pass the skill's cover-the-logo test: gridded, stepped
// and orthogonal, never diagonal, on white, its colours by meaning (magenta
// the problem, blue the method, mint the answer).
//
// Same frame as the Signature art: drawn in 1080 x 1350, scaled with the
// renderer's unit and pinned bottom-right, so the text zone stays plain ground.

const { white: WHITE, line: LINE, magenta: MAGENTA, blue: BLUE, mint: MINT } = palettes["ai-officer"];

const r = (n: number) => Math.round(n * 10) / 10;

// A faint square grid behind the steps, the "gridded" half of the brand.
function grid(x0: number, y0: number, x1: number, y1: number, step: number): string {
  let d = "";
  for (let x = x0; x <= x1; x += step) d += `M${x} ${y0}V${y1}`;
  for (let y = y0; y <= y1; y += step) d += `M${x0} ${y}H${x1}`;
  return `<path d="${d}" stroke="${LINE}" stroke-width="2" fill="none"/>`;
}

// Three rising steps: problem, method, answer.
function steps(tops: [number, number, number], colours: [string, string, string]): string {
  const xs = [600, 740, 880];
  return xs.map((x, i) => `<rect x="${x}" y="${tops[i]}" width="120" height="${1350 - tops[i]}" fill="${colours[i]}"/>`).join("");
}

export const INSTITUTE_COMPOSITIONS: Record<ArtComposition, string> = {
  hook: grid(580, 860, 1080, 1350, 60) + steps([1110, 1000, 890], [MAGENTA, BLUE, MINT]),
  close: grid(580, 900, 1080, 1350, 60) + steps([1150, 1040, 930], [BLUE, BLUE, MINT]),
  corner: `<rect x="900" y="1170" width="80" height="80" fill="${MAGENTA}"/><rect x="990" y="1170" width="80" height="80" fill="${BLUE}"/><rect x="990" y="1260" width="80" height="80" fill="${MINT}"/><rect x="900" y="1260" width="80" height="80" fill="none" stroke="${LINE}" stroke-width="2"/>`,
};

export function instituteArtSvg(composition: ArtComposition, width: number, height: number): string {
  const u = Math.min(width / 1080, height / 1350);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${WHITE}"/>` +
    `<g transform="translate(${r(width - 1080 * u)} ${r(height - 1350 * u)}) scale(${u})">${INSTITUTE_COMPOSITIONS[composition]}</g></svg>`;
}

// The SVG for a brand's art in a look, or null for a brand or a look with no
// code-drawn art yet. The Institute has only Signature until its diagonal
// question is decided.
export function brandArtSvg(brandSlug: string, composition: ArtComposition, width: number, height: number, style: StyleKey = "signature"): string | null {
  if (brandSlug === "edge8") return style === "signature" ? signatureArtSvg(composition, width, height) : edge8LookArtSvg(style, composition, width, height);
  if (brandSlug === "ai-officer") return style === "signature" ? instituteArtSvg(composition, width, height) : null;
  return null;
}

// The art as a PNG at the card's exact pixels, ready for renderCard's `art`.
export async function brandArt(brandSlug: string, composition: ArtComposition, width: number, height: number, style: StyleKey = "signature"): Promise<Buffer | null> {
  const svg = brandArtSvg(brandSlug, composition, width, height, style);
  if (!svg) return null;
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const res = new ImageResponse(h("img", { src, width, height }), { width, height });
  return Buffer.from(await res.arrayBuffer());
}
