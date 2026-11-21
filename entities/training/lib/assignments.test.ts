import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

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

// TR.21: a learner's file opens only for the organiser who runs the session its
// assignment is on. The organiser names the submission (the assignment and the
// person); the path is read from the submission, never taken from the caller.
// Everyone else, whatever permission their role gives them, reads "not found".
describe("signSubmissionForOrganiser", () => {
  const ASSIGNMENT = "0b3c6c1e-8f2a-4f8e-9d1a-2c3b4d5e6f70";
  const LEARNER = "5a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const PATH = `plan/p1/assignment/${ASSIGNMENT}/${LEARNER}/1-talk.webm`;
  const NOT_FOUND = { ok: false, error: "That file was not found." };
  const row = (organiserId: string, storagePath: string | null = PATH) => ({ storage_path: storagePath, assignment: { training: { organiser_id: organiserId } } });

  it("gives the session's organiser a short link to the file on the submission", async () => {
    const { signSubmissionForOrganiser } = await import("./assignments");
    script("training_submissions", { data: [row("hoan")] });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://signed/talk" } });
    expect(await signSubmissionForOrganiser("hoan", ASSIGNMENT, LEARNER)).toEqual({ ok: true, url: "https://signed/talk" });
    expect(storageCalls).toEqual([expect.objectContaining({ bucket: "training-uploads", op: "createSignedUrl", args: [PATH, 600] })]);
    const read = calls.find((c) => c.table === "training_submissions");
    expect(read?.filters).toEqual(expect.arrayContaining([["eq", "assignment_id", ASSIGNMENT], ["eq", "person_id", LEARNER], ["eq", "assignment.training.organiser_id", "hoan"]]));
  });

  it("refuses an organiser who does not run that session, and signs nothing", async () => {
    const { signSubmissionForOrganiser } = await import("./assignments");
    script("training_submissions", { data: [row("someone-else")] });
    expect(await signSubmissionForOrganiser("hoan", ASSIGNMENT, LEARNER)).toEqual(NOT_FOUND);
    expect(storageCalls).toEqual([]);
  });

  it("refuses when the reader organises no session the submission is on (an admin or a team manager)", async () => {
    const { signSubmissionForOrganiser } = await import("./assignments");
    script("training_submissions", { data: [] });
    expect(await signSubmissionForOrganiser("admin", ASSIGNMENT, LEARNER)).toEqual(NOT_FOUND);
    expect(storageCalls).toEqual([]);
  });

  it("has nothing to open for a written or link answer", async () => {
    const { signSubmissionForOrganiser } = await import("./assignments");
    script("training_submissions", { data: [row("hoan", null)] });
    expect(await signSubmissionForOrganiser("hoan", ASSIGNMENT, LEARNER)).toEqual(NOT_FOUND);
    expect(storageCalls).toEqual([]);
  });

  it("refuses an id that is not one, before reading anything", async () => {
    const { signSubmissionForOrganiser } = await import("./assignments");
    expect(await signSubmissionForOrganiser("hoan", "training-uploads/x", LEARNER)).toEqual(NOT_FOUND);
    expect(await signSubmissionForOrganiser("hoan", ASSIGNMENT, `${LEARNER}/../other`)).toEqual(NOT_FOUND);
    expect(calls).toEqual([]);
    expect(storageCalls).toEqual([]);
  });

  it("no longer offers a way to sign a path the caller supplies", async () => {
    const mod: Record<string, unknown> = await import("./assignments");
    expect(mod.signDownload).toBeUndefined();
  });
});
