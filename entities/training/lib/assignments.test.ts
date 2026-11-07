import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Homework (PR 4): a submission of a kind the assignment does not accept is
// refused before anything is written; an uploaded path must sit under the
// learner's own prefix; a resubmission replaces.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-14T09:00:00Z");
const ASG = { id: "a1", training_id: "t1", due_at: "2026-10-19T11:00:00Z", prompt: "Record yourself", accepts: ["recording", "link"], archived_at: null, training: { plan_id: "p1" } };

describe("recordSubmission", () => {
  it("refuses a kind the assignment does not take", async () => {
    const { recordSubmission } = await import("./assignments");
    script("training_assignments", { data: [ASG] });
    expect(await recordSubmission("duc", "a1", { kind: "written", text: "hello" }, NOW)).toEqual({ ok: false, error: "This homework does not take a written answer." });
    expect(calls.filter((c) => c.table === "training_submissions")).toEqual([]);
  });

  it("refuses an uploaded path outside the learner's own prefix", async () => {
    const { recordSubmission } = await import("./assignments");
    script("training_assignments", { data: [ASG] });
    expect(await recordSubmission("duc", "a1", { kind: "recording", storagePath: "plan/p1/assignment/a1/harry/x.webm" }, NOW)).toEqual({ ok: false, error: "Invalid upload path." });
  });

  it("upserts the one row per learner and assignment", async () => {
    const { recordSubmission } = await import("./assignments");
    script("training_assignments", { data: [ASG] });
    script("training_submissions", { data: null });
    expect(await recordSubmission("duc", "a1", { kind: "link", url: "https://example.test/x" }, NOW)).toEqual({ ok: true });
    const up = calls.find((c) => c.table === "training_submissions" && c.ops.includes("upsert"));
    expect(up?.payloads[0]).toMatchObject({ assignment_id: "a1", person_id: "duc", kind: "link", url: "https://example.test/x", text: null, storage_path: null });
    expect(up?.options[0]).toEqual({ onConflict: "assignment_id,person_id" });
  });

  it("refuses an assignment on a session the learner is not on", async () => {
    const { recordSubmission } = await import("./assignments");
    script("training_assignments", { data: [] });
    expect(await recordSubmission("duc", "a1", { kind: "link", url: "https://example.test/x" }, NOW)).toEqual({ ok: false, error: "That homework was not found." });
  });
});
