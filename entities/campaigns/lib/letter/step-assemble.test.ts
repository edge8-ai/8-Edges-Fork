import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StepContext } from "./types";

// Y.75. The assemble step used to fetch every page the letter links to,
// including the site's own pages. Inside a run that reached assemble by
// handing itself on over HTTP, a fetch of the site's own domain is one more
// hop through the same deployment, and Vercel answered 508 (loop detected):
// the letters of 1 Oct and 8 Oct were both lost to it. Our own pages are now
// checked from data; only another site's page is fetched.

type Rendered = { posts: { title: string; imageUrl: string | null; url: string }[]; cta: { label: string; url: string } | null; layout: string };
const rendered = vi.hoisted(() => ({ value: null as unknown as Rendered }));
vi.mock("@/entities/campaigns/lib/broadcast-blocks", () => ({
  resolveBroadcastBlocks: async () => rendered.value,
}));

const { runAssemble } = await import("./step-assemble");

const fetches: string[] = [];
let answer = 200;
const post = (url: string) => ({ title: "A post", imageUrl: "https://cdn.example/hero.png", url });
const letterWith = (posts: number, cta: { label: string; url: string } | null) =>
  ({ letter: { blocks: { posts: Array.from({ length: posts }, (_, i) => ({ id: `p${i}` })), cta, layout: "cards" } } }) as unknown as StepContext;

beforeEach(() => {
  fetches.length = 0;
  answer = 200;
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.example.com");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetches.push(url);
    return new Response("", { status: answer });
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the letter's assemble step (Y.75)", () => {
  it("never fetches the site's own pages: posts resolve from data, the button from the catalogue", async () => {
    const cta = { label: "Book a conversation", url: "https://www.example.com/contact/" };
    rendered.value = { posts: [post("https://www.example.com/post/a/"), post("https://example.com/post/b/")], cta, layout: "cards" };
    const result = await runAssemble(letterWith(2, cta));
    expect(result).toMatchObject({ ok: true });
    expect(fetches).toEqual([]);
  });

  it("refuses a button on the site's own domain that is not a page in the catalogue", async () => {
    const cta = { label: "Old page", url: "https://www.example.com/gone/" };
    rendered.value = { posts: [post("https://www.example.com/post/a/")], cta, layout: "cards" };
    const result = await runAssemble(letterWith(1, cta));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("not one of the letter's call to action pages") });
    expect(fetches).toEqual([]);
  });

  it("still fetches another site's page, and names its answer when it fails", async () => {
    vi.stubEnv("LETTER_CTA_LINKEDIN_URL", "https://www.linkedin.com/in/someone/");
    const cta = { label: "Follow me on LinkedIn", url: "https://www.linkedin.com/in/someone/" };
    rendered.value = { posts: [post("https://ai-officer.example/post/c/")], cta, layout: "cards" };
    answer = 404;
    const result = await runAssemble(letterWith(1, cta));
    expect(fetches).toEqual([
      "https://www.linkedin.com/in/someone/",
      "https://www.linkedin.com/in/someone/",
      "https://ai-officer.example/post/c/",
      "https://ai-officer.example/post/c/",
    ]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("did not answer (answered 404)") });
  });

  it("keeps the data checks: a post that no longer resolves, a missing hero, no button", async () => {
    rendered.value = { posts: [{ title: "No hero", imageUrl: null, url: "https://www.example.com/post/a/" }], cta: null, layout: "cards" };
    const result = await runAssemble(letterWith(2, null));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("1 picked post(s) no longer resolve") });
    expect((result as { error: string }).error).toContain('"No hero" has no hero image.');
    expect((result as { error: string }).error).toContain("No call to action.");
  });
});
