// The contract between the emblem module and everything that draws from it
// (LD.3; spec "The emblem module is private"). The module itself, ./emblems/,
// holds Edge8's art and never reaches the public fork; the fork's overlay ships
// a plain set at the same path with the same exports. Both draw to the boxes
// and types here, so ./Emblem.tsx names a tier and nothing else and works with
// either.
//
// The module exports one component per kind of art, each drawing exactly the
// box it is given: HelmArt (HELM_BOX's proportions), MedalArt and StarsArt
// (MEDAL_BOX's; the star arc overlays the medal), and BorderArt (the border's
// full extent, BORDER_GEOMETRY's width × height). It also ships frames.css,
// which paints the kernel Avatar's `frame-<tier>` round a face.
import type { BuilderTier, LearnShareTier } from "../lib/points";

export const HELM_BOX = { width: 280, height: 320 } as const;
export const MEDAL_BOX = { width: 256, height: 256 } as const;

/** Immortal's three medals: the first at 60,000 points, the second and third further up. */
export type ImmortalBand = 1 | 2 | 3;
export type StarCount = 1 | 2 | 3 | 4 | 5;

/**
 * Where a border's art sits round its hole, in the art's own pixels: its size,
 * the hole's centre and the hole's radius. Border scales it so the hole clears
 * a face by the kernel's FRAME_AIR.
 */
export type BorderGeometry = { width: number; height: number; cx: number; cy: number; r: number };

/** What the module draws each kind of art with; every component fills its box. */
export type HelmArtProps = { tier: LearnShareTier; width: number; height: number };
export type MedalArtProps = { tier: BuilderTier; band: ImmortalBand | null; size: number };
export type StarsArtProps = { stars: StarCount; size: number };
export type BorderArtProps = { tier: LearnShareTier; width: number; height: number };
