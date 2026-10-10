import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.1. company-os owns the invoices screen, so it answers the global search for
// invoices, reading finance's table through finance's door. Who is asked is the
// invoices page's declared permission (ADR 0013), applied by runSearch and
// proved for the personas in app/search.test.ts. An invoice has no page of its
// own, so a hit opens the invoices list filtered to it.
vi.mock("@/entities/finance", () => ({ INVOICE_VOIDED: "voided", selectInvoices: (cols: string) => builderFor("invoices").select(cols) }));

import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { searchContributions } from "./search";

const [invoices] = searchContributions;
const everything = { may: () => true };
const ADMIN: SearchActor = { surface: "admin", admin: { id: "u1", email: "a@x.test" } as AdminUser, access: everything };
const team = (): SearchActor => ({
  surface: "team",
  team: { isAdmin: false } as unknown as TeamActor,
  access: everything,
});

beforeEach(() => resetFake());

describe("company-os's search contribution", () => {
  it("offers invoices on both surfaces, by the invoices page each opens", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([
      ["invoice", { admin: "/admin/revenue/invoices", team: "/team/revenue/invoices" }],
    ]);
  });

  it("finds an invoice by number or customer and opens the list filtered to its number", async () => {
    script("invoices", { data: [{ id: "i1", doc_number: "1042", customer_name: "Acme", status: "open" }] });
    const hits = await invoices.search(ADMIN, ["acme"], 5);
    expect(hits).toEqual([{ id: "i1", title: "Invoice 1042", detail: "Acme · open", href: "/admin/revenue/invoices?q=1042" }]);
    expect(calls[0].filters).toContainEqual(["or", "doc_number.ilike.*acme*,customer_name.ilike.*acme*"]);
    // A voided invoice is not searchable: the list a hit opens hides it.
    expect(calls[0].filters).toContainEqual(["neq", "status", "voided"]);
  });

  it("falls back to the customer when an invoice has no number", async () => {
    script("invoices", { data: [{ id: "i2", doc_number: null, customer_name: "Acme & Co", status: "paid" }] });
    const [hit] = await invoices.search(team(), ["acme"], 5);
    expect(hit.title).toBe("Invoice for Acme & Co");
    expect(hit.href).toBe("/team/revenue/invoices?q=Acme%20%26%20Co");
  });
});
