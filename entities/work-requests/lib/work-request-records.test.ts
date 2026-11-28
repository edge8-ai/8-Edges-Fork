import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The two work-request writes portal's door performs for company-os (A.70).
// Each row is the write company-os built by hand before A.70 through
// insertContractorWorkRequests or updateContractorWorkRequests, step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { linkWorkRequestsToPayment, openWorkRequestRow } from "./work-request-records";

const NOW = "2026-10-26T03:00:00.000Z";
beforeEach(() => {
  resetQueries();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

const ROW = { person_id: "p1", title: "Landing page", brief: "Build it", access_token: "tok", status: "awaiting_estimate", created_by: "admin@example.test" };

const cases: [string, () => PromiseLike<unknown>, Step[]][] = [
  // company-os createWorkRequest.
  ["openWorkRequestRow", () => openWorkRequestRow(ROW), [["insert", ROW], ["select", "id, access_token"], ["single"]]],
  // company-os rollupContractorPayments: only the listed requests.
  [
    "linkWorkRequestsToPayment",
    () => linkWorkRequestsToPayment(["w1", "w2"], "pay-1"),
    [["update", { payment_id: "pay-1", updated_at: NOW }], ["in", "id", ["w1", "w2"]]],
  ],
];

describe("work-request writes", () => {
  it.each(cases)("%s makes the write its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "contractor_work_requests", steps }]);
  });
});
