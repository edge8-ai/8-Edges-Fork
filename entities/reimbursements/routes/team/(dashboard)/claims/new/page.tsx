import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { readRedInvoiceBuyer } from "@/entities/reimbursements";
import { buyerEditHref } from "@/entities/reimbursements/lib/red-invoice-buyer";
import { RedInvoiceHint } from "@/entities/reimbursements/ui/RedInvoiceHint";
import { listTrips } from "@/entities/reimbursements/lib/trips";
import { NewClaimForm } from "./NewClaimForm";

export const metadata = {
  title: "New Claim",
  description: "Start a reimbursement claim.",
};

// /team/claims/new — names the claim and starts it as a draft. Receipts are
// added on the claim's own page, one at a time, over as many days as a trip
// takes: a receipt's documents need the claim and the item to exist first.
// The red-invoice hint is here because a red invoice is asked for at the till,
// before there is anything to upload (RB.2), and it sits above the form so the
// VAT details are the first thing read (RB.15, Mai).
export default async function NewClaimPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.mine");
  const [buyer, trips] = await Promise.all([readRedInvoiceBuyer(), listTrips()]);
  return (
    <>
      <p className="u-mb-3">
        <Link href="/team/claims">← My claims</Link>
      </p>
      <PageHead title="New claim" sub="Give it a name you will recognise and the event it belongs to, then add receipts as you go and submit when you are done." />
      <div className="u-max-form u-mb-3">
        <RedInvoiceHint buyer={buyer} editHref={buyerEditHref(access, buyer)} />
      </div>
      <section className="admin-card admin-section-card u-max-form">
        <NewClaimForm trips={trips} />
      </section>
    </>
  );
}
