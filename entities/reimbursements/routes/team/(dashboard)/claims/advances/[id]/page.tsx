import Link from "next/link";
import { notFound } from "next/navigation";
import { saigonToday } from "@/kernel/config/dates";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { PageHead } from "@/kernel/ui/PageHead";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { alertOf, stagesOf } from "@/entities/reimbursements/lib/advance-card";
import { ADVANCE_STATUS_LABEL, ADVANCE_STATUS_TONE, advanceRef, isSettling, moveNeedsReason, ownerCanAdvance } from "@/entities/reimbursements/lib/advance-rules";
import { readMyAdvance } from "@/entities/reimbursements/lib/my-advances";
import { readReturnAccount } from "@/entities/reimbursements/lib/return-account";
import { advanceDecisionPath, ownAdvancePath } from "@/entities/reimbursements/lib/paths";
import { formsOf } from "@/entities/reimbursements/lib/advance-forms";
import { AdvanceHistory } from "@/entities/reimbursements/ui/AdvanceHistory";
import { AdvanceFormLinks } from "@/entities/reimbursements/ui/AdvancePaper";
import { ReturnDetails } from "@/entities/reimbursements/ui/ReturnDetails";
import { SettlementStrip } from "@/entities/reimbursements/ui/SettlementStrip";
import { AdvanceMoves, OpenAdvanceFile, ReportReturn } from "./AdvanceMoves";

export const metadata = {
  title: "Your Advance",
  description: "Where your advance stands, and what to do next.",
};

// /team/claims/advances/[id]: one advance, for its owner (AD.5). Someone else's reads
// exactly as one that does not exist, and so does an id that could not be one.
export default async function AdvancePage({ params }: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.mine");
  const may = mayProp(access, ["reimbursements.mine"]);
  const actor = await requireTeamMember();
  const { id } = await params;
  if (!Id.safeParse(id).success) notFound();
  const advance = await readMyAdvance(id, actor.personId);
  if (!advance) notFound();

  const { row, facts, files, events, owedVnd, reached } = advance;
  const today = saigonToday();
  const alert = alertOf(facts, today);
  const settling = isSettling({ status: row.status, claimStatus: facts.claimStatus });
  const can = ownerCanAdvance({ status: row.status, submittedAt: row.submittedAt, settling });
  // Read only while money is owed: nobody else needs the company's account.
  const returnReference = `${advanceRef(row.refNo)} HOAN UNG`;
  const returnAccount = row.status === "to_return" ? await readReturnAccount({ amountVnd: owedVnd, reference: returnReference }) : null;
  // Nobody tells the person asking that their own request waits, so an employer who may
  // decide their own needs this link to reach it at all.
  const backOn = row.status === "approved" && Boolean(facts.reinstatedWhy);
  const decidesOwn = row.status === "submitted" && access.may("reimbursements.approve") && access.may("reimbursements.decide-own");

  return (
    <>
      <p className="u-mb-3"><Link href="/team/claims">← My claims</Link></p>
      <PageHead
        title={row.purpose}
        sub={`Advance ${advanceRef(row.refNo)}${reached.askedOn ? ` · asked ${formatDate(reached.askedOn)}` : ""}`}
        action={
          <span className="u-row u-gap-1 u-items-center">
            {/* "Back on" only while it waits for the transfer: the newest reason stays the put-back's after the payout, which carries none. */}
            <Badge tone={backOn ? "warn" : ADVANCE_STATUS_TONE[row.status]}>{backOn ? "Back on" : ADVANCE_STATUS_LABEL[row.status]}</Badge>
            <span className="admin-cell-mono u-strong">{formatVndWhole(row.amountVnd)}</span>
          </span>
        }
      />
      <div className={`admin-alert admin-alert--${alert.tone}`} role="status">
        <span className="u-strong">{alert.head}</span> {alert.body}
      </div>
      {facts.spentVnd !== null && (
        <div className="u-mt-4">
          <SettlementStrip advancedVnd={row.amountVnd} spentVnd={facts.spentVnd} viewer="owner" />
        </div>
      )}
      <ol className="admin-rb-stages adv-stages u-mt-4" aria-label="Where this advance stands">
        {stagesOf(facts, reached).map((stage, i) => (
          <li
            key={stage.label}
            className={`admin-rb-stage ${stage.state === "done" ? "is-done" : stage.state === "current" ? "is-current" : stage.state === "stopped" ? "is-stopped" : ""}`}
            aria-current={stage.state === "current" ? "step" : undefined}
          >
            <span className="admin-rb-stage-dot" aria-hidden="true">{stage.state === "done" ? "✓" : i + 1}</span>
            <span className="admin-rb-stage-text">
              <span className="admin-rb-stage-label">{stage.label}</span>
              <span className="admin-list-sub">{stage.sub}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="u-grid-2-1 u-mt-4">
        <div className="u-stack u-gap-4">
          {decidesOwn && (
            <section className="admin-card admin-section-card">
              <h2 className="admin-card-title">Yours to decide</h2>
              <p className="u-m-0">You may decide your own advance as the employer.</p>
              <div className="admin-form-actions u-mt-4">
                <Link className="admin-btn admin-btn--primary" href={advanceDecisionPath(row.id)}>Open the decision</Link>
              </div>
            </section>
          )}
          {returnAccount && (
            <section className="admin-card admin-section-card">
              <h2 className="admin-card-title">Return {formatVndWhole(owedVnd)} by bank transfer</h2>
              <ReturnDetails account={returnAccount} amount={formatVndWhole(owedVnd)} reference={returnReference} />
              <ReportReturn advanceId={row.id} reported={facts.returnReported} may={may} />
              <p className="admin-hint u-m-0 u-mt-2">By transfer only, never from salary. Finance records each transfer when it arrives.</p>
            </section>
          )}
          {(can.edit || can.withdraw || can.cancel || can.delete || can.settle) && (
            <section className="admin-card admin-section-card">
              <h2 className="admin-card-title">{row.status === "sent_back" ? "Fix it" : row.status === "draft" ? "Finish it" : row.status === "paid_out" ? "Settle it" : "If plans change"}</h2>
              <p className="u-m-0">
                {row.status === "paid_out"
                  ? `Keep every red invoice, then settle${row.settleBy ? ` by ${formatDate(row.settleBy)}` : ""}. Any part you did not spend goes back by transfer, never from salary.`
                  : row.status === "sent_back"
                  ? `Change what ${facts.approver} asked, then send it again.`
                  : row.status === "draft"
                    ? `Add what is missing, then send it to ${facts.approver}.`
                    : row.status === "submitted"
                      ? `Withdraw it while ${facts.approver} has not decided.`
                      : facts.reinstatedWhy
                        ? "If the money never reached you, cancel it and say so. Finance is told."
                        : "Cancel it before the transfer, and Finance is told not to send it."}
              </p>
              <AdvanceMoves advanceId={row.id} can={can} cancelNeedsReason={moveNeedsReason("cancel", row.status)} fixing={row.status === "sent_back"} settlementStarted={facts.claimStatus !== null} may={may} />
            </section>
          )}
          <AdvanceHistory events={events} viewer="owner" />
        </div>
        <div className="u-stack u-gap-4">
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">Details</h2>
            <dl className="u-stack u-gap-1 u-m-0">
              <div><dt className="admin-label">Purchase or trip&apos;s last day</dt><dd className="u-m-0">{formatDate(row.spendEndsOn)}</dd></div>
              {row.settleBy && <div><dt className="admin-label">Settle by</dt><dd className="u-m-0">{formatDate(row.settleBy)}</dd></div>}
              <div>
                <dt className="admin-label">Evidence</dt>
                <dd className="u-m-0">
                  {files.filter((f) => f.kind === "evidence").length === 0 && "None yet."}
                  {files.filter((f) => f.kind === "evidence").map((f) => (
                    <div key={f.id}>
                      <OpenAdvanceFile advanceId={row.id} fileId={f.id} name={f.filename} may={may} />
                      {f.replaced && <span className="admin-cell-muted"> · set aside</span>}
                    </div>
                  ))}
                </dd>
              </div>
              {facts.paidTo && <div><dt className="admin-label">Paid to</dt><dd className="u-m-0">{facts.paidTo}</dd></div>}
            </dl>
          </section>
          <AdvanceFormLinks kinds={formsOf({ status: row.status, submittedAt: row.submittedAt, spentVnd: facts.spentVnd })} base={ownAdvancePath(row.id)} />
          <section className="admin-card admin-section-card">
            <p className="admin-hint u-m-0">Kept for ten years. Nothing sent can be deleted.</p>
          </section>
        </div>
      </div>
    </>
  );
}
