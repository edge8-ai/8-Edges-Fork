import { describe, expect, it } from "vitest";
import { brandArt, brandArtSvg } from "./brand-art";
import { decodePng } from "./brand-grade";
import { CHANNEL_IMAGE_SIZES } from "./channel-sizes";
import { renderCard } from "./render-card";
import { accentFor, lookFor } from "./looks";
import palettes from "./brand-palettes.json";

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const aio = palettes["ai-officer"];
const WHITE = toRgb(aio.white);

const CLEAR_TOP = { hook: 0.5, close: 0.6, corner: 0.84 } as const;
const SIZES = [CHANNEL_IMAGE_SIZES.linkedin, CHANNEL_IMAGE_SIZES.facebook, CHANNEL_IMAGE_SIZES.twitter];

describe("the Institute's code-drawn art", () => {
  for (const { width, height } of SIZES) {
    for (const composition of ["hook", "close", "corner"] as const) {
      it(`${composition} at ${width} x ${height}: exact size, words' zone plain white`, async () => {
        const img = decodePng((await brandArt("ai-officer", composition, width, height))!);
        expect([img.width, img.height]).toEqual([width, height]);
        let stray = 0;
        for (let y = 0; y < Math.floor(height * CLEAR_TOP[composition]); y += 3) {
          for (let x = 0; x < width; x += 3) {
            const i = (y * width + x) * 3;
            if (img.rgb[i] !== WHITE[0] || img.rgb[i + 1] !== WHITE[1] || img.rgb[i + 2] !== WHITE[2]) stray++;
          }
        }
        expect(stray).toBe(0);
      }, 30_000);
    }
  }

  it("is orthogonal only (no diagonal paths) and uses only the Institute's colours", () => {
    for (const composition of ["hook", "close", "corner"] as const) {
      const svg = brandArtSvg("ai-officer", composition, 1080, 1350)!;
      expect(svg).not.toMatch(/<polygon|<line|L\d/);
      const hexes = new Set(svg.match(/#[0-9A-Fa-f]{6}/g));
      for (const hex of hexes) expect([aio.white, aio.line, aio.magenta, aio.blue, aio.mint]).toContain(hex);
    }
  });

  it("gives Edge8 its own Signature art and an unknown brand none", () => {
    expect(brandArtSvg("edge8", "hook", 1080, 1350)).toContain(palettes.edge8.navy);
    expect(brandArtSvg("someone-else", "hook", 1080, 1350)).toBeNull();
  });
});

describe("renderCard with the Institute look", () => {
  const look = lookFor("ai-officer", "signature")!;

  it("draws on white with the accent by role and the navy logo", async () => {
    const png = await renderCard({
      look,
      arrangement: "headline",
      words: { kicker: "Most leadership teams are comparing seat prices.", headline: "That is the wrong comparison.", accent: "the wrong comparison." },
      width: 1080,
      height: 1350,
      art: await brandArt("ai-officer", "hook", 1080, 1350),
      counter: "01 / 04",
      accent: accentFor(look, "hook"),
    });
    const img = decodePng(png);
    const at = (x: number, y: number) => { const i = (y * img.width + x) * 3; return [img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]]; };
    expect([img.width, img.height]).toEqual([1080, 1350]);
    expect(at(1070, 20)).toEqual(WHITE);
    // The bar bottom-left takes the hook's accent: magenta, the problem.
    expect(at(128, 1350 - 96 - 3)).toEqual(toRgb(aio.magenta));
    // The navy logo sits top-left: some dark pixels in its box.
    let dark = 0;
    for (let y = 80; y < 130; y += 2) for (let x = 85; x < 370; x += 2) if (Math.max(...at(x, y)) < 80) dark++;
    expect(dark).toBeGreaterThan(20);
  }, 30_000);

  it("takes blue for the key point and dark mint for the close", () => {
    expect(accentFor(look, "key")).toBe(aio.blue);
    expect(accentFor(look, "close")).toBe(aio.mintDark);
    expect(accentFor(lookFor("edge8", "signature")!, "close")).toBe(palettes.edge8.blue);
  });
});
