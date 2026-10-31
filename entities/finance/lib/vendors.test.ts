import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { addVendor, changeVendor, eraseVendor, stampVendorArchive, vendorOptions } from "./vendors";

// A.65: each question or command is the query its caller used to build by
// hand around selectVendors / insertVendors / updateVendors / deleteVendors.
// The expected steps are those callers' chains as they stood on main before
// the card.
const q = (...steps: Query["steps"]): Query => ({ table: "vendors", steps });
const stamp = { archived_at: "2026-10-18T03:00:00.000Z", archived_by: "admin@example.test" };

const cases: [string, () => Promise<unknown>, Query][] = [
  // org lib/equipment.ts
  ["vendorOptions", () => vendorOptions(), q(["select", "id, name"], ["is", "archived_at", null], ["order", "name", { ascending: true }])],
  // company-os and team vendors/actions.ts
  ["addVendor", () => addVendor({ name: "Print shop", type: "supplier" }), q(["insert", { name: "Print shop", type: "supplier" }], ["select", "id"], ["single"])],
  ["changeVendor", () => changeVendor("v1", { url: null }), q(["update", { url: null }], ["eq", "id", "v1"])],
  // crm lib/mutations.ts archiveRecord (the guard) and restoreRecord (none)
  ["stampVendorArchive, archiving", () => stampVendorArchive("v1", stamp, true), q(["update", stamp], ["eq", "id", "v1"], ["is", "archived_at", null])],
  [
    "stampVendorArchive, restoring",
    () => stampVendorArchive("v1", { archived_at: null, archived_by: null }, false),
    q(["update", { archived_at: null, archived_by: null }], ["eq", "id", "v1"]),
  ],
  // crm lib/mutations.ts guardedDelete
  ["eraseVendor", () => eraseVendor("v1"), q(["delete"], ["eq", "id", "v1"])],
];

beforeEach(() => resetQueries());

describe("finance's vendor questions and commands make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("keeps PostgREST's own error on an erase, so a foreign-key refusal can be told apart", async () => {
    answerNext({ data: null, error: { message: "violates foreign key", code: "23503" } });
    expect(await eraseVendor("v1")).toMatchObject({ error: { code: "23503" } });
  });

  it("answers a failed change as a Result carrying the database's message", async () => {
    answerNext({ data: null, error: { message: "write refused" } });
    expect(await changeVendor("v1", { name: "x" })).toEqual({ ok: false, error: "write refused" });
  });
});
