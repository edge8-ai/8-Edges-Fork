import { describe, expect, it, vi } from "vitest";

// Z.15.5: the model each site called is the one the registry resolves today.

const rows = vi.hoisted(() => ({ value: [] as { site: string; model: string }[] }));
vi.mock("@/kernel/data/supabase", () => {
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows.value, error: null }).then(resolve),
  };
  for (const op of ["select", "gte", "limit", "eq", "is"]) b[op] = () => b;
  return { companyOs: { from: () => b } };
});

const { callsCarryACost, expectedModels, siteModelsMatch } = await import("./site-model-invariant");

describe("expectedModels", () => {
  it("resolves each declared site through modelFor, overrides included", () => {
    const want = expectedModels({ AI_MODEL_MEETING_SUMMARY: "deepseek/deepseek-v3.2" });
    expect(want.get("meeting-summary")).toEqual(new Set(["deepseek/deepseek-v3.2"]));
    expect(want.has("brand-image")).toBe(false);
  });

  it("expects a fallback's row on the fallback's model (Y.67.3)", () => {
    const want = expectedModels({});
    expect(want.get("roadmap-assist")).toEqual(new Set(["qwen/qwen3.8-flash"]));
    expect(want.get("roadmap-assist:fallback")).toEqual(new Set(["claude-sonnet-5"]));
  });
});

describe("siteModelsMatch", () => {
  it("names a site that called a model the registry does not name", async () => {
    const expected = [...(expectedModels().get("receipt-read") ?? [])][0];
    rows.value = [
      { site: "receipt-read", model: expected },
      { site: "receipt-read", model: "claude-haiku-4-5" },
      { site: "brand-image", model: "gemini-image" },
    ];
    const r = await siteModelsMatch().check(new Date());
    expect(r.ok).toBe(false);
    expect(r.detail).toBe(`receipt-read called claude-haiku-4-5, expected ${expected}`);
  });

  it("names an undeclared site", async () => {
    rows.value = [{ site: "rogue-site", model: "claude-sonnet-5" }];
    const r = await siteModelsMatch().check(new Date());
    expect(r.detail).toBe("rogue-site called claude-sonnet-5 (not a declared site)");
  });
});

describe("callsCarryACost (Z.15.4)", () => {
  it("names the models an answered call had no cost for", async () => {
    rows.value = [{ site: "receipt-read", model: "new-model-x" }, { site: "receipt-read", model: "new-model-x" }];
    const r = await callsCarryACost().check(new Date());
    expect(r).toEqual({ ok: false, detail: "2 answered call(s) with no cost; add their model to kernel/ai/prices.ts: new-model-x (receipt-read)" });
  });
  it("passes when none is missing", async () => {
    rows.value = [];
    expect((await callsCarryACost().check(new Date())).ok).toBe(true);
  });
});
