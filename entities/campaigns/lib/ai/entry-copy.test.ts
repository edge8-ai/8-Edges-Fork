import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFake, script, fakeSupabase } from "@/kernel/data/testing/fake-company-os";

// Y.91: Regenerate copy on the asset page asks the live-edit rule before the
// model call, so a live post on a gated campaign costs no draft, and writes
// through the rule, so a post that went live during the call is not
// overwritten. The rule's own cases are in ../blog-live-edit.test.ts.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const create = vi.hoisted(() => vi.fn());
vi.mock("@/kernel/ai/gateway", () => ({ aiSite: () => ({ model: "claude-test", clientIfConfigured: () => ({ messages: { create } }) }) }));
vi.mock("@/kernel/ai/response", () => ({ jsonSchemaFor: () => ({}), readStructuredOutput: () => ({ ok: true, data: { body_md: "The new body." } }) }));
vi.mock("@/entities/campaigns/lib/brand-profiles", () => ({ getBrandProfile: async () => ({ brandId: "brand-1" }) }));
vi.mock("@/entities/campaigns/lib/ai/brand-writer", () => ({ systemPrompt: () => "voice" }));
const live = vi.hoisted(() => ({ before: null as string | null, write: null as string | null, asked: [] as unknown[][], written: [] as unknown[][] }));
vi.mock("@/entities/campaigns/lib/blog-live-edit", () => ({
  liveEditRefusal: async (...a: unknown[]) => (live.asked.push(a), live.before),
  updateContentUnlessLive: async (...a: unknown[]) => {
    live.written.push(a);
    return { error: live.write ? { message: live.write, refused: true } : null };
  },
}));

const { generateEntryCopy } = await import("./entry-copy");
const REFUSAL = "This post is live and its campaign publishes on approval.";

beforeEach(() => {
  resetFake();
  create.mockReset();
  create.mockResolvedValue({});
  Object.assign(live, { before: null, write: null });
  live.asked.length = 0;
  live.written.length = 0;
  script("marketing_content", { data: { id: "blog-1", title: "How to delegate", brand_id: "brand-1", channel: "blog", copy_md: "Body.", notes: null, blog_style: null, social_style: null, asset_url: null, posted_url: null } });
});

describe("generateEntryCopy and a live post", () => {
  it("refuses before the model call, so a refused post costs no draft", async () => {
    live.before = REFUSAL;
    expect(await generateEntryCopy("blog-1")).toEqual({ ok: false, error: REFUSAL });
    expect(live.asked).toEqual([["blog-1"]]);
    expect(create).not.toHaveBeenCalled();
    expect(live.written).toEqual([]);
  });

  it("writes the draft through the rule, and shows its refusal when the post went live meanwhile", async () => {
    live.write = REFUSAL;
    expect(await generateEntryCopy("blog-1")).toEqual({ ok: false, error: REFUSAL });
    expect(create).toHaveBeenCalledOnce();
    expect(live.written).toEqual([["blog-1", { copy_md: "The new body." }]]);
  });

  it("saves the draft the rule lets through", async () => {
    expect(await generateEntryCopy("blog-1")).toEqual({ ok: true, bodyMd: "The new body." });
  });
});
