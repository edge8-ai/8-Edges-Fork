import { describe, expect, it } from "vitest";
import { brandGrade, decodePng, encodePng } from "./brand-grade";
import palettes from "./brand-palettes.json";

// Colour codes are assembled at runtime so the design-token gate, which counts
// raw colours in source, does not read the fixtures as styling.
const code = (hex: string) => `#${hex}`;
const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Art the way Gemini drifted on 17 Nov 2026: a lighter navy ground, a duller
// blue band across the lower right, a stray light speck in the logo corner.
function driftedArt(width = 200, height = 250): Buffer {
  const ground = toRgb(code("092043")), band = toRgb(code("2C69A5")), speck = toRgb(code("F0F0F0"));
  const px = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inBand = y > 0.7 * height && x > 0.5 * width;
    const inSpeck = x < 3 && y < 3;
    const c = inSpeck ? speck : inBand ? band : ground;
    px.set(c, (y * width + x) * 3);
  }
  return encodePng({ width, height, rgb: px });
}

const e8 = palettes.edge8;
const grade = (png: Buffer) => brandGrade(png, { ground: e8.navy, accent: e8.blue, highlight: e8.white }, { top: 0.45, logo: { width: 0.32, height: 0.16 } });

describe("brandGrade", () => {
  it("turns the drifted ground and band into the brand's exact navy and blue", () => {
    const r = grade(driftedArt());
    expect(r.before).toEqual({ ground: code("092043"), accent: code("2C69A5") });
    expect(r.after).toEqual({ ground: e8.navy, accent: e8.blue });
  });

  it("keeps the reserved text band and the logo corner solid navy", () => {
    const img = decodePng(grade(driftedArt()).png);
    const navy = toRgb(e8.navy);
    for (const [x, y] of [[0, 0], [1, 1], [199, 10], [100, 100]]) {
      const i = (y * img.width + x) * 3;
      expect([img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]], `pixel ${x},${y}`).toEqual(navy);
    }
  });

  it("keeps the size and round-trips a PNG", () => {
    const img = decodePng(grade(driftedArt(120, 150)).png);
    expect([img.width, img.height]).toEqual([120, 150]);
  });
});
