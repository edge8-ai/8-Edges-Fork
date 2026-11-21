import { describe, expect, it } from "vitest";
import { brandArt, brandArtSvg } from "./brand-art";
import { signatureArtSvg, type ArtComposition } from "./signature-art";
import { decodePng } from "./brand-grade";
import { CHANNEL_IMAGE_SIZES } from "./channel-sizes";
import { lookFor, type Look } from "./looks";
import palettes from "./brand-palettes.json";

// The art behind Edge8's Editorial and Campaign set cards (R3.347.2, R3.347.3),
// checked the way the Signature art is: exact size, the words' zone plain
// navy, the look's accent where its anatomy puts it, and only brand colours.

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const e8 = palettes.edge8;
const NAVY = toRgb(e8.navy);
const BLUE = toRgb(e8.blue);

const SIZES = [CHANNEL_IMAGE_SIZES.linkedin, CHANNEL_IMAGE_SIZES.facebook, CHANNEL_IMAGE_SIZES.twitter];
const COMPOSITIONS = ["hook", "close", "corner"] as const;

// The share of the frame, from the top, each composition leaves as plain
// navy: the text zone of the look's cards.
const CLEAR_TOP: Record<"editorial" | "campaign-set", Record<ArtComposition, number>> = {
  editorial: { hook: 0.6, close: 0.6, corner: 0.84 },
  "campaign-set": { hook: 0.7, close: 0.7, corner: 0.84 },
};

// A point in the 1080 x 1350 frame, where the art pins it on a card of this size.
function at(width: number, height: number, [fx, fy]: [number, number]): [number, number] {
  const u = Math.min(width / 1080, height / 1350);
  return [Math.round(width - 1080 * u + fx * u), Math.round(height - 1350 * u + fy * u)];
}

// Where each look's accent must be: on Editorial's blue diagonal at the right
// edge; inside Campaign set's blue wedge, short of its mint tip.
const ACCENT_AT: Record<"editorial" | "campaign-set", Record<ArtComposition, [number, number]>> = {
  editorial: { hook: [1077, 1045], close: [1077, 975], corner: [1077, 1220] },
  "campaign-set": { hook: [760, 1340], close: [760, 1340], corner: [900, 1340] },
};

describe("Edge8's Editorial and Campaign set art", () => {
  for (const style of ["editorial", "campaign-set"] as const) {
    for (const { width, height } of SIZES) {
      for (const composition of COMPOSITIONS) {
        it(`${style} ${composition} at ${width} x ${height}: exact size, words' zone navy, accent in place`, async () => {
          const img = decodePng((await brandArt("edge8", composition, width, height, style))!);
          expect([img.width, img.height]).toEqual([width, height]);

          let stray = 0;
          for (let y = 0; y < Math.floor(height * CLEAR_TOP[style][composition]); y += 3) {
            for (let x = 0; x < width; x += 3) {
              const i = (y * width + x) * 3;
              if (img.rgb[i] !== NAVY[0] || img.rgb[i + 1] !== NAVY[1] || img.rgb[i + 2] !== NAVY[2]) stray++;
            }
          }
          expect(stray).toBe(0);

          const [px, py] = at(width, height, ACCENT_AT[style][composition]);
          const c = (py * width + px) * 3;
          const rgb = [img.rgb[c], img.rgb[c + 1], img.rgb[c + 2]];
          expect(Math.abs(rgb[2] - BLUE[2]), `${style} ${composition} ${rgb}`).toBeLessThan(24);
          expect(rgb[2]).toBeGreaterThan(rgb[0] + 100);
        }, 30_000);
      }
    }
  }

  it("Editorial uses only the brand's navy, blue and white", () => {
    for (const composition of COMPOSITIONS) {
      const hexes = new Set(brandArtSvg("edge8", composition, 1080, 1350, "editorial")!.match(/#[0-9A-Fa-f]{6}/g));
      for (const hex of hexes) expect([e8.navy, e8.blue, e8.white]).toContain(hex);
      expect(hexes).toContain(e8.blue);
    }
  });

  it("Campaign set uses only the brand's navy, blue and mint, with the mint tip in the corner", async () => {
    for (const composition of COMPOSITIONS) {
      const hexes = new Set(brandArtSvg("edge8", composition, 1080, 1350, "campaign-set")!.match(/#[0-9A-Fa-f]{6}/g));
      expect([...hexes].sort()).toEqual([e8.navy, e8.blue, e8.mint].sort());
    }
    const img = decodePng((await brandArt("edge8", "hook", 1080, 1350, "campaign-set"))!);
    const c = (1347 * 1080 + 1077) * 3;
    expect([img.rgb[c], img.rgb[c + 1], img.rgb[c + 2]]).toEqual(toRgb(e8.mint));
  }, 30_000);

  it("keeps Edge8's palette, fonts and logo in every look", () => {
    const frame = (l: Look) => ({ ground: l.ground, ink: l.ink, accent: l.accent, groundKind: l.groundKind, logo: l.logo, fonts: l.fonts, margin: l.margin });
    const signature = lookFor("edge8", "signature")!;
    expect(frame(signature)).toEqual({
      ground: e8.navy, ink: e8.white, accent: e8.blue, groundKind: "dark",
      logo: { file: "public/logo-white.png", width: 196, height: 96, drawWidth: 150 },
      fonts: { display: "Manrope", body: "Manrope", mono: "Manrope" }, margin: 80,
    });
    for (const style of ["editorial", "campaign-set"] as const) expect(frame(lookFor("edge8", style)!)).toEqual(frame(signature));
  });

  it("leaves Signature's art as it was, and gives the Institute no other look", () => {
    for (const composition of COMPOSITIONS) {
      expect(brandArtSvg("edge8", composition, 1080, 1350)).toBe(signatureArtSvg(composition, 1080, 1350));
      expect(brandArtSvg("edge8", composition, 1080, 1350, "signature")).toBe(signatureArtSvg(composition, 1080, 1350));
      expect(brandArtSvg("ai-officer", composition, 1080, 1350, "editorial")).toBeNull();
    }
  });
});
