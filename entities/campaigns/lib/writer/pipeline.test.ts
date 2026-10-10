import { beforeEach, describe, expect, it, vi } from "vitest";
import * as F from "./fixtures/pipeline";

// The pipeline end to end against recorded model output: a fixture campaign
// runs steps 1 to 8 through advance(), one call per step, and every check in
// the process table has a test that proves it blocks. The data layer is an
// in-memory store standing in for ./data; the model is a fake whose reply is
// chosen by the task each step's system prompt names, read through the real
// readTextOutput so usage accounting runs too.

type Campaign = {
  id: string; name: string; idea: string | null; objective: string | null; brandId: string | null; pillarId: string | null;
  startsOn: string | null; writerStep: string | null; writerStartedAt: string | null; writerError: string | null; status?: string; endsOn?: string | null;
  seoGeoMd: string | null;
};
type Blog = { id: string; title: string; copyMd: string | null; seoMd: string | null; imageUrl: string | null; imageBriefMd: string | null; notes: string | null; status: string; postedUrl: string | null; publishDate?: string | null };
type Asset = { id: string; channel: string; status: string; imageUrl: string | null };

const store: { campaign: Campaign; blog: Blog | null; assets: Asset[]; takenSlugs: Set<string>; heroSelects: boolean; channelImages: boolean; ledger: F.Ledger[] } = {
  campaign: null as unknown as Campaign,
  blog: null,
  assets: [],
  takenSlugs: new Set(),
  heroSelects: true,
  channelImages: true,
  ledger: [],
};

// blog-publish (reached through the validate step) builds the service-role
// client at import; Node 20 in CI refuses that without native WebSocket, and
// nothing here should touch a database anyway.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));

vi.mock("./data", () => ({
  moveWriterStateFrom: async (_id: string, from: string | null, s: { step: string; error: null; startedAt: string }) => {
    if (store.campaign.writerStep !== from) return { ok: true, moved: false };
    Object.assign(store.campaign, { writerStep: s.step, writerError: s.error, writerStartedAt: s.startedAt });
    return { ok: true, moved: true };
  },
  loadCampaign: async () => ({ ok: true, data: { ...store.campaign } }),
  setWriterState: async (_id: string, s: { step: string | null; error: string | null; startedAt?: string | null }) => {
    store.campaign.writerStep = s.step;
    store.campaign.writerError = s.error;
    if (s.startedAt !== undefined) store.campaign.writerStartedAt = s.startedAt;
    return { ok: true };
  },
  loadBlogAsset: async () => (store.blog ? { ok: true, data: { ...store.blog } } : { ok: false, error: "The campaign has no blog asset yet." }),
  updateBlogAsset: async (_id: string, fields: Record<string, string>) => {
    if (!store.blog) return { ok: false, error: "no blog" };
    if ("copy_md" in fields) store.blog.copyMd = fields.copy_md;
    if ("seo_md" in fields) store.blog.seoMd = fields.seo_md;
    if ("notes" in fields) store.blog.notes = fields.notes;
    if ("title" in fields) store.blog.title = fields.title;
    return { ok: true };
  },
  appendBlogNotes: async (_b: Blog, heading: string, lines: string[]) => {
    store.blog!.notes = `${store.blog!.notes ?? ""}\n## ${heading}\n${lines.map((l) => `- ${l}`).join("\n")}`;
    return { ok: true };
  },
  slugTaken: async (slug: string) => store.takenSlugs.has(slug),
  loadBrandLedger: async () => ({ ok: true, data: store.ledger.map((r) => ({ ...r })) }),
  listCampaignAssets: async () => ({ ok: true, data: store.assets.map((a) => ({ ...a })) }),
  approveChannelAssets: async () => {
    for (const a of store.assets) if (a.channel !== "blog" && a.status === "drafted") a.status = "approved";
    return { ok: true };
  },
  scheduleBlogAsset: async () => {
    if (!store.blog) return { ok: false, error: "no blog" };
    store.blog.status = "scheduled";
    return { ok: true };
  },
  finishCampaign: async (_id: string, endsOn: string) => {
    store.campaign.status = "done";
    store.campaign.endsOn = endsOn;
    return { ok: true };
  },
}));

vi.mock("@/entities/campaigns/lib/brand-profiles", () => ({
  getBrandProfile: async () => ({ ...F.PROFILE, ...profileOverride }),
}));
let profileOverride: Partial<Record<keyof typeof F.PROFILE, string | string[] | boolean | null>> = {};

let writerOutputs: unknown[] = F.WRITER_OUTPUTS;
vi.mock("@/entities/campaigns/lib/ai/brand-writer", () => ({
  writeForBrand: async () => ({ ok: true, outputs: writerOutputs }),
}));
vi.mock("@/entities/campaigns/lib/calendar-drafting", () => ({
  storeCampaignOutputs: async ({ outputs }: { outputs: typeof F.WRITER_OUTPUTS }) => {
    storedOutputs.push(outputs.map((o) => o.channel));
    const blog = outputs.find((o) => o.channel === "blog");
    if (blog) store.blog = { id: "blog-1", title: blog.title!, copyMd: blog.bodyMd, seoMd: blog.seoMd ?? null, imageUrl: null, imageBriefMd: blog.imageBriefMd ?? null, notes: null, status: "drafted", postedUrl: null };
    for (const o of outputs) {
      if (!store.assets.some((a) => a.channel === o.channel)) store.assets.push({ id: `${o.channel}-1`, channel: o.channel, status: "drafted", imageUrl: null });
    }
    return { failed: [] };
  },
}));
vi.mock("@/entities/campaigns/lib/ai/brand-image", () => ({
  HERO_ASPECT_RATIO: "16:9",
  generateEntryImage: async (id: string, opts: { aspectRatio?: string }) => {
    if (id === "blog-1") {
      heroCalls.push(opts.aspectRatio ?? "default");
      const url = "https://cdn.test/marketing/entries/blog-1/hero.png";
      if (store.heroSelects) store.blog!.imageUrl = url;
      return { ok: true, url };
    }
    const asset = store.assets.find((a) => a.id === id);
    if (asset && store.channelImages) asset.imageUrl = `https://cdn.test/marketing/entries/${id}/image.png`;
    return { ok: true, url: `https://cdn.test/marketing/entries/${id}/image.png` };
  },
}));
const heroCalls: string[] = [];
const storedOutputs: string[][] = [];
const uploads: string[] = [];
vi.mock("@/entities/campaigns/lib/exhibits", () => ({
  uploadExhibit: async (_id: string, svg: string) => {
    uploads.push(svg);
    return { ok: true, url: `https://cdn.test/marketing/entries/blog-1/exhibits/${uploads.length}.png`, width: 1600, height: 900 };
  },
}));
// The site door is mocked whole: importing the real barrel builds a Supabase
// client, which Node 20 (CI) refuses without native WebSocket. The renderer is
// the site's own pipeline spelled out against the real POST_HTML_SCHEMA, so the
// assemble step's "sanitizer keeps every block" check runs against the real
// allow-list.
vi.mock("@/entities/site", async () => {
  const [{ remark }, { toHast }, { raw }, { sanitize }, { toHtml }, { POST_HTML_SCHEMA }] = await Promise.all([
    import("remark"),
    import("mdast-util-to-hast"),
    import("hast-util-raw"),
    import("hast-util-sanitize"),
    import("hast-util-to-html"),
    import("@/kernel/config/post-html-schema"),
  ]);
  return {
    categories: [],
    renderPostMarkdown: async (md: string) => toHtml(sanitize(raw(toHast(remark().parse(md), { allowDangerousHtml: true })), POST_HTML_SCHEMA)),
  };
});

// blog-publish (reached through validate) imports the cache tags from here;
// nothing in the pipeline reads posts through it any more.
vi.mock("../blog", () => ({ BLOG_CACHE_TAG: "blog", postTag: (slug: string) => `post:${slug}` }));

// The fake model: pick the reply by the task the system prompt names.
const replies: Record<string, () => unknown> = {};
const modelCalls: string[] = [];
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({
    messages: {
      create: async (req: { system: string }) => {
        const key = Object.keys(replies).find((k) => req.system.includes(k))!;
        modelCalls.push(key);
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(replies[key]()) }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        };
      },
    },
  }),
}));

// The Publish approval (Y.16): the primitive and the parked-run rows as an
// in-memory fake with their rules, and the effect ledger as a set of keys, so
// the approval path runs through the real advance and publish step.
vi.mock("@/kernel/approvals/requests", async () => (await import("../testing/approvals-fake")).requestsFake);
vi.mock("@/kernel/approvals/waiting", async () => (await import("../testing/approvals-fake")).waitingFake);
vi.mock("@/kernel/audit/parked-runs", async () => (await import("../testing/approvals-fake")).parksFake);
const effectKeys = new Set<string>();
vi.mock("@/kernel/audit/effects", () => ({
  once: async (key: string, _kind: string, act: () => Promise<{ ok: boolean; error?: string }>) => {
    if (effectKeys.has(key)) return { acted: false, reason: `${key} is already claimed or done` };
    effectKeys.add(key);
    return { acted: true, outcome: await act(), attempt: 1 };
  },
}));

const publishBlogAsset = vi.fn();
vi.mock("@/entities/campaigns/lib/blog-publish", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, publishBlogAsset: (id: string, actor: string) => publishBlogAsset(id, actor) };
});

const { advance, startWriterRun } = await import("./advance");
const { approvePublish, reaskPublish } = await import("./publish-approval");
const { blogVersion } = await import("../blog-version");
const { approvalsFor, fake, resetApprovalsFake } = await import("../testing/approvals-fake");

function resetReplies() {
  replies["You are the editor"] = () => F.EDIT_REPLY;
  replies["search and AI-search package"] = () => F.SEO_REPLY;
  replies["Propose two or three exhibits"] = () => F.EXHIBITS_REPLY;
  replies["Choose two to four published posts"] = () => F.LINKS_REPLY;
  replies["Two things for the post"] = () => F.ASSEMBLE_REPLY;
  replies["The blog post below is final; it goes live"] = () => F.CHANNELS_REPLY;
}

beforeEach(() => {
  store.campaign = {
    id: "camp-1", name: "The Smarter the Model", idea: F.IDEA, objective: "Ship the post", brandId: "brand-1", pillarId: null,
    startsOn: "2026-09-08", writerStep: null, writerStartedAt: null, writerError: null, seoGeoMd: F.PLAN_MD,
  };
  store.blog = null;
  store.assets = [];
  store.takenSlugs = new Set();
  store.ledger = F.LEDGER.map((r) => ({ ...r }));
  store.heroSelects = true;
  store.channelImages = true;
  storedOutputs.length = 0;
  publishBlogAsset.mockReset();
  publishBlogAsset.mockImplementation(async () => {
    store.blog!.postedUrl = "https://www.example.com/post/how-to-delegate-work-to-ai/";
    store.blog!.status = "published";
    return { ok: true, slug: "how-to-delegate-work-to-ai", liveUrl: "https://www.example.com/post/how-to-delegate-work-to-ai/", verified: true };
  });
  profileOverride = {};
  writerOutputs = F.WRITER_OUTPUTS;
  heroCalls.length = 0;
  uploads.length = 0;
  modelCalls.length = 0;
  resetReplies();
  resetApprovalsFake();
  effectKeys.clear();
});

async function runUntil(step: string) {
  await startWriterRun("camp-1");
  while (store.campaign.writerStep !== step && store.campaign.writerStep !== "ready" && store.campaign.writerStep !== "done" && !store.campaign.writerError) {
    await advance("camp-1");
  }
}

describe("the pipeline end to end", () => {
  it("takes a fixture campaign from idea to ready to publish in eight steps", async () => {
    await startWriterRun("camp-1");
    expect(store.campaign.writerStep).toBe("draft");
    expect(store.campaign.writerStartedAt).not.toBeNull();

    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await advance("camp-1");
      expect(r).toMatchObject({ ok: true });
      if ("step" in r) seen.push(r.step);
    }
    expect(seen).toEqual(["draft", "edit", "seo", "exhibits", "hero", "links", "assemble", "validate"]);
    expect(store.campaign.writerStep).toBe("ready");
    expect(store.campaign.writerError).toBeNull();
    expect(modelCalls).toEqual(["You are the editor", "search and AI-search package", "Propose two or three exhibits", "Choose two to four published posts", "Two things for the post"]);

    const md = store.blog!.copyMd!;
    expect(md.match(/class="idea-in-brief"/g)).toHaveLength(1);
    expect(md.match(/class="post-figure"/g)).toHaveLength(2);
    expect(md.match(/class="faq-item"/g)).toHaveLength(5);
    expect(md).toContain("> When you have enough information to act, act.");
    expect(md).not.toContain("paraphrased");
    expect(md).toContain("[planning system](/post/three-levels-of-model-usage/)");
    expect(md).toContain(`<a href="https://every.to/vibe-check/fable-5-1" target="_blank" rel="noopener">Every's review</a>`);
    expect(md).not.toContain("—");
    expect(store.blog!.seoMd).toContain("**Title tag:** How to Delegate Work to AI");
    expect(store.blog!.seoMd).toContain("**Slug:** how-to-delegate-work-to-ai");
    expect(store.blog!.imageUrl).toMatch(/hero\.png$/);
    expect(heroCalls).toEqual(["16:9"]);
    expect(uploads).toHaveLength(2);
    expect(store.blog!.notes).toContain("## Edit pass");
    expect(store.blog!.notes).toContain("Renamed the Other 50% heading");

    // Parked on a Publish approval for this version of the post (Y.16).
    expect(approvalsFor("campaign_publish", "camp-1")).toEqual([
      expect.objectContaining({ state: "pending", approverPermission: "campaigns.marketing", metadata: expect.objectContaining({ version: blogVersion(store.blog!), reach: "public" }) }),
    ]);
    expect(fake.parks).toEqual([expect.objectContaining({ status: "waiting" })]);

    // Idle afterwards: a tick on a ready campaign does nothing.
    expect(await advance("camp-1")).toMatchObject({ skipped: "Ready to publish" });
  });

  it("does nothing on a campaign without a run, and on one that stopped with an error", async () => {
    expect(await advance("camp-1")).toMatchObject({ skipped: "No writer run on this campaign." });
    store.campaign.writerStep = "edit";
    store.campaign.writerError = "boom";
    expect(await advance("camp-1")).toMatchObject({ skipped: expect.stringContaining("Stopped at Step 2 of 10: Edit: boom") });
    expect(modelCalls).toEqual([]);
  });
});

describe("with auto-publish on", () => {
  it("writes the channels from the final post, approves them, publishes, and closes the campaign", async () => {
    profileOverride = { autoPublish: true };
    await startWriterRun("camp-1");
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await advance("camp-1");
      expect(r).toMatchObject({ ok: true });
      if ("step" in r) seen.push(r.step);
    }
    expect(seen).toEqual(["draft", "edit", "seo", "exhibits", "hero", "links", "assemble", "validate", "channels", "publish"]);
    expect(store.campaign.writerStep).toBe("done");
    expect(publishBlogAsset).toHaveBeenCalledWith("blog-1", "writer-agent");
    // The channel pass stores exactly the non-blog channels, before the publish, and approves them.
    expect(storedOutputs.at(-1)).toEqual(["linkedin", "facebook", "email"]);
    for (const c of ["linkedin", "facebook", "email"]) {
      const asset = store.assets.find((a) => a.channel === c);
      expect(asset?.imageUrl).toMatch(/image\.png$/);
      expect(asset?.status).toBe("approved");
    }
    expect(store.campaign.status).toBe("done");
    expect(store.campaign.endsOn).toBeTruthy();
    expect(await advance("camp-1")).toMatchObject({ skipped: "Published" });
  });
  // The re-review of #1988, blocker 1 (d): an auto-publish brand's run is
  // never held by approval history; a rerun on its live post re-publishes it.
  it("re-publishes a live post on a rerun, whatever approval history the campaign has", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("publish");
    store.blog!.status = "published";
    fake.approvals.push({ id: "ap-old", subjectType: "campaign_publish", subjectId: "camp-1", state: "cancelled", approverPermission: null, metadata: { version: "0" }, decidedBy: null, reason: null });
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "publish", next: "done" });
    expect(publishBlogAsset).toHaveBeenCalledTimes(1);
  });

  it("a post dated after today is scheduled for the daily publisher instead of published", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("publish");
    store.blog!.publishDate = "2999-01-01";
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "publish", next: "done", summary: expect.stringMatching(/Scheduled for 2999-01-01/) });
    expect(publishBlogAsset).not.toHaveBeenCalled();
    expect(store.blog!.status).toBe("scheduled");
    expect(store.campaign.status).toBe("done");
    expect(store.campaign.endsOn).toBe("2999-01-01");
  });
  it("publish: the publish gate's errors stop the run", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("publish");
    publishBlogAsset.mockResolvedValue({ ok: false, errors: ["Slug \"x\" is already in use by another post."] });
    await expectBlocked("publish", /Publish: Slug "x" is already in use/);
  });
  it("publish: a live URL that does not answer 200 stops the run", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("publish");
    publishBlogAsset.mockResolvedValue({ ok: true, slug: "s", liveUrl: "https://www.example.com/post/s/", verified: false, warning: "Not yet." });
    await expectBlocked("publish", /did not answer 200/);
  });
  it("publish: an unverified bare path (no site origin configured) still closes the campaign", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("publish");
    publishBlogAsset.mockResolvedValue({ ok: true, slug: "s", liveUrl: "/post/s/", verified: false, warning: "No origin." });
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "publish", next: "done", summary: expect.stringMatching(/not verified because no site origin/) });
    expect(store.campaign.status).toBe("done");
  });
  it("channels: a missing channel or a channel without an image stops the run", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("channels");
    replies["The blog post below is final; it goes live"] = () => ({ outputs: F.CHANNELS_REPLY.outputs.filter((o) => o.channel !== "email") });
    await expectBlocked("channels", /no email deliverable/);
    store.campaign.writerError = null;
    replies["The blog post below is final; it goes live"] = () => F.CHANNELS_REPLY;
    store.channelImages = false;
    await expectBlocked("channels", /still have no image/);
  });
});

async function expectBlocked(step: string, pattern: RegExp) {
  const r = await advance("camp-1");
  expect(r).toMatchObject({ ok: false, step, error: expect.stringMatching(pattern) });
  expect(store.campaign.writerStep).toBe(step);
  expect(store.campaign.writerError).toMatch(pattern);
}

describe("every check blocks", () => {
  it("draft: a missing active channel", async () => {
    writerOutputs = F.WRITER_OUTPUTS.filter((o) => o.channel !== "email");
    await startWriterRun("camp-1");
    await expectBlocked("draft", /no email deliverable/);
    expect(store.blog).toBeNull();
  });
  it("draft: a blog outside the brand's word range", async () => {
    writerOutputs = F.WRITER_OUTPUTS.map((o) => (o.channel === "blog" ? { ...o, bodyMd: "Too short." } : o));
    await startWriterRun("camp-1");
    await expectBlocked("draft", /2 words; the brand profile asks for 600 to 1200/);
  });
  it("draft: a blog type or hero style the last posts leaned on", async () => {
    // The fixture blog is a thesis; two of the last four posts already are.
    store.ledger[0].blogType = "thesis";
    store.ledger[1].blogType = "thesis";
    await startWriterRun("camp-1");
    await expectBlocked("draft", /blog type "thesis" already carries 2 of the brand's last 3 posts/);
    expect(store.blog).toBeNull();
    store.campaign.writerError = null;
    store.ledger[1].blogType = "warning";
    store.ledger[0].imageStyle = "concept-card";
    store.ledger[1].imageStyle = "concept-card";
    await expectBlocked("draft", /image style "concept-card" already carries 2/);
  });
  it("draft: a profile with no word range says what to add", async () => {
    profileOverride = { channelsMd: "## Blog\nWrite well.", processMd: null };
    await startWriterRun("camp-1");
    await expectBlocked("draft", /states no blog word range/);
  });
  it("edit: an em dash, banned language, the brand name, or an empty change log", async () => {
    await runUntil("edit");
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY.replace("90-day plan", "90-day plan — every time"), change_log: ["x"] });
    await expectBlocked("edit", /em dash/);
    store.campaign.writerError = null;
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY.replace("90-day plan", "staffing audit plan"), change_log: ["x"] });
    await expectBlocked("edit", /audit, staffing/);
    store.campaign.writerError = null;
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY.replace("PR agency", "EDGE8 agency"), change_log: ["x"] });
    await expectBlocked("edit", /"Edge8" exactly/);
    store.campaign.writerError = null;
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY, change_log: [] });
    await expectBlocked("edit", /no change log/);
    expect(store.blog!.copyMd).toBe(F.DRAFT_BODY);
  });
  it("seo: a bad slug, a taken slug, or a first FAQ question that is not How/What with the keyword", async () => {
    await runUntil("seo");
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, slug: "" });
    await expectBlocked("seo", /not a valid kebab-case slug/);
    store.campaign.writerError = null;
    store.takenSlugs.add("how-to-delegate-work-to-ai");
    replies["search and AI-search package"] = () => F.SEO_REPLY;
    await expectBlocked("seo", /already in use/);
    store.takenSlugs.clear();
    store.campaign.writerError = null;
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [{ question: "Why bother?", answer: "a" }, ...F.SEO_REPLY.faq.slice(1)] });
    await expectBlocked("seo", /must start with How or What/);
    store.campaign.writerError = null;
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [{ question: "How to write a brief?", answer: "a" }, ...F.SEO_REPLY.faq.slice(1)] });
    await expectBlocked("seo", /carry the primary keyword/);
    expect(store.blog!.seoMd).toBe("**Title tag (58 chars):** wrong label");
  });
  it("seo: a question that names the brand or asks what a source says", async () => {
    await runUntil("seo");
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [{ question: "How do you delegate work to AI at Edge8?", answer: "a" }, ...F.SEO_REPLY.faq.slice(1)] });
    await expectBlocked("seo", /names Edge8; nobody asks an AI about a brand's own process/);
    store.campaign.writerError = null;
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [F.SEO_REPLY.faq[0], { question: "What does the Stanford playbook say about pilots?", answer: "a" }, ...F.SEO_REPLY.faq.slice(2)] });
    await expectBlocked("seo", /asks what a source says/);
  });
  it("seo: an FAQ answer with no figure, or a figure the post never states", async () => {
    await runUntil("seo");
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [F.SEO_REPLY.faq[0], { question: "What is Claude Fable 5.1?", answer: "A capable model." }, ...F.SEO_REPLY.faq.slice(2)] });
    await expectBlocked("seo", /has no figure; back it with a number the post states/);
    store.campaign.writerError = null;
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [F.SEO_REPLY.faq[0], { question: "What is Claude Fable 5.1?", answer: "It is 873 times faster." }, ...F.SEO_REPLY.faq.slice(2)] });
    await expectBlocked("seo", /cites 873, which the post never states/);
  });
  it("seo: retries once with the failed checks named, and passes when the second package is fixed", async () => {
    await runUntil("seo");
    let calls = 0;
    replies["search and AI-search package"] = () =>
      ++calls === 1 ? { ...F.SEO_REPLY, faq: [F.SEO_REPLY.faq[0], { question: "What is Claude Fable 5.1?", answer: "A capable model." }, ...F.SEO_REPLY.faq.slice(2)] } : F.SEO_REPLY;
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "seo" });
    expect(calls).toBe(2);
    expect(store.campaign.writerError).toBeNull();
  });
  it("seo: a keyword or first question that is not the campaign plan's", async () => {
    await runUntil("seo");
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, primary_keyword: "AI delegation", faq: [{ question: "How do I get started with AI delegation?", answer: F.SEO_REPLY.faq[0].answer }, ...F.SEO_REPLY.faq.slice(1)] });
    await expectBlocked("seo", /must be the plan's, "delegate work to AI"/);
  });
  it("seo: a primary keyword an earlier post already owns", async () => {
    await runUntil("seo");
    store.ledger[2].primaryKeyword = "Delegate work to AI";
    replies["search and AI-search package"] = () => F.SEO_REPLY;
    await expectBlocked("seo", /already the keyword of "Three levels of model usage" \(\/post\/three-levels-of-model-usage\/\)/);
  });
  it("channels: a social style the channel's last posts leaned on", async () => {
    profileOverride = { autoPublish: true };
    for (const r of store.ledger) r.social[0].socialStyle = "hook-story";
    await runUntil("channels");
    await expectBlocked("channels", /Channels \(linkedin\): The linkedin style "hook-story" already carries 3/);
  });
  it("exhibits: a number the body never states, a missing heading, or fewer than two figures", async () => {
    await runUntil("exhibits");
    const [a, b] = F.EXHIBITS_REPLY.exhibits;
    replies["Propose two or three exhibits"] = () => ({ exhibits: [{ ...a, svg: a.svg.replace("42%", "99%") }, b] });
    await expectBlocked("exhibits", /Exhibit 1 shows 99, which the body never states/);
    store.campaign.writerError = null;
    replies["Propose two or three exhibits"] = () => ({ exhibits: [a, { ...b, anchor_heading: "No such heading" }] });
    await expectBlocked("exhibits", /names a heading that is not in the body/);
    store.campaign.writerError = null;
    replies["Propose two or three exhibits"] = () => ({ exhibits: [a] });
    await expectBlocked("exhibits", /fewer than two figures/);
    expect(store.blog!.copyMd).not.toContain("post-figure");
  });
  it("hero: an image that is not the entry's selected image", async () => {
    await runUntil("hero");
    store.heroSelects = false;
    await expectBlocked("hero", /not the entry's selected image/);
  });
  it("links: fewer than two placeable internal links", async () => {
    await runUntil("links");
    replies["Choose two to four published posts"] = () => ({ internal: [{ phrase: "planning system", slug: "three-levels-of-model-usage" }, { phrase: "nowhere", slug: "your-prompts-are-expiring" }], sources: [] });
    await expectBlocked("links", /only 1 internal link/);
  });
  it("links: a link to an audit page", async () => {
    store.campaign.idea = `${F.IDEA}\nAlso https://www.example.com/ai-audit/`;
    await runUntil("links");
    replies["Choose two to four published posts"] = () => ({ ...F.LINKS_REPLY, sources: [{ phrase: "Every's review", url: "https://www.example.com/ai-audit/" }] });
    await expectBlocked("links", /audit page/);
  });
  it("assemble: no pull quote verbatim in the idea, or an SEO package without five FAQ", async () => {
    await runUntil("assemble");
    replies["Two things for the post"] = () => ({ ...F.ASSEMBLE_REPLY, pull_quotes: [{ quote: "Not in the idea.", anchor_heading: "Budget" }] });
    await expectBlocked("assemble", /no pull quote could be verified verbatim/);
    store.campaign.writerError = null;
    store.blog!.seoMd = "**Title tag:** t\n**Meta description:** m\n**Slug:** s";
    await expectBlocked("assemble", /carries 0 FAQ item/);
  });
  it("validate: lists every failure of the assembled body at once", async () => {
    await runUntil("validate");
    store.blog!.copyMd = store.blog!.copyMd!.replace(/<figure class="post-figure">[\s\S]*?<\/figure>\n?/g, "").replace("90-day plan", "90-day — plan");
    store.blog!.imageUrl = null;
    await expectBlocked("validate", /no hero image/);
    expect(store.campaign.writerError).toMatch(/em dash/);
    expect(store.campaign.writerError).toMatch(/0 exhibit/);
  });
});

// Y.16: a brand without auto-publish publishes only through its approval. The
// approval moves the run to publish; the next tick (advance, as the driver
// calls it) publishes that version once, and a post edited after the approval
// goes back to ready with a new one instead of going live.
describe("with a Publish approval", () => {
  const by = { personId: "person-1", email: "approver@example.test" };

  async function approved(): Promise<string> {
    await runUntil("ready");
    expect(store.campaign.writerStep).toBe("ready");
    const version = blogVersion(store.blog!);
    expect(await approvePublish("camp-1", version, by)).toEqual({ ok: true });
    expect(store.campaign.writerStep).toBe("publish");
    return version;
  }

  it("publishes the approved version on the next tick, once", async () => {
    await approved();
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "publish", next: "done" });
    expect(publishBlogAsset).toHaveBeenCalledTimes(1);
    expect(store.campaign.status).toBe("done");
  });

  it("does not publish a second time when the step is retried after it published", async () => {
    await approved();
    publishBlogAsset.mockImplementationOnce(async () => {
      store.blog!.status = "published";
      return { ok: true, slug: "s", liveUrl: "https://www.example.com/post/s/", verified: false, warning: "Not yet." };
    });
    await expectBlocked("publish", /did not answer 200/);
    store.campaign.writerError = null;
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "publish", next: "done", summary: expect.stringMatching(/Already published by an earlier attempt/) });
    expect(publishBlogAsset).toHaveBeenCalledTimes(1);
  });

  // The Opus review of #1988, finding 7: publishing a post with no date gives
  // it today's, which changes its version; a retry must close the campaign,
  // not read the live post as edited and send the run back to ready.
  it("closes a post published with no date on retry, though publishing changed its version", async () => {
    await approved();
    publishBlogAsset.mockImplementationOnce(async () => {
      store.blog!.status = "published";
      store.blog!.publishDate = "2026-10-09";
      return { ok: true, slug: "s", liveUrl: "https://www.example.com/post/s/", verified: false, warning: "Not yet." };
    });
    await expectBlocked("publish", /did not answer 200/);
    store.campaign.writerError = null;
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "publish", next: "done", summary: expect.stringMatching(/Already published/) });
    expect(publishBlogAsset).toHaveBeenCalledTimes(1);
    expect(approvalsFor("campaign_publish", "camp-1").map((x) => x.state)).toEqual(["approved"]);
  });

  // The re-review of #1988, blocker 1 (c): a live post edited and approved
  // again is re-published, so the site serves what was approved.
  it("re-publishes a live post a person edited and had approved again", async () => {
    await approved();
    await advance("camp-1");
    expect(publishBlogAsset).toHaveBeenCalledTimes(1);
    store.campaign.writerStep = "done";
    store.blog!.copyMd = `${store.blog!.copyMd}\\n\\nA correction after it went live.`;
    expect(await reaskPublish("camp-1", by)).toMatchObject({ ok: true });
    expect(await approvePublish("camp-1", blogVersion(store.blog!), by)).toEqual({ ok: true });
    expect(await advance("camp-1")).toMatchObject({ ok: true, step: "publish", next: "done" });
    expect(publishBlogAsset).toHaveBeenCalledTimes(2);
  });

  it("sends a post edited after its approval back to ready with a new approval, publishing nothing", async () => {
    const old = await approved();
    const epoch = store.campaign.writerStartedAt;
    store.blog!.copyMd = `${store.blog!.copyMd}\n\nOne more line, added after the approval.`;
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, step: "publish", next: "ready", summary: expect.stringMatching(/changed after it was approved/) });
    expect(publishBlogAsset).not.toHaveBeenCalled();
    expect(store.campaign.writerStep).toBe("ready");
    // A new start time, so the publish tick the run reaches next is a fresh one.
    expect(store.campaign.writerStartedAt).not.toBe(epoch);
    const rows = approvalsFor("campaign_publish", "camp-1");
    expect(rows.map((x) => [x.state, x.metadata.version])).toEqual([
      ["approved", old],
      ["pending", blogVersion(store.blog!)],
    ]);
  });

  it("never reaches publish without a decision: a run set to publish by hand goes back to ready", async () => {
    await runUntil("ready");
    store.campaign.writerStep = "publish";
    const r = await advance("camp-1");
    expect(r).toMatchObject({ ok: true, next: "ready" });
    expect(publishBlogAsset).not.toHaveBeenCalled();
  });
});
