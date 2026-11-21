import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The runs list's counts and the run page's earlier runs (RP.7), read through
// the store with the Supabase client faked at the module boundary.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { earlierRuns, listRuns } = await import("./run-store");

const runRow = (id: string, uploadedAt: string, status = "sent") => ({
  id,
  profile_id: "profile-1",
  profile_version: 2,
  file_name: `${id}.xlsx`,
  data_rows: 1200,
  truncated: false,
  status,
  uploaded_by: "person-1",
  uploaded_at: uploadedAt,
  sent_by: null,
  sent_at: null,
  closed_by: null,
  closed_at: null,
});
const jobRow = (runId: string, by: string | null) => ({ run_id: runId, done_at: by ? "2026-10-29T03:00:00Z" : null, done_by: by });

beforeEach(() => resetFake());

describe("listRuns", () => {
  it("counts each run's jobs, the done ones, and who did them, most jobs first", async () => {
    script("replenishment_runs", { data: [runRow("run-2", "2026-10-29T01:00:00Z"), runRow("run-1", "2026-10-22T01:00:00Z", "closed"), runRow("run-0", "2026-10-15T01:00:00Z", "draft")] });
    script("replenishment_jobs", {
      data: [jobRow("run-2", "sam"), jobRow("run-2", "dana"), jobRow("run-2", "dana"), jobRow("run-2", null), jobRow("run-1", "sam"), jobRow("run-1", "sam")],
    });
    const runs = await listRuns();
    expect(runs.map(({ id, status, uploadedAt, jobs, done, workedBy }) => ({ id, status, uploadedAt, jobs, done, workedBy }))).toEqual([
      { id: "run-2", status: "sent", uploadedAt: "2026-10-29T01:00:00Z", jobs: 4, done: 3, workedBy: ["dana", "sam"] },
      { id: "run-1", status: "closed", uploadedAt: "2026-10-22T01:00:00Z", jobs: 2, done: 2, workedBy: ["sam"] },
      // A run with no jobs is a valid, empty run.
      { id: "run-0", status: "draft", uploadedAt: "2026-10-15T01:00:00Z", jobs: 0, done: 0, workedBy: [] },
    ]);
    // Every run's jobs are read in the one paged query, not one query per run.
    expect(calls.filter((c) => c.table === "replenishment_jobs")).toHaveLength(1);
    expect(calls.find((c) => c.table === "replenishment_jobs")?.filters).toEqual([["in", "run_id", ["run-2", "run-1", "run-0"]]]);
  });

  it("raises when the job counts cannot be read, rather than calling every run empty", async () => {
    script("replenishment_runs", { data: [runRow("run-2", "2026-10-29T01:00:00Z")] });
    script("replenishment_jobs", { data: null, error: { message: "timeout" } });
    await expect(listRuns()).rejects.toThrow(/job counts/);
  });

  it("raises when the runs cannot be read", async () => {
    script("replenishment_runs", { data: null, error: { message: "timeout" } });
    await expect(listRuns()).rejects.toThrow(/list/);
  });
});

describe("earlierRuns", () => {
  it("reads the same profile's runs uploaded before this one, newest first, with their counts", async () => {
    script("replenishment_runs", { data: [runRow("run-1", "2026-10-22T01:00:00Z", "closed")] });
    script("replenishment_jobs", { data: [jobRow("run-1", "sam"), jobRow("run-1", null)] });
    const runs = await earlierRuns({ profileId: "profile-1", uploadedAt: "2026-10-29T01:00:00Z" });
    expect(runs.map(({ id, jobs, done, workedBy }) => ({ id, jobs, done, workedBy }))).toEqual([{ id: "run-1", jobs: 2, done: 1, workedBy: ["sam"] }]);
    const read = calls.find((c) => c.table === "replenishment_runs");
    expect(read?.filters).toEqual([
      ["eq", "profile_id", "profile-1"],
      ["lt", "uploaded_at", "2026-10-29T01:00:00Z"],
    ]);
    expect(read?.ops).toEqual(expect.arrayContaining(["order", "limit"]));
  });

  it("answers no earlier runs without reading any jobs", async () => {
    script("replenishment_runs", { data: [] });
    expect(await earlierRuns({ profileId: "profile-1", uploadedAt: "2026-10-29T01:00:00Z" })).toEqual([]);
    expect(calls.filter((c) => c.table === "replenishment_jobs")).toEqual([]);
  });
});
