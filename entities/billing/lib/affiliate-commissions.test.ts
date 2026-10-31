import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { bookingsOfPerson } from "./bookings";
import {
  commissionForRedemption,
  commissionsOf,
  commissionTotalsOf,
  everyCommissionTotal,
  recordCommissionRedemption,
} from "./affiliate-commissions";
import { subscriptionBook } from "./subscriptions";

// A.69: each question or command is the statement its caller used to build by
// hand around selectAffiliateCommissions / updateAffiliateCommissions /
// selectBookings / selectSubscriptions, as it stood on main before the card.
const q = (...steps: Query["steps"]): Query => ({ table: "affiliate_commissions", steps });
const NOW = "2026-10-26T03:00:00.000Z";

const cases: [string, () => Promise<unknown>, Query][] = [
  // crm lib/affiliates-actions.ts setCommissionRedemption
  [
    "commissionForRedemption",
    () => commissionForRedemption("cm1"),
    q(["select", "id, gross_cents, payout_id"], ["eq", "id", "cm1"], ["maybeSingle"]),
  ],
  // crm lib/affiliates-actions.ts setCommissionRedemption and portal lib/referrals.ts chooseRedemptionForActor
  [
    "recordCommissionRedemption",
    () => recordCommissionRedemption("cm1", { choice: "work_credit", rate: 0.15, commissionCents: 1500 }),
    q(
      ["update", { redemption_choice: "work_credit", rate: 0.15, commission_cents: 1500, chosen_at: NOW }],
      ["eq", "id", "cm1"],
    ),
  ],
  // crm lib/companies.ts getCompany
  [
    "commissionTotalsOf",
    () => commissionTotalsOf(["a1", "a2"]),
    q(["select", "gross_cents, commission_cents, redemption_choice, payout_id"], ["in", "affiliate_id", ["a1", "a2"]]),
  ],
  // crm lib/affiliates.ts getAffiliateGroups
  [
    "everyCommissionTotal",
    () => everyCommissionTotal(),
    q(["select", "affiliate_id, gross_cents, commission_cents, redemption_choice, payout_id"]),
  ],
  // crm lib/affiliates.ts, one affiliate's detail
  [
    "commissionsOf",
    () => commissionsOf(["a1"]),
    q(
      [
        "select",
        "id, affiliate_id, source_event, source_ref, gross_cents, rate, commission_cents, redemption_choice, chosen_at, payout_id, notes, created_at, payout:affiliate_payouts!payout_id(method)",
      ],
      ["in", "affiliate_id", ["a1"]],
      ["order", "created_at", { ascending: false }],
    ),
  ],
  // crm lib/contacts.ts getPerson360
  [
    "bookingsOfPerson",
    () => bookingsOfPerson("p1"),
    {
      table: "bookings",
      steps: [
        ["select", "id, kind, start_date, end_date, party_size, amount_cents, amount_usd_cents, currency, status, created_at"],
        ["eq", "person_id", "p1"],
        ["order", "created_at", { ascending: false }],
      ],
    },
  ],
  // crm lib/revenue-metrics/outlook.ts loadRecurringForecast: never person_id
  [
    "subscriptionBook",
    () => subscriptionBook(5000),
    {
      table: "subscriptions",
      steps: [["select", "id, status, product_id, current_period_end, cancel_at_period_end"], ["limit", 5000]],
    },
  ],
];

beforeEach(() => {
  resetQueries();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe("billing's commission, booking and subscription questions make their callers' statements", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("hands a refused redemption's error back for the caller's message", async () => {
    answerNext({ data: null, error: { message: "write refused" } });
    expect(await recordCommissionRedemption("cm1", { choice: "cash", rate: 0.1, commissionCents: 100 })).toMatchObject({
      error: { message: "write refused" },
    });
  });
});
