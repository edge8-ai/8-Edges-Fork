import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/entities/finance", () => ({}));
vi.mock("@/kernel/audit/routine-runs-readers", () => ({}));

import { nextWeeklySync, runMarks, syncHealth, type RunMark } from "./qbo-sync-overview";

const NOW = Date.parse("2026-11-13T06:00:00Z");
const ok: RunMark = { startedAt: "2026-11-09T05:30:00Z", outcome: "ok", error: null };
const base = { connected: true, sharedWith: null, latest: ok, lastSyncedAt: "2026-11-09T05:30:55Z", now: NOW };

describe("syncHealth", () => {
  it("is in sync when the last run worked and synced this week", () => {
    expect(syncHealth(base)).toEqual({ tone: "ok", headline: "Invoices in sync" });
  });

  // The page's old badge said "Connected" for AIO for five weeks while it was
  // linked to Edge8's books. Shared books outrank every other fact.
  it("says linked to the wrong books before anything else a connected company could say", () => {
    expect(syncHealth({ ...base, sharedWith: "edge8" }).headline).toBe("Not syncing: linked to the wrong books");
  });

  it("names a failed last run with its error", () => {
    const failed: RunMark = { ...ok, outcome: "failed", error: "QBO 401" };
    expect(syncHealth({ ...base, latest: failed })).toEqual({ tone: "err", headline: "Last sync failed", error: "QBO 401" });
  });

  it("calls a sync older than a week overdue", () => {
    expect(syncHealth({ ...base, lastSyncedAt: "2026-11-01T05:30:00Z" }).headline).toBe("Sync is overdue");
  });

  it("is not connected before anything else", () => {
    expect(syncHealth({ ...base, connected: false, sharedWith: "edge8" }).headline).toBe("Not connected");
  });
});

describe("runMarks", () => {
  const run = (results: unknown, status = "ok", error: string | null = null) => ({ started_at: "2026-11-09T05:30:00Z", status, error, result: results === undefined ? null : { results } });

  it("reads each company's own outcome from the run's results", () => {
    const rows = [run([{ entity: "edge8", ok: true }, { entity: "aio", ok: false, error: "shared books" }])];
    expect(runMarks(rows, "edge8")[0].outcome).toBe("ok");
    expect(runMarks(rows, "aio")[0]).toMatchObject({ outcome: "failed", error: "shared books" });
  });

  it("marks a run that left the company out as off", () => {
    expect(runMarks([run([{ entity: "edge8", ok: true }])], "aio")[0].outcome).toBe("off");
  });

  it("marks a run that died before writing results as failed for everyone", () => {
    expect(runMarks([run(undefined, "died", "timeout")], "aio")[0]).toMatchObject({ outcome: "failed", error: "timeout" });
  });
});

describe("nextWeeklySync", () => {
  it("is the coming Monday at 05:30 UTC", () => {
    expect(nextWeeklySync(new Date(NOW)).toISOString()).toBe("2026-11-16T05:30:00.000Z");
  });

  it("is next week's once this Monday's time has passed", () => {
    expect(nextWeeklySync(new Date("2026-11-16T05:31:00Z")).toISOString()).toBe("2026-11-23T05:30:00.000Z");
    expect(nextWeeklySync(new Date("2026-11-16T05:00:00Z")).toISOString()).toBe("2026-11-16T05:30:00.000Z");
  });

  // The cron's schedule is read as text by the generator, so it is read as text here.
  it("matches the schedule the cron declares", () => {
    const cron = readFileSync(new URL("../crons/qbo-invoice-sync.ts", import.meta.url), "utf8");
    expect(cron).toContain('export const schedule = "30 5 * * 1";');
  });
});
