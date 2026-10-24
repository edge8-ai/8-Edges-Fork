import { beforeEach, describe, expect, it, vi } from "vitest";

// E-signature. What follows a client's signature runs from the sign action and
// again from the deal page's Retry invoice button, so it must raise the
// agreement's invoice once however often it runs, and never take the
// signature back when invoicing fails.

type Invoice = { qboId: string } | { error: string };
const state: { invoice: Invoice | null } = { invoice: null };
const agreement = () => ({
  id: "agr-1",
  status: "signed",
  header: { companyId: "co-1", companyName: "Example Rentals", title: "MSA", fee: { cents: 1_500_000, currency: "aud", description: "Foundation" } },
  client: { name: "Sam", ...(state.invoice ? { invoice: state.invoice } : {}) },
});

vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));
const recordAgreementInvoice = vi.fn(async (_id: string, invoice: Invoice) => {
  state.invoice = invoice;
  return { ok: true };
});
const completeSignedAgreement = vi.fn(async () => ({ ok: true }));
vi.mock("@/entities/crm", () => ({
  getAgreement: vi.fn(async () => agreement()),
  // crm's rule, restated for the double: signed, and no invoice raised yet
  // (crm's own suite proves the real one).
  needsInvoice: (a: ReturnType<typeof agreement>) => a.status === "signed" && !(a.client.invoice && "qboId" in a.client.invoice),
  recordAgreementInvoice: (id: string, invoice: Invoice) => recordAgreementInvoice(id, invoice),
  completeSignedAgreement: () => completeSignedAgreement(),
  listAgreementsToSignFor: vi.fn(),
  mayClientSee: vi.fn(),
}));
let invoiceResult: unknown;
const invoiceCompanyForHours = vi.fn(async (_args: unknown) => invoiceResult);
vi.mock("@/entities/company-os", () => ({ invoiceCompanyForHours: (args: unknown) => invoiceCompanyForHours(args) }));

import { afterClientSigned, invoiceSignedAgreement } from "./agreements";

const raised = {
  ok: true,
  invoice: { id: "q1", docNumber: "1001", totalCents: 1_500_000, currency: "aud" },
  ledgerId: "led-1",
  emailed: true,
  companyName: "Example Rentals",
};

beforeEach(() => {
  state.invoice = null;
  invoiceCompanyForHours.mockClear();
  recordAgreementInvoice.mockClear();
  invoiceResult = raised;
});

describe("invoicing a signed agreement", () => {
  it("raises one invoice when completion runs twice", async () => {
    await afterClientSigned("agr-1", "https://edge8.test");
    await afterClientSigned("agr-1", "https://edge8.test");
    expect(invoiceCompanyForHours).toHaveBeenCalledTimes(1);
    expect(invoiceCompanyForHours).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "co-1", hours: 1, rateCents: 1_500_000, expectCurrency: "aud" }),
    );
    expect(state.invoice).toEqual(expect.objectContaining({ qboId: "q1", docNumber: "1001" }));
  });

  it("stores why the invoice was not raised, and raises it on retry once fixed", async () => {
    invoiceResult = { ok: false, kind: "manual", reason: "Example Rentals has no QuickBooks customer mapping.", companyName: "Example Rentals" };
    expect(await invoiceSignedAgreement("agr-1")).toEqual({ ok: false, error: expect.stringContaining("no QuickBooks customer") });
    expect(state.invoice).toEqual(expect.objectContaining({ error: expect.stringContaining("no QuickBooks customer") }));

    invoiceResult = raised;
    expect(await invoiceSignedAgreement("agr-1")).toEqual({ ok: true, invoiced: true });
    expect(await invoiceSignedAgreement("agr-1")).toEqual({ ok: true, invoiced: false });
    expect(invoiceCompanyForHours).toHaveBeenCalledTimes(2);
  });

  it("never throws out of the post-sign steps, so the client's signature stands", async () => {
    invoiceCompanyForHours.mockImplementationOnce(async () => {
      throw new Error("QuickBooks down");
    });
    await expect(afterClientSigned("agr-1", "https://edge8.test")).resolves.toBeUndefined();
  });
});
