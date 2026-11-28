import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { carouselPdf } from "./carousel-pdf";
import { encodePng } from "./brand-grade";

// A solid-colour slide at a given size.
const slide = (width: number, height: number, rgb: [number, number, number]) => {
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) px.set(rgb, i * 3);
  return encodePng({ width, height, rgb: px });
};

describe("carouselPdf", () => {
  const slides = [slide(108, 135, [4, 16, 45]), slide(108, 135, [40, 123, 232]), slide(108, 135, [255, 255, 255]), slide(108, 135, [111, 242, 193])];
  const pdf = carouselPdf(slides);
  const text = pdf.toString("latin1");

  it("is a PDF with one page per slide, each the slide's own size", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Pages /Kids [3 0 R 6 0 R 9 0 R 12 0 R] /Count 4");
    expect(text.match(/\/MediaBox \[0 0 108 135\]/g)).toHaveLength(4);
  });

  it("points every cross-reference entry at its object", () => {
    const start = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const entries = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(14);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("keeps each slide's pixels, in order", () => {
    const streams = [...text.matchAll(/\/Subtype \/Image [^>]*\/Length (\d+) >>\nstream\n/g)];
    expect(streams).toHaveLength(4);
    const first = streams[0];
    const at = first.index! + first[0].length;
    const rgb = inflateSync(pdf.subarray(at, at + Number(first[1])));
    expect(rgb.length).toBe(108 * 135 * 3);
    expect([...rgb.subarray(0, 3)]).toEqual([4, 16, 45]);
  });

  it("refuses an empty set", () => {
    expect(() => carouselPdf([])).toThrow(/at least one slide/);
  });
});
