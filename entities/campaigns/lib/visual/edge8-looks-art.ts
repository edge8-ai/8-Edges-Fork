import palettes from "./brand-palettes.json";
import { edge8ArtSvg, tower, type ArtComposition } from "./signature-art";

// The art behind Edge8's Editorial and Campaign set cards (R3.347), drawn by
// code like the Signature art and in the same frame: 1080 x 1350, scaled with
// the renderer's unit and pinned bottom-right, so the words' zone stays plain
// navy. Only the brand's own colours. The anatomy is Marketing's
// (docs/marketing/visual-direction.md, Layouts):
//
//   Editorial     the brand art crossed by a blue diagonal: a lit plane and a
//                 building under one full-width band rising to the right; on
//                 slides full of words, only a short stretch of the band in
//                 the corner.
//   Campaign set  a corner wedge bottom-right, blue with a mint tip, the same
//                 on every post so a campaign reads as one set; smaller on
//                 slides full of words.
//
// Each look's tops stay below its text: Editorial's art starts at y 870 (the
// corner at 1190), Campaign set's at 972 (the corner at 1160).

const { blue: BLUE, mint: MINT, white: WHITE } = palettes.edge8;

export type Edge8OtherLook = "editorial" | "campaign-set";

export const EDITORIAL_COMPOSITIONS: Record<ArtComposition, string> = {
  hook:
    `<polygon points="0,1120 1080,900 1080,1350 0,1350" fill="${WHITE}" fill-opacity="0.04"/>` +
    tower({ tl: [700, 930], tr: [860, 870], br: [860, 1350], bl: [680, 1350] }, { tl: [860, 870], tr: [1010, 920], br: [1030, 1350], bl: [860, 1350] }) +
    `<polygon points="0,1230 1080,1010 1080,1080 0,1300" fill="${BLUE}"/>`,
  close:
    `<polygon points="0,1180 1080,880 1080,1350 0,1350" fill="${WHITE}" fill-opacity="0.04"/>` +
    tower({ tl: [740, 960], tr: [880, 900], br: [880, 1350], bl: [720, 1350] }, { tl: [880, 900], tr: [1020, 950], br: [1040, 1350], bl: [880, 1350] }) +
    `<polygon points="0,1280 1080,940 1080,1010 0,1350" fill="${BLUE}"/>`,
  corner: `<polygon points="760,1350 1080,1190 1080,1250 880,1350" fill="${BLUE}"/>`,
};

const WEDGE = `<polygon points="670,1350 1080,972 1080,1350" fill="${BLUE}"/><polygon points="842,1350 1080,1134 1080,1350" fill="${MINT}"/>`;

export const CAMPAIGN_SET_COMPOSITIONS: Record<ArtComposition, string> = {
  hook: WEDGE,
  close: WEDGE,
  corner: `<polygon points="840,1350 1080,1350 1080,1160" fill="${BLUE}"/><polygon points="960,1350 1080,1350 1080,1255" fill="${MINT}"/>`,
};

export function edge8LookArtSvg(look: Edge8OtherLook, composition: ArtComposition, width: number, height: number): string {
  const body = look === "editorial" ? EDITORIAL_COMPOSITIONS[composition] : CAMPAIGN_SET_COMPOSITIONS[composition];
  return edge8ArtSvg(body, width, height);
}
