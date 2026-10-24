import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// company_os.audit_log.record_id is a uuid column, and a failed audit insert
// is only logged, never raised. So a caller that passed a text key (an access
// code's scope, a routine's path, an event's name) lost every row it ever
// wrote, silently: access_codes kept none from #1486 on (B.13). These tests pin
// the guard that keeps such a row, and prove it leaves a real uuid alone.

type Row = Record<string, unknown>;
const inserted: Row[][] = [];

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => ({
      insert: async (rows: Row | Row[]) => {
        if (table === "audit_log") inserted.push(Array.isArray(rows) ? rows : [rows]);
        return { error: null };
      },
    }),
  },
}));

import { recordAudit, recordAuditMany } from "./audit";

const UUID = "3f2b8c1e-9a4d-4e6f-8b2a-1c5d7e9f0a3b";
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  inserted.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe("recordAudit", () => {
  it("writes a uuid record id as it is, with the caller's context untouched and no warning", async () => {
    await recordAudit({ table: "tasks", recordId: UUID, operation: "update", actor: "a@example.test", context: { via: "drawer" } });
    expect(inserted).toEqual([[expect.objectContaining({ table_name: "tasks", record_id: UUID, context: { via: "drawer" } })]]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the row for a non-uuid id: record_id null, the id in context.record_key, one warning naming the table", async () => {
    await recordAudit({ table: "access_codes", recordId: "gam", operation: "update", context: { scope: "gam" } });
    expect(inserted).toEqual([[expect.objectContaining({ table_name: "access_codes", record_id: null, context: { scope: "gam", record_key: "gam" } })]]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("access_codes");
  });

  it("leaves a null record id null without a warning", async () => {
    await recordAudit({ table: "access_codes", recordId: null, operation: "update" });
    expect(inserted[0][0]).toMatchObject({ record_id: null, context: {} });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("recordAuditMany", () => {
  it("keeps every row of a mixed batch and warns once, naming each offending table", async () => {
    await recordAuditMany([
      { table: "invoices", recordId: UUID, operation: "update" },
      { table: "revenue_targets", recordId: "revenue:month:2026-09-01", operation: "update" },
      { table: "revenue_targets", recordId: "revenue:month:2026-10-01", operation: "update" },
      { table: "events", recordId: "leave.withdrawn", operation: "update" },
    ]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].map((r) => r.record_id)).toEqual([UUID, null, null, null]);
    expect(inserted[0].map((r) => (r.context as Row).record_key)).toEqual([
      undefined,
      "revenue:month:2026-09-01",
      "revenue:month:2026-10-01",
      "leave.withdrawn",
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("revenue_targets, events");
  });
});
