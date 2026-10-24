import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Gemini request and its ledger row. The network (fetch), the database
// and storage are the outside world here; the request brand-image builds and
// the row it records are what the test reads.
const { inserts } = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[] }));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: null };
      },
    }),
  },
  supabase: {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example.test/${path}` } }),
      }),
    },
  },
}));
vi.mock("@/entities/campaigns/lib/brand-profiles", () => ({ getBrandProfile: async () => null }));
vi.mock("@/entities/campaigns/lib/marketing-images", () => ({ recordAssetImage: async () => ({ ok: true }) }));
// The live-edit rule (Y.91) has its own suite (../blog-live-edit.test.ts); here
// only that a refusal stops the request before it is made.
const live = vi.hoisted(() => ({ refusal: null as string | null, asked: [] as unknown[][] }));
vi.mock("@/entities/campaigns/lib/blog-live-edit", () => ({
  liveEditRefusal: async (...a: unknown[]) => (live.asked.push(a), live.refusal),
}));

import { generateEntryImage } from "./brand-image";

const KEY = "gemini-test-key-123";
const fetchMock = vi.fn();

beforeEach(() => {
  inserts.length = 0;
  live.refusal = null;
  live.asked.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GEMINI_API_KEY", KEY);
  vi.stubEnv("SUPABASE_URL", "https://db.example.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function imageResponse() {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("png").toString("base64") } }] } }],
      usageMetadata: { promptTokenCount: 210, candidatesTokenCount: 1290 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("generateEntryImage's Gemini request", () => {
  it("sends the key in the x-goog-api-key header, never in the URL", async () => {
    fetchMock.mockResolvedValue(imageResponse());
    const r = await generateEntryImage("entry-1", { prompt: "A navy ground with one mint line." });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect(url).not.toContain("key=");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(KEY);
  });

  it("records one ai_calls row for the call, with no prompt text", async () => {
    fetchMock.mockResolvedValue(imageResponse());
    await generateEntryImage("entry-1", { prompt: "A navy ground with one mint line." });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: "ai_calls",
      site: "brand-image",
      class: "A",
      provider: "google",
      model: "gemini-2.5-flash-image",
      input_tokens: 210,
      output_tokens: 1290,
      ok: true,
      error_kind: null,
    });
    expect(JSON.stringify(inserts[0])).not.toContain("mint line");
  });

  it("records a failed call as not ok", async () => {
    fetchMock.mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    const r = await generateEntryImage("entry-1", { prompt: "A navy ground." });
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ provider: "google", ok: false, error_kind: "rate_limit", input_tokens: null });
  });

  it("asks the live-edit rule first, and a live post on a gated campaign costs no image (Y.91)", async () => {
    live.refusal = "This post is live and its campaign publishes on approval.";
    expect(await generateEntryImage("entry-1", { prompt: "A navy ground." })).toEqual({ ok: false, error: live.refusal });
    expect(live.asked).toEqual([["entry-1"]]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });
});
