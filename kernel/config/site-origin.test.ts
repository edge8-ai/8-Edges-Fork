import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `next/headers` only works inside a request scope, so the test substitutes
// a controllable header bag. Each case sets the headers it needs; the rest
// of the function (env fallback, vercel.app exclusion, proto inference) is
// exercised through the public export only.
const headerBag = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerBag.get(name) ?? null }),
}));

import { getSiteOrigin } from "@/kernel/config/site-origin";

describe("getSiteOrigin", () => {
  const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    headerBag.clear();
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
  });

  it("builds the origin from the request host and forwarded proto", async () => {
    headerBag.set("host", "example.com");
    headerBag.set("x-forwarded-proto", "https");
    expect(await getSiteOrigin()).toBe("https://example.com");
  });

  it("infers http for localhost when no proto header is present", async () => {
    headerBag.set("host", "localhost:3000");
    expect(await getSiteOrigin()).toBe("http://localhost:3000");
  });

  it("infers https for a non-localhost host when no proto header is present", async () => {
    headerBag.set("host", "www.example.com");
    expect(await getSiteOrigin()).toBe("https://www.example.com");
  });

  it("falls back to NEXT_PUBLIC_SITE_URL when there is no host header", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
    expect(await getSiteOrigin()).toBe("https://preview.example.com");
  });

  // There is no production-domain fallback any more, deliberately: it was the
  // upstream's own domain, so an unconfigured fork built every link, QR code and
  // ticket URL on someone else's site — and they worked, which is why nobody
  // noticed. Empty is the honest answer to "no host, no configuration".
  it("returns empty when neither host nor env is set", async () => {
    expect(await getSiteOrigin()).toBe("");
  });

  it("treats a *.vercel.app host as the no-request case", async () => {
    headerBag.set("host", "edge8-web-abc123.vercel.app");
    headerBag.set("x-forwarded-proto", "https");
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.example.com";
    expect(await getSiteOrigin()).toBe("https://www.example.com");
  });

  it("returns empty for an empty NEXT_PUBLIC_SITE_URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(await getSiteOrigin()).toBe("");
  });
});

