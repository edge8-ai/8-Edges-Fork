import { beforeEach, describe, expect, it, vi } from "vitest";

// S.1, SR.2.2. company-os owns the invoices screen, so it answers the global
// search for invoices, through finance's door: invoicesMatching, a question
// over the database's company_os.search_invoices (number and customer,
// accents ignored, best match first, never a voided invoice, since the list a
// hit opens hides it; proved in the SR.2.1 migration's proof). Who is asked is
// the invoices page's declared permission (ADR 0013), applied by runSearch and
// proved for the personas in app/search.test.ts. An invoice has no page of its
// own, so a hit opens the invoices list filtered to it.
const invoicesMatching = vi.fn<(terms: string[], lim: number) => Promise<{ data: unknown; error: unknown }>>();
vi.mock("@/entities/finance", () => ({ invoicesMatching: (t: string[], l: number) => invoicesMatching(t, l) }));

import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { ReadFailure } from "@/kernel/data/read";
import { searchContributions } from "./search";

const [invoices] = searchContributions;
const everything = { may: () => true };
const ADMIN: SearchActor = { surface: "admin", admin: { id: "u1", email: "a@x.test" } as AdminUser, access: everything };
const team = (): SearchActor => ({
  surface: "team",
  team: { isAdmin: false } as unknown as TeamActor,
  access: everything,
});
const answer = (data: unknown[]) => invoicesMatching.mockResolvedValue({ data, error: null });

beforeEach(() => invoicesMatching.mockReset());

describe("company-os's search contribution", () => {
  it("offers invoices on both surfaces, by the invoices page each opens", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([
      ["invoice", { admin: "/admin/revenue/invoices", team: "/team/revenue/invoices" }],
    ]);
  });

  it("asks finance's ranked search and opens the list filtered to the invoice's number", async () => {
    answer([{ id: "i1", doc_number: "1042", customer_name: "Acme", status: "open", score: 30 }]);
    const hits = await invoices.search(ADMIN, ["acme"], 5);
    expect(invoicesMatching).toHaveBeenCalledWith(["acme"], 5);
    expect(hits).toEqual([{ id: "i1", title: "Invoice 1042", detail: "Acme · open", href: "/admin/revenue/invoices?q=1042" }]);
  });

  it("falls back to the customer when an invoice has no number", async () => {
    answer([{ id: "i2", doc_number: null, customer_name: "Acme & Co", status: "paid", score: 30 }]);
    const [hit] = await invoices.search(team(), ["acme"], 5);
    expect(hit.title).toBe("Invoice for Acme & Co");
    expect(hit.href).toBe("/team/revenue/invoices?q=Acme%20%26%20Co");
  });

  it("raises a failed search instead of answering that no invoice matched", async () => {
    invoicesMatching.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(invoices.search(ADMIN, ["acme"], 5)).rejects.toBeInstanceOf(ReadFailure);
  });
});
