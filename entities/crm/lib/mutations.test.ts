import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";

// LD.1's db-review: the Ladders tables reference people ON DELETE RESTRICT so a
// person who leaves keeps their history (ADR 0021). A hard delete of such a
// person is refused with 23503, and the CRM has to say "archive instead"
// rather than suggest clearing rows nobody may clear.
const deleted = vi.hoisted(() => ({ error: null as PostgrestError | null, ids: [] as string[] }));
vi.mock("@/kernel/identity/writes", () => ({
  deletePeople: () => ({
    eq: async (_col: string, id: string) => {
      deleted.ids.push(id);
      return { data: null, error: deleted.error };
    },
  }),
  updatePeople: vi.fn(),
  updateCompanies: vi.fn(),
  deleteCompanies: vi.fn(),
}));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/finance", () => ({ eraseVendor: vi.fn(), stampVendorArchive: vi.fn() }));
vi.mock("./writes", () => ({ updateDeals: vi.fn(), deleteDeals: vi.fn() }));

import { recordAudit } from "@/kernel/audit/audit";
import { guardedDelete } from "./mutations";

// The shape PostgREST hands back for a foreign-key refusal on a delete.
function fkViolation(table: string): PostgrestError {
  return {
    name: "PostgrestError",
    code: "23503",
    message: `update or delete on table "people" violates foreign key constraint "${table}_person_id_fkey" on table "${table}"`,
    details: `Key (id)=(p1) is still referenced from table "${table}".`,
    hint: "",
  } as PostgrestError;
}

beforeEach(() => {
  deleted.error = null;
  deleted.ids.length = 0;
  vi.mocked(recordAudit).mockClear();
});

describe("guardedDelete · a person with Ladders history", () => {
  it.each(["ladder_positions", "ladder_unlocks", "ladder_display"])("says archive instead when %s blocks the delete", async (table) => {
    deleted.error = fkViolation(table);
    expect(await guardedDelete("people", "p1", "admin@example.test")).toEqual({
      ok: false,
      error: "This person has history on the Ladders, so they can't be deleted. Archive them instead.",
    });
    expect(deleted.ids).toEqual(["p1"]);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("names the blocking table from the message when PostgREST sends no details", async () => {
    deleted.error = { ...fkViolation("ladder_unlocks"), details: "" } as PostgrestError;
    const r = await guardedDelete("people", "p1", "admin@example.test");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("history on the Ladders") });
  });

  it("keeps the named-relation message for any other blocker", async () => {
    deleted.error = fkViolation("bookings");
    expect(await guardedDelete("people", "p1", "admin@example.test")).toEqual({
      ok: false,
      error: "Can't permanently delete: still referenced by bookings. Archive it instead, or clear the bookings first.",
    });
  });

  it("deletes and audits when nothing refuses", async () => {
    expect(await guardedDelete("people", "p1", "admin@example.test", { via: "contact_360" })).toEqual({ ok: true });
    expect(recordAudit).toHaveBeenCalledWith({ table: "people", recordId: "p1", operation: "delete", actor: "admin@example.test", context: { via: "contact_360" } });
  });
});
