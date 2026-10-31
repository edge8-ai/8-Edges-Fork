import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The buyer a red invoice must name (design §1.9, decided §4.8): the
// Vietnamese legal entity's legal name and tax code, read from org's
// `legal_entities` through its door. What these assert is what the hint on the
// New claim screen would show: the name and code, the name alone while no tax
// code is entered (production today), or nothing to copy at all.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { buyerEditHref, readRedInvoiceBuyer } from "./red-invoice-buyer";

const ADDRESS = "Phòng 1.01, Số 1 Đường Ví Dụ, Phường Mẫu, Thành phố Hồ Chí Minh";
const VN = { slug: "acme-vn", name: "Acme Vietnam", legal_name: "CÔNG TY TNHH ACME VIỆT NAM", tax_id: "0300000001", registered_address: ADDRESS };

beforeEach(() => {
  resetFake();
  // Only the columns the read selects come back, so a dropped column fails here.
  answerOnlySelectedColumns();
});

describe("readRedInvoiceBuyer", () => {
  it("gives the Vietnamese entity's legal name, address and tax code, and which entity it is", async () => {
    script("legal_entities", { data: [VN] });
    expect(await readRedInvoiceBuyer()).toEqual({ state: "ready", slug: "acme-vn", legalName: "CÔNG TY TNHH ACME VIỆT NAM", address: ADDRESS, taxCode: "0300000001" });
    const read = calls.find((c) => c.table === "legal_entities");
    // Only the active entity whose books are kept in dong is the buyer.
    expect(read?.filters).toEqual(expect.arrayContaining([["eq", "base_currency", "vnd"], ["eq", "active", true]]));
  });

  it("says the tax code is not configured while the row has none, and still gives the name", async () => {
    script("legal_entities", { data: [{ ...VN, tax_id: null }] });
    expect(await readRedInvoiceBuyer()).toEqual({ state: "no_tax_code", slug: "acme-vn", legalName: "CÔNG TY TNHH ACME VIỆT NAM", address: ADDRESS });
    script("legal_entities", { data: [{ ...VN, tax_id: "   ", registered_address: " " }] });
    expect(await readRedInvoiceBuyer()).toEqual({ state: "no_tax_code", slug: "acme-vn", legalName: "CÔNG TY TNHH ACME VIỆT NAM", address: null });
  });

  it("falls back to the entity's short name when no legal name is entered", async () => {
    script("legal_entities", { data: [{ ...VN, legal_name: "  ", tax_id: null, registered_address: null }] });
    expect(await readRedInvoiceBuyer()).toEqual({ state: "no_tax_code", slug: "acme-vn", legalName: "Acme Vietnam", address: null });
  });

  it("has nothing to show when there is no Vietnamese entity", async () => {
    script("legal_entities", { data: [] });
    expect(await readRedInvoiceBuyer()).toEqual({ state: "not_configured" });
  });

  it("says it could not read, rather than 'not configured', when the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    script("legal_entities", { data: null, error: { message: "db down" } });
    expect(await readRedInvoiceBuyer()).toEqual({ state: "unavailable" });
  });
});

// RB.15: the VAT box offers "Edit legal details" to whoever keeps them, by the
// atom Settings → Legal entities declares, and to nobody else.
describe("buyerEditHref", () => {
  const holding = (...atoms: string[]) => ({ may: (a: string) => atoms.includes(a) });
  const ready = { state: "ready" as const, slug: "acme-vn", legalName: "X", address: null, taxCode: "1" };

  it("links a keeper of the legal details to the buyer's own drawer", () => {
    expect(buyerEditHref(holding("org.legal-registration"), ready)).toBe("/admin/settings/legal-entities?open=acme-vn");
  });

  it("links a keeper to the list when there is no buyer to open", () => {
    expect(buyerEditHref(holding("org.legal-registration"), { state: "not_configured" })).toBe("/admin/settings/legal-entities");
    expect(buyerEditHref(holding("org.legal-registration"), { state: "unavailable" })).toBe("/admin/settings/legal-entities");
  });

  it("gives everyone else no link, including a Super Admin's other atoms alone", () => {
    expect(buyerEditHref(holding("reimbursements.mine"), ready)).toBeNull();
    expect(buyerEditHref(holding("org.legal-entities"), ready)).toBeNull();
    expect(buyerEditHref(undefined, ready)).toBeNull();
  });
});
