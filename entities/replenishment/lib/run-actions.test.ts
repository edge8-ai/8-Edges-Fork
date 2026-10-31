import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls, timeline } from "@/kernel/data/testing/fake-company-os";
import { WAREHOUSE_PROFILE } from "./__fixtures__/warehouse";
import { buildRun } from "./engine";
import { parseProfile } from "./profile";
import { readExport } from "./read-export";

// The weekly run (RP.4), through the actions only, with the Supabase client
// faked at the module boundary. createRun runs the real reader and the real
// engine on a synthetic export, so the jobs it writes are compared with what
// the engine makes of the same file; the database and the bucket are the fake.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const guard = vi.hoisted(() => ({ asked: [] as string[], refuse: null as Error | null }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    guard.asked.push(p);
    if (guard.refuse) throw guard.refuse;
    return { user: { email: "manager@example.com" }, personId: "person-1" };
  },
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/audit/audit", () => audit);

const { createRun, sendRun, closeRun } = await import("./run-actions");

const PROFILE_ID = "7c1f2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b";
const RUN_ID = "0b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e";
const profileRow = { id: PROFILE_ID, name: "Main floor", warehouse: "Site 1", version: 3, saved_by: null, saved_at: "2026-10-28T01:00:00Z", document: WAREHOUSE_PROFILE };

const csv = (...lines: string[]) => lines.join("\n");
const HEADER = "Item,Description,Bin,On hand";
// Two jobs (one a choice at the shelf), one excluded item and one whose size
// cannot be read, among locations in and out of the zones.
const EXPORT = csv(
  HEADER,
  "KES-38,Kestrel Arlo Black 38R,P03-02,23",
  "KES-38,Kestrel Arlo Black 38R,U05,30",
  "KES-44,Kestrel Arlo Black 44R,U02,10",
  "SOCK-1,Kestrel socks 38R,U01,5",
  "KES-X,Kestrel Arlo no size,U03,4",
  "KES-38,Kestrel Arlo Black 38R,DOCK,99",
);

function form(text: string | Uint8Array<ArrayBuffer>, name = "export.csv", profileId = PROFILE_ID): FormData {
  const data = new FormData();
  data.set("profileId", profileId);
  data.set("file", new File([text], name));
  return data;
}

const writes = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => ["insert", "update", "delete"].includes(op)));
const payload = <T,>(table: string, i = 0) => writes(table)[i]?.payloads[0] as T;

beforeEach(() => {
  resetFake();
  guard.asked.length = 0;
  guard.refuse = null;
  vi.clearAllMocks();
});

describe("createRun", () => {
  it("turns a synthetic export into a draft run whose jobs are the engine's, in walking order", async () => {
    script("replenishment_profiles", { data: profileRow });
    scriptStorage("upload", { data: { path: "x" } });
    script("replenishment_runs", { data: null });
    script("replenishment_jobs", { data: null });

    const result = await createRun(form(EXPORT));
    expect(result.ok).toBe(true);
    expect(guard.asked).toEqual(["replenishment.runs"]);

    const profile = parseProfile(WAREHOUSE_PROFILE);
    if (!profile.ok) throw new Error(profile.error);
    const expected = buildRun(profile.profile, readExport(new TextEncoder().encode(EXPORT)));
    expect(expected.jobs.map((j) => j.item)).toEqual(["KES-44", "KES-38"]);

    const run = payload<Record<string, unknown>>("replenishment_runs");
    const id = (result as { id: string }).id;
    expect(run).toMatchObject({
      id,
      profile_id: PROFILE_ID,
      profile_version: 3,
      profile_snapshot: WAREHOUSE_PROFILE,
      file_name: "export.csv",
      storage_path: `runs/${id}/export.csv`,
      data_rows: 6,
      truncated: false,
      status: "draft",
      uploaded_by: "person-1",
    });
    expect(run.left_out).toEqual(expected.leftOut);
    expect((run.left_out as { item: string }[]).map((x) => x.item).sort()).toEqual(["KES-X", "SOCK-1"]);

    const jobs = payload<Record<string, unknown>[]>("replenishment_jobs");
    expect(jobs).toEqual(
      expected.jobs.map((job, i) => ({
        run_id: id,
        position: i + 1,
        item: job.item,
        description: job.description,
        rule_label: job.rule,
        band_label: job.band,
        pick_total: Number(job.pick),
        reserve_total: Number(job.reserve),
        move_text: job.move,
        collect: job.collect,
        destinations: job.destinations,
      })),
    );
    expect(jobs.map((j) => [j.item, j.move_text])).toEqual([["KES-44", "8 or 10"], ["KES-38", "12"]]);

    expect(storageCalls).toHaveLength(1);
    expect(storageCalls[0]).toMatchObject({ bucket: "replenishment-exports", op: "upload" });
    expect(storageCalls[0]?.args[0]).toBe(`runs/${id}/export.csv`);
    expect(timeline()).toEqual(["replenishment_profiles:select", "replenishment_runs:insert", "replenishment_jobs:insert"]);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "replenishment_runs", recordId: id, operation: "insert", newData: expect.objectContaining({ jobs: 2, left_out: 2 }) }));
  });

  it("makes an export with nothing to restock a valid, empty run, and writes no jobs", async () => {
    script("replenishment_profiles", { data: profileRow });
    scriptStorage("upload", { data: { path: "x" } });
    script("replenishment_runs", { data: null });

    const result = await createRun(form(csv(HEADER, "KES-38,Kestrel Arlo Black 38R,P03-02,40", "KES-38,Kestrel Arlo Black 38R,U05,30")));
    expect(result.ok).toBe(true);
    expect(payload<Record<string, unknown>>("replenishment_runs")).toMatchObject({ status: "draft", data_rows: 2, truncated: true, left_out: [] });
    expect(writes("replenishment_jobs")).toEqual([]);
  });

  it("refuses an export missing a column with the engine's sentence, and keeps and writes nothing", async () => {
    script("replenishment_profiles", { data: profileRow });
    const result = await createRun(form(csv("Item,Description,Bin", "KES-38,Kestrel Arlo Black 38R,U05")));
    expect(result).toEqual({ ok: false, error: 'The export has no "On hand" column.' });
    expect(storageCalls).toEqual([]);
    expect(writes("replenishment_runs")).toEqual([]);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("refuses a damaged workbook with the reader's sentence", async () => {
    script("replenishment_profiles", { data: profileRow });
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    const result = await createRun(form(broken, "export.xlsx"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/could not be read as a spreadsheet/);
    expect(storageCalls).toEqual([]);
  });

  it("refuses a file that is not an export before reading the profile", async () => {
    expect(await createRun(form("%PDF-1.7", "export.pdf"))).toEqual({ ok: false, error: "export.pdf can't be read. Upload the export as .xlsx or .csv." });
    expect(calls).toEqual([]);
  });

  it("asks for the profile and the file", async () => {
    expect(await createRun(form(EXPORT, "export.csv", "nope"))).toEqual({ ok: false, error: "Choose the profile to read the export with." });
    const noFile = new FormData();
    noFile.set("profileId", PROFILE_ID);
    expect(await createRun(noFile)).toEqual({ ok: false, error: "Choose this week's stock export." });
    expect(calls).toEqual([]);
  });

  it("refuses to build from a stored profile that no longer passes its checks", async () => {
    script("replenishment_profiles", { data: { ...profileRow, document: { ...WAREHOUSE_PROFILE, rules: [] } } });
    const result = await createRun(form(EXPORT));
    expect(!result.ok && result.error).toMatch(/^The profile no longer passes its checks.*rules/);
    expect(storageCalls).toEqual([]);
  });

  it("raises when the profile cannot be read, rather than calling it missing", async () => {
    script("replenishment_profiles", { error: { message: "down" } });
    await expect(createRun(form(EXPORT))).rejects.toThrow(/read failed/);
  });

  it("deletes the run and the kept export when its jobs are refused", async () => {
    script("replenishment_profiles", { data: profileRow });
    scriptStorage("upload", { data: { path: "x" } });
    scriptStorage("remove", { data: [] });
    script("replenishment_runs", { data: null }, { data: null });
    script("replenishment_jobs", { error: { message: "check violated" } });

    expect(await createRun(form(EXPORT))).toEqual({ ok: false, error: "Could not save the run. Try again." });
    const [insert, undo] = writes("replenishment_runs");
    expect(undo?.ops).toContain("delete");
    expect(undo?.filters).toEqual([["eq", "id", (insert?.payloads[0] as { id: string }).id]]);
    expect(storageCalls.map((c) => c.op)).toEqual(["upload", "remove"]);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("raises, naming the run, when a run whose jobs were refused cannot be deleted again", async () => {
    script("replenishment_profiles", { data: profileRow });
    scriptStorage("upload", { data: { path: "x" } });
    script("replenishment_runs", { data: null }, { error: { message: "down" } });
    script("replenishment_jobs", { error: { message: "check violated" } });
    await expect(createRun(form(EXPORT))).rejects.toThrow(/was written without its jobs and could not be deleted again/);
  });

  it("writes nothing when the export cannot be kept", async () => {
    script("replenishment_profiles", { data: profileRow });
    scriptStorage("upload", { error: { message: "bucket full" } });
    expect(await createRun(form(EXPORT))).toEqual({ ok: false, error: "Could not keep the export. Try again." });
    expect(writes("replenishment_runs")).toEqual([]);
  });

  it("is refused before anything else when the guard refuses", async () => {
    guard.refuse = new Error("NEXT_NOT_FOUND");
    await expect(createRun(form(EXPORT))).rejects.toBe(guard.refuse);
    expect(calls).toEqual([]);
    expect(storageCalls).toEqual([]);
  });
});

describe("sendRun", () => {
  it("sends a draft, stamping who and when, and only a draft", async () => {
    script("replenishment_runs", { data: [{ id: RUN_ID }] });
    expect(await sendRun(RUN_ID)).toEqual({ ok: true });
    expect(guard.asked).toEqual(["replenishment.runs"]);
    const [update] = writes("replenishment_runs");
    expect(update?.payloads[0]).toMatchObject({ status: "sent", sent_by: "person-1", sent_at: expect.any(String) });
    expect(update?.filters).toEqual([["eq", "id", RUN_ID], ["in", "status", ["draft"]]]);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ recordId: RUN_ID, newData: { status: "sent" } }));
  });

  it("says so when the run is no longer a draft", async () => {
    script("replenishment_runs", { data: [] });
    expect(await sendRun(RUN_ID)).toEqual({ ok: false, error: "Only a draft can be sent, and this run is not one any more. Reload the page." });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("reports a failed write as a failure", async () => {
    script("replenishment_runs", { error: { message: "down" } });
    expect(await sendRun(RUN_ID)).toEqual({ ok: false, error: "Could not send the run. Try again." });
  });

  it("refuses a malformed id before it touches the database", async () => {
    expect(await sendRun("nope")).toEqual({ ok: false, error: "Run not found." });
    expect(calls).toEqual([]);
  });
});

describe("closeRun", () => {
  it("closes a draft or a sent run, stamping who and when", async () => {
    script("replenishment_runs", { data: [{ id: RUN_ID }] });
    expect(await closeRun(RUN_ID)).toEqual({ ok: true });
    const [update] = writes("replenishment_runs");
    expect(update?.payloads[0]).toMatchObject({ status: "closed", closed_by: "person-1", closed_at: expect.any(String) });
    expect(update?.filters).toEqual([["eq", "id", RUN_ID], ["in", "status", ["draft", "sent"]]]);
  });

  it("says so when the run is closed already", async () => {
    script("replenishment_runs", { data: [] });
    expect(await closeRun(RUN_ID)).toEqual({ ok: false, error: "This run is closed already. Reload the page." });
  });
});
