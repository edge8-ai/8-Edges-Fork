import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  eraseManualOrder,
  expirePendingOrder,
  latestOrdersOfPeople,
  openOrder,
  orderFigures,
  ordersOfPerson,
  paidOrdersBetween,
  recordManualOrderPayment,
  stampOrderSession,
} from "./orders";

// A.69: each question or command is the statement its caller used to build by
// hand around selectOrders / insertOrders / updateOrders / deleteOrders. The
// expected steps are those callers' chains as they stood on main before the
// card.
const q = (...steps: Query["steps"]): Query => ({ table: "orders", steps });
const NOW = "2026-10-26T03:00:00.000Z";
const pending = {
  person_id: "p1",
  payment_method: "stripe",
  amount_cents: 50000,
  currency: "usd",
  status: "pending",
  metadata: { type: "token_pack", token_purchase_id: "tp1", company_id: "c1", packs: 1 },
};

const cases: [string, () => Promise<unknown>, Query][] = [
  // crm lib/contacts.ts getPerson360
  [
    "ordersOfPerson",
    () => ordersOfPerson("p1"),
    q(
      ["select", "id, amount_cents, amount_usd_cents, currency, status, payment_method, created_at"],
      ["eq", "person_id", "p1"],
      ["order", "created_at", { ascending: false }],
    ),
  ],
  // crm lib/revenue-metrics/overview.ts loadOverview
  ["orderFigures", () => orderFigures(5000), q(["select", "created_at, amount_usd_cents, status"], ["limit", 5000])],
  // team lib/chat/company-tools.ts companyTotals
  [
    "paidOrdersBetween",
    () => paidOrdersBetween("2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z"),
    q(
      ["select", "amount_usd_cents"],
      ["eq", "status", "paid"],
      ["gte", "created_at", "2026-10-01T00:00:00.000Z"],
      ["lte", "created_at", "2026-10-31T23:59:59.999Z"],
    ),
  ],
  // team lib/chat/company-tools.ts oneClient
  [
    "latestOrdersOfPeople",
    () => latestOrdersOfPeople(["p1", "p2"]),
    q(
      ["select", "created_at, status, amount_cents, currency, amount_usd_cents, refunded_cents, product_id"],
      ["in", "person_id", ["p1", "p2"]],
      ["order", "created_at", { ascending: false }],
      ["limit", 100],
    ),
  ],
  // portal tokens/actions.ts, retreats events/[id]/actions.ts and events/[slug]/actions.ts
  ["openOrder", () => openOrder(pending), q(["insert", pending], ["select", "id"], ["single"])],
  // portal tokens/actions.ts and retreats events/[slug]/actions.ts
  ["stampOrderSession", () => stampOrderSession("o1", "cs_1"), q(["update", { stripe_session_id: "cs_1" }], ["eq", "id", "o1"])],
  [
    "expirePendingOrder",
    () => expirePendingOrder("o1"),
    q(["update", { status: "expired" }], ["eq", "id", "o1"], ["eq", "status", "pending"]),
  ],
  // retreats events/[id]/actions.ts setRegistrationPayment
  [
    "recordManualOrderPayment",
    () => recordManualOrderPayment("o1", { amountCents: 120000, currency: "aud", amountUsdCents: 79000 }),
    q(
      [
        "update",
        {
          amount_cents: 120000,
          currency: "aud",
          amount_usd_cents: 79000,
          status: "paid",
          payment_method: "manual",
          updated_at: NOW,
        },
      ],
      ["eq", "id", "o1"],
    ),
  ],
  [
    "eraseManualOrder",
    () => eraseManualOrder("o1"),
    q(["delete"], ["eq", "id", "o1"], ["eq", "payment_method", "manual"]),
  ],
];

beforeEach(() => {
  resetQueries();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe("billing's order questions and commands make their callers' statements", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("answers a new order's id, as the checkout needs it for the session's metadata", async () => {
    answerNext({ data: { id: "o9" }, error: null });
    expect(await openOrder(pending)).toEqual({ data: { id: "o9" }, error: null });
  });
});
