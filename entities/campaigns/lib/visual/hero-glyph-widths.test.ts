import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HERO_STYLES, type HeroBrand } from "./hero-layout";
import { HERO_MEASURED_RANGES, charEm, kickerEm } from "./hero-metrics";
import { FONT_FILES, type FontFamily } from "./looks";

// The hero layout fits text by an upper bound on each character's width
// (charEm, and kickerEm for the kicker), never by drawing it. This proves the
// bound against the fonts the hero ships: for every character the bound is
// claimed for, in every font file a brand's hero loads, the glyph's advance
// width is at most the bound. A character a font lacks is drawn by another
// font the renderer loaded, or as that font's missing-glyph box, so both are
// held to the bound too. Kerning is not counted.
//
// No font library is a dependency, so the three tables needed (head for the
// em size, hmtx for the advances, cmap format 4 for the character map) are
// read here directly.

type Font = { upem: number; advance: (glyph: number) => number; glyph: (cp: number) => number | undefined };

function readFont(file: string): Font {
  const buf = readFileSync(file);
  const tables = new Map<string, number>();
  for (let i = 0; i < buf.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    tables.set(buf.toString("latin1", at, at + 4), buf.readUInt32BE(at + 8));
  }
  const table = (tag: string) => {
    const at = tables.get(tag);
    if (at === undefined) throw new Error(`${file} has no ${tag} table`);
    return at;
  };
  const upem = buf.readUInt16BE(table("head") + 18);
  const metrics = buf.readUInt16BE(table("hhea") + 34);
  const hmtx = table("hmtx");
  // Glyphs past the last full metric share its advance.
  const advance = (glyph: number) => buf.readUInt16BE(hmtx + 4 * Math.min(glyph, metrics - 1));

  // The Unicode BMP subtable (platform 3 encoding 1, or platform 0), format 4.
  const cmap = table("cmap");
  let sub = -1;
  for (let i = 0; i < buf.readUInt16BE(cmap + 2); i++) {
    const at = cmap + 4 + i * 8;
    const platform = buf.readUInt16BE(at);
    const encoding = buf.readUInt16BE(at + 2);
    const offset = cmap + buf.readUInt32BE(at + 4);
    if (buf.readUInt16BE(offset) === 4 && ((platform === 3 && encoding === 1) || platform === 0)) sub = offset;
  }
  if (sub < 0) throw new Error(`${file} has no format 4 cmap`);
  const segs = buf.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const ranges = deltas + segs * 2;
  const glyph = (cp: number) => {
    for (let i = 0; i < segs; i++) {
      const end = buf.readUInt16BE(ends + i * 2);
      if (cp > end) continue;
      const start = buf.readUInt16BE(starts + i * 2);
      if (cp < start) return undefined;
      const delta = buf.readInt16BE(deltas + i * 2);
      const range = buf.readUInt16BE(ranges + i * 2);
      if (range === 0) return (cp + delta) & 0xffff || undefined;
      const g = buf.readUInt16BE(ranges + i * 2 + range + 2 * (cp - start));
      return g === 0 ? undefined : (g + delta) & 0xffff;
    }
    return undefined;
  };
  return { upem, advance, glyph };
}

const fileFor = (family: FontFamily, weight: number) => {
  const f = FONT_FILES[family].find((x) => x.weight === weight);
  if (!f) throw new Error(`no ${family} ${weight} in FONT_FILES`);
  return f.file;
};

// Every character the bound is claimed for.
const MEASURED = HERO_MEASURED_RANGES.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)));

// What the renderer loads for a brand: every weight of each family its hero
// uses (render-hero.ts loads them all), any of which may draw a missing glyph.
function loadedFonts(brand: HeroBrand): { file: string; font: Font }[] {
  const { display, body, small } = HERO_STYLES[brand].fonts;
  return [...new Set([display, body, small])].flatMap((family) => FONT_FILES[family].map(({ file }) => ({ file, font: readFont(file) })));
}

// The widest a character can be drawn when `primary` is asked for it: its own
// glyph, or, when it has none, any loaded font's glyph or missing-glyph box.
function drawnEm(c: string, primary: Font, loaded: Font[]): number {
  const cp = c.codePointAt(0)!;
  const own = primary.glyph(cp);
  if (own !== undefined) return primary.advance(own) / primary.upem;
  return Math.max(...loaded.map((f) => f.advance(f.glyph(cp) ?? 0) / f.upem));
}

const BRANDS: HeroBrand[] = ["ai-officer", "edge8"];

describe("the hero layout's width bound holds for the shipped fonts", () => {
  for (const brand of BRANDS) {
    const { display, body, small, smallWeight } = HERO_STYLES[brand].fonts;
    // The headline and the values are display 800; the labels and the source
    // are body 500; the kicker is the small face at its weight.
    const roles = [
      { role: "headline and values", family: display, weight: 800, bound: charEm },
      { role: "labels and source", family: body, weight: 500, bound: charEm },
      { role: "kicker", family: small, weight: smallWeight, bound: kickerEm(small) },
    ];
    for (const { role, family, weight, bound } of roles) {
      it(`${brand}: ${role} (${family} ${weight})`, () => {
        const loaded = loadedFonts(brand).map((f) => f.font);
        const primary = readFont(fileFor(family, weight));
        const over = MEASURED.filter((c) => drawnEm(c, primary, loaded) > bound(c)).map(
          (c) => `${JSON.stringify(c)} U+${c.codePointAt(0)!.toString(16)} ${drawnEm(c, primary, loaded).toFixed(3)} > ${bound(c)}`,
        );
        expect(over).toEqual([]);
      });
    }
  }
});
