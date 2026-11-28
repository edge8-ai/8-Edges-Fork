import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJsonMessage } from "@/kernel/ai/testing/fake-message";
import type { HeroWords } from "./visual/hero-shape";

// Generate on a blog post or an email, end to end through the one maker every
// screen and the writer call (spec: "The code-drawn hero", R3.350.3). The model,
// the database and storage are the outside world here; the words are checked,
// laid out and drawn for real, and the version row the maker records is what
// the test reads. Prior art: ./ai/card-words.test.ts and the image set's tests.

const { post, brand, uploads, versions, live, model } = vi.hoisted(() => ({
  // The marketing_content row Generate is pressed on.
  post: {
    // The production regression the card was opened for: the Ignite figures.
    copy: "We ran the AI Officer checklist live at Ignite last week. 78 people surveyed. 20 started the checklist. 11 finished all nine steps. 3 built a prototype before the session closed. Most of the room stopped before anything was built.",
    channel: "blog" as string,
    brandId: "brand-1" as string | null,
    brief: null as string | null,
  },
  brand: { read: null as unknown },
  uploads: [] as { path: string; body: Buffer; contentType: string }[],
  versions: [] as Record<string, unknown>[],
  live: { refusal: null as string | null },
  // Each answer the model gives, in turn, and every request it was sent.
  model: { replies: [] as unknown[], requests: [] as { model: string; messages: { content: string }[] }[] },
}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({
            data: { id, title: "What Ignite taught us", channel: post.channel, brand_id: post.brandId, copy_md: post.copy, image_brief_md: post.brief },
            error: null,
          }),
        }),
      }),
      insert: async () => ({ error: null }),
    }),
  },
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string, body: Buffer, opts: { contentType: string }) => {
          uploads.push({ path, body, contentType: opts.contentType });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example.test/${path}` } }),
      }),
    },
  },
}));
vi.mock("@/entities/campaigns/lib/brand-profiles", () => ({ readBrandProfile: async () => brand.read }));
vi.mock("@/entities/campaigns/lib/blog-live-edit", () => ({ liveEditRefusal: async () => live.refusal }));
vi.mock("@/entities/campaigns/lib/marketing-images", () => ({
  recordAssetImage: async (row: Record<string, unknown>) => (versions.push(row), { ok: true }),
}));
// The real gateway resolves the site's model from the registry; only the
// client that would reach Anthropic is replaced.
vi.mock("@/kernel/ai/gateway", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/kernel/ai/gateway")>();
  return {
    ...real,
    aiSite: (decl: Parameters<typeof real.aiSite>[0]) => ({
      ...real.aiSite(decl),
      clientIfConfigured: () => ({
        messages: {
          create: async (body: { model: string; messages: { content: string }[] }) => {
            model.requests.push(body);
            return fakeJsonMessage(model.replies.shift());
          },
        },
      }),
    }),
  };
});

const { makePostImages, redrawPostHero } = await import("./post-images");
const { parseImageCard } = await import("./visual/image-card");
const { decodePng, encodePng } = await import("./visual/brand-grade");

// The Ignite words, with the event line as the kicker rather than a caption
// over the logo corner.
const IGNITE = {
  layout: "steps",
  kicker: "Live at Ignite",
  headline: "Most stop before the prototype",
  figures: [
    { value: "78", label: "surveyed" },
    { value: "20", label: "started the checklist" },
    { value: "11", label: "finished all nine steps" },
    { value: "3", label: "built a prototype" },
  ],
};
// A figure the post never states: the check sends it back, and it comes back.
const INVENTED = { ...IGNITE, figures: [...IGNITE.figures.slice(0, 3), { value: "40", label: "built a prototype" }] };

const profile = { brandId: "brand-1", brandSlug: "ai-officer", brandName: "Harbour Learning Institute", logoOnDarkPath: null, logoOnLightPath: null };

beforeEach(() => {
  post.channel = "blog";
  post.brandId = "brand-1";
  post.brief = null;
  brand.read = { ok: true, profile };
  uploads.length = 0;
  versions.length = 0;
  live.refusal = null;
  model.replies.length = 0;
  model.requests.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Generate on a blog post or an email", () => {
  it("records one kept, selected hero whose card holds the words, written by Opus", async () => {
    post.brief = "Point: most of the room stopped before building.\nFigures: 78, 20, 11, 3.\nLayout: steps.";
    model.replies.push(IGNITE);
    const r = await makePostImages({ id: "post-1", channel: "blog" }, { createdBy: "marketer@example.test" });

    expect(r).toEqual({ ok: true, url: expect.stringMatching(/^https:\/\/cdn\.example\.test\/entries\/post-1\/hero\/.+\.png$/) });
    expect(uploads).toHaveLength(1);
    expect(uploads[0].contentType).toBe("image/png");
    const png = decodePng(uploads[0].body);
    expect([png.width, png.height]).toEqual([1200, 675]);

    expect(versions).toHaveLength(1);
    const v = versions[0];
    expect(v).toMatchObject({ entryId: "post-1", url: r.ok && r.url, model: "claude-opus-5-5", createdBy: "marketer@example.test" });
    // The brief Opus was given is the prompt the version was made from.
    expect(v.promptUsed).toBe(post.brief);
    expect(model.requests[0].messages[0].content).toContain("Layout: steps.");
    // The card is read back as a hero, with the checked words in it.
    expect(parseImageCard(v.card)).toMatchObject({ kind: "hero", brand: "ai-officer", channel: "blog", width: 1200, height: 675, art: "code", words: IGNITE });
  }, 60_000);

  it("draws the email banner the same way, and records an empty prompt when there was no brief", async () => {
    post.channel = "email";
    post.brandId = "brand-1";
    brand.read = { ok: true, profile: { ...profile, brandSlug: "edge8", brandName: "Edge8" } };
    model.replies.push(IGNITE);
    const r = await makePostImages({ id: "post-2", channel: "email" });
    expect(r.ok).toBe(true);
    expect(versions).toHaveLength(1);
    expect(versions[0].promptUsed).toBe("");
    expect(parseImageCard(versions[0].card)).toMatchObject({ kind: "hero", brand: "edge8", channel: "email" });
  }, 60_000);

  it("refuses a post with no brand before the model is asked", async () => {
    post.brandId = null;
    expect(await makePostImages({ id: "post-1", channel: "blog" })).toEqual({ ok: false, error: "Set a brand on this post first, so its hero takes the brand's colours." });
    expect(model.requests).toHaveLength(0);
    expect(uploads).toHaveLength(0);
    expect(versions).toHaveLength(0);
  });

  it("refuses a live post on a gated campaign before the model is asked", async () => {
    live.refusal = "This post is live on a gated campaign; its hero stays as published.";
    expect(await makePostImages({ id: "post-1", channel: "blog" })).toEqual({ ok: false, error: live.refusal });
    expect(model.requests).toHaveLength(0);
    expect(versions).toHaveLength(0);
  });

  it("refuses a brand with no hero colours before the model is asked", async () => {
    brand.read = { ok: true, profile: { ...profile, brandSlug: "a-client", brandName: "A Client" } };
    expect(await makePostImages({ id: "post-1", channel: "blog" })).toEqual({ ok: false, error: expect.stringMatching(/no hero colours yet/) });
    expect(model.requests).toHaveLength(0);
  });

  it("records nothing when the answer fails its checks twice", async () => {
    model.replies.push(INVENTED, INVENTED);
    const r = await makePostImages({ id: "post-1", channel: "blog" });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/still break the rules after one retry/) });
    expect(model.requests).toHaveLength(2);
    expect(uploads).toHaveLength(0);
    expect(versions).toHaveLength(0);
  });
});

// R3.351: a marketer edits the selected hero's words and redraws them. The
// words pass the model's checks against the same post, and no model is called.
describe("Edit words and redraw", () => {
  const EDITED: HeroWords = { ...IGNITE, layout: "steps", headline: "Three of 78 built something" };

  it("records a new selected hero from the edited words, with no model and no prompt", async () => {
    const r = await redrawPostHero({ id: "post-1", channel: "blog" }, EDITED, { createdBy: "marketer@example.test" });
    expect(r).toEqual({ ok: true, url: expect.stringMatching(/^https:\/\/cdn\.example\.test\/entries\/post-1\/hero\/.+\.png$/) });
    expect(model.requests).toHaveLength(0);
    expect(uploads).toHaveLength(1);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ entryId: "post-1", promptUsed: null, model: null, createdBy: "marketer@example.test" });
    expect(parseImageCard(versions[0].card)).toMatchObject({ kind: "hero", brand: "ai-officer", channel: "blog", words: EDITED });
  }, 60_000);

  it("names every failure at once and draws nothing when the words break the checks", async () => {
    const words: HeroWords = { ...EDITED, headline: "x".repeat(49), figures: [...IGNITE.figures.slice(0, 3), { value: "40", label: "built a prototype" }] };
    expect(await redrawPostHero({ id: "post-1", channel: "blog" }, words)).toEqual({
      ok: false,
      error: "These words were not drawn: fix the problems listed.",
      failures: expect.arrayContaining([
        "The headline is 49 characters; it takes 48 at most.",
        'Figure 4\'s value "40" is not in the post. Use a number the post states, as it states it.',
      ]),
    });
    expect(model.requests).toHaveLength(0);
    expect(uploads).toHaveLength(0);
    expect(versions).toHaveLength(0);
  });

  it("refuses a live post on a gated campaign, and a social post, before anything is drawn", async () => {
    live.refusal = "This post is live on a gated campaign; its hero stays as published.";
    expect(await redrawPostHero({ id: "post-1", channel: "blog" }, EDITED)).toEqual({ ok: false, error: live.refusal });
    live.refusal = null;
    expect(await redrawPostHero({ id: "post-1", channel: "linkedin" }, EDITED)).toEqual({ ok: false, error: expect.stringMatching(/Only a blog post's or an email's hero/) });
    expect(uploads).toHaveLength(0);
    expect(versions).toHaveLength(0);
  });
});

describe("Generate for a brand with an uploaded logo", () => {
  // A very wide, short wordmark: drawn 264 x 13, too short for even one source
  // line beside it. The words are checked against this logo before anything
  // is drawn, so a source line goes back to Opus with the reason, not to the
  // renderer to refuse after the model was paid.
  const UPLOAD = "brands/brand-1/logo-on-dark.png";
  const WIDE_LOGO = encodePng({ width: 1000, height: 50, rgb: Buffer.alloc(1000 * 50 * 3, 255) });
  const WITH_SOURCE = { ...IGNITE, source: "AI Journey survey and the session checklist" };

  beforeEach(() => {
    brand.read = { ok: true, profile: { ...profile, logoOnDarkPath: UPLOAD } };
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(WIDE_LOGO)));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends words that do not fit beside the logo back to Opus once, and draws the answer that does", async () => {
    model.replies.push(WITH_SOURCE, IGNITE);
    const r = await makePostImages({ id: "post-1", channel: "blog" });
    expect(r.ok).toBe(true);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1].messages[0].content).toContain("This brand's logo is too short for a source line beside it; leave the source out.");
    expect(versions).toHaveLength(1);
    const card = parseImageCard(versions[0].card);
    expect(card).toMatchObject({ kind: "hero", logo: UPLOAD, words: IGNITE });
  }, 60_000);

  it("records nothing when the retry still does not fit", async () => {
    model.replies.push(WITH_SOURCE, WITH_SOURCE);
    const r = await makePostImages({ id: "post-1", channel: "blog" });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/still break the rules after one retry: This brand's logo is too short for a source line/) });
    expect(uploads).toHaveLength(0);
    expect(versions).toHaveLength(0);
  });

  it("refuses edited words that do not fit beside the logo, with the layout's reason", async () => {
    const r = await redrawPostHero({ id: "post-1", channel: "blog" }, { ...WITH_SOURCE, layout: "steps" });
    expect(r).toEqual({ ok: false, error: expect.any(String), failures: expect.arrayContaining(["This brand's logo is too short for a source line beside it; leave the source out."]) });
    expect(model.requests).toHaveLength(0);
    expect(uploads).toHaveLength(0);
  });
});
