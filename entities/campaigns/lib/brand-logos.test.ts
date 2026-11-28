import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The brand's logo file for a code-drawn picture (S8): an upload is fetched
// with a time limit, and one that cannot be read is an error the marketer
// fixes, never a file quietly swapped. Storage is the outside world here.
vi.mock("@/kernel/data/supabase", () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.example.test/${p}` } }) }) } },
}));

import { appLogo } from "@/entities/campaigns/lib/visual/brand-kit";
import { brandLogoFile } from "./brand-logos";

// A PNG header at the given size: all the logo reader looks at.
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const fetchMock = vi.fn();
const edge8 = { brandSlug: "edge8", logoOnDarkPath: "brands/b1/logo-on-dark.png", logoOnLightPath: "brands/b1/logo-on-light.png" };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("brandLogoFile", () => {
  it("fetches the ground's upload with a time limit", async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array(pngHeader(400, 100))));
    const file = await brandLogoFile(edge8, "dark");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("logo-on-dark");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(file).toEqual({ ok: true, logo: expect.objectContaining({ width: 400, height: 100, mime: "image/png" }), source: edge8.logoOnDarkPath });
  });

  it("uses the brand kit's file when there is no upload", async () => {
    const kit = appLogo("edge8", "dark")!;
    const file = await brandLogoFile({ ...edge8, logoOnDarkPath: null }, "dark");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(file).toEqual({ ok: true, logo: expect.objectContaining({ width: kit.width, height: kit.height }), source: "brand kit" });
  });

  it("says an upload that took too long could not be read", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    expect(await brandLogoFile(edge8, "dark")).toEqual({ ok: false, error: expect.stringContaining("The uploaded logo could not be read (it took too long)") });
  });
});
