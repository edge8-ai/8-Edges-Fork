import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The restricted-record questions contacts' door answers (A.64). Each row is
// the query a caller in another entity built by hand before A.64, and the
// column list is the point: a question over people_sensitive selects only
// what its own callers read, never a union (H1-DESIGN rule 7).

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  bankDetailsOf,
  bankDetailsOfPeople,
  bankNameAndAccountOf,
  bankNameAndAccountRowsOf,
  idDocumentPathOf,
  saveSensitiveFields,
  sensitiveRecordOf,
  taxIdentifiersOfEveryone,
} from "./people-sensitive";

beforeEach(() => resetQueries());

const reads: [string, () => Promise<unknown>, Step[]][] = [
  // crm admin editor (read and before-save), team "my details".
  ["sensitiveRecordOf", () => sensitiveRecordOf("p1"), [["select", "*"], ["eq", "person_id", "p1"], ["maybeSingle"]]],
  // retreats: one side of the ID document, that column only.
  ["idDocumentPathOf (front)", () => idDocumentPathOf("p1", "front"), [["select", "id_front_path"], ["eq", "person_id", "p1"], ["maybeSingle"]]],
  ["idDocumentPathOf (back)", () => idDocumentPathOf("p1", "back"), [["select", "id_back_path"], ["eq", "person_id", "p1"], ["maybeSingle"]]],
  // reimbursements: the person's own bank details, and whether Finance could pay.
  ["bankDetailsOf", () => bankDetailsOf("p1"), [["select", "bank_name, bank_account_number, bank_branch"], ["eq", "person_id", "p1"], ["maybeSingle"]]],
  ["bankNameAndAccountOf", () => bankNameAndAccountOf("p1"), [["select", "bank_name, bank_account_number"], ["eq", "person_id", "p1"], ["maybeSingle"]]],
  // team assistant "my records".
  [
    "bankNameAndAccountRowsOf",
    () => bankNameAndAccountRowsOf("p1"),
    [["select", "person_id, bank_name, bank_account_number"], ["eq", "person_id", "p1"], ["limit", 1]],
  ],
  // reimbursements payment run.
  [
    "bankDetailsOfPeople",
    () => bankDetailsOfPeople(["p1", "p2"]),
    [["select", "person_id, bank_name, bank_account_number, bank_branch"], ["in", "person_id", ["p1", "p2"]]],
  ],
  // finance payroll workbook matching.
  ["taxIdentifiersOfEveryone", () => taxIdentifiersOfEveryone(), [["select", "person_id, tax_code, national_id_number"]]],
];

describe("people_sensitive questions (A.64)", () => {
  it.each(reads)("%s reads exactly its callers' columns", async (_name, ask, steps) => {
    await ask();
    expect(queries).toEqual([{ table: "people_sensitive", steps }]);
  });

  it("idDocumentPathOf answers the path itself, or null", async () => {
    await expect(idDocumentPathOf("p1", "front")).resolves.toEqual({ data: null, error: null });
  });
});

describe("people_sensitive commands (A.64)", () => {
  it("saveSensitiveFields upserts the fields on the person, stamped, keyed by person", async () => {
    await saveSensitiveFields("p1", { notes: "kept" });
    const [query] = queries;
    expect(query.table).toBe("people_sensitive");
    expect(query.steps).toEqual([["upsert", { person_id: "p1", notes: "kept", updated_at: expect.any(String) }, { onConflict: "person_id" }]]);
  });
});
