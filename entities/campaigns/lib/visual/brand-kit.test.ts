import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRAND_LOGOS,
  appLogo,
  appLogoUrl,
  builtStyles,
  channelTemplatesSchema,
  imageChoices,
  logoStoragePath,
  resolveTemplates,
  templateError,
  unbuiltLooksNote,
  uploadedLogoError,
} from "./brand-kit";
import { pngDimensions } from "./png-dimensions";

describe("brand logos", () => {
  it("has a file for each ground for both brands, at the native size it declares", () => {
    for (const [brand, grounds] of Object.entries(BRAND_LOGOS)) {
      for (const [ground, logo] of Object.entries(grounds)) {
        const bytes = readFileSync(logo.file);
        if (logo.mime === "image/png") {
          expect(pngDimensions(bytes), `${brand} ${ground}`).toEqual({ width: logo.width, height: logo.height });
        } else {
          const svg = bytes.toString("utf8");
          expect(svg, `${brand} ${ground}`).toContain(`viewBox="0 0 ${logo.width} ${logo.height}"`);
          // A logo is an image, never a document: no script or external link inside.
          expect(svg).not.toMatch(/<script|on\w+=|href=/i);
        }
      }
    }
  });

  it("picks the white Edge8 wordmark for navy and the black one for white", () => {
    expect(appLogo("edge8", "dark")?.file).toBe("public/logo-white.png");
    expect(appLogo("edge8", "light")?.file).toBe("public/logo.png");
    expect(appLogoUrl(appLogo("edge8", "light")!)).toBe("/logo.png");
  });

  it("picks the Institute's white PNG for navy and its navy SVG for white", () => {
    expect(appLogo("ai-officer", "dark")).toMatchObject({ mime: "image/png", width: 2048, height: 381 });
    expect(appLogo("ai-officer", "light")).toMatchObject({ mime: "image/svg+xml" });
  });

  it("has no logo for an unknown brand", () => {
    expect(appLogo("someone-else", "dark")).toBeNull();
    expect(appLogo("constructor", "dark")).toBeNull();
    expect(appLogo(null, "light")).toBeNull();
  });
});

describe("channel templates", () => {
  it("defaults to the Mk.2 set in the Signature style", () => {
    const t = resolveTemplates({}, "edge8");
    expect(t.blog).toEqual({ images: 1, style: "signature", from: "default" });
    expect(t.linkedin).toEqual({ images: 4, style: "signature", from: "default" });
    expect(t.facebook).toEqual({ images: 4, style: "signature", from: "default" });
    expect(t.twitter).toEqual({ images: 1, style: "signature", from: "default" });
    expect(resolveTemplates(null, "ai-officer").email).toEqual({ images: 1, style: "signature", from: "default" });
  });

  it("uses what the brand stored, channel by channel", () => {
    const t = resolveTemplates({ twitter: { images: 2, style: "signature" } }, "edge8");
    expect(t.twitter).toEqual({ images: 2, style: "signature", from: "brand" });
    expect(t.linkedin.from).toBe("default");
    expect(resolveTemplates({ linkedin: { images: 2, style: "editorial" } }, "edge8").linkedin).toEqual({ images: 2, style: "editorial", from: "brand" });
  });

  it("reads a stored value that no longer fits as the default", () => {
    expect(resolveTemplates({ blog: { images: 4, style: "signature" } }, "edge8").blog.from).toBe("default");
    expect(resolveTemplates({ linkedin: { images: 4, style: "editorial" } }, "ai-officer").linkedin.from).toBe("default");
    expect(resolveTemplates({ linkedin: { layout: 4 } }, "edge8").linkedin.from).toBe("default");
    expect(resolveTemplates("not an object", "edge8").facebook.from).toBe("default");
  });

  it("refuses counts a channel cannot take and looks the brand has not got", () => {
    expect(imageChoices("blog")).toEqual([1]);
    expect(imageChoices("linkedin")).toEqual([4, 2, 1]);
    expect(templateError("blog", { images: 2, style: "signature" }, "edge8")).toMatch(/blog takes 1/);
    expect(templateError("linkedin", { images: 2, style: "editorial" }, "ai-officer")).toBe("The Editorial look is not built for this brand yet; Signature is.");
    expect(templateError("linkedin", { images: 2, style: "editorial" }, "edge8")).toBeNull();
    expect(templateError("facebook", { images: 4, style: "campaign-set" }, "edge8")).toBeNull();
    expect(templateError("facebook", { images: 1, style: "signature" }, "ai-officer")).toBeNull();
    // A brand with no looks drawn yet can still keep the default, so saving
    // its templates never fails on a choice it did not make.
    expect(templateError("linkedin", { images: 4, style: "signature" }, "a-client")).toBeNull();
    // It is told only what is true: no look is built for it yet, so no other
    // look is offered in place of the one refused.
    expect(templateError("linkedin", { images: 4, style: "editorial" }, "a-client")).toBe("The Editorial look is not built for this brand yet, and no other look is either.");
  });

  // R3.347.1: built is per brand. Edge8 has all three looks; the Institute
  // keeps Signature until its diagonal question is decided.
  it("knows which looks each brand has drawn", () => {
    expect(builtStyles("edge8")).toEqual(["signature", "editorial", "campaign-set"]);
    expect(builtStyles("ai-officer")).toEqual(["signature"]);
    expect(builtStyles("a-client")).toEqual([]);
    expect(builtStyles(null)).toEqual([]);
  });

  it("says why a brand's other looks are greyed", () => {
    expect(unbuiltLooksNote("ai-officer", "AI Officer")).toBe("Editorial and Campaign set are not available for AI Officer yet.");
    expect(unbuiltLooksNote("edge8", "Edge8")).toBeNull();
  });

  it("stores only known channels and fields", () => {
    expect(channelTemplatesSchema.safeParse({ linkedin: { images: 4, style: "signature" } }).success).toBe(true);
    expect(channelTemplatesSchema.safeParse({ tiktok: { images: 1, style: "signature" } }).success).toBe(false);
    expect(channelTemplatesSchema.safeParse({ linkedin: { images: 3, style: "signature" } }).success).toBe(false);
    expect(channelTemplatesSchema.safeParse({ linkedin: { images: 4, style: "signature", extra: 1 } }).success).toBe(false);
  });
});

describe("uploaded logos", () => {
  const png = (w: number, h: number, size = 64) => {
    const b = new Uint8Array(size);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const v = new DataView(b.buffer);
    v.setUint32(16, w);
    v.setUint32(20, h);
    return b;
  };

  it("accepts the brand kit's own logo files", () => {
    expect(uploadedLogoError(readFileSync("public/logo-white.png"))).toBeNull();
    expect(uploadedLogoError(readFileSync("public/brands/ai-officer/logo-on-dark.png"))).toBeNull();
  });

  it("refuses anything that is not a PNG, too small, too big or not logo-shaped", () => {
    expect(uploadedLogoError(new TextEncoder().encode("<svg onload=alert(1)>"))).toMatch(/PNG/);
    expect(uploadedLogoError(png(100, 50))).toMatch(/at least 150/);
    expect(uploadedLogoError(png(3000, 100))).toMatch(/shape/);
    expect(uploadedLogoError(png(400, 200, 2 * 1024 * 1024 + 1))).toMatch(/over 2 MB/);
  });

  it("keeps each upload at its own path, so an old card's logo never changes under it", () => {
    expect(logoStoragePath("brand-1", "dark", "abc")).toBe("brands/brand-1/logo-on-dark-abc.png");
  });
});
