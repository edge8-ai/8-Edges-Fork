import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  invoiceLedger,
  invoicedDeals,
  invoicesSince,
  invoicesWithBalance,
  liveClientInvoicesBetween,
  liveInvoices,
  liveInvoicesBetween,
  pastDueInvoicesOf,
} from "./invoice-book";

// A.65: each question is the query its caller used to build by hand around
// selectInvoices(columns). The expected steps are those callers' chains as
// they stood on main before the card, so a passing row is the proof that the
// caller's query did not change. Where a question serves two callers with
// different columns, the select is their union (H1-DESIGN rule 6).
const q = (...steps: Query["steps"]): Query => ({ table: "invoices", steps });

const BILLING_COLUMNS =
  "id, doc_number, customer_name, amount_cents, amount_usd_cents, balance_cents, balance_usd_cents, currency, status, txn_date, due_date, deal_id, company_id, kind";

const cases: [string, () => Promise<unknown>, Query][] = [
  // crm revenue-metrics/billing.ts and clients.ts (clients read a subset).
  ["invoiceLedger", () => invoiceLedger(), q(["select", BILLING_COLUMNS], ["limit", 5000])],
  // company-os dashboard (limit 2000, a subset) and crm revenue-metrics/overview.ts (limit 5000).
  [
    "liveInvoices, as the dashboard asks",
    () => liveInvoices(2000),
    q(
      ["select", "txn_date, amount_cents, amount_usd_cents, balance_cents, balance_usd_cents, currency, status, entity, kind"],
      ["neq", "status", "voided"],
      ["limit", 2000],
    ),
  ],
  [
    "liveInvoices, as the overview asks",
    () => liveInvoices(5000),
    q(
      ["select", "txn_date, amount_cents, amount_usd_cents, balance_cents, balance_usd_cents, currency, status, entity, kind"],
      ["neq", "status", "voided"],
      ["limit", 5000],
    ),
  ],
  // crm revenue-metrics/outlook.ts
  [
    "invoicesSince",
    () => invoicesSince("2026-07-01"),
    q(["select", "id, amount_cents, amount_usd_cents, currency, status, txn_date, kind"], ["gte", "txn_date", "2026-07-01"], ["limit", 5000]),
  ],
  // crm revenue-metrics/runway.ts
  [
    "invoicesWithBalance",
    () => invoicesWithBalance(),
    q(["select", "id, balance_cents, balance_usd_cents, amount_usd_cents, currency, status, due_date"], ["gt", "balance_cents", 0], ["limit", 5000]),
  ],
  // crm revenue-metrics/health.ts
  [
    "invoicedDeals",
    () => invoicedDeals(),
    q(["select", "deal_id"], ["not", "deal_id", "is", null], ["neq", "status", "voided"], ["limit", 5000]),
  ],
  // crm account-health.ts
  [
    "pastDueInvoicesOf",
    () => pastDueInvoicesOf(["c1", "c2"], "2026-10-18"),
    q(
      ["select", "company_id, status, balance_cents, due_date"],
      ["in", "company_id", ["c1", "c2"]],
      ["neq", "status", "voided"],
      ["gt", "balance_cents", 0],
      ["lt", "due_date", "2026-10-18"],
    ),
  ],
  // team chat company-tools.ts companyTotals
  [
    "liveInvoicesBetween",
    () => liveInvoicesBetween("2026-10-01", "2026-10-31"),
    q(
      ["select", "amount_cents, balance_cents, currency"],
      ["gte", "txn_date", "2026-10-01"],
      ["lte", "txn_date", "2026-10-31"],
      ["neq", "status", "voided"],
    ),
  ],
  // team chat company-tools.ts clientFinancials, with revenue access
  [
    "liveClientInvoicesBetween, every client",
    () => liveClientInvoicesBetween("2026-10-01", "2026-10-31", null),
    q(
      ["select", "company_id, amount_cents, balance_cents, currency"],
      ["gte", "txn_date", "2026-10-01"],
      ["lte", "txn_date", "2026-10-31"],
      ["neq", "status", "voided"],
      ["not", "company_id", "is", null],
    ),
  ],
  // team chat company-tools.ts clientFinancials, assigned clients only
  [
    "liveClientInvoicesBetween, assigned clients",
    () => liveClientInvoicesBetween("2026-10-01", "2026-10-31", ["client-a"]),
    q(
      ["select", "company_id, amount_cents, balance_cents, currency"],
      ["gte", "txn_date", "2026-10-01"],
      ["lte", "txn_date", "2026-10-31"],
      ["neq", "status", "voided"],
      ["not", "company_id", "is", null],
      ["in", "company_id", ["client-a"]],
    ),
  ],
];

beforeEach(() => resetQueries());

describe("finance's invoice-book questions make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("hands back the PostgREST answer as it came, so the caller decides what a failure means", async () => {
    answerNext({ data: null, error: { message: "db down" } });
    expect(await invoiceLedger()).toEqual({ data: null, error: { message: "db down" } });
  });
});
