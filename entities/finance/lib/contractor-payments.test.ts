import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  contractorPayment,
  contractorPaymentsForMonth,
  contractorPaymentsOf,
  contractorPaymentsOwedSince,
  decideContractorPayment,
  openContractorPayment,
  overrideContractorPaymentAmount,
  setContractorPaymentTotals,
} from "./contractor-payments";

// A.65: each question or command is the query its caller used to build by
// hand around selectContractorPayments / insertContractorPayments /
// updateContractorPayments, with the same columns: payments are pay data, so
// no question selects a column its caller did not read before (H1-DESIGN
// rule 7).
const q = (...steps: Query["steps"]): Query => ({ table: "contractor_payments", steps });
const NOW = "2026-10-18T03:00:00.000Z";

const cases: [string, () => Promise<unknown>, Query][] = [
  // company-os lib/contractor-payments.ts rollup
  [
    "contractorPaymentsForMonth",
    () => contractorPaymentsForMonth(["p1", "p2"], "2026-09-01"),
    q(["select", "id, status, person_id"], ["in", "person_id", ["p1", "p2"]], ["eq", "period_month", "2026-09-01"]),
  ],
  [
    "openContractorPayment",
    () => openContractorPayment("p1", "2026-09-01", "vnd"),
    q(["insert", { person_id: "p1", period_month: "2026-09-01", status: "pending", currency: "vnd" }], ["select", "id"], ["single"]),
  ],
  [
    "setContractorPaymentTotals",
    () => setContractorPaymentTotals("pay-1", { regularHours: 10, overtimeHours: 2, amountCents: 12000, currency: "usd", summary: "2 accepted work requests" }),
    q(
      [
        "update",
        {
          total_regular_hours: 10,
          total_overtime_hours: 2,
          amount_cents: 12000,
          currency: "usd",
          summary: "2 accepted work requests",
          updated_at: NOW,
        },
      ],
      ["eq", "id", "pay-1"],
    ),
  ],
  // company-os contractor-payments/actions.ts
  [
    "contractorPayment",
    () => contractorPayment("pay-1"),
    q(
      ["select", "id, person_id, period_month, status, amount_cents, currency, people!person_id(display_name, preferred_name, full_name, email, first_name)"],
      ["eq", "id", "pay-1"],
      ["maybeSingle"],
    ),
  ],
  [
    "decideContractorPayment, paid",
    () => decideContractorPayment("pay-1", { status: "paid", decidedBy: "admin@example.test", note: null }),
    q(
      ["update", { status: "paid", decided_by: "admin@example.test", decided_at: NOW, paid_at: NOW, note: null, updated_at: NOW }],
      ["eq", "id", "pay-1"],
    ),
  ],
  [
    "decideContractorPayment, rejected",
    () => decideContractorPayment("pay-1", { status: "rejected", decidedBy: "admin@example.test", note: "Duplicate" }),
    q(
      ["update", { status: "rejected", decided_by: "admin@example.test", decided_at: NOW, paid_at: null, note: "Duplicate", updated_at: NOW }],
      ["eq", "id", "pay-1"],
    ),
  ],
  [
    "overrideContractorPaymentAmount",
    () => overrideContractorPaymentAmount("pay-1", 9900, "Rounded"),
    q(["update", { amount_cents: 9900, note: "Rounded", updated_at: NOW }], ["eq", "id", "pay-1"]),
  ],
  // crm revenue-metrics/runway.ts
  [
    "contractorPaymentsOwedSince",
    () => contractorPaymentsOwedSince("2026-04-01"),
    q(["select", "id, amount_cents, currency, period_month"], ["gte", "period_month", "2026-04-01"], ["neq", "status", "rejected"], ["limit", 20000]),
  ],
  // portal lib/my-contractor-work.ts
  [
    "contractorPaymentsOf",
    () => contractorPaymentsOf("p1"),
    q(
      ["select", "id, period_month, total_regular_hours, total_overtime_hours, amount_cents, currency, status, paid_at, note"],
      ["eq", "person_id", "p1"],
      ["order", "period_month", { ascending: false }],
    ),
  ],
];

beforeEach(() => {
  resetQueries();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe("finance's contractor-payment questions and commands make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("answers a failed write as a Result carrying the database's message", async () => {
    answerNext({ data: null, error: { message: "write refused" } });
    expect(await overrideContractorPaymentAmount("pay-1", 1, "x")).toEqual({ ok: false, error: "write refused" });
  });
});
