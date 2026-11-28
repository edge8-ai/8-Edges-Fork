import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { PageHead } from "@/kernel/ui/PageHead";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { ownerIsOnlyOtherPayer } from "@/entities/reimbursements/lib/advance-payers";
import { readAdvanceForDecision } from "@/entities/reimbursements/lib/advance-queue";
import type { AdvanceEvent } from "@/entities/reimbursements/lib/advance-history";
import { ADVANCE_STATUS_LABEL_TO_OTHERS, ADVANCE_STATUS_TONE, advanceRef, ownAdvanceRefusal, type AdvanceStatus } from "@/entities/reimbursements/lib/advance-rules";
import { advanceApproverOf, NO_PERSON_RECORD } from "@/entities/reimbursements/lib/deciders";
import { AdvanceHistory } from "@/entities/reimbursements/ui/AdvanceHistory";
import { OpenDocument } from "@/entities/reimbursements/ui/OpenDocument";
import { openAdvanceFileToDecide } from "./actions";
import { AdvanceDecision } from "./AdvanceDecision";

export const metadata = {
  title: "Decide an Advance",
  description: "One advance, its quote beside the amount, to approve, send back or reject.",
};

// The formats a browser shows inline. A PDF, which most quotes are, opens in its own tab.
const INLINE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** What has already happened to a request that no longer waits on anyone. */
function standing(status: AdvanceStatus, events: AdvanceEvent[], asker: string): string {
  const by = (move: string) => {
    const event = events.find((e) => e.move === move);
    return event?.actorName ? ` by ${event.actorName} on ${formatDate(event.at)}` : "";
  };
  if (status === "draft") return `${asker} withdrew this request.`;
  if (status === "sent_back") return `Sent back${by("send_back")}. It comes back here if ${asker} sends it again.`;
  if (status === "rejected") return `Rejected${by("reject")}.`;
  if (status === "cancelled") return `${asker} cancelled this advance, so no money moves.`;
  return `Approved${by("approve")}. It stands at ${ADVANCE_STATUS_LABEL_TO_OTHERS[status].toLowerCase()}.`;
}

// /team/finance/advances/[id]/decision: one advance, for whoever approves them (AD.6). It
// has its own page because a page declares one permission (ADR 0013) and Finance's page for
// the same advance declares another: the link the Inbox and the email carry can only reach
// someone who may decide. Nothing on it shows a bank account.
export default async function AdvanceDecisionPage({ params }: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.approve");
  const may = mayProp(access, ["reimbursements.approve"]);
  const { id } = await params;
  if (!Id.safeParse(id).success) notFound();
  const advance = await readAdvanceForDecision(id);
  if (!advance) notFound();

  const { row, ownerName, tripName, evidence, events, checks } = advance;
  const actor = advanceApproverOf(access);
  const own = access.personId === row.personId;
  const waiting = row.status === "submitted" && row.submittedAt !== null;
  const refused = actor ? ownAdvanceRefusal(row, actor) : NO_PERSON_RECORD;
  // Where the asker is the only other payer, the approver records the transfer too (#2526).
  // The same question decides who is emailed to send it, so the hint and the email agree.
  const youRecordIt = waiting && !refused && access.personId !== null ? await ownerIsOnlyOtherPayer(row.personId, access.personId) : false;
  const current = evidence.filter((f) => !f.replaced);
  const aside = evidence.filter((f) => f.replaced);

  return (
    <>
      <p className="u-mb-3"><Link href="/team/inbox">← Inbox</Link></p>
      <PageHead
        title={`${ownerName} asks for ${formatVndWhole(row.amountVnd)}`}
        sub={`Advance ${advanceRef(row.refNo)} · ${row.purpose}`}
        action={<Badge tone={ADVANCE_STATUS_TONE[row.status]}>{ADVANCE_STATUS_LABEL_TO_OTHERS[row.status]}</Badge>}
      />
      {!waiting && <div className="admin-alert admin-alert--info" role="status">{standing(row.status, events, ownerName)}</div>}
      <div className="u-grid-2-1 u-mt-4">
        <div className="u-stack u-gap-4">
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">The quote beside the amount</h2>
            <p className="u-m-0 u-mb-3">
              Asked <span className="admin-cell-mono u-strong">{formatVndWhole(row.amountVnd)}</span>. Check it against what is attached: nothing here reads the quote for you.
            </p>
            {current.length === 0 && <div className="admin-alert admin-alert--warn" role="status">No evidence is attached to this request.</div>}
            <div className="u-stack u-gap-3">
              {current.map((file) => (
                <div key={file.id} className="u-stack u-gap-1">
                  {file.url && file.mimeType && INLINE.has(file.mimeType) && (
                    <div className="admin-box admin-scroll-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a signed, one-minute link to an uploaded photo of unknown size */}
                      <img src={file.url} alt={file.filename} className="admin-img-thumb u-w-full" />
                    </div>
                  )}
                  <OpenDocument claimId={row.id} fileId={file.id} label={file.filename} openFile={openAdvanceFileToDecide} />
                </div>
              ))}
              {aside.map((file) => (
                <div key={file.id} className="u-stack u-gap-1">
                  <span className="admin-list-sub">Set aside by {ownerName}, kept on record:</span>
                  <OpenDocument claimId={row.id} fileId={file.id} label={file.filename} openFile={openAdvanceFileToDecide} />
                </div>
              ))}
            </div>
          </section>
          {waiting && refused && <div className="admin-alert admin-alert--info" role="status">{refused === NO_PERSON_RECORD ? refused : "This is your own advance, so someone else decides it."}</div>}
          {waiting && !refused && <AdvanceDecision advanceId={row.id} submittedAt={row.submittedAt as string} asker={ownerName} own={own} youRecordIt={youRecordIt} may={may} />}
          <AdvanceHistory events={events} viewer="decider" />
        </div>
        <div className="u-stack u-gap-4">
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">Details</h2>
            <dl className="u-stack u-gap-1 u-m-0">
              <div><dt className="admin-label">For</dt><dd className="u-m-0">{row.purpose}</dd></div>
              <div><dt className="admin-label">Purchase or trip&apos;s last day</dt><dd className="u-m-0">{formatDate(row.spendEndsOn)}</dd></div>
              {tripName && <div><dt className="admin-label">Event</dt><dd className="u-m-0">{tripName}</dd></div>}
              {row.settleBy && <div><dt className="admin-label">Settle by</dt><dd className="u-m-0">{formatDate(row.settleBy)}</dd></div>}
            </dl>
          </section>
          {waiting && (
            <section className="admin-card admin-section-card">
              <h2 className="admin-card-title">Checked for you</h2>
              <ul className="adv-checks">
                {checks.map((check) => (
                  <li key={check.text}>
                    <span className={`adv-tick${check.holds ? "" : " is-no"}`} aria-hidden="true">{check.holds ? "✓" : "!"}</span>
                    <span>{check.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
