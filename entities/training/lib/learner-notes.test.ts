import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The teacher's note (PR 4): a new row per save, by the plan's organiser only;
// the latest per learner is the current note and the count of versions rides with it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

describe("learner notes", () => {
  it("writes a new version on the organiser's own plan, and refuses another's", async () => {
    const { writeNote } = await import("./learner-notes");
    script("training_plans", { data: [{ id: "p1" }] });
    script("training_learner_notes", { data: null });
    expect(await writeNote("hoan", "p1", "duc", { strong: "s", weak: "w", focus: "f" })).toEqual({ ok: true });
    expect(calls.find((c) => c.table === "training_learner_notes")?.payloads[0]).toEqual({ plan_id: "p1", person_id: "duc", strong: "s", weak: "w", focus: "f", written_by: "hoan" });
    script("training_plans", { data: [] });
    expect(await writeNote("someone", "p1", "duc", { strong: "s", weak: "w", focus: "f" })).toEqual({ ok: false, error: "That plan was not found." });
  });

  it("gives the latest per learner with the number of versions", async () => {
    const { latestNotes } = await import("./learner-notes");
    script("training_learner_notes", { data: [
      { person_id: "duc", strong: "new", weak: "", focus: "", created_at: "2026-10-12T00:00:00Z" },
      { person_id: "duc", strong: "old", weak: "", focus: "", created_at: "2026-10-09T00:00:00Z" },
      { person_id: "harry", strong: "h", weak: "", focus: "", created_at: "2026-10-10T00:00:00Z" },
    ] });
    const notes = await latestNotes("p1", ["duc", "harry"]);
    expect(notes.get("duc")).toEqual({ strong: "new", weak: "", focus: "", writtenAt: "2026-10-12T00:00:00Z", versions: 2 });
    expect(notes.get("harry")?.versions).toBe(1);
  });
});
