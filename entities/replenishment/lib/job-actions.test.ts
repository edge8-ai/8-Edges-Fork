import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, timeline } from "@/kernel/data/testing/fake-company-os";

// Working a sent run (RP.5), through the actions only, with the Supabase
// client faked at the module boundary as RP.4's tests do: what a scan writes,
// what a reopen clears, and which runs refuse both.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const guard = vi.hoisted(() => ({ asked: [] as string[], refuse: null as Error | null, personId: "person-7" as string | null }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    guard.asked.push(p);
    if (guard.refuse) throw guard.refuse;
    return { user: { email: "operator@example.com" }, personId: guard.personId };
  },
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/audit/audit", () => audit);
const session = vi.hoisted(() => ({ signOutTo: vi.fn(async () => {}) }));
vi.mock("@/kernel/identity/session", () => session);

const { completeJob, reopenJob, notYou } = await import("./job-actions");

const JOB_ID = "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b";
const RUN_ID = "0b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e";

/** Scripts the two reads that find the job's run, and the write that follows. */
function jobOnRun(status: string, written = true) {
  script("replenishment_jobs", { data: { run_id: RUN_ID } });
  script("replenishment_runs", { data: { id: RUN_ID, status } });
  script("replenishment_jobs", { data: written ? [{ id: JOB_ID }] : [] });
}

const updates = () => calls.filter((c) => c.table === "replenishment_jobs" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  guard.asked.length = 0;
  guard.refuse = null;
  guard.personId = "person-7";
  vi.clearAllMocks();
});

describe("completeJob", () => {
  it("records the trimmed BIN, the time and the person together, on the job of a sent run", async () => {
    jobOnRun("sent");
    const before = Date.now();
    expect(await completeJob(JOB_ID, "  A05B02S04 \n")).toEqual({ ok: true });
    expect(guard.asked).toEqual(["replenishment.work"]);

    const [write] = updates();
    const columns = write?.payloads[0] as { bin_used: string; done_at: string; done_by: string };
    expect(columns.bin_used).toBe("A05B02S04");
    expect(columns.done_by).toBe("person-7");
    expect(Date.parse(columns.done_at)).toBeGreaterThanOrEqual(before - 1);
    // The write names the job and its run, so it can never reach another run's job.
    expect(write?.filters).toEqual([["eq", "id", JOB_ID], ["eq", "run_id", RUN_ID]]);
    expect(timeline()).toEqual(["replenishment_jobs:select", "replenishment_runs:select", "replenishment_jobs:update"]);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("accepts any BIN, however it is spelt", async () => {
    jobOnRun("sent");
    expect(await completeJob(JOB_ID, "shelf by the door, 3rd from top")).toEqual({ ok: true });
    expect((updates()[0]?.payloads[0] as { bin_used: string }).bin_used).toBe("shelf by the door, 3rd from top");
  });

  it("overwrites the BIN of a job that is done already, so a second scan corrects the first", async () => {
    jobOnRun("sent");
    jobOnRun("sent");
    expect(await completeJob(JOB_ID, "A01")).toEqual({ ok: true });
    expect(await completeJob(JOB_ID, "B02")).toEqual({ ok: true });
    expect(updates().map((c) => (c.payloads[0] as { bin_used: string }).bin_used)).toEqual(["A01", "B02"]);
  });

  it("refuses an empty BIN before reading anything", async () => {
    expect(await completeJob(JOB_ID, "   ")).toEqual({ ok: false, error: "Scan or type the BIN first." });
    expect(calls).toHaveLength(0);
  });

  it("refuses a job id that is not one", async () => {
    expect(await completeJob("not-a-job", "A01")).toEqual({ ok: false, error: "That job was not found." });
    expect(calls).toHaveLength(0);
  });

  it("refuses a job on a draft or a closed run, and writes nothing", async () => {
    script("replenishment_jobs", { data: { run_id: RUN_ID } });
    script("replenishment_runs", { data: { id: RUN_ID, status: "draft" } });
    expect(await completeJob(JOB_ID, "A01")).toEqual({ ok: false, error: "This run has not been sent to the scanners yet." });
    script("replenishment_jobs", { data: { run_id: RUN_ID } });
    script("replenishment_runs", { data: { id: RUN_ID, status: "closed" } });
    expect(await completeJob(JOB_ID, "A01")).toEqual({ ok: false, error: "This run is closed, so its jobs can't change." });
    expect(updates()).toHaveLength(0);
  });

  it("refuses a job that does not exist", async () => {
    script("replenishment_jobs", { data: null });
    expect(await completeJob(JOB_ID, "A01")).toEqual({ ok: false, error: "That job was not found." });
    expect(updates()).toHaveLength(0);
  });

  it("says so when a read fails, and writes nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    script("replenishment_jobs", { error: { message: "connection reset" } });
    expect(await completeJob(JOB_ID, "A01")).toEqual({ ok: false, error: "Could not reach the run. Check the signal and try again." });
    expect(updates()).toHaveLength(0);
  });

  it("says so when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    script("replenishment_jobs", { data: { run_id: RUN_ID } });
    script("replenishment_runs", { data: { id: RUN_ID, status: "sent" } });
    script("replenishment_jobs", { error: { message: "violates check constraint" } });
    expect(await completeJob(JOB_ID, "A01")).toEqual({ ok: false, error: "Could not save the job. Try again." });
  });

  it("refuses someone with no person record, since a finished job must name who finished it", async () => {
    guard.personId = null;
    expect(await completeJob(JOB_ID, "A01")).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it("asks for the work atom before anything else", async () => {
    guard.refuse = new Error("refused");
    await expect(completeJob(JOB_ID, "A01")).rejects.toThrow("refused");
    expect(guard.asked).toEqual(["replenishment.work"]);
    expect(calls).toHaveLength(0);
  });
});

describe("reopenJob", () => {
  it("clears the BIN, the time and the person together, and audits it", async () => {
    jobOnRun("sent");
    expect(await reopenJob(JOB_ID)).toEqual({ ok: true });
    expect(guard.asked).toEqual(["replenishment.work"]);
    const [write] = updates();
    expect(write?.payloads[0]).toEqual({ bin_used: null, done_at: null, done_by: null });
    expect(write?.filters).toEqual([["eq", "id", JOB_ID], ["eq", "run_id", RUN_ID]]);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "replenishment_jobs", recordId: JOB_ID, operation: "update", actor: "operator@example.com" }));
  });

  it("refuses a job on a closed run", async () => {
    script("replenishment_jobs", { data: { run_id: RUN_ID } });
    script("replenishment_runs", { data: { id: RUN_ID, status: "closed" } });
    expect(await reopenJob(JOB_ID)).toEqual({ ok: false, error: "This run is closed, so its jobs can't change." });
    expect(updates()).toHaveLength(0);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("says the job was not found when the write matched no row", async () => {
    jobOnRun("sent", false);
    expect(await reopenJob(JOB_ID)).toEqual({ ok: false, error: "That job was not found." });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});

describe("notYou", () => {
  it("signs the scanner's last person out to the Team sign-in", async () => {
    await notYou();
    expect(guard.asked).toEqual(["replenishment.work"]);
    expect(session.signOutTo).toHaveBeenCalledWith("/team/login");
  });
});
