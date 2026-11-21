import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.25: the switch Settings -> Agents writes. Off needs a reason, because
// every skipped run repeats it; on keeps the row and says who switched it.
// The reader fails loudly, because a page that showed a paused routine as on
// would be wrong in the one way that matters.

const db = vi.hoisted(() => ({
  upserts: [] as { row: Record<string, unknown>; opts: unknown }[],
  read: { data: [] as unknown[] | null, error: null as { message: string } | null },
  write: { data: [{ routine_id: "x" }] as unknown[] | null, error: null as { message: string } | null },
}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      select: async () => db.read,
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        db.upserts.push({ row, opts });
        return { select: async () => db.write };
      },
    }),
  },
}));

const { pauseRoutine, resumeRoutine, routineSwitches, shadowRoutine } = await import("./routine-config");

beforeEach(() => {
  db.upserts.length = 0;
  db.read = { data: [], error: null };
  db.write = { data: [{ routine_id: "x" }], error: null };
});

describe("pauseRoutine", () => {
  it("writes the pause with its trimmed reason and who switched it", async () => {
    expect(await pauseRoutine("/api/cron/ideas-digest/", "  waiting on Y.22 ", "person-1")).toEqual({ ok: true });
    expect(db.upserts[0].row).toMatchObject({ routine_id: "/api/cron/ideas-digest/", mode: "paused", paused_reason: "waiting on Y.22", updated_by: "person-1" });
    expect(db.upserts[0].opts).toEqual({ onConflict: "routine_id" });
  });

  it("refuses a pause with no reason and writes nothing", async () => {
    expect(await pauseRoutine("/api/cron/ideas-digest/", "   ", "person-1")).toMatchObject({ ok: false });
    expect(db.upserts).toHaveLength(0);
  });

  it("says when the write failed or touched no row", async () => {
    db.write = { data: null, error: { message: "permission denied" } };
    expect(await pauseRoutine("/api/cron/x/", "why", null)).toEqual({ ok: false, error: "routine_config: permission denied" });
    db.write = { data: [], error: null };
    expect(await pauseRoutine("/api/cron/x/", "why", null)).toMatchObject({ ok: false });
  });
});

describe("resumeRoutine", () => {
  it("turns it on by writing live with no reason, keeping the row", async () => {
    expect(await resumeRoutine("/api/cron/ideas-digest/", "person-1")).toEqual({ ok: true });
    expect(db.upserts[0].row).toMatchObject({ mode: "live", paused_reason: null, updated_by: "person-1" });
  });
});

describe("shadowRoutine (Z.17)", () => {
  it("writes shadow with no reason, keeping who switched it", async () => {
    expect(await shadowRoutine("/api/cron/chain/", "person-1")).toEqual({ ok: true });
    expect(db.upserts[0].row).toMatchObject({ routine_id: "/api/cron/chain/", mode: "shadow", paused_reason: null, updated_by: "person-1" });
  });
});

describe("routineSwitches", () => {
  it("reads each switched routine with who switched it", async () => {
    db.read = {
      data: [
        { routine_id: "/api/cron/a/", mode: "paused", paused_reason: "redesign", updated_at: "2026-10-07T03:00:00Z", person: { display_name: "Ana Lima", full_name: "Ana Maria Lima" } },
        { routine_id: "/api/cron/b/", mode: "live", paused_reason: null, updated_at: "2026-10-08T03:00:00Z", person: null },
        { routine_id: "/api/cron/c/", mode: "shadow", paused_reason: null, updated_at: "2026-10-08T03:00:00Z", person: null },
        { routine_id: "/api/cron/d/", mode: "sideways", paused_reason: null, updated_at: "2026-10-08T03:00:00Z", person: null },
      ],
      error: null,
    };
    const switches = await routineSwitches();
    expect(switches.get("/api/cron/a/")).toEqual({ routineId: "/api/cron/a/", mode: "paused", paused: true, reason: "redesign", updatedAt: "2026-10-07T03:00:00Z", updatedBy: "Ana Lima" });
    expect(switches.get("/api/cron/b/")).toMatchObject({ mode: "live", paused: false });
    expect(switches.get("/api/cron/c/")).toMatchObject({ mode: "shadow", paused: false });
    // A value outside the three is shown as the position that does nothing.
    expect(switches.get("/api/cron/d/")).toMatchObject({ mode: "paused", paused: true });
  });

  it("throws on a failed read rather than showing every routine as on", async () => {
    db.read = { data: null, error: { message: "timeout" } };
    await expect(routineSwitches()).rejects.toThrow(/timeout/);
  });
});
