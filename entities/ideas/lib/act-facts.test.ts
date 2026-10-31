import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The ladders' second question of Ideas (LD.7): a person's sparks, the marks
// and build notes they gave, and the "it held" others gave them. The read
// names the three marks a badge can rest on, so a skip never reaches the
// ladders.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { sparkFactsOf } = await import("./act-facts");

beforeEach(() => resetFake());

const idea = (id: string, person: string, over: Record<string, unknown> = {}) => ({ id, person_id: person, kind: "learning", status: "open", source_urls: null, created_at: "2026-10-20T03:00:00Z", ...over });

describe("sparkFactsOf", () => {
  it("asks for held, trying and unstuck marks only, and says whose spark each was", async () => {
    script(
      "ideas",
      { data: [idea("i1", "me", { source_urls: ["https://a.example", "https://b.example"] }), idea("i2", "me", { kind: "build", status: "archived" })] },
      { data: [idea("i9", "mate", { kind: "build" })] },
    );
    script(
      "idea_reactions",
      { data: [{ id: "m1", idea_id: "i9", person_id: "me", kind: "unstuck", created_at: "2026-10-21T03:00:00Z" }] },
      {
        data: [
          { id: "h1", idea_id: "i1", person_id: "mate", kind: "held", created_at: "2026-10-22T03:00:00Z" },
          { id: "h2", idea_id: "i1", person_id: "me", kind: "held", created_at: "2026-10-22T04:00:00Z" },
        ],
      },
    );
    script("idea_builds", { data: [{ id: "b1", idea_id: "i9", person_id: "me", created_at: "2026-10-21T05:00:00Z" }] });

    const me = (await sparkFactsOf(["me"])).get("me");

    const marks = calls.find((c) => c.table === "idea_reactions");
    expect(marks?.filters).toEqual(expect.arrayContaining([["in", "kind", ["held", "trying", "unstuck"]], ["is", "archived_at", null]]));
    expect(me?.sparks.map((s) => [s.id, s.kind, s.archived, s.sources])).toEqual([
      ["i1", "learning", false, 2],
      ["i2", "build", true, 0],
    ]);
    expect(me?.marksGiven).toEqual([{ id: "m1", ideaId: "i9", kind: "unstuck", sparkKind: "build", sparkBy: "mate", at: "2026-10-21T03:00:00Z" }]);
    expect(me?.buildNotes).toEqual([{ id: "b1", ideaId: "i9", sparkBy: "mate", at: "2026-10-21T05:00:00Z" }]);
    // The reader's own "it held" on their own spark is not someone else's.
    expect(me?.heldReceived).toEqual([{ id: "h1", ideaId: "i1", by: "mate", at: "2026-10-22T03:00:00Z" }]);
  });
});
