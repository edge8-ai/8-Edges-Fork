import { beforeEach, describe, expect, it, vi } from "vitest";

let chain: { method: string; args: unknown[] }[] = [];
let response: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const builder: Record<string, unknown> = {
  then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
};
for (const m of ["eq", "in", "neq", "is", "order", "limit"]) {
  builder[m] = (...args: unknown[]) => {
    chain.push({ method: m, args });
    return builder;
  };
}
vi.mock("./reads", () => ({
  selectInvoices: (...args: unknown[]) => {
    chain.push({ method: "select", args });
    return builder;
  },
}));

import { paidTransitions, paymentCandidatesFor } from "./invoice-paid";

// Which rows of a QuickBooks mirror pass are payments (S.2).
//
// The mirror is a bulk upsert of every invoice since 2025, so "the row says
// paid" is nowhere near enough: the first sync of an entity would announce
// every invoice the company has ever collected, and every weekly pass after it
// would re-announce the same ones. A payment is a TRANSITION, and the only
// thing that can see one is the stored row the upsert is about to overwrite.

const stored = [
  { id: "inv-1", source: "quickbooks", entity: "edge8", external_id: "101", status: "overdue", company_id: "co-1", deal_id: "deal-1" },
  { id: "inv-2", source: "quickbooks", entity: "edge8", external_id: "102", status: "paid", company_id: "co-1", deal_id: null },
  // A cancelled bill. It reaches this set only if the read is wrong, but the
  // pure function must refuse it either way — see ./invoice-status.
  { id: "inv-3", source: "quickbooks", entity: "edge8", external_id: "103", status: "voided", company_id: "co-2", deal_id: null },
];

const row = (external_id: string, status: string, over: Partial<{ amount_cents: number; currency: string }> = {}) => ({
  source: "quickbooks",
  entity: "edge8",
  external_id,
  status,
  amount_cents: 450_000,
  currency: "usd",
  ...over,
});

beforeEach(() => {
  chain = [];
  response = { data: [], error: null };
});

describe("paymentCandidatesFor", () => {
  it("asks for what is still owed, not for the ids in the pass", async () => {
    // The mirror carries every invoice since 2025 and most are long since
    // paid. Listing their external ids would be a query string hundreds of
    // entries long asked in order to learn nothing: only an unpaid row can
    // become a payment.
    await paymentCandidatesFor([row("101", "paid"), row("102", "open")]);
    expect(chain).toContainEqual({ method: "neq", args: ["status", "paid"] });
    // And voided, which the read used to pull in: a cancelled bill can never
    // become a payment, so it has no business in the candidate set.
    expect(chain).toContainEqual({ method: "neq", args: ["status", "voided"] });
    expect(chain).toContainEqual({ method: "in", args: ["source", ["quickbooks"]] });
    expect(chain).toContainEqual({ method: "in", args: ["entity", ["edge8"]] });
    expect(chain.some((c) => c.method === "in" && c.args[0] === "external_id")).toBe(false);
  });

  it("raises when the read fails, so the sync stops before its upsert (S.19.1)", async () => {
    // Answering "no candidates" let the sync overwrite the rows as paid in the
    // same pass, and the payment was never announced by any later one.
    response = { data: null, error: { message: "connection reset" } };
    await expect(paymentCandidatesFor([row("101", "paid")])).rejects.toThrow(/payment candidates/);
  });

  it("reads nothing for an empty pass", async () => {
    expect(await paymentCandidatesFor([])).toEqual([]);
    expect(chain).toEqual([]);
  });
});

describe("paidTransitions", () => {
  it("announces an invoice that was open and is now paid", () => {
    expect(paidTransitions([row("101", "paid")], stored, "2026-09-22")).toEqual([
      {
        invoiceId: "inv-1",
        companyId: "co-1",
        dealId: "deal-1",
        amountCents: 450_000,
        currency: "usd",
        paidOn: "2026-09-22",
      },
    ]);
  });

  it("says nothing about an invoice that was already paid", () => {
    // Every weekly pass re-upserts the same rows. Without this, one collected
    // invoice would announce itself for as long as the sync keeps running.
    expect(paidTransitions([row("102", "paid")], stored, "2026-09-22")).toEqual([]);
  });

  it("says nothing about an invoice arriving already paid", () => {
    // History landing on the first sync of an entity, not a payment anybody
    // just made. There is no stored row to transition from, and no invoice id
    // either, since the upsert has not run yet.
    expect(paidTransitions([row("999", "paid")], stored, "2026-09-22")).toEqual([]);
  });

  it("says nothing about an invoice that is still owed, or was voided", () => {
    expect(paidTransitions([row("101", "open")], stored, "2026-09-22")).toEqual([]);
    expect(paidTransitions([row("101", "overdue")], stored, "2026-09-22")).toEqual([]);
    expect(paidTransitions([row("101", "voided")], stored, "2026-09-22")).toEqual([]);
  });

  // S.2/S.8. The case above is a voided row ARRIVING; this is the dangerous
  // one — the mirror says paid and the row it would transition FROM is voided.
  // `was.status === "paid"` let that through, so a cancelled bill reinstated
  // and settled in QuickBooks announced a payment, and crm's subscriber raises
  // the paying company to `customer` off exactly that fact.
  it("never calls a voided stored row a payment, even when the mirror says paid", () => {
    expect(paidTransitions([row("103", "paid")], stored, "2026-09-22")).toEqual([]);
  });

  it("matches on the QuickBooks company as well as the id", () => {
    // external_id is unique per QBO company, not across them — the ledger's
    // own key is (source, entity, external_id). Matching on the id alone would
    // read AIO's invoice 101 as Edge8's.
    expect(paidTransitions([row("101", "paid")].map((r) => ({ ...r, entity: "aio" })), stored, "2026-09-22")).toEqual([]);
  });

  it("carries a payment from a client nobody has mapped yet", () => {
    // Most AIO customers are individuals with no company row, by design; the
    // payment is still a fact, and a subscriber that cannot act does nothing.
    const unmapped = [{ ...stored[0], company_id: null, deal_id: null }];
    expect(paidTransitions([row("101", "paid")], unmapped, "2026-09-22")[0]).toMatchObject({
      companyId: null,
      dealId: null,
    });
  });
});
