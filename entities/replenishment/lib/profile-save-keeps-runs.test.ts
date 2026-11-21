import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";
import { WAREHOUSE_PROFILE } from "./__fixtures__/warehouse";

// A save never changes a run already made (RP.6; spec "Data": a run keeps a
// snapshot of its profile and its jobs are written once, at upload). Through
// the public functions: a run is made, the profile is saved with a threshold
// that would no longer make one of its jobs, and the run still reads back with
// its own snapshot and every job it was sent with. The fake database answers
// each read with the rows the earlier writes put there.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async () => ({ user: { email: "manager@example.com" }, personId: "person-1" }),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));

const { createRun } = await import("./run-actions");
const { saveProfile } = await import("./profile-actions");
const { jobsOfRun, readRun } = await import("./run-store");

const PROFILE_ID = "7c1f2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b";
const profileRow = { id: PROFILE_ID, name: "Main floor", warehouse: "Site 1", version: 3, saved_by: null, saved_at: "2026-10-28T01:00:00Z", document: WAREHOUSE_PROFILE };
// KES-38 holds 23 in the pick face: a job below 24, not below 20.
const EXPORT = ["Item,Description,Bin,On hand", "KES-38,Kestrel Arlo Black 38R,P03-02,23", "KES-38,Kestrel Arlo Black 38R,U05,30", "KES-44,Kestrel Arlo Black 44R,U02,10"].join("\n");

const written = (table: string, op: string) => calls.filter((c) => c.table === table && c.ops.includes(op)).map((c) => c.payloads[0]);

beforeEach(() => resetFake());

describe("saving a profile", () => {
  it("leaves a run made before the save with its own snapshot and every job", async () => {
    script("replenishment_profiles", { data: profileRow });
    scriptStorage("upload", { data: { path: "x" } });
    script("replenishment_runs", { data: null });
    script("replenishment_jobs", { data: null });
    const data = new FormData();
    data.set("profileId", PROFILE_ID);
    data.set("file", new File([EXPORT], "export.csv"));
    const made = await createRun(data);
    if (!made.ok) throw new Error(made.error);
    const runRow = written("replenishment_runs", "insert")[0] as Record<string, unknown>;
    const jobRows = (written("replenishment_jobs", "insert")[0] as { item: string }[]).map((row, i) => ({ ...row, id: `job-${i + 1}`, done_at: null, bin_used: null, done_by: null }));
    expect(jobRows.map((job) => job.item)).toEqual(["KES-44", "KES-38"]);

    const edited = structuredClone(WAREHOUSE_PROFILE);
    edited.rules[0].bands[0].reorderBelow = 20;
    script("replenishment_profiles", { data: [{ version: 4 }] });
    const before = calls.length;
    expect(await saveProfile({ id: PROFILE_ID, version: 3, name: "Main floor", warehouse: "Site 1", document: edited })).toEqual({ ok: true, version: 4 });
    expect(calls.slice(before).map((c) => c.table)).toEqual(["replenishment_profiles"]);

    script("replenishment_runs", { data: { ...runRow, uploaded_at: "2026-10-29T01:00:00Z", sent_by: null, sent_at: null, closed_by: null, closed_at: null } });
    script("replenishment_jobs", { data: jobRows });
    const run = await readRun(made.id as string);
    const jobs = await jobsOfRun(made.id as string);
    expect(run?.profileVersion).toBe(3);
    expect(run?.snapshot?.rules[0].bands[0].reorderBelow).toBe(24);
    expect(jobs.map((job) => [job.item, job.move])).toEqual([
      ["KES-44", "8 or 10"],
      ["KES-38", "12"],
    ]);
  });
});
