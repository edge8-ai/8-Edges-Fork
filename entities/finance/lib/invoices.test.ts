import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isForkTree } from "@/scripts/fork-tree.mjs";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  anyInvoiceOf,
  clientInvoices,
  invoiceAttribution,
  invoicesMatching,
  latestInvoicesOfCompany,
  liveInvoicesOfCompany,
  mirrorRaisedInvoice,
  mirrorSyncedInvoices,
  setInvoiceDeal,
} from "./invoices";

// A.65: each question or command is the query its caller used to build by
// hand around selectInvoices / updateInvoices / upsertInvoices /
// selectInvoicesMatching. The expected steps are those callers' chains as they
// stood on main before the card.
const q = (...steps: Query["steps"]): Query => ({ table: "invoices", steps });
const row = { source: "quickbooks", entity: "edge8" as const, external_id: "42", status: "open", amount_cents: 100, currency: "usd", txn_date: "2026-10-01" };

const cases: [string, () => Promise<unknown>, Query][] = [
  // crm lib/invoices.ts getInvoicesForCompany
  [
    "liveInvoicesOfCompany",
    () => liveInvoicesOfCompany("co-1"),
    q(
      ["select", "id, doc_number, txn_date, due_date, currency, amount_cents, balance_cents, status, memo, customer_name, deal_id"],
      ["eq", "company_id", "co-1"],
      ["neq", "status", "voided"],
      ["order", "txn_date", { ascending: false }],
    ),
  ],
  // team chat company-tools.ts oneClient: voided included, a hundred newest
  [
    "latestInvoicesOfCompany",
    () => latestInvoicesOfCompany("co-1"),
    q(
      ["select", "company_id, doc_number, txn_date, due_date, amount_cents, balance_cents, currency, status"],
      ["eq", "company_id", "co-1"],
      ["order", "txn_date", { ascending: false }],
      ["limit", 100],
    ),
  ],
  // portal lib/invoices.ts getInvoicesForActor: never memo
  [
    "clientInvoices",
    () => clientInvoices(["co-1"]),
    q(
      ["select", "id, doc_number, txn_date, due_date, currency, amount_cents, balance_cents, status, payment_link, lines"],
      ["in", "company_id", ["co-1"]],
      ["neq", "status", "voided"],
      ["order", "txn_date", { ascending: false }],
    ),
  ],
  // portal lib/invoices.ts hasInvoices
  ["anyInvoiceOf", () => anyInvoiceOf(["co-1"]), q(["select", "id"], ["in", "company_id", ["co-1"]], ["limit", 1])],
  // crm deals/attribution-actions.ts
  ["invoiceAttribution", () => invoiceAttribution("inv-1"), q(["select", "company_id, deal_id"], ["eq", "id", "inv-1"], ["maybeSingle"])],
  ["setInvoiceDeal, linking", () => setInvoiceDeal("inv-1", "deal-1"), q(["update", { deal_id: "deal-1" }], ["eq", "id", "inv-1"])],
  ["setInvoiceDeal, unlinking", () => setInvoiceDeal("inv-1", null), q(["update", { deal_id: null }], ["eq", "id", "inv-1"])],
  // company-os client-invoicing.ts: the ledger's own key since A.73 (see below)
  [
    "mirrorRaisedInvoice",
    () => mirrorRaisedInvoice(row),
    q(["upsert", row, { onConflict: "source,entity,external_id" }], ["select", "id"], ["maybeSingle"]),
  ],
  // company-os qbo-invoice-sync.ts
  ["mirrorSyncedInvoices", () => mirrorSyncedInvoices([row]), q(["upsert", [row], { onConflict: "source,entity,external_id" }])],
];

beforeEach(() => resetQueries());

describe("finance's invoice questions and commands make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("asks the database's ranked invoice search with the caller's terms and limit", async () => {
    await invoicesMatching(["acme"], 5);
    expect(queries).toEqual([{ table: "rpc:search_invoices", steps: [["rpc", { terms: ["acme"], lim: 5 }]] }]);
  });

  // A.73: the raised-invoice mirror named (source, external_id) for two months
  // after the table was re-keyed, and Postgres refused every upsert because no
  // unique constraint matched. Pin both mirrors to the key the migrations
  // declare, read from the SQL itself, so a later re-key fails here first.
  // The public fork has no supabase/migrations (it builds its database from
  // supabase/01-schema.sql), so there the test has nothing to read.
  it.skipIf(isForkTree(process.cwd()))("upserts on the ledger's unique key as the migrations declare it", async () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const declared = readdirSync(dir)
      .sort()
      .flatMap((f) => [...readFileSync(join(dir, f), "utf8").matchAll(/add constraint invoices_\w+_key\s+unique \(([^)]+)\)/gi)])
      .map((m) => m[1].split(",").map((c) => c.trim()).join(","));
    const key = declared.at(-1);
    expect(key).toBe("source,entity,external_id");

    await mirrorRaisedInvoice(row);
    await mirrorSyncedInvoices([row]);
    const targets = queries.map((query) => (query.steps[0][2] as { onConflict: string }).onConflict);
    expect(targets).toEqual([key, key]);
  });

  it("answers a failed write as a Result carrying the database's message", async () => {
    answerNext({ data: null, error: { message: "write refused" } });
    expect(await setInvoiceDeal("inv-1", null)).toEqual({ ok: false, error: "write refused" });
    answerNext({ data: null, error: null });
    expect(await mirrorSyncedInvoices([row])).toEqual({ ok: true });
  });
});
