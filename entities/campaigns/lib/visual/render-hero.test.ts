import { describe, expect, it } from "vitest";
import { renderHero } from "./render-hero";
import { decodePng } from "./brand-grade";
import palettes from "./brand-palettes.json";
import type { HeroWords } from "./hero-shape";

// One smoke test per brand: a hero renders to a 1200 x 675 PNG on the brand's
// navy. Its pixels are not asserted beyond that; the layout test
// (hero-layout.test.ts) is where the no-overlap guarantee lives.

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const IGNITE: HeroWords = {
  layout: "steps",
  kicker: "EO South Pacific Ignite · Sydney · 18 Oct 2026",
  headline: "Attended versus produced",
  figures: [
    { value: "78", label: "surveyed" },
    { value: "20", label: "started the checklist" },
    { value: "11", label: "finished all nine steps" },
    { value: "3", label: "built a prototype" },
  ],
  source: "AI Journey survey and the session checklist",
};

describe("renderHero", () => {
  for (const brand of ["ai-officer", "edge8"] as const) {
    it(`draws a ${brand} hero as a 1200 x 675 PNG on the brand navy`, async () => {
      const img = decodePng(await renderHero({ words: IGNITE, brand }));
      expect([img.width, img.height]).toEqual([1200, 675]);
      // The top-right corner is ground: no layout writes there.
      const i = (10 * img.width + 1190) * 3;
      expect([img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]]).toEqual(toRgb(palettes[brand].navy));
    }, 30_000);
  }

  it("refuses words the layout cannot fit, rather than draw them", async () => {
    await expect(renderHero({ words: { ...IGNITE, figures: [] }, brand: "ai-officer" })).rejects.toThrow(/do not fit/);
  });
});
