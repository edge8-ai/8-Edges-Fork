"use client";

// What to tell a Vietnamese seller at the till (plan: "the organisation's company name and
// tax code ready to copy"; design §1.9, RB.2). A red invoice is issued to the
// details the buyer gives, so the claim screens show them at the top, each with
// a copy button, and one button that copies all three at once (RB.15, Mai's
// layout: name, address, tax code). A ride is not held to it strictly (RB.15),
// but the box does not say so: a ride still brings its invoice where it can (RB.16).
//
// The values come from org's `legal_entities` (decided §4.8). Whatever is not
// entered yet is said plainly, so nobody copies a blank. Whoever keeps the
// legal details (org.legal-registration) is handed `editHref`, decided by the
// server page; everyone else gets null and sees no link.
import { useState } from "react";
import type { RedInvoiceBuyer } from "../lib/red-invoice-buyer";

/** The clipboard is refused outside a secure context or without the person's gesture; the value stays on screen to select by hand. */
function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return [copied, copy] as const;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const [copied, copy] = useCopy(value);
  return (
    <div className="admin-vat-row">
      <span className="admin-label">{label}</span>
      <span className="admin-vat-value">{value}</span>
      <button type="button" className="admin-btn admin-btn--sm" onClick={copy} aria-label={`Copy the ${label.toLowerCase()}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** The three details in the order a seller asks for them, as Finance writes them in chat. */
function CopyAll({ legalName, address, taxCode }: { legalName: string; address: string; taxCode: string }) {
  const [copied, copy] = useCopy(`Name: ${legalName}\nAddress: ${address}\nTax code: ${taxCode}`);
  return (
    <button type="button" className="admin-btn admin-btn--sm" onClick={copy}>
      {copied ? "Copied all three" : "Copy all"}
    </button>
  );
}

export function RedInvoiceHint({ buyer, editHref = null }: { buyer: RedInvoiceBuyer; editHref?: string | null }) {
  const known = buyer.state === "ready" || buyer.state === "no_tax_code" ? buyer : null;
  // Copy all waits for all three: a half-filled buyer would be pasted to a seller as if whole.
  const all = buyer.state === "ready" && buyer.address ? { legalName: buyer.legalName, address: buyer.address, taxCode: buyer.taxCode } : null;
  return (
    <section className="admin-alert admin-alert--info u-stack u-gap-2" aria-label="VAT invoice details">
      <div className="admin-vat-head">
        <div className="u-stack u-flex-320">
          <span className="u-strong u-ink">VAT invoice (red invoice) details</span>
          <span>Bought something in Vietnam? Ask the seller for a red invoice made out to this company.</span>
        </div>
        <div className="admin-vat-actions">
          {editHref && (
            <a className="admin-btn admin-btn--sm admin-vat-edit" href={editHref}>
              Edit legal details
            </a>
          )}
          {all && <CopyAll {...all} />}
        </div>
      </div>
      {known && <DetailRow label="Company name" value={known.legalName} />}
      {known?.address && <DetailRow label="Address" value={known.address} />}
      {buyer.state === "ready" && <DetailRow label="Tax code" value={buyer.taxCode} />}
      {known && !known.address && <span className="admin-hint">Address not configured yet. Ask Finance for it until it is entered.</span>}
      {buyer.state === "no_tax_code" && <span className="admin-hint">Tax code not configured yet. Ask Finance for it until it is entered.</span>}
      {buyer.state === "not_configured" && (
        <span className="admin-hint">The company name and tax code are not configured yet. Ask Finance for them.</span>
      )}
      {buyer.state === "unavailable" && (
        <span className="admin-hint">The company name and tax code could not be read just now. Reload the page, or ask Finance.</span>
      )}
    </section>
  );
}
