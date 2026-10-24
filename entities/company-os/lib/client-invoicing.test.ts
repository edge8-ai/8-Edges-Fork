// A.73: raising a client invoice mirrors it into the ledger. The mirror names
// the realm the invoice was raised in, and a refused mirror is reported in the
// result rather than only logged, without failing a raise QuickBooks already made.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

const mirrorRaisedInvoice = vi.fn();
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/entities/finance", () => ({
  currentBillableRate: vi.fn(),
  mirrorRaisedInvoice: (row: unknown) => mirrorRaisedInvoice(row),
}));
vi.mock("@/entities/company-os/lib/qbo", () => ({ qboFetch: vi.fn() }));
vi.mock("@/entities/company-os/lib/qbo-invoices", () => ({
  createQboInvoice: vi.fn(async () => ({
    ok: true,
    invoice: { id: "qbo-77", docNumber: "1077", txnDate: "2026-10-21", dueDate: null, totalCents: 20000, currency: "usd" },
  })),
  sendQboInvoice: vi.fn(async () => ({ ok: true })),
}));

import { invoiceCompanyForHours } from "./client-invoicing";

const raise = () => invoiceCompanyForHours({ companyId: "co-1", hours: 2, rateCents: 10000, description: "Work", memo: "work_request:w1" });

beforeEach(() => {
  resetFake();
  mirrorRaisedInvoice.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  script("companies", { data: { id: "co-1", name: "Acme", metadata: { qbo_customer_ids: ["cust-9"] } } });
});

describe("invoiceCompanyForHours mirrors the raised invoice into the ledger", () => {
  it("writes the row under Edge8's realm and answers its id", async () => {
    mirrorRaisedInvoice.mockResolvedValue({ data: { id: "led-1" }, error: null });
    const result = await raise();
    expect(mirrorRaisedInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ source: "quickbooks", entity: "edge8", external_id: "qbo-77" }),
    );
    expect(result).toMatchObject({ ok: true, ledgerId: "led-1", ledgerError: null });
  });

  it("names a refused mirror in the result and still answers the raised invoice", async () => {
    mirrorRaisedInvoice.mockResolvedValue({
      data: null,
      error: { message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" },
    });
    const result = await raise();
    expect(result).toMatchObject({ ok: true, ledgerId: null, invoice: { id: "qbo-77" } });
    expect(result.ok && result.ledgerError).toMatch(/Invoice 1077 raised, but its ledger row was not written: there is no unique/);
  });
});
