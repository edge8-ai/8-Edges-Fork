"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { assignCompanyMetadataId } from "@/kernel/identity/writes";
// Concrete files, not this entity's own door: the door re-exports them, so
// importing it here would make the entity depend on itself.
import { selectInvoices } from "@/entities/finance/lib/reads";
import { updateInvoices } from "@/entities/finance/lib/writes";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { getQboInvoiceCustomerId, type QboEntity } from "@/entities/company-os";
import { stripPostgrestMetacharacters } from "@/kernel/data/postgrest-filter";
import { recordAuditMany } from "@/kernel/audit/audit";

// Links (or re-links, or clears) the CRM company behind a synced QuickBooks
// invoice, from the invoice shelf. QuickBooks stays the source of truth for the
// invoice; this only writes the customer -> company link the sync reads back.
// The link lives on company metadata (the same list the sync matches), and
// company_id is set on every invoice for that customer so the whole history
// moves together and the next sync keeps it.

export type CompanyHit = { id: string; name: string | null };

// The mapping list is realm-scoped: each entity has its own key on company
// metadata, because a customer id is only unique within one QuickBooks company.
const MAPPING_KEY: Record<QboEntity, string> = {
  edge8: "qbo_customer_ids",
  aio: "qbo_customer_ids_aio",
};

// Typeahead for the company picker. Same sanitizing and shape as the deals
// referring-company search.
export async function searchCompanies(query: string): Promise<CompanyHit[]> {
  await requirePermission("finance.invoices");

  const term = stripPostgrestMetacharacters(query.trim());
  if (term.length < 2) return [];

  const { data, error } = await companyOs
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .ilike("name", `%${term}%`)
    .order("name")
    .limit(8);
  if (error) {
    console.error("[revenue/invoices] searchCompanies failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export type MapResult =
  | { ok: true; company: CompanyHit | null; linkedCount: number }
  | { ok: false; error: string };

// companyId null clears the link. Any invoice with no stored customer id (a row
// synced before that column existed) has it resolved live from QuickBooks, so
// mapping works without a re-sync first.
export async function setInvoiceCustomerCompany(invoiceId: string, companyId: string | null): Promise<MapResult> {
  const { user: user } = await requirePermission("finance.invoices");

  // finance owns invoices, so the read comes through its door and the row shape
  // is stated here rather than inferred from the column list.
  const { data: invoiceRow, error: invErr } = await selectInvoices("entity, customer_id, external_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) return { ok: false, error: invErr.message };
  const invoice = invoiceRow as { entity: string; customer_id: string | null; external_id: string } | null;
  if (!invoice) return { ok: false, error: "Invoice not found." };

  const entity = invoice.entity as QboEntity;
  const key = MAPPING_KEY[entity];
  if (!key) return { ok: false, error: `Unknown QuickBooks entity "${entity}".` };

  // Resolve the customer id: stored if the sync has written it, otherwise a
  // live lookup, which we persist so the row is consistent from here on.
  let customerId = invoice.customer_id;
  if (!customerId) {
    const live = await getQboInvoiceCustomerId(entity, invoice.external_id);
    if (!live.ok) return { ok: false, error: `Couldn't reach QuickBooks to identify the customer (${live.error}).` };
    customerId = live.customerId;
    if (!customerId) return { ok: false, error: "QuickBooks has no customer on this invoice." };
    await updateInvoices({ customer_id: customerId }).eq("id", invoiceId);
  }

  // The chosen company is checked before anything is written, so a link to a
  // company that does not exist changes nothing.
  let company: CompanyHit | null = null;
  if (companyId) {
    const { data: target, error: coErr } = await companyOs
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .maybeSingle();
    if (coErr) return { ok: false, error: coErr.message };
    if (!target) return { ok: false, error: "Company not found." };
    company = { id: target.id, name: target.name };
  }

  // One customer maps to one company. The database moves the id in one
  // transaction: it leaves every other company's list for this realm and joins
  // the chosen company's, or only leaves when the link is cleared (S.18). This
  // used to be a loop of whole-metadata writes, which raced the portal's
  // company form writing other keys of the same object.
  const { data: assigned, error: assignErr } = await assignCompanyMetadataId(key, customerId, companyId);
  if (assignErr) return { ok: false, error: assignErr.message };
  if (!assigned) return { ok: false, error: "Company not found." };

  // Point (or unpoint) every invoice for this customer at the chosen company.
  const { data: touched, error: backfillErr } = await updateInvoices({ company_id: companyId })
    .eq("source", "quickbooks")
    .eq("entity", entity)
    .eq("customer_id", customerId)
    .select("id");
  if (backfillErr) return { ok: false, error: backfillErr.message };
  // Every invoice the link moved records it on its own history, since the whole
  // customer's history moves together (S.19.8).
  await recordAuditMany(
    (touched ?? []).map((t) => ({
      table: "invoices",
      recordId: t.id,
      operation: "update" as const,
      actor: user.email,
      newData: { company_id: companyId },
      context: { customer_id: customerId, via: "invoice shelf" },
    })),
  );

  revalidateSurfaces("/revenue/invoices");
  return { ok: true, company, linkedCount: (touched ?? []).length };
}
