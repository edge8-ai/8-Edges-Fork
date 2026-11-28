import { describe, expect, it } from "vitest";
import { heroLayout, type HeroBox, type HeroLayoutResult, type HeroLogoSize } from "./hero-layout";
import { HERO_CAPS, HERO_FIGURE_COUNTS, HERO_LAYOUTS, HERO_SIZE, type HeroWords } from "./hero-shape";

// The no-overlap guarantee (spec: "The code-drawn hero", Testing Decisions):
// for every layout and both brands, with the longest words the caps allow and
// with the shortest, every text box lies inside the picture, outside the blog
// list's card-crop bands, and clear of the logo and the gap around it.

const BRANDS = ["ai-officer", "edge8"] as const;
// The blog list crops the 16:9 picture to its 350 x 180 card, which takes about
// 29px off the top and the bottom.
const CROP_BAND = 29;
// The clear zone around the logo no text enters (the prototype's logo zone).
const LOGO_GAP = 24;

// Text at exactly a cap, in the widest letters the fonts have (an "M" and
// lower-case "m"s), split into six-letter words so it wraps like real words.
const widest = (cap: number) => "Mmmmmm ".repeat(Math.ceil(cap / 7)).slice(0, cap).trimEnd().padEnd(cap, "m");
// The longest figure value: a number at the cap, so steps can still draw bars.
const LONGEST_VALUE = "8,888.8%";

type WordSet = "longest" | "shortest" | "tallest";

function wordsFor(layout: HeroWords["layout"], count: number, set: WordSet): HeroWords {
  const long = set !== "shortest";
  const figures = Array.from({ length: count }, () => ({
    // The tallest set keeps the values short: a short value is drawn at full
    // size, so long labels under full-size values are the most height a
    // layout ever needs.
    value: set === "longest" ? LONGEST_VALUE : "1",
    label: long ? widest(HERO_CAPS.label) : "a",
  }));
  return {
    layout,
    kicker: long ? widest(HERO_CAPS.kicker) : undefined,
    headline: long ? widest(HERO_CAPS.headline) : "A",
    figures,
    source: long ? widest(HERO_CAPS.source) : undefined,
  };
}

function textBoxes(l: HeroLayoutResult): { name: string; box: HeroBox }[] {
  return [
    ...(l.kicker ? [{ name: "kicker", box: l.kicker }] : []),
    { name: "headline", box: l.headline },
    ...l.figures.flatMap((f, i) => [
      { name: `value ${i}`, box: f.value },
      { name: `label ${i}`, box: f.label },
    ]),
    ...(l.source ? [{ name: "source", box: l.source }] : []),
  ];
}

const overlaps = (a: HeroBox, b: HeroBox) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

function expectClean(l: HeroLayoutResult) {
  expect(l.misfits).toEqual([]);
  expect(l.fits).toBe(true);
  expect(l.headline.lines).toBeLessThanOrEqual(2);
  const zone = { left: l.logo.left - LOGO_GAP, top: l.logo.top - LOGO_GAP, width: l.logo.width + 2 * LOGO_GAP, height: l.logo.height + 2 * LOGO_GAP };
  const boxes = textBoxes(l);
  for (const { name, box } of boxes) {
    expect(box.left, `${name} left`).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width, `${name} right`).toBeLessThanOrEqual(HERO_SIZE.width);
    expect(box.top, `${name} top`).toBeGreaterThanOrEqual(CROP_BAND);
    expect(box.top + box.height, `${name} bottom`).toBeLessThanOrEqual(HERO_SIZE.height - CROP_BAND);
    expect(overlaps(box, zone), `${name} reaches the logo corner`).toBe(false);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i].box, boxes[j].box), `${boxes[i].name} overlaps ${boxes[j].name}`).toBe(false);
    }
  }
}

describe("heroLayout: no text box reaches the logo corner", () => {
  for (const brand of BRANDS) {
    for (const layout of HERO_LAYOUTS) {
      const { min, max } = HERO_FIGURE_COUNTS[layout];
      // Every count the layout draws, three included: a row or steps of three
      // has its own column width, between two's and four's.
      for (let count = min; count <= max; count++) {
        for (const set of ["longest", "shortest", "tallest"] as const) {
          it(`${brand}, ${layout} with ${count} figure(s), ${set} words`, () => {
            expectClean(heroLayout(wordsFor(layout, count, set), brand));
          });
        }
      }
    }
  }

  it("keeps the logo bottom-left at the brand margin, at the logo share of the width", () => {
    // 80 of 1080 of the width is 89px; 0.22 of it is 264px, and the AI Officer
    // file (2048 x 381) is drawn 49px tall at that width.
    expect(heroLayout(wordsFor("steps", 4, "shortest"), "ai-officer").logo).toEqual({ left: 89, top: 537, width: 264, height: 49 });
    // Edge8's white wordmark is a 196 x 96 PNG, never drawn wider than its pixels.
    expect(heroLayout(wordsFor("steps", 4, "shortest"), "edge8").logo).toEqual({ left: 89, top: 490, width: 196, height: 96 });
  });
});

// A brand may upload its own logo for a dark ground, of any proportions. The
// layout draws it at the logo share of the width, never taller than 96px, so
// these three cover the shapes that move the corner: one wide and short
// (264 x 33), one tall and narrow (24 x 96) and one at the cap (264 x 96).
const UPLOADS: Record<string, HeroLogoSize> = {
  "wide and short": { width: 1600, height: 200, mime: "image/png" },
  "tall and narrow": { width: 300, height: 1200, mime: "image/png" },
  "at the 96px cap": { width: 528, height: 192, mime: "image/svg+xml" },
};
// A source line that takes one line beside any of them.
const ONE_LINE_SOURCE = widest(30);

describe("heroLayout: no text box reaches an uploaded logo", () => {
  it("draws the uploads at the sizes the cases are named for", () => {
    const words = wordsFor("stat", 1, "shortest");
    expect(heroLayout(words, "edge8", UPLOADS["wide and short"]).logo).toMatchObject({ width: 264, height: 33 });
    expect(heroLayout(words, "edge8", UPLOADS["tall and narrow"]).logo).toMatchObject({ width: 24, height: 96 });
    expect(heroLayout(words, "edge8", UPLOADS["at the 96px cap"]).logo).toMatchObject({ width: 264, height: 96 });
  });

  for (const [shape, upload] of Object.entries(UPLOADS)) {
    for (const brand of BRANDS) {
      for (const layout of HERO_LAYOUTS) {
        const { min, max } = HERO_FIGURE_COUNTS[layout];
        for (let count = min; count <= max; count++) {
          for (const set of ["longest", "shortest", "tallest"] as const) {
            it(`${shape}: ${brand}, ${layout} with ${count} figure(s), ${set} words`, () => {
              const words = wordsFor(layout, count, set);
              if (words.source) words.source = ONE_LINE_SOURCE;
              expectClean(heroLayout(words, brand, upload));
            });
          }
        }
      }
    }
  }
});

describe("heroLayout: words that do not fit say why", () => {
  const IGNITE_STEPS: HeroWords = {
    layout: "steps",
    headline: "Attended versus produced",
    figures: [
      { value: "78", label: "surveyed" },
      { value: "3", label: "built a prototype" },
    ],
  };

  it("refuses a source line taller than a short logo, naming the room there is", () => {
    // The longest source takes two lines; a 33px logo has room for one.
    const l = heroLayout({ ...IGNITE_STEPS, source: widest(HERO_CAPS.source) }, "ai-officer", UPLOADS["wide and short"]);
    expect(l.fits).toBe(false);
    expect(l.misfits).toEqual(["The source line takes 2 lines beside this brand's logo, which has room for 1; shorten it or leave it out."]);
    // The same source beside the kit's 49px logo fits.
    expect(heroLayout({ ...IGNITE_STEPS, source: widest(HERO_CAPS.source) }, "ai-officer").fits).toBe(true);
  });

  it("asks for no source at all beside a logo too short for one line", () => {
    const l = heroLayout({ ...IGNITE_STEPS, source: "Ignite" }, "edge8", { width: 2000, height: 100, mime: "image/png" });
    expect(l.misfits).toEqual(["This brand's logo is too short for a source line beside it; leave the source out."]);
  });

  it("refuses a character the width bound is not measured for", () => {
    const l = heroLayout({ ...IGNITE_STEPS, headline: "Attended versus produced 🚀" }, "ai-officer");
    expect(l.fits).toBe(false);
    expect(l.misfits).toEqual(['The headline has a character the hero cannot measure ("🚀"); use plain letters, numbers and punctuation.']);
  });

  it("refuses more figures than the layout draws", () => {
    const l = heroLayout({ ...IGNITE_STEPS, layout: "stat" }, "ai-officer");
    expect(l.fits).toBe(false);
    expect(l.misfits).toEqual(["A stat hero draws 1 figure; the words have 2."]);
  });
});

describe("heroLayout: the bars", () => {
  // The bars read each value with heroFigureNumber, the parser the words check
  // holds steps values to, so the check and the bars cannot read a value two
  // ways. A currency sign and thousands separators are the value's unit and
  // formatting, not part of its size.
  it("draws money values in proportion, read the way the words check reads them", () => {
    const l = heroLayout({ layout: "steps", headline: "Spend", figures: [{ value: "$1,250", label: "planned" }, { value: "$500", label: "spent" }] }, "edge8");
    expect(l.figures.map((f) => f.bar?.height)).toEqual([120, 48]);
  });
});

describe("heroLayout: the headline", () => {
  it("keeps a short headline at full size on one line", () => {
    const l = heroLayout({ layout: "stat", headline: "Attended versus produced", figures: [{ value: "3", label: "built a prototype" }] }, "ai-officer");
    expect(l.headline.size).toBe(60);
    expect(l.headline.lines).toBe(1);
  });

  it("steps down in size until the headline fits two lines", () => {
    // Seven wide words: at 44px only three fit a line (three lines); at 40px
    // four do, so it is drawn on two lines at 40px.
    const l = heroLayout({ layout: "row", headline: widest(HERO_CAPS.headline), figures: [{ value: "1", label: "a" }, { value: "2", label: "b" }] }, "ai-officer");
    expect(l.headline.size).toBe(40);
    expect(l.headline.lines).toBe(2);
  });
});

describe("heroLayout: the Ignite case study (regression)", () => {
  // The first real hero made in production put a caption where the logo went.
  // The same words, with the event line as the kicker, lay out clean.
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

  for (const brand of BRANDS) {
    it(`lays out clean for ${brand}`, () => {
      expectClean(heroLayout(IGNITE, brand));
    });
  }

  it("draws the AI Officer hero at the prototype's sizes, bars in proportion, the last figure in the accent", () => {
    const l = heroLayout(IGNITE, "ai-officer");
    expect(l.kicker).toMatchObject({ left: 89, top: 80, text: "EO SOUTH PACIFIC IGNITE · SYDNEY · 18 OCT 2026" });
    expect(l.headline).toMatchObject({ left: 89, top: 116, width: 1022, size: 60, lines: 1 });
    // The largest value takes the full 120px bar; 3 of 78 would be 5px, so it
    // takes the 6px floor. Every bar stands on the rule at y = 490.
    expect(l.figures.map((f) => f.bar?.height)).toEqual([120, 31, 17, 6]);
    for (const f of l.figures) expect((f.bar?.top ?? 0) + (f.bar?.height ?? 0)).toBe(490);
    expect(l.figures.map((f) => f.accent)).toEqual([false, false, false, true]);
    expect(l.source).toMatchObject({ left: 393, width: 718, align: "right" });
  });
});
