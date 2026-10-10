// company-os's answer to the global search (S.1): invoices.
//
// The invoices screen is company-os's, though the table is finance's, so the
// hit belongs here and the read goes through finance's door. Invoices are
// served on both surfaces, and runSearch asks this only of someone who may open
// the invoices page there (its declared permission, ADR 0013). An invoice has
// no page of its own (its drawer opens from local state), so a hit opens the
// list filtered to the invoice's number, or to its customer when it has none.
import { mustRows } from "@/kernel/data/read";
import { matchEveryTerm } from "@/kernel/data/postgrest-filter";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { SearchContribution, SearchHit } from "@/kernel/shell/search";
import { INVOICE_VOIDED, selectInvoices } from "@/entities/finance";

type InvoiceRow = { id: string; doc_number: string | null; customer_name: string | null; status: string };

// A function declaration, not a method on the contribution below, so nothing at
// module scope touches finance's door value (entity-door-load-order).
async function searchInvoices(actor: SearchActor, terms: string[], limit: number): Promise<SearchHit[]> {
  const rows = mustRows(
    // A voided invoice is hidden from the list a hit opens, so it would land on nothing.
    await matchEveryTerm(selectInvoices("id, doc_number, customer_name, status").neq("status", INVOICE_VOIDED), ["doc_number", "customer_name"], terms)
      .order("txn_date", { ascending: false })
      .limit(limit),
    "[company-os/search] invoices",
  ) as InvoiceRow[];
  const base = actor.surface === "team" ? "/team/revenue" : "/admin/revenue";
  return rows.map((i) => ({
    id: i.id,
    title: i.doc_number ? `Invoice ${i.doc_number}` : `Invoice for ${i.customer_name ?? "an unnamed customer"}`,
    detail: [i.customer_name, i.status].filter(Boolean).join(" · ") || null,
    href: `${base}/invoices?q=${encodeURIComponent(i.doc_number ?? i.customer_name ?? "")}`,
  }));
}

const invoices: SearchContribution = {
  kind: "invoice",
  label: "Invoices",
  opens: { admin: "/admin/revenue/invoices", team: "/team/revenue/invoices" },
  search: searchInvoices,
};

export const searchContributions: SearchContribution[] = [invoices];
