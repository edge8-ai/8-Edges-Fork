import { beforeEach, describe, expect, it, vi } from "vitest";

// The SLA a promoted lead gets (Z.11, spec test 10): four hours from now, or,
// when the inquiry-to-lead chain files it, four hours from the moment the form
// was sent, so the minutes the chain took are not added to the visitor's wait.

const upserted: Record<string, unknown>[] = [];

// A query that answers `value` however it is filtered.
function answer(value: unknown) {
  const b: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve) };
  for (const op of ["select", "eq", "in", "is", "order", "limit", "neq"]) b[op] = () => b;
  b.maybeSingle = async () => value;
  return b;
}

vi.mock("@/kernel/events", () => ({ publish: async () => undefined }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => answer({ data: { id: "person-1" }, error: null }) } }));
vi.mock("@/kernel/identity/writes", () => ({ updateCompanies: () => answer({ data: null, error: null }) }));
vi.mock("@/entities/contacts", () => ({ selectPersonCompanies: () => answer({ data: [], error: null }) }));
vi.mock("./reads", () => ({
  selectLead: () => answer({ data: null, error: null }),
  selectDeals: () => answer({ count: 0, data: null, error: null }),
}));
vi.mock("./writes", () => ({
  upsertLead: async (row: Record<string, unknown>) => (upserted.push(row), { error: null }),
  insertLifecycleTransitions: async () => ({ error: null }),
}));

import { promotePersonToLead } from "./lifecycle";

beforeEach(() => {
  upserted.length = 0;
});

describe("promotePersonToLead's SLA", () => {
  it("counts four hours from the inquiry when the chain passes slaFrom", async () => {
    const r = await promotePersonToLead("person-1", { reason: "inbound_inquiry", slaFrom: "2026-10-09T07:41:00.000Z" });
    expect(r).toEqual({ ok: true, promoted: true });
    expect(upserted[0].sla_due_at).toBe("2026-10-09T11:41:00.000Z");
  });

  it("counts from now without it, as every other caller does", async () => {
    const before = Date.now();
    await promotePersonToLead("person-1", { reason: "inquiry_promoted" });
    const due = Date.parse(String(upserted[0].sla_due_at));
    expect(due - before).toBeGreaterThanOrEqual(4 * 3600_000 - 1000);
    expect(due - before).toBeLessThanOrEqual(4 * 3600_000 + 5000);
  });
});
