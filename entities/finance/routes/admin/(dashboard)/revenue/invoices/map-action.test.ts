import { beforeEach, describe, expect, it, vi } from "vitest";

// S.18. Linking a QuickBooks customer to a company moves the customer id in
// one database call instead of rewriting whole metadata objects in a loop,
// which raced the portal's company form writing other keys of the same object.
// These pin the call the action makes, the realm key it names, and that a
// company that is not there changes nothing: no id moved, no invoice re-pointed.

type Rpc = { data: boolean | null; error: { message: string } | null };
let assignResponse: Rpc = { data: true, error: null };
let targetRow: { id: string; name: string } | null = { id: "co-1", name: "Acme" };
let invoiceRow: { entity: string; customer_id: string | null; external_id: string } | null;
const assigns: Array<[string, string, string | null]> = [];
const invoiceWrites: Record<string, unknown>[] = [];
const companyWrites: unknown[] = [];

// The actions ask for their declared permission first (ADR 0013); recorded so the test pins which.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: vi.fn(async (p: string) => (asked.push(p), { user: { id: "u-1", email: "rev@edge8.test" } })) }));
const audited: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAuditMany: async (rows: Record<string, unknown>[]) => void audited.push(...rows) }));
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: vi.fn() }));
vi.mock("@/entities/company-os", () => ({ getQboInvoiceCustomerId: vi.fn() }));
vi.mock("@/kernel/identity/writes", () => ({
  assignCompanyMetadataId: async (key: string, value: string, companyId: string | null) => {
    assigns.push([key, value, companyId]);
    return assignResponse;
  },
  updateCompanies: (patch: unknown) => {
    companyWrites.push(patch);
    return { eq: async () => ({ error: null }) };
  },
}));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: targetRow, error: null }) }) }) }),
  },
}));
vi.mock("@/entities/finance/lib/reads", () => ({
  selectInvoices: () => ({ eq: () => ({ maybeSingle: async () => ({ data: invoiceRow, error: null }) }) }),
}));
vi.mock("@/entities/finance/lib/writes", () => ({
  updateInvoices: (patch: Record<string, unknown>) => {
    invoiceWrites.push(patch);
    const chain = { eq: () => chain, select: async () => ({ data: [{ id: "inv-1" }, { id: "inv-2" }], error: null }) };
    return chain;
  },
}));

import { setInvoiceCustomerCompany } from "./map-action";

beforeEach(() => {
  audited.length = 0;
  assignResponse = { data: true, error: null };
  targetRow = { id: "co-1", name: "Acme" };
  invoiceRow = { entity: "edge8", customer_id: "42", external_id: "qbo-inv-1" };
  assigns.length = 0;
  invoiceWrites.length = 0;
  companyWrites.length = 0;
});

describe("setInvoiceCustomerCompany", () => {
  it("moves the customer id to the chosen company in one call and re-points its invoices", async () => {
    expect(await setInvoiceCustomerCompany("inv-1", "co-1")).toEqual({
      ok: true,
      company: { id: "co-1", name: "Acme" },
      linkedCount: 2,
    });
    expect(assigns).toEqual([["qbo_customer_ids", "42", "co-1"]]);
    expect(invoiceWrites).toEqual([{ company_id: "co-1" }]);
    expect(companyWrites).toEqual([]);
    // Each invoice the link moved records it on its own history (S.19.8).
    expect(audited).toEqual([
      expect.objectContaining({ table: "invoices", recordId: "inv-1", actor: "rev@edge8.test", newData: { company_id: "co-1" } }),
      expect.objectContaining({ table: "invoices", recordId: "inv-2", actor: "rev@edge8.test", newData: { company_id: "co-1" } }),
    ]);
    expect(new Set(asked)).toEqual(new Set(["finance.invoices"]));
  });

  it("names the AIO realm's own list for an AIO invoice", async () => {
    invoiceRow = { entity: "aio", customer_id: "7", external_id: "qbo-inv-9" };
    await setInvoiceCustomerCompany("inv-9", "co-1");
    expect(assigns).toEqual([["qbo_customer_ids_aio", "7", "co-1"]]);
  });

  it("clears the link by removing the id everywhere", async () => {
    expect(await setInvoiceCustomerCompany("inv-1", null)).toEqual({ ok: true, company: null, linkedCount: 2 });
    expect(assigns).toEqual([["qbo_customer_ids", "42", null]]);
    expect(invoiceWrites).toEqual([{ company_id: null }]);
  });

  it("changes nothing when the chosen company does not exist", async () => {
    targetRow = null;
    expect(await setInvoiceCustomerCompany("inv-1", "gone")).toEqual({ ok: false, error: "Company not found." });
    expect(assigns).toEqual([]);
    expect(invoiceWrites).toEqual([]);
    expect(audited).toEqual([]);
  });

  it("stops before re-pointing invoices when the move fails or the company vanished", async () => {
    for (const [response, error] of [
      [{ data: null, error: { message: "deadlock detected" } }, "deadlock detected"],
      [{ data: false, error: null }, "Company not found."],
    ] as const) {
      assignResponse = response;
      expect(await setInvoiceCustomerCompany("inv-1", "co-1")).toEqual({ ok: false, error });
    }
    expect(invoiceWrites).toEqual([]);
  });
});
