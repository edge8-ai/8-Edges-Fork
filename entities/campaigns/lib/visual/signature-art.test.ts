import { describe, expect, it } from "vitest";
import { signatureArt, signatureArtSvg, type ArtComposition } from "./signature-art";
import { decodePng } from "./brand-grade";
import { CHANNEL_IMAGE_SIZES } from "./channel-sizes";
import palettes from "./brand-palettes.json";

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const NAVY = toRgb(palettes.edge8.navy);
const BLUE = toRgb(palettes.edge8.blue);

// The share of the frame, from the top, that each composition must leave as
// plain navy ground: the text zone of a Signature card.
const CLEAR_TOP: Record<ArtComposition, number> = { hook: 0.5, close: 0.6, corner: 0.84 };

const SIZES = [
  ["linkedin", CHANNEL_IMAGE_SIZES.linkedin],
  ["facebook", CHANNEL_IMAGE_SIZES.facebook],
  ["twitter", CHANNEL_IMAGE_SIZES.twitter],
] as const;

describe("signatureArt", () => {
  for (const [channel, { width, height }] of SIZES) {
    for (const composition of ["hook", "close", "corner"] as const) {
      it(`draws ${composition} for ${channel} at ${width} x ${height}, words' zone untouched`, async () => {
        const img = decodePng(await signatureArt(composition, width, height));
        expect([img.width, img.height]).toEqual([width, height]);

        const rows = Math.floor(height * CLEAR_TOP[composition]);
        let stray = 0;
        for (let y = 0; y < rows; y += 3) {
          for (let x = 0; x < width; x += 3) {
            const i = (y * width + x) * 3;
            if (img.rgb[i] !== NAVY[0] || img.rgb[i + 1] !== NAVY[1] || img.rgb[i + 2] !== NAVY[2]) stray++;
          }
        }
        expect(stray).toBe(0);

        // The blue accent: across the bottom-right corner on the hook and the
        // corner wedge, across the right edge (below the text) on the close.
        const [px, py] = composition === "close" ? [width - 3, Math.round(height - 1350 * Math.min(width / 1080, height / 1350) * (1 - 930 / 1350))] : [width - 3, height - 3];
        const c = (py * width + px) * 3;
        const corner = [img.rgb[c], img.rgb[c + 1], img.rgb[c + 2]];
        expect(Math.abs(corner[2] - BLUE[2]), `corner ${corner}`).toBeLessThan(24);
        expect(corner[2]).toBeGreaterThan(corner[0] + 100);
      }, 30_000);
    }
  }

  it("uses only the brand's navy, blue and white", () => {
    for (const composition of ["hook", "close", "corner"] as const) {
      const hexes = new Set(signatureArtSvg(composition, 1080, 1350).match(/#[0-9A-Fa-f]{6}/g));
      expect([...hexes].sort()).toEqual(
        [palettes.edge8.navy, palettes.edge8.blue, ...(composition === "corner" ? [] : [palettes.edge8.white])].sort(),
      );
    }
  });
});
