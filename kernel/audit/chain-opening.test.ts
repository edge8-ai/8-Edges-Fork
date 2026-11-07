import { beforeEach, describe, expect, it, vi } from "vitest";

// The mode a chain opens a run in (A.43): every switch position against every
// no-row policy, the one answer the chains used to disagree on, plus a failed
// read, a slow one and a shadow run.

const sw = vi.hoisted(() => ({ read: { ok: true, row: null } as unknown, hang: false }));
vi.mock("./routine-config", () => ({
  readRoutineSwitch: async () => (sw.hang ? new Promise(() => {}) : sw.read),
}));

const { chainOpeningMode } = await import("./chain-opening");
const { runStore } = await import("./run-context");

const ROUTINE = "/api/cron/stub-chain/";
const row = (mode: "live" | "shadow" | "paused") => ({ ok: true, row: { mode, reason: mode === "paused" ? "testing" : null } });

beforeEach(() => {
  sw.read = { ok: true, row: null };
  sw.hang = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("chainOpeningMode", () => {
  const cases: [string, "live" | "shadow" | "off", "live" | "shadow" | "off", unknown][] = [];
  for (const noRow of ["live", "shadow", "off"] as const) {
    cases.push(["live", noRow, "live", row("live")]);
    cases.push(["shadow", noRow, "shadow", row("shadow")]);
    cases.push(["paused", noRow, "off", row("paused")]);
    cases.push(["no row", noRow, noRow, { ok: true, row: null }]);
  }

  it.each(cases)("a %s switch, with the policy noRow %s, opens %s", async (_label, noRow, expected, read) => {
    sw.read = read;
    expect(await chainOpeningMode(ROUTINE, { noRow, unread: "throw" })).toBe(expected);
  });

  it("a switch that cannot be read opens what the policy says, or raises", async () => {
    sw.read = { ok: false, error: "routine_config unreachable" };
    expect(await chainOpeningMode(ROUTINE, { noRow: "shadow", unread: "shadow" })).toBe("shadow");
    expect(await chainOpeningMode(ROUTINE, { noRow: "live", unread: "off" })).toBe("off");
    await expect(chainOpeningMode(ROUTINE, { noRow: "live", unread: "throw" })).rejects.toThrow("routine_config unreachable");
  });

  it("a switch slower than the deadline opens what the deadline says", async () => {
    sw.hang = true;
    expect(await chainOpeningMode(ROUTINE, { noRow: "shadow", unread: "shadow", deadline: { ms: 5, then: "off" } })).toBe("off");
  });

  it("inside a shadow run, opens shadow whatever the switch says", async () => {
    sw.read = row("live");
    const ctx = { routineId: ROUTINE, runId: null, mode: "shadow" as const, aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] };
    expect(await runStore().run(ctx, () => chainOpeningMode(ROUTINE, { noRow: "live", unread: "throw" }))).toBe("shadow");
    sw.read = { ok: true, row: null };
    expect(await runStore().run(ctx, () => chainOpeningMode(ROUTINE, { noRow: "live", unread: "throw" }))).toBe("shadow");
  });

  it("a paused switch opens nothing, inside a shadow run too", async () => {
    sw.read = row("paused");
    const ctx = { routineId: ROUTINE, runId: null, mode: "shadow" as const, aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] };
    expect(await runStore().run(ctx, () => chainOpeningMode(ROUTINE, { noRow: "live", unread: "throw" }))).toBe("off");
  });
});
