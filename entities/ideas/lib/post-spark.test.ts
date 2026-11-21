import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// postSpark (LD.2): the one writer every new spark passes through. It posts as
// the person it is given, whatever the row says, and states idea.posted once
// the row is in; a failed insert states nothing.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const published: [string, unknown][] = [];
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async (name: string, payload: unknown) => void published.push([name, payload])) }));
beforeEach(() => {
  resetFake();
  published.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("postSpark", () => {
  it("inserts as the person and states idea.posted with the new id", async () => {
    const { postSpark } = await import("./spark-store");
    script("ideas", { data: { id: "i1" } });
    const row = { kind: "learning", title: "Ask before you build", person_id: "someone-else" } as unknown as Parameters<typeof postSpark>[1];
    expect(await postSpark("p1", row)).toEqual({ data: { id: "i1" }, error: null });
    const insert = calls.find((c) => c.table === "ideas" && c.ops.includes("insert"));
    expect(insert?.payloads[0]).toMatchObject({ kind: "learning", title: "Ask before you build", person_id: "p1" });
    expect(published).toEqual([["idea.posted", { ideaId: "i1", personId: "p1" }]]);
  });

  it("returns the error and states nothing when the insert fails", async () => {
    const { postSpark } = await import("./spark-store");
    script("ideas", { data: null, error: { message: "denied" } });
    expect(await postSpark("p1", { title: "x" })).toEqual({ data: null, error: "denied" });
    expect(published).toEqual([]);
  });
});
