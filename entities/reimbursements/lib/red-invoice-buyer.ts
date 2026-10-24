// The buyer a red invoice must name (design §1.9, decided §4.8): the
// organisation's Vietnamese legal entity, its legal name, registered address
// and tax code. A Vietnamese seller issues the e-invoice to whatever details
// the buyer gives at the till, so the claim screens show all three, ready to
// copy (the address since RB.15, at Mai's request).
//
// The values are data in org's `legal_entities`, read through its door, never
// code: a fork carries none of them, and `kernel/config/organisation.ts` stays
// as it is. Production has no tax code yet (RB.13 enters it), so "no tax code"
// is a state the hint shows, not an error. The AI's check that an invoice names
// this buyer is RB.9's warning; nothing here blocks a submit.
import { readOr } from "@/kernel/data/read";
import type { Access } from "@/kernel/identity/access-model";
import { legalEntityEditHref, selectLegalEntities } from "@/entities/org";

/**
 * `slug` names the entity, so whoever keeps the legal details can be sent to
 * edit it. `address` is null until entered: a seller can issue without it, so
 * its absence is said, never a reason to withhold the rest.
 */
export type RedInvoiceBuyer =
  | { state: "ready"; slug: string; legalName: string; address: string | null; taxCode: string }
  | { state: "no_tax_code"; slug: string; legalName: string; address: string | null }
  | { state: "not_configured" }
  | { state: "unavailable" };

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The active entity whose books are kept in dong is the buyer. A failed read
 * is said as such, never as "not configured": telling a person the tax code is
 * missing when it is entered would send them to the wrong fix.
 */
export async function readRedInvoiceBuyer(): Promise<RedInvoiceBuyer> {
  const rows = readOr(
    await selectLegalEntities("slug, name, legal_name, tax_id, registered_address").eq("base_currency", "vnd").eq("active", true).order("slug").limit(1),
    "[reimbursements] red invoice buyer",
    null,
  );
  if (rows === null) return { state: "unavailable" };
  const row = rows[0];
  const legalName = row ? (text(row.legal_name) ?? text(row.name)) : null;
  if (!row || !legalName) return { state: "not_configured" };
  const slug = String(row.slug);
  const address = text(row.registered_address);
  const taxCode = text(row.tax_id);
  return taxCode ? { state: "ready", slug, legalName, address, taxCode } : { state: "no_tax_code", slug, legalName, address };
}

/**
 * Where the VAT box sends its viewer to edit the buyer, or null when they may
 * not (RB.15). The atom is the one Settings → Legal entities itself declares
 * (org.legal-registration: Super Admin, Finance, the accountant), so the link
 * never leads to a page that refuses. A buyer not yet configured, or not read,
 * links to the list, where the keeper can fix it.
 */
export function buyerEditHref(access: Pick<Access, "may"> | null | undefined, buyer: RedInvoiceBuyer): string | null {
  if (!access?.may("org.legal-registration")) return null;
  return legalEntityEditHref(buyer.state === "ready" || buyer.state === "no_tax_code" ? buyer.slug : null);
}
