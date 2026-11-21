import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin Home's Logged and Snooze on a deal (AH.5): logFollowUp asks
// crm.pipeline first and writes only the next step and its date.
const gate = vi.hoisted(() => ({ allowed: true, asked: [] as string[] }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    gate.asked.push(p);
    if (!gate.allowed) throw new Error("NEXT_REDIRECT");
    return { user: { email: "admin@example.com" } };
  },
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const db = vi.hoisted(() => ({ updates: [] as unknown[], error: null as null | { message: string } }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: () => ({ update: (u: unknown) => (db.updates.push(u), { eq: async () => ({ error: db.error }) }) }) },
}));

const { logFollowUp } = await import("./follow-up-actions");

beforeEach(() => {
  gate.allowed = true;
  gate.asked = [];
  db.updates = [];
  db.error = null;
});

describe("logFollowUp", () => {
  it("refuses a person without crm.pipeline before writing", async () => {
    gate.allowed = false;
    await expect(logFollowUp("d1", "Call", "2026-11-20")).rejects.toThrow("NEXT_REDIRECT");
    expect(gate.asked).toEqual(["crm.pipeline"]);
    expect(db.updates).toEqual([]);
  });

  it("writes the next step and its date, and nothing else", async () => {
    expect(await logFollowUp("d1", "  Call Tomas  ", "2026-11-20")).toEqual({ ok: true });
    expect(db.updates).toEqual([{ next_step: "Call Tomas", next_step_date: "2026-11-20" }]);
  });

  it("refuses a date that is not one, and says when the write fails", async () => {
    expect(await logFollowUp("d1", "Call", "next week")).toEqual({ ok: false, error: "Pick a date." });
    db.error = { message: "boom" };
    expect(await logFollowUp("d1", null, "2026-11-20")).toEqual({ ok: false, error: "boom" });
  });
});
