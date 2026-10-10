import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { canSubmit, ownerCan, type ClaimStatus } from "@/entities/reimbursements/lib/claim-rules";
import { noticeTone } from "@/entities/reimbursements/lib/claim-moves";
import { isClaimId } from "@/entities/reimbursements/lib/claim-labels";
import { readMyClaim, type MyClaim } from "@/entities/reimbursements/lib/my-claims";
import { ClaimCard, ClaimDetail } from "@/entities/reimbursements/ui/ClaimDetail";
import { readRedInvoiceBuyer } from "@/entities/reimbursements";
import { buyerEditHref } from "@/entities/reimbursements/lib/red-invoice-buyer";
import { RedInvoiceHint } from "@/entities/reimbursements/ui/RedInvoiceHint";
import { ClaimItems } from "./ClaimItems";
import { ClaimMoves } from "./ClaimMoves";
import { ClaimTrip } from "./ClaimTrip";
import { listTrips } from "@/entities/reimbursements/lib/trips";
import { listRebillCompanies } from "@/entities/reimbursements/lib/rebill-companies";
import { BankDetailsPanel } from "./BankDetailsPanel";
import { OpenDocument } from "@/entities/reimbursements/ui/OpenDocument";
import { openOwnBankReceipt } from "../actions";
import { bankConfirmable, bankDetailsOnFile, readOwnBankDetails } from "@/entities/reimbursements/lib/own-bank-details";

export const metadata = {
  title: "Claim",
  description: "One of your reimbursement claims: its receipts, where it is, and its history.",
};

// /team/claims/[id] — the owner's view of one of their claims (plan section 8):
// where it is, its receipts and documents, and everything that happened to it,
// from its own append-only history. While it is the owner's to change (draft,
// or sent back) the receipts are editable here, which is also how a claim is
// filled in after /team/claims/new starts it. A claim that is not the actor's
// is a 404, exactly like one that does not exist.
export default async function MyClaimPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const { id } = await props.params;
  if (!isClaimId(id)) notFound();
  const claim = await readMyClaim(id, actor.personId);
  if (!claim) notFound();
  // The bank panel is the owner's alone (design §1.11): readMyClaim filters on
  // the actor's person id in the query, so reaching this line means the claim
  // is theirs, and the details read are the actor's own, never the claim's
  // by an id the page was handed.
  const bank = await readOwnBankDetails(actor.personId);

  const can = ownerCan(claim);
  // The seller's details, the trips to pick from and the clients to rebill
  // matter only while the claim can still be changed.
  const [buyer, trips, companies] = can.edit ? await Promise.all([readRedInvoiceBuyer(), listTrips(), listRebillCompanies()]) : [null, [], []];
  const ready = canSubmit({
    title: claim.title,
    items: claim.items.map((i) => ({
      label: i.label,
      category: i.category,
      currency: i.currency,
      amount: i.amount,
      boughtInVietnam: i.boughtInVietnam,
      lostReceiptNote: i.lostReceiptNote,
      removed: i.removed !== null,
      // The page lists confirmed documents only; a replaced one counts for nothing.
      documents: i.documents.map((d) => ({ kind: d.kind, confirmed: true, mimeType: d.mimeType, replaced: d.replacedAt !== null })),
    })),
    bankDetailsOnFile: bankDetailsOnFile(bank),
  });

  return (
    <ClaimDetail
      claim={claim}
      back={{ href: "/team/claims", label: "My claims" }}
      totalVnd={claim.totalVnd}
      ratePending={claim.ratePending}
      notices={<Banner claim={claim} />}
      tripEditor={can.edit ? <ClaimTrip claimId={claim.id} trips={trips} current={claim.trip} /> : undefined}
      receipts={
        <>
          {buyer && (
            <div className="u-mb-3">
              <RedInvoiceHint buyer={buyer} editHref={buyerEditHref(access, buyer)} />
            </div>
          )}
          <ClaimItems claimId={claim.id} items={claim.items} removal={can.remove} companies={companies} may={mayProp(access, ["reimbursements.mine"])} />
        </>
      }
      actions={
        <>
          <ClaimCard>
            <ClaimMoves
              claimId={claim.id}
              can={{ submit: can.submit, withdraw: can.withdraw, delete: can.delete }}
              blockers={ready.ok ? [] : ready.reasons}
              resubmit={claim.status === "sent_back"}
            />
          </ClaimCard>
          {claim.bankReceiptFileId && (
            <ClaimCard>
              <div className="u-stack u-gap-1">
                <span className="admin-label">Paid</span>
                <span className="admin-hint">The receipt from the bank for the transfer that paid this claim.</span>
                <OpenDocument claimId={claim.id} fileId={claim.bankReceiptFileId} label="bank receipt" openFile={openOwnBankReceipt} />
              </div>
            </ClaimCard>
          )}
          <ClaimCard>
            <BankDetailsPanel details={bank} claimId={claim.id} confirmedAt={claim.bankConfirmedAt} confirmable={bankConfirmable(claim.status)} />
          </ClaimCard>
        </>
      }
    />
  );
}

// The line under the title, in the plan's words for each state (section 3),
// in the status badge's own tone (noticeTone), so the two never disagree.
function Banner({ claim }: { claim: MyClaim }) {
  const tone = noticeTone(claim.status);
  const more: Partial<Record<ClaimStatus, string>> = {
    draft: "A draft can be changed freely. Add receipts as you go, then submit.",
    submitted: "You can still withdraw it to change it, until it is checked.",
    sent_back: "Fix what is wrong, then resubmit.",
    checked: "The claim is locked while it waits for approval.",
    approved: "The claim is locked. Only being sent back reopens it.",
    rejected: "This is final.",
  };
  return (
    <div className={`admin-alert admin-alert--${tone}`} role="status">
      <span className="u-strong">{claim.line}</span> {more[claim.status] ?? ""}
    </div>
  );
}
