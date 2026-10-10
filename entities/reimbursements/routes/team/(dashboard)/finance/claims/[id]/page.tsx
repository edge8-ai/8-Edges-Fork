import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { readClaimForChecker } from "@/entities/reimbursements/lib/check-queue";
import { isClaimId } from "@/entities/reimbursements/lib/claim-labels";
import { DecidedClaim } from "@/entities/reimbursements/ui/DecidedClaim";
import { CheckerWithoutPerson } from "@/entities/reimbursements/ui/CheckQueue";
import { readRedInvoiceBuyer } from "@/entities/reimbursements/lib/red-invoice-buyer";
import { decideClaim, declineItem, enterItemRate, openClaimFile, rereadReceipt } from "@/entities/reimbursements/lib/decision-actions";

export const metadata = {
  title: "Check a Claim",
  description: "One submitted claim, each receipt beside its line, to check, send back or reject.",
};

// /team/finance/claims/[id] — the checker's page for one claim (plan section 8):
// each receipt's line with its document beside it, a decline per line, and the
// decision on the whole claim. A claim that is not waiting to be checked is
// shown as it stands, with no moves; so is the viewer's own claim, which
// someone else checks (design §1.5), unless the viewer may decide their own
// (the Employer, §1.6). The page's guard reaches every claim; DecidedClaim
// decides which of the checker's moves this viewer may make on it.
export default async function CheckClaimPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.check");
  const { id } = await props.params;
  if (!isClaimId(id)) notFound();
  if (!access.personId) {
    return (
      <>
        <PageHead eyebrow="Finance" title="Check a claim" />
        <CheckerWithoutPerson />
      </>
    );
  }
  const claim = await readClaimForChecker(id);
  if (!claim) notFound();
  // What the AI reading compared each red invoice's buyer with (RB.9).
  const buyer = await readRedInvoiceBuyer();

  return (
    <DecidedClaim
      claim={claim}
      viewerPersonId={access.personId}
      mayDecideOwn={access.may("reimbursements.decide-own")}
      back={{ href: "/team/finance/claims/to-check", label: "To check" }}
      openFile={openClaimFile}
      buyer={buyer}
      check={{ decide: decideClaim, decline: declineItem, enterRate: enterItemRate, reread: rereadReceipt, doneHref: "/team/finance/claims/to-check" }}
    />
  );
}
