import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.7: a routine paused in routine_config records a skipped run that names
// the reason and does none of the work; a live one, a missing row and a failed
// read all run.

const inserted: Record<string, unknown>[] = [];
const config = vi.hoisted(() => ({ value: { data: null as unknown, error: null as { message: string } | null } }));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => {
      if (table === "routine_config") {
        const b: Record<string, unknown> = { maybeSingle: async () => config.value };
        b.select = () => b;
        b.eq = () => b;
        return b;
      }
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) };
        },
      };
    },
  },
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));

const { withRoutineRun, recordRoutineRun } = await import("@/kernel/audit/routine-runs");

const SECRET = "test-cron-secret";
const req = () => new Request("https://example.test/api/cron/thing/", { headers: { authorization: `Bearer ${SECRET}` } });

beforeEach(() => {
  inserted.length = 0;
  process.env.CRON_SECRET = SECRET;
  config.value = { data: null, error: null };
});

describe("routine_config pause (Y.7)", () => {
  it("records a skipped run naming the reason, and never calls the handler", async () => {
    config.value = { data: { mode: "paused", paused_reason: "bank holiday, no transfers" }, error: null };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    const res = await withRoutineRun("/api/cron/thing/", req(), handler);
    expect(handler).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ status: "skipped", reason: "paused: bank holiday, no transfers" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: "skipped", summary: "paused: bank holiday, no transfers", error: null });
  });

  it("runs a live routine and one with no row", async () => {
    for (const data of [{ mode: "live", paused_reason: null }, null]) {
      config.value = { data, error: null };
      const handler = vi.fn(async () => Response.json({ status: "ok" }));
      await withRoutineRun("/api/cron/thing/", req(), handler);
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it("runs when the switch cannot be read", async () => {
    config.value = { data: null, error: { message: "timeout" } };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    await withRoutineRun("/api/cron/thing/", req(), handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("lets a person's button run a paused routine", async () => {
    config.value = { data: { mode: "paused", paused_reason: "held" }, error: null };
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    await recordRoutineRun("/api/cron/thing/", handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
