import Link from "next/link";
import { notFound } from "next/navigation";
import { saigonToday } from "@/kernel/config/dates";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { PageHead } from "@/kernel/ui/PageHead";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { payoutRefusalFor, reinstateRefusalFor } from "@/entities/reimbursements/lib/advance-payers";
import { readAdvanceForFinance } from "@/entities/reimbursements/lib/advance-queue";
import { ownMoneyRefusal, PUT_BACK_LABEL, ADVANCE_STATUS_LABEL_TO_OTHERS, ADVANCE_STATUS_TONE, advanceRef, isOverdue, isSettling, type AdvanceStatus } from "@/entities/reimbursements/lib/advance-rules";
import { readAdvancePayeeBank } from "@/entities/reimbursements/lib/bank-details";
import { payableOf } from "@/entities/reimbursements/lib/settlement-rules";
import { actorLabel, NO_PERSON_RECORD } from "@/entities/reimbursements/lib/deciders";
import { financeAdvancePath } from "@/entities/reimbursements/lib/paths";
import { formsOf } from "@/entities/reimbursements/lib/advance-forms";
import { AdvanceHistory } from "@/entities/reimbursements/ui/AdvanceHistory";
import { AdvanceLedger } from "@/entities/reimbursements/ui/AdvanceLedger";
import { AdvanceFormLinks } from "@/entities/reimbursements/ui/AdvancePaper";
import { OpenDocument } from "@/entities/reimbursements/ui/OpenDocument";
import { openAdvanceFileToPay } from "../actions";
import { FinishPayout, FinishReturn, PayoutPanel, ReturnPanel } from "./AdvancePanels";
import { ReinstatePanel } from "./ReinstatePanel";

export const metadata = {
  title: "An Advance",
  description: "One advance: where to send it, what came back and its account 141.",
};

/** What there is to say while Finance has nothing to do on it. */
function waitingLine(status: AdvanceStatus, owner: string, settleBy: string | null, overdue: boolean, owedToThem: { vnd: number; paid: boolean }): string {
  switch (status) {
    case "draft":
      return `${owner} withdrew this request. Nothing to do.`;
    case "submitted":
      return "Waiting for approval. You transfer it once it is approved.";
    case "sent_back":
      return `Sent back to ${owner} to fix. Nothing to do until it is approved.`;
    case "rejected":
      return "Rejected, so no money moves.";
    case "cancelled":
      return `${owner} cancelled it, so no money moves. Do not send it.`;
    case "settled":
      if (owedToThem.vnd > 0) return `Closed. ${owedToThem.paid ? "The company paid" : "The company pays"} ${owner} the difference, ${formatVndWhole(owedToThem.vnd)}${owedToThem.paid ? "." : ", in a payment run."}`;
      return "Closed. Nothing is owed either way.";
    case "paid_out":
      return overdue ? `Overdue since ${formatDate(settleBy)}.` : `With ${owner} until ${formatDate(settleBy)}.`;
    default:
      return "Nothing to do.";
  }
}

// /team/finance/advances/[id]: one advance, for whoever records its money (AD.7). A bank
// account is read only while this viewer has a transfer to make, because reading one is
// audited and nobody should have it on screen for a form they cannot send.
export default async function FinanceAdvancePage({ params }: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.pay");
  const may = mayProp(access, ["reimbursements.pay"]);
  const { id } = await params;
  if (!Id.safeParse(id).success) notFound();
  const advance = await readAdvanceForFinance(id);
  if (!advance) notFound();

  const { row, ownerName, spentVnd, approvedBy, claim, returnReported, returnedVnd, owedVnd, transfers, account, files, unusedReceipt, events } = advance;
  const reference = advanceRef(row.refNo);
  const refusedToPay = row.status === "approved" ? await payoutRefusalFor(row, { personId: access.personId }) : null;
  const paying = row.status === "approved" && !refusedToPay;
  // Back from a cancel because the money had already gone, so this only records it.
  const putBack = row.status === "approved" ? events.find((e) => e.move === "reinstate") : undefined;
  // Once approved, an advance leaves only by a payout or a cancel, so this is a cancel that may have crossed the transfer.
  const crossedCancel = row.status === "cancelled" && events.some((e) => e.move === "approve");
  const refusedToPutBack = crossedCancel ? await reinstateRefusalFor(row, { personId: access.personId }) : null;
  const cancelledWhy = events.find((e) => e.move === "cancel")?.reason;
  // A transfer on the ledger of an advance still at approved: the status write was lost.
  const lostPayout = paying ? transfers.find((t) => t.direction === "out") : undefined;
  const payee = paying && !lostPayout && !putBack ? await readAdvancePayeeBank({ personId: row.personId, advanceId: row.id, actor: actorLabel(access), purpose: "advance_panel" }) : null;
  const ownMoney = ownMoneyRefusal(row, { personId: access.personId });
  const returning = row.status === "to_return" && Boolean(access.personId) && !ownMoney;
  const settling = isSettling({ status: row.status, claimStatus: claim?.status ?? null });
  const overdue = isOverdue({ status: row.status, settleBy: row.settleBy, claimStatus: claim?.status ?? null }, saigonToday());
  const lateBack = overdue ? `Overdue since ${formatDate(row.settleBy)}. ` : "";
  const backLine =
    lateBack + (returnReported
      ? `${returnedVnd > 0 ? `${formatVndWhole(returnedVnd)} has arrived so far. ` : ""}${ownerName} says ${formatVndWhole(owedVnd)} was sent with reference ${reference} HOAN UNG. Check the bank before you record it.`
      : returnedVnd > 0
        ? `${formatVndWhole(returnedVnd)} has arrived so far; ${formatVndWhole(owedVnd)} is still owed. Record the next transfer when it arrives.`
        : `${ownerName} owes ${formatVndWhole(owedVnd)}. Record each transfer when it arrives.`);
  const nameOf = (fileId: string | null) => files.find((f) => f.id === fileId)?.filename ?? "the receipt";

  return (
    <>
      <p className="u-mb-3"><Link href="/team/finance/advances">← Advances</Link></p>
      <PageHead
        title={`${reference} · ${ownerName}`}
        sub={`${row.purpose}${approvedBy ? ` · approved by ${approvedBy}` : ""}`}
        action={
          <span className="u-row u-gap-1 u-items-center">
            <Badge tone={overdue ? "err" : putBack ? "warn" : ADVANCE_STATUS_TONE[row.status]}>{overdue ? "Overdue" : settling ? "Settling" : putBack ? PUT_BACK_LABEL : ADVANCE_STATUS_LABEL_TO_OTHERS[row.status]}</Badge>
            <span className="admin-cell-mono u-strong">{formatVndWhole(row.amountVnd)}</span>
          </span>
        }
      />
      <div className="u-grid-2-1">
        <div className="u-stack u-gap-4">
          {refusedToPay && <div className="admin-alert admin-alert--info" role="status">{refusedToPay}</div>}
          {paying && row.decidedBy === access.personId && <div className="admin-alert admin-alert--info" role="status">You approved this too, because {ownerName} is the only other person who records transfers. Attach the bank&apos;s receipt.</div>}
          {payee && !payee.ok && <div className="admin-alert admin-alert--err" role="alert">{payee.error}</div>}
          {lostPayout && (
            <FinishPayout
              advanceId={row.id}
              amountVnd={row.amountVnd}
              transferredOn={lostPayout.transferredOn}
              line={`The transfer of ${formatVndWhole(lostPayout.amountVnd)} on ${formatDate(lostPayout.transferredOn)} is on the ledger, but the advance did not move on. Nobody needs to send anything again.`}
              may={may}
            />
          )}
          {paying && payee?.ok && !payee.bank && (
            <div className="admin-alert admin-alert--warn" role="status">{ownerName} has no bank details on file. Ask them to add them to their profile, then come back to transfer it.</div>
          )}
          {paying && putBack && !lostPayout && (
            <>
              <div className="admin-alert admin-alert--warn" role="status">Put back: &quot;{putBack.reason}&quot; Record the transfer below. Nobody needs to send it again.</div>
              <PayoutPanel advanceId={row.id} amountVnd={row.amountVnd} reference={reference} owner={ownerName} bank={null} receipt={unusedReceipt} may={may} />
            </>
          )}
          {paying && payee?.ok && payee.bank && (
            <PayoutPanel
              advanceId={row.id}
              amountVnd={row.amountVnd}
              reference={reference}
              owner={ownerName}
              bank={payee.bank}
              receipt={unusedReceipt}
              may={may}
            />
          )}
          {/* Keyed on what is owed, so a recorded return starts the next one from what is left. */}
          {returning && owedVnd > 0 && <ReturnPanel key={owedVnd} advanceId={row.id} owedVnd={owedVnd} line={backLine} may={may} />}
          {returning && owedVnd === 0 && <FinishReturn advanceId={row.id} line={`All ${formatVndWhole(returnedVnd)} has arrived, but the advance did not close. Nothing more is owed.`} may={may} />}
          {row.status === "to_return" && !returning && <div className="admin-alert admin-alert--info" role="status">{ownMoney ?? NO_PERSON_RECORD}</div>}
          {settling && claim && (
            <div className="admin-alert admin-alert--info" role="status">
              Its settlement is being checked.{access.may("reimbursements.check") && <> <Link href={`/team/finance/claims/${claim.id}`}>Open the claim</Link></>}
            </div>
          )}
          {crossedCancel && <div className="admin-alert admin-alert--info" role="status">{ownerName} cancelled it{cancelledWhy ? `: "${cancelledWhy}"` : "."} If the money has not gone, do not send it.</div>}
          {crossedCancel && refusedToPutBack && <div className="admin-alert admin-alert--info" role="status">{refusedToPutBack}</div>}
          {crossedCancel && !refusedToPutBack && <ReinstatePanel advanceId={row.id} owner={ownerName} approvedBy={approvedBy} may={may} />}
          {!crossedCancel && !paying && !refusedToPay && row.status !== "to_return" && !settling && <div className={`admin-alert admin-alert--${overdue ? "warn" : "info"}`} role="status">{waitingLine(row.status, ownerName, row.settleBy, overdue, { vnd: spentVnd === null ? 0 : payableOf(spentVnd, row.amountVnd), paid: claim?.status === "paid" })}</div>}
          <AdvanceLedger account={account} owner={ownerName} />
          <AdvanceHistory events={events} viewer="decider" />
        </div>
        <div className="u-stack u-gap-4">
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">Details</h2>
            <dl className="u-stack u-gap-1 u-m-0">
              <div><dt className="admin-label">Purchase or trip&apos;s last day</dt><dd className="u-m-0">{formatDate(row.spendEndsOn)}</dd></div>
              {row.settleBy && <div><dt className="admin-label">Settle by</dt><dd className="u-m-0">{formatDate(row.settleBy)}</dd></div>}
              {transfers.filter((t) => t.direction === "out").map((t) => (
                <div key={t.id}>
                  <dt className="admin-label">Sent to</dt>
                  <dd className="u-m-0">{[t.bankName, t.accountLast4 ? `•••• ${t.accountLast4}` : null].filter(Boolean).join(" · ") || "Not recorded"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <AdvanceFormLinks kinds={formsOf({ status: row.status, submittedAt: row.submittedAt, spentVnd })} base={financeAdvancePath(row.id)} />
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">Files</h2>
            <div className="u-stack u-gap-2">
              {files.length === 0 && <span className="admin-hint">None yet.</span>}
              {files.filter((f) => f.kind === "evidence").map((f) => (
                <OpenDocument key={f.id} claimId={row.id} fileId={f.id} label={`${f.filename}${f.replaced ? " (set aside)" : ""}`} openFile={openAdvanceFileToPay} />
              ))}
              {transfers.filter((t) => t.receiptFileId).map((t) => (
                <OpenDocument key={t.id} claimId={row.id} fileId={t.receiptFileId as string} label={`${nameOf(t.receiptFileId)} (${t.direction === "out" ? "payout" : "return"})`} openFile={openAdvanceFileToPay} />
              ))}
              {files.filter((f) => f.kind === "bank_receipt" && !transfers.some((t) => t.receiptFileId === f.id)).map((f) => (
                <OpenDocument key={f.id} claimId={row.id} fileId={f.id} label={`${f.filename} (not on a transfer)`} openFile={openAdvanceFileToPay} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
