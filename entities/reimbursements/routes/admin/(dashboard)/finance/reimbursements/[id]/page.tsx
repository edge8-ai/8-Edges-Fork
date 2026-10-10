import { notFound } from "next/navigation";
import { requirePermission, type RequestAccess } from "@/kernel/identity/access-request";
import { listClaimsToApprove, listClaimsToCheck, readClaimForChecker } from "@/entities/reimbursements/lib/check-queue";
import type { ClaimStatus } from "@/entities/reimbursements/lib/claim-rules";
import { movesFor, waitsOn } from "@/entities/reimbursements/lib/claim-moves";
import { claimViewerOf } from "@/entities/reimbursements/lib/deciders";
import { isClaimId } from "@/entities/reimbursements/lib/claim-labels";
import { DecidedClaim } from "@/entities/reimbursements/ui/DecidedClaim";
import { readRedInvoiceBuyer } from "@/entities/reimbursements/lib/red-invoice-buyer";
import { approverDecides, decideClaim, declineItem, enterItemRate, openClaimFileInAdmin, rereadReceipt } from "@/entities/reimbursements/lib/decision-actions";

export const metadata = {
  title: "Reimbursement Claim",
  description: "One reimbursement claim with its receipts and history, and the check or approval waiting on the viewer.",
};

// /admin/finance/reimbursements/[id] — one claim in Admin (design §1.5): every
// Admin viewer (reimbursements.view) sees it with its amounts and receipts and
// no bank details (§1.11). A viewer who also checks gets the checker's moves
// while it waits to be checked, and one who approves gets the approver's while
// it waits for approval, so the Employer and the approver decide without
// leaving Admin. Each move's action keeps its own guard; movesFor
// (claim-moves.ts) adds the claim's status and the own-claim rule, for
// DecidedClaim and for the links here alike.
export default async function AdminClaimPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.view");
  const { id } = await props.params;
  if (!isClaimId(id)) notFound();
  // Seeing a claim needs no person record; deciding one does, so a viewer with
  // none (an allowlisted address) reads the claim with no moves.
  const claim = await readClaimForChecker(id);
  if (!claim) notFound();
  // What the AI reading compared each red invoice's buyer with (RB.9).
  const buyer = await readRedInvoiceBuyer();

  const back =
    waitsOn(claim.status, "checker") && access.may("reimbursements.check")
      ? { href: "/admin/finance/reimbursements/to-check", label: "To check" }
      : waitsOn(claim.status, "approver") && access.may("reimbursements.approve")
        ? { href: "/admin/finance/reimbursements/to-approve", label: "To approve" }
        : { href: "/admin/finance/reimbursements/all", label: "All claims" };
  const next = await nextInQueue(claim, access);

  return (
    <DecidedClaim
      claim={claim}
      viewerPersonId={access.personId}
      mayDecideOwn={access.may("reimbursements.decide-own")}
      back={back}
      openFile={openClaimFileInAdmin}
      buyer={buyer}
      check={
        access.may("reimbursements.check") ? { decide: decideClaim, decline: declineItem, enterRate: enterItemRate, reread: rereadReceipt, doneHref: "/admin/finance/reimbursements/to-check" } : undefined
      }
      approve={access.may("reimbursements.approve") ? { decide: approverDecides, doneHref: "/admin/finance/reimbursements/to-approve" } : undefined}
      next={next}
    />
  );
}

/**
 * Where a decision on this claim leads (RB.14): the next claim waiting in the
 * same queue, oldest first, or the queue when this was the last. Read only
 * for a claim this viewer may decide now; every other viewer has no decision.
 */
async function nextInQueue(claim: { id: string; status: ClaimStatus; personId: string }, access: RequestAccess): Promise<{ href: string; label: string } | undefined> {
  // Only for a claim this viewer decides now: never their own, unless they may decide their own.
  if (!access.personId) return undefined;
  const moves = movesFor(claim, claimViewerOf(access));
  const claimId = claim.id;
  const scope = { includeOwn: access.may("reimbursements.decide-own") };
  const queue = moves.check
    ? { list: await listClaimsToCheck(access.personId, scope), href: "/admin/finance/reimbursements/to-check", name: "To check" }
    : moves.approve
      ? { list: await listClaimsToApprove(access.personId, scope), href: "/admin/finance/reimbursements/to-approve", name: "To approve" }
      : null;
  if (!queue) return undefined;
  const rest = queue.list.filter((c) => c.id !== claimId);
  if (rest.length === 0) return { href: queue.href, label: `Back to ${queue.name}: nothing else waits` };
  return { href: `/admin/finance/reimbursements/${rest[0].id}`, label: `Next claim · ${rest.length} left` };
}
