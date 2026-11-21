import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { expireTokenPurchase, linkTokenPurchaseOrder, stampTokenPurchaseSession, startTokenPurchase } from "./token-purchases";

// A.69: each command is the statement the portal's token checkout
// (routes/portal/(dashboard)/tokens/actions.ts) used to build by hand around
// insertTokenPurchases / updateTokenPurchases, as it stood on main before the
// card.
const q = (...steps: Query["steps"]): Query => ({ table: "token_purchases", steps });
const row = { company_id: "c1", person_id: "p1", packs: 2, tokens: 80, amount_cents: 100000, currency: "usd", status: "pending" };

const cases: [string, () => Promise<unknown>, Query][] = [
  ["startTokenPurchase", () => startTokenPurchase(row), q(["insert", row], ["select", "id"], ["single"])],
  ["linkTokenPurchaseOrder", () => linkTokenPurchaseOrder("tp1", "o1"), q(["update", { order_id: "o1" }], ["eq", "id", "tp1"])],
  [
    "stampTokenPurchaseSession",
    () => stampTokenPurchaseSession("tp1", "cs_1"),
    q(["update", { stripe_session_id: "cs_1" }], ["eq", "id", "tp1"]),
  ],
  // the order insert failed: no guard
  ["expireTokenPurchase, any status", () => expireTokenPurchase("tp1", false), q(["update", { status: "expired" }], ["eq", "id", "tp1"])],
  // the Stripe session failed: only while still pending
  [
    "expireTokenPurchase, pending only",
    () => expireTokenPurchase("tp1", true),
    q(["update", { status: "expired" }], ["eq", "id", "tp1"], ["eq", "status", "pending"]),
  ],
];

beforeEach(() => resetQueries());

describe("billing's token purchase commands make the portal checkout's statements", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });
});
