import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { cardPrStampCurrent, cardPrSync, prKey } from "./types";

// W.161: HTT's PR sync states what it stored and Boards stamps the cards that
// link those PRs. Scripted in the order the subscriber asks: the cards with a
// PR link (a page at a time), then one answer per write, and for a write that
// matched no row, the card read again and the retried write.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const published: { name: string; payload: unknown }[] = [];
vi.mock("@/kernel/events", () => ({
  publish: async (name: string, payload: unknown) => {
    published.push({ name, payload });
  },
}));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: vi.fn(async () => ({ user: { email: "admin@example.com" }, personId: null })),
}));

const { stampSyncedPullRequests, announcePrLink, CARD_PAGE } = await import("./pr-stamp");
const { requestMissingPrStamps } = await import("./pr-backfill");

const PR_NEW_ORG = "https://github.com/edge8-ai/edge8-web/pull/1781";
const PR_OLD_ORG = "https://github.com/talentedgeai/edge8-web/pull/1781/files";
const KEY = "edge8-ai/edge8-web#1781";
const synced = (over: Partial<{ url: string; number: number; title: string; state: "open" | "merged" | "closed" }> = {}) => ({
  pullRequests: [{ url: PR_NEW_ORG, number: 1781, title: "Card drawer: hybrid layout", state: "merged" as const, ...over }],
});
const row = (id: string, metadata: Record<string, unknown>, updated_at = "2026-10-05T01:00:00Z") => ({ id, metadata, updated_at });
const writes = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "update");
const reads = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "select");
const landed = { data: [{ id: "x" }] };
const missed = { data: [] };

beforeEach(() => {
  resetFake();
  published.length = 0;
});

describe("which PR a link names", () => {
  // B10: the owner is part of the key, folded through the rename alias.
  it("reads owner, repo and number, folding the renamed org, whatever trails the number", () => {
    expect(prKey(PR_NEW_ORG)).toBe(KEY);
    expect(prKey(PR_OLD_ORG)).toBe(KEY);
    expect(prKey("https://github.com/Edge8-AI/Edge8-Web/pull/1781")).toBe(KEY);
    expect(prKey("https://github.com/edge8-ai/edge8-web/pull/17810")).toBe("edge8-ai/edge8-web#17810");
    expect(prKey("https://example.com/not-a-pr")).toBeNull();
  });

  it("keeps two real owners of one repo name apart", () => {
    const a = prKey("https://github.com/australian-payroll-association/payroll-training-au/pull/5");
    const b = prKey("https://github.com/tracy-infinite-leverage/payroll-training-au/pull/5");
    expect(a).not.toBe(b);
  });

  it("believes a stamp only while it describes the card's current PR", () => {
    const stamp = { key: KEY, title: "Card drawer", state: "merged" };
    expect(cardPrSync({ metadata: { pr_url: PR_OLD_ORG, pr_synced: stamp } })?.state).toBe("merged");
    // The link was swapped to another PR since the stamp: it says nothing.
    expect(cardPrSync({ metadata: { pr_url: "https://github.com/edge8-ai/edge8-web/pull/1800", pr_synced: stamp } })).toBeNull();
    // The same repo name and number under another owner is another PR.
    expect(cardPrSync({ metadata: { pr_url: "https://github.com/someone-else/edge8-web/pull/1781", pr_synced: stamp } })).toBeNull();
    expect(cardPrSync({ metadata: { pr_url: PR_NEW_ORG } })).toBeNull();
  });

  it("still believes a stamp written before the owner joined the key, until it is rewritten", () => {
    const legacy = { key: "edge8-web#1781", title: "Card drawer", state: "merged" };
    expect(cardPrSync({ metadata: { pr_url: PR_NEW_ORG, pr_synced: legacy } })?.title).toBe("Card drawer");
    expect(cardPrSync({ metadata: { pr_url: "https://github.com/edge8-ai/edge8-web/pull/1800", pr_synced: legacy } })).toBeNull();
    // Believed, but not current: the backfill asks for it again.
    expect(cardPrStampCurrent({ metadata: { pr_url: PR_NEW_ORG, pr_synced: legacy } })).toBe(false);
    expect(cardPrStampCurrent({ metadata: { pr_url: PR_NEW_ORG, pr_synced: { ...legacy, key: KEY } } })).toBe(true);
  });
});

describe("stamping the synced PRs on their cards (W.161)", () => {
  it("stamps every card that links the PR, matched across the org rename, and keeps the rest of its metadata", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_OLD_ORG, build_summary: "kept" }), row("c2", { pr_url: "https://github.com/edge8-ai/edge8-web/pull/42" })] });
    script("tasks", landed);
    await stampSyncedPullRequests(synced());

    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0].payloads[0]).toEqual({
      metadata: { pr_url: PR_OLD_ORG, build_summary: "kept", pr_synced: { key: KEY, title: "Card drawer: hybrid layout", state: "merged" } },
    });
    // Conditional on the row being as read, so a save in between wins.
    expect(w[0].filters).toEqual(expect.arrayContaining([["eq", "id", "c1"], ["eq", "updated_at", "2026-10-05T01:00:00Z"]]));
  });

  it("does not stamp a card that links the same repo name and number under another owner (B10)", async () => {
    script("tasks", { data: [row("c1", { pr_url: "https://github.com/someone-else/edge8-web/pull/1781" })] });
    await stampSyncedPullRequests(synced());
    expect(writes()).toHaveLength(0);
  });

  it("writes nothing when the card already carries exactly that stamp", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG, pr_synced: { key: KEY, title: "Card drawer: hybrid layout", state: "merged" } })] });
    await stampSyncedPullRequests(synced());
    expect(writes()).toHaveLength(0);
  });

  it("rewrites a stamp that carries the owner-less key", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG, pr_synced: { key: "edge8-web#1781", title: "Card drawer: hybrid layout", state: "merged" } })] });
    script("tasks", landed);
    await stampSyncedPullRequests(synced());
    expect((writes()[0].payloads[0] as { metadata: { pr_synced: { key: string } } }).metadata.pr_synced.key).toBe(KEY);
  });

  it("restamps when the state moves on", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG, pr_synced: { key: KEY, title: "Card drawer: hybrid layout", state: "open" } })] });
    script("tasks", landed);
    await stampSyncedPullRequests(synced());
    expect((writes()[0].payloads[0] as { metadata: { pr_synced: { state: string } } }).metadata.pr_synced.state).toBe("merged");
  });

  it("tries every card before reporting the ones it could not stamp", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG }), row("c2", { pr_url: PR_OLD_ORG })] });
    script("tasks", { error: { message: "boom" } }, landed);
    await expect(stampSyncedPullRequests(synced())).rejects.toThrow(/could not stamp 1 card/);
    expect(writes()).toHaveLength(2);
  });

  it("reads nothing when no synced PR is a GitHub pull request link", async () => {
    await stampSyncedPullRequests(synced({ url: "https://example.com/elsewhere" }));
    expect(calls).toHaveLength(0);
  });

  it("refuses to guess when the cards cannot be read", async () => {
    script("tasks", { error: { message: "down" } });
    await expect(stampSyncedPullRequests(synced())).rejects.toThrow();
  });

  // One PR stated (a link just set) reads only the links that could name it.
  it("narrows the read to links holding that PR's number when one PR is stated", async () => {
    script("tasks", { data: [] });
    await stampSyncedPullRequests(synced());
    expect(reads()[0].filters).toContainEqual(["ilike", "metadata->>pr_url", "%/pull/1781%"]);
  });

  it("reads every linked card when several PRs are stated", async () => {
    script("tasks", { data: [] });
    await stampSyncedPullRequests({
      pullRequests: [...synced().pullRequests, { url: "https://github.com/edge8-ai/edge8-web/pull/1800", number: 1800, title: "x", state: "open" }],
    });
    expect(reads()[0].filters.some((f) => f[0] === "ilike")).toBe(false);
  });
});

// B6: one unpaged read stops at PostgREST's max rows, so cards past the
// thousandth were never stamped. A full page asks for the next one.
describe("paging the linked cards (B6)", () => {
  it("reads past a full page and stamps the card on the second one", async () => {
    const full = Array.from({ length: CARD_PAGE }, (_, i) => row(`a${String(i).padStart(4, "0")}`, { pr_url: "https://github.com/edge8-ai/edge8-web/pull/1" }));
    script("tasks", { data: full }, { data: [row("z1", { pr_url: PR_NEW_ORG })] });
    script("tasks", landed);
    await stampSyncedPullRequests(synced());

    expect(reads()).toHaveLength(2);
    for (const r of reads()) expect(r.ops).toEqual(expect.arrayContaining(["order", "range"]));
    expect(writes()).toHaveLength(1);
    expect(writes()[0].filters).toContainEqual(["eq", "id", "z1"]);
  });

  it("stops after a short page", async () => {
    script("tasks", { data: [row("c1", { pr_url: "https://github.com/edge8-ai/edge8-web/pull/1" })] });
    await stampSyncedPullRequests(synced());
    expect(reads()).toHaveLength(1);
  });
});

// B13: a conditional write that matched no row passed as a success, and the
// PR was never stated again, so the stamp was lost for good.
describe("a stamp write that matched no row (B13)", () => {
  it("asks which row it wrote, reads the card again and retries once", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG })] });
    script("tasks", missed, { data: row("c1", { pr_url: PR_NEW_ORG, build_summary: "saved meanwhile" }, "2026-10-05T02:00:00Z") }, landed);
    await stampSyncedPullRequests(synced());

    const w = writes();
    expect(w).toHaveLength(2);
    expect(w[0].ops).toContain("select");
    // The retry carries what the card holds now, conditional on its new stamp.
    expect(w[1].payloads[0]).toEqual({ metadata: { pr_url: PR_NEW_ORG, build_summary: "saved meanwhile", pr_synced: { key: KEY, title: "Card drawer: hybrid layout", state: "merged" } } });
    expect(w[1].filters).toContainEqual(["eq", "updated_at", "2026-10-05T02:00:00Z"]);
  });

  it("does not retry when the card was relinked to another PR meanwhile", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG })] });
    script("tasks", missed, { data: row("c1", { pr_url: "https://github.com/edge8-ai/edge8-web/pull/1800" }, "2026-10-05T02:00:00Z") });
    await stampSyncedPullRequests(synced());
    expect(writes()).toHaveLength(1);
  });

  it("counts and logs a stamp that still did not land, without failing the others", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG })] });
    script("tasks", missed, { data: row("c1", { pr_url: PR_NEW_ORG }, "2026-10-05T02:00:00Z") }, missed);
    await expect(stampSyncedPullRequests(synced())).resolves.toBeUndefined();
    expect(writes()).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/1 stamp\(s\) did not land after a retry: c1/));
    warn.mockRestore();
  });

  it("reports a failed re-read as a card it could not stamp", async () => {
    script("tasks", { data: [row("c1", { pr_url: PR_NEW_ORG })] });
    script("tasks", missed, { error: { message: "read timeout" } });
    await expect(stampSyncedPullRequests(synced())).rejects.toThrow(/could not stamp 1 card.*read timeout/);
  });
});

// F8: a card linked to a PR that HTT already stored was never stamped, because
// HTT re-states only PRs that changed. Setting the link now asks.
describe("asking for a stamp when a link is set (F8)", () => {
  it("asks when a PR link is set on a card that had none", async () => {
    await announcePrLink("c1", {}, { pr_url: PR_NEW_ORG });
    expect(published).toEqual([{ name: "board.card.pr_linked", payload: { taskId: "c1", prUrl: PR_NEW_ORG } }]);
  });

  it("asks when the link changes to another PR", async () => {
    await announcePrLink("c1", { pr_url: PR_NEW_ORG, pr_synced: { key: KEY, title: "t", state: "merged" } }, { pr_url: "https://github.com/edge8-ai/edge8-web/pull/1800" });
    expect(published).toHaveLength(1);
  });

  it("does not ask when the link names the PR the stamp already describes", async () => {
    await announcePrLink("c1", { pr_url: PR_OLD_ORG, pr_synced: { key: KEY, title: "t", state: "merged" } }, { pr_url: PR_NEW_ORG });
    expect(published).toHaveLength(0);
  });

  it("asks again for an unchanged link whose stamp is missing", async () => {
    await announcePrLink("c1", { pr_url: PR_NEW_ORG }, { pr_url: PR_NEW_ORG });
    expect(published).toHaveLength(1);
  });

  it("does not ask for a link that is not a GitHub pull request, or a cleared one", async () => {
    await announcePrLink("c1", {}, { pr_url: "https://example.com/doc" });
    await announcePrLink("c1", { pr_url: PR_NEW_ORG }, {});
    expect(published).toHaveLength(0);
  });

  it("supplies the scheme a pre-W.116 link lacks, so the fact is a URL", async () => {
    await announcePrLink("c1", {}, { pr_url: "github.com/edge8-ai/edge8-web/pull/1781" });
    expect(published[0].payload).toEqual({ taskId: "c1", prUrl: PR_NEW_ORG });
  });
});

describe("the by-hand backfill (F8)", () => {
  it("requests a stamp for each linked card whose stamp is missing or not current, and skips the rest", async () => {
    script("tasks", {
      data: [
        row("c1", { pr_url: PR_NEW_ORG }),
        row("c2", { pr_url: PR_NEW_ORG, pr_synced: { key: KEY, title: "t", state: "merged" } }),
        row("c3", { pr_url: PR_NEW_ORG, pr_synced: { key: "edge8-web#1781", title: "t", state: "merged" } }),
        row("c4", { pr_url: "https://example.com/doc" }),
      ],
    });
    const r = await requestMissingPrStamps();
    expect(r).toEqual({ ok: true, requested: 2, next: null });
    expect(published.map((p) => (p.payload as { taskId: string }).taskId)).toEqual(["c1", "c3"]);
  });

  it("asks for at most 100 per call and hands back where to carry on", async () => {
    const many = Array.from({ length: 150 }, (_, i) => row(`c${String(i).padStart(3, "0")}`, { pr_url: PR_NEW_ORG }));
    script("tasks", { data: many });
    const r = await requestMissingPrStamps();
    expect(r).toEqual({ ok: true, requested: 100, next: "c099" });
    expect(published).toHaveLength(100);

    script("tasks", { data: many.slice(100) });
    const again = await requestMissingPrStamps("c099");
    expect(again).toEqual({ ok: true, requested: 50, next: null });
    expect(reads().at(-1)!.filters).toContainEqual(["gt", "id", "c099"]);
  });

  it("is refused before anything is read when the caller does not hold boards.open", async () => {
    const { requirePermission } = await import("@/kernel/identity/access-request");
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(requestMissingPrStamps()).rejects.toThrow("NEXT_REDIRECT");
    expect(vi.mocked(requirePermission)).toHaveBeenLastCalledWith("boards.open");
    expect(calls).toHaveLength(0);
  });
});
