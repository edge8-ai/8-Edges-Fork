import { describe, expect, it } from "vitest";
import { renderCard, type CardInput } from "./render-card";
import { lookFor } from "./looks";
import { decodePng } from "./brand-grade";
import { CHANNEL_IMAGE_SIZES } from "./channel-sizes";
import palettes from "./brand-palettes.json";

const look = lookFor("edge8", "signature")!;
const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const CARDS: Record<string, Pick<CardInput, "arrangement" | "words" | "counter" | "noteOnItem">> = {
  headline: { arrangement: "headline", counter: "01 / 04", words: { kicker: "Most founders think a company video costs a week.", headline: "Ours takes an afternoon.", accent: "an afternoon." } },
  steps: {
    arrangement: "steps", counter: "02 / 04", noteOnItem: 3,
    words: {
      headline: "Here is the order we do it in at Edge8.", accent: "at Edge8.", note: "This is where quality is won or lost.",
      items: ["Talk the idea through first.", "Write the post.", "Pull out the three to five points", "Write the script.", "Plan the scenes.", "Run it through a workflow that already knows your brand.", "Add a voiceover.", "Generate. Watch it once. Ship."],
    },
  },
  columns: { arrangement: "columns", counter: "03 / 04", words: { headline: "AI video on its own is average.", accent: "is average.", sub: "Ours is never as good as when our motion designer directs it.", labels: ["Tools", "Motion designer"], under: "Same tools. Same script. Different result." } },
  "single-idea": { arrangement: "single-idea", words: { headline: "The person directing it is the thing.", accent: "is the thing." } },
};

function pixel(png: Buffer, x: number, y: number) {
  const img = decodePng(png);
  const i = (y * img.width + x) * 3;
  return { size: [img.width, img.height], rgb: [img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]] };
}

describe("renderCard, Edge8 layout 4", () => {
  for (const [name, card] of Object.entries(CARDS)) {
    it(`draws a ${name} card at LinkedIn's exact 1080 x 1350 on the brand navy`, async () => {
      const png = await renderCard({ look, width: 1080, height: 1350, ...card });
      const corner = pixel(png, 1070, 1340);
      expect(corner.size).toEqual([1080, 1350]);
      expect(corner.rgb).toEqual(toRgb(palettes.edge8.navy));
    }, 30_000);
  }

  it("places the original logo top-left and the blue bar bottom-left", async () => {
    const png = await renderCard({ look, width: 1080, height: 1350, ...CARDS.headline });
    // The white wordmark's first letter, and the middle of the bar.
    const logo = pixel(png, 92, 108).rgb;
    expect(Math.min(...logo)).toBeGreaterThan(200);
    expect(pixel(png, 128, 1350 - 96 - 3).rgb).toEqual(toRgb(palettes.edge8.blue));
  }, 30_000);

  it("fits the wide channels too", async () => {
    for (const size of [CHANNEL_IMAGE_SIZES.twitter, CHANNEL_IMAGE_SIZES.email]) {
      const png = await renderCard({ look, width: size.width, height: size.height, ...CARDS.headline, counter: null });
      expect(pixel(png, 0, 0).size).toEqual([size.width, size.height]);
    }
  }, 30_000);
});

// Pixels in a box that pass a test, sampled every other pixel.
function count(png: Buffer, [x0, y0, x1, y1]: [number, number, number, number], test: (rgb: number[]) => boolean): number {
  const img = decodePng(png);
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * 3;
      if (test([img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]])) n++;
    }
  }
  return n;
}
const white = (rgb: number[]) => Math.min(...rgb) > 200;
const blueish = (rgb: number[]) => rgb[2] > rgb[0] + 100;

// The logo boxes on a 1080 x 1350 card: the white wordmark drawn 150 wide
// (73 tall) inside the 80 px margin, 72 px from the top or the bottom.
const TOP_LEFT: [number, number, number, number] = [80, 72, 230, 146];
const TOP_RIGHT: [number, number, number, number] = [850, 72, 1000, 146];
const BOTTOM_LEFT: [number, number, number, number] = [80, 1204, 230, 1278];

// R3.347.2: Edge8's Editorial look, drawn and checked like Signature (the
// anatomy in docs/marketing/visual-direction.md).
describe("renderCard, Edge8 Editorial", () => {
  const editorial = lookFor("edge8", "editorial")!;

  it("draws every arrangement at LinkedIn's exact size on the brand navy", async () => {
    for (const card of Object.values(CARDS)) {
      const png = await renderCard({ look: editorial, width: 1080, height: 1350, ...card });
      const at = pixel(png, 1070, 20);
      expect(at.size).toEqual([1080, 1350]);
      expect(at.rgb).toEqual(toRgb(palettes.edge8.navy));
    }
  }, 60_000);

  it("puts the logo top-right on the cover only, and the slide number top-left", async () => {
    const cover = await renderCard({ look: editorial, width: 1080, height: 1350, ...CARDS.headline, counter: "01", cover: true });
    expect(count(cover, TOP_RIGHT, white)).toBeGreaterThan(20);
    expect(count(cover, TOP_LEFT, white)).toBe(0);
    const later = await renderCard({ look: editorial, width: 1080, height: 1350, ...CARDS.steps, counter: "02", cover: false });
    expect(count(later, TOP_RIGHT, white)).toBe(0);
    // The slide number in the faint white, top-left.
    expect(count(later, [80, 92, 180, 126], (rgb) => Math.min(...rgb) > 120)).toBeGreaterThan(5);
  }, 30_000);

  // render-card.ts: a card drawn without `cover` counts as a cover, so a
  // caller that leaves it out never drops the logo by omission.
  it("keeps the logo on a card drawn without saying whether it is the cover", async () => {
    const unsaid = await renderCard({ look: editorial, width: 1080, height: 1350, ...CARDS.headline, counter: "01" });
    expect(count(unsaid, TOP_RIGHT, white)).toBeGreaterThan(20);
  }, 30_000);

  it("draws a short blue rule above the headline and no bar bottom-left", async () => {
    const png = await renderCard({ look: editorial, width: 1080, height: 1350, ...CARDS["single-idea"], cover: true });
    // The rule: the bar's 96 x 7, 44 px above the text zone's top (260).
    expect(pixel(png, 128, 260 - 44 + 3).rgb).toEqual(toRgb(palettes.edge8.blue));
    expect(pixel(png, 128, 1350 - 96 - 3).rgb).toEqual(toRgb(palettes.edge8.navy));
  }, 30_000);

  it("fits the square and wide channels", async () => {
    for (const size of [CHANNEL_IMAGE_SIZES.facebook, CHANNEL_IMAGE_SIZES.twitter, CHANNEL_IMAGE_SIZES.email]) {
      const png = await renderCard({ look: editorial, width: size.width, height: size.height, ...CARDS.headline, counter: null });
      expect(pixel(png, 0, 0).size).toEqual([size.width, size.height]);
    }
  }, 30_000);
});

// R3.347.3: Edge8's Campaign set look.
describe("renderCard, Edge8 Campaign set", () => {
  const campaign = lookFor("edge8", "campaign-set")!;

  it("draws every arrangement at LinkedIn's exact size on the brand navy", async () => {
    for (const card of Object.values(CARDS)) {
      const png = await renderCard({ look: campaign, width: 1080, height: 1350, ...card });
      const at = pixel(png, 1070, 20);
      expect(at.size).toEqual([1080, 1350]);
      expect(at.rgb).toEqual(toRgb(palettes.edge8.navy));
    }
  }, 60_000);

  it("puts the logo bottom-left on every image and the counter top-left in blue", async () => {
    for (const cover of [true, false]) {
      const png = await renderCard({ look: campaign, width: 1080, height: 1350, ...CARDS.headline, counter: "02 / 04", cover });
      expect(count(png, BOTTOM_LEFT, white)).toBeGreaterThan(20);
      expect(count(png, TOP_LEFT, white)).toBe(0);
      expect(count(png, [80, 92, 230, 126], blueish)).toBeGreaterThan(5);
    }
  }, 30_000);

  it("draws no bar: the logo holds the bottom-left corner", async () => {
    const png = await renderCard({ look: campaign, width: 1080, height: 1350, ...CARDS["single-idea"] });
    // Where Signature's bar sits (96 x 7, 96 px from the bottom): no blue.
    expect(count(png, [80, 1244, 180, 1258], blueish)).toBe(0);
  }, 30_000);

  it("fits the square and wide channels", async () => {
    for (const size of [CHANNEL_IMAGE_SIZES.facebook, CHANNEL_IMAGE_SIZES.twitter, CHANNEL_IMAGE_SIZES.email]) {
      const png = await renderCard({ look: campaign, width: size.width, height: size.height, ...CARDS.headline, counter: null });
      expect(pixel(png, 0, 0).size).toEqual([size.width, size.height]);
    }
  }, 30_000);
});
