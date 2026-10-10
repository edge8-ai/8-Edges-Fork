import { beforeEach, describe, expect, it, vi } from "vitest";

// Crm's side of a payment (S.2).
//
// An account becomes a `customer` in exactly one place today: moveDealStage,
// when a deal lands on a won stage. A client who was never in the pipeline —
// most of AIO, the QuickBooks-only bookkeeping clients, anybody invoiced off a
// retreat — pays their invoices and stays at whatever stage the last inbound
// form left them on. So the Clients tab re-derives "who is a client" by
// reading up to five thousand invoice rows on every render
// (lib/revenue-metrics/clients.ts), because the stage cannot be trusted.
//
// Paying is the plainest evidence there is. This makes it durable at the
// moment it happens, and the read is the thing it is chipping away at.

const bumpCompanyLifecycle = vi.fn(async () => {});
vi.mock("./lifecycle", () => ({
  bumpCompanyLifecycle: (...a: unknown[]) => bumpCompanyLifecycle(...(a as [])),
}));

import { markAccountCustomerOnPayment } from "./invoice-subscriptions";

const PAID = {
  invoiceId: "inv-1",
  companyId: "co-1",
  dealId: "deal-1",
  amountCents: 450_000,
  currency: "usd",
  paidOn: "2026-09-22",
};

beforeEach(() => bumpCompanyLifecycle.mockClear());

describe("markAccountCustomerOnPayment", () => {
  it("makes the paying account a customer, and says why", async () => {
    await markAccountCustomerOnPayment(PAID);
    expect(bumpCompanyLifecycle).toHaveBeenCalledWith("co-1", "customer", { reason: "invoice_paid" });
  });

  it("does nothing for a payment from a client nobody has mapped", async () => {
    // An unmapped QuickBooks customer, which is most of AIO by design. There
    // is no account to advance and guessing one would attach revenue to the
    // wrong company.
    await markAccountCustomerOnPayment({ ...PAID, companyId: null });
    expect(bumpCompanyLifecycle).not.toHaveBeenCalled();
  });

  it("never lowers an account that is already further on", async () => {
    // Delegated, not re-implemented: bumpCompanyLifecycle is raise-only, so an
    // evangelist paying an invoice is not demoted to customer. The point of
    // this test is that the handler goes through that function and does not
    // write the stage itself.
    await markAccountCustomerOnPayment(PAID);
    expect(bumpCompanyLifecycle).toHaveBeenCalledTimes(1);
  });
});
