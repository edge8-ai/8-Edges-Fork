import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "@/kernel/config/palette";

// The exhibit renderer is the one place SVG becomes a PNG the marketing bucket
// accepts. These tests render a real fixture through resvg (no mock: the point
// is that the native module and the bundled fonts work) and check the upload
// path and payload against a scripted storage client.

const uploads: { bucket: string; path: string; bytes: number; contentType: string }[] = [];
let uploadError: { message: string } | null = null;

vi.mock("@/kernel/data/supabase", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer, opts: { contentType: string }) => {
          uploads.push({ bucket, path, bytes: body.length, contentType: opts.contentType });
          return { error: uploadError };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
      }),
    },
  },
  companyOs: {},
  htt: {},
}));

const { renderExhibitPng, uploadExhibit, pngSize, EXHIBIT_WIDTH } = await import("./exhibits");

const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="${PALETTE.canvas}"/>
  <rect x="80" y="120" width="120" height="250" fill="${PALETTE.blue}"/>
  <rect x="280" y="200" width="120" height="170" fill="${PALETTE.mint}"/>
  <text x="80" y="80" font-family="Manrope" font-size="28" fill="${PALETTE.dark}">Human hours per feature</text>
</svg>`;

describe("renderExhibitPng", () => {
  it("renders a 16:9 fixture to a PNG at the exhibit width, height following the ratio", async () => {
    const png = await renderExhibitPng(FIXTURE);
    expect(pngSize(png)).toEqual({ width: EXHIBIT_WIDTH, height: 900 });
    // A real raster, not a placeholder: a 1600x900 PNG with two bars and a
    // line of text is comfortably larger than a blank one.
    expect(png.length).toBeGreaterThan(5_000);
  });

  it("honours a caller's width", async () => {
    const png = await renderExhibitPng(FIXTURE, 400);
    expect(pngSize(png)).toEqual({ width: 400, height: 225 });
  });

  it("throws on malformed SVG", async () => {
    await expect(renderExhibitPng("<svg><rect")).rejects.toThrow();
  });
});

describe("uploadExhibit", () => {
  it("stores the PNG under the entry's exhibits folder and returns its public URL and size", async () => {
    uploads.length = 0;
    const r = await uploadExhibit("entry-1", FIXTURE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("marketing");
    expect(uploads[0].path).toMatch(/^entries\/entry-1\/exhibits\/[0-9a-f-]{36}\.png$/);
    expect(uploads[0].contentType).toBe("image/png");
    expect(r.url).toBe(`https://cdn.test/marketing/${uploads[0].path}`);
    expect(r.width).toBe(EXHIBIT_WIDTH);
    expect(r.height).toBe(900);
  });

  it("returns the storage error instead of throwing", async () => {
    uploadError = { message: "bucket refused" };
    const r = await uploadExhibit("entry-1", FIXTURE);
    uploadError = null;
    expect(r).toEqual({ ok: false, error: "bucket refused" });
  });

  it("returns a readable error for SVG that does not render", async () => {
    const r = await uploadExhibit("entry-1", "not svg at all");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Exhibit SVG did not render/);
  });
});

describe("pngSize", () => {
  it("returns null for anything that is not a PNG", () => {
    expect(pngSize(Buffer.from("hello"))).toBeNull();
  });
});
