// One claim as anyone but its owner reads it (design §1.5, RB.14): the checker
// on the Team view, and the checker, the approver and every Admin viewer in
// Admin. Where the claim stands as four steps; its receipts as rows to work
// through, each opening onto its documents and what the AI read beside what
// was claimed; and the one decision this viewer may make now. It decides one
// thing only: which of the moves the page handed in this viewer may make on
// the claim as it stands. A page hands `check` only to a viewer holding
// reimbursements.check and `approve` only to one holding
// reimbursements.approve; movesFor (claim-moves.ts) adds the claim's status
// and the own-claim rule (never your own claim, unless you may decide your own:
// the Employer, §1.6). The lifecycle module refuses the same moves by the same
// rules, so a hand-edited request gets nowhere either.
//
// No bank detail is read or shown here (§1.11): neither decision needs one,
// and Admin's view of every claim is without them.
import Link from "next/link";
import type { Result } from "@/kernel/data/result";
import { Badge } from "@/kernel/ui/Badge";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { CLAIM_CATEGORY_LABEL } from "../lib/categories";
import type { ClaimForChecker } from "../lib/check-queue";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE, nextRunDate, type ClaimStatus } from "../lib/claim-rules";
import { movesFor } from "../lib/claim-moves";
import type { MyItem } from "../lib/my-claims";
import type { RedInvoiceBuyer } from "../lib/red-invoice-buyer";
import { amountText, receiptCheck } from "../lib/review-facts";
import { ClaimHistory, ClaimTripAndRebill } from "./ClaimDetail";
import { ClaimStages } from "./ClaimStages";
import { DeclineItem } from "./DeclineItem";
import { EnterRate } from "./EnterRate";
import { ClaimTotal } from "./ItemValue";
import { OpenDocument } from "./OpenDocument";
import { ReceiptDetail } from "./ReceiptDetail";
import { RereadReceipt } from "./RereadReceipt";
import { ReviewWorkspace, type ReviewRow } from "./ReviewWorkspace";

type OpenFile = (claimId: string, fileId: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;

export type DecidedClaimProps = {
  claim: ClaimForChecker;
  /** The viewer's people id; null for a sign-in with no person record, who may read but not decide. */
  viewerPersonId: string | null;
  /** Whether the viewer holds reimbursements.decide-own. */
  mayDecideOwn: boolean;
  back: { href: string; label: string };
  /** The page's signer for a document, behind the page's own permission. */
  openFile: OpenFile;
  /** The organisation as a red invoice must name it, so the AI reading beside each document says what it compared (RB.9). */
  buyer?: RedInvoiceBuyer;
  /** The checker's actions, handed in only to a viewer who may check. */
  check?: {
    decide: (claimId: string, move: "check" | "send_back" | "reject", reason?: string) => Promise<Result>;
    decline: (claimId: string, itemId: string, reason: string | null) => Promise<Result>;
    /** Enters a receipt's rate by hand (RB.10): the floor when no bank had one. */
    enterRate: (claimId: string, itemId: string, rate: string) => Promise<Result>;
    /** Has the AI read one receipt again (RB.9); a re-read decides nothing, so it is offered on any claim. */
    reread: (claimId: string, itemId: string) => Promise<Result>;
    doneHref: string;
  };
  /** The approver's action, handed in only to a viewer who may approve. */
  approve?: {
    decide: (claimId: string, move: "approve" | "send_back" | "reject", reason?: string) => Promise<Result>;
    doneHref: string;
  };
  /** Where a decision leads: the next claim in the decider's queue, when there is one. */
  next?: { href: string; label: string };
};

// Once approved, the claim's figure is the frozen total the run pays.
const FROZEN: ReadonlySet<ClaimStatus> = new Set<ClaimStatus>(["approved", "in_run", "paid"]);

/**
 * A receipt's money as its row shows it: the value in VND, or Rate pending,
 * and the amount as paid when it was paid in another currency. The rate behind
 * the figure is in the receipt's detail (ItemValue), where there is room.
 */
function RowValue({ item }: { item: MyItem }) {
  return (
    <span className="admin-rb-value">
      {item.amountVnd === null ? <Badge tone="warn">Rate pending</Badge> : <span className="admin-cell-mono u-strong">{formatVndWhole(item.amountVnd)}</span>}
      {item.currency !== "vnd" && <span className="admin-list-sub">{amountText(item.amount, item.currency)}</span>}
    </span>
  );
}

/** Whether a rate can value the receipt: one abroad that is not valued at its card charge. */
const rateable = (item: MyItem) => item.currency !== "vnd" && item.chargedVnd === null;

export function DecidedClaim({ claim, viewerPersonId, mayDecideOwn, back, openFile, buyer, check, approve, next }: DecidedClaimProps) {
  const moves = movesFor(claim, { personId: viewerPersonId, mayDecideOwn, mayCheck: !!check, mayApprove: !!approve });
  const checking = moves.check;
  const approving = moves.approve;
  const kept = formatVndWhole(claim.keptTotalVnd);
  const runDate = formatDate(nextRunDate(new Date().toISOString()));
  // Receipts the check would keep whose rate is pending (RB.10): the check is
  // refused until each has a rate or is declined, so the checker reads it first.
  const pendingNote =
    claim.ratePending > 0
      ? `${claim.ratePending === 1 ? "One receipt's rate is" : `${claim.ratePending} receipts' rates are`} pending: no bank had a rate for the day yet. Enter the rate by hand from the bank's page, or decline the receipt, before checking.`
      : null;
  const notice =
    moves.blockedAsOwn
      ? "This is your own claim. Someone else decides it."
      : checking
        ? pendingNote
        : approving
          ? null
          : check && !approve
            ? `${claim.line} There is nothing to check.`
            : claim.line;

  const rows: ReviewRow[] = claim.items.map((item) => {
    const c = receiptCheck({ ...item, removed: item.removed !== null });
    const controls =
      !item.removed && (checking || check) ? (
        <div className="u-row u-wrap u-gap-1">
          {checking && check && rateable(item) && !item.declined && (
            <EnterRate claimId={claim.id} itemId={item.id} currency={item.currency} pending={item.amountVnd === null} enter={check.enterRate} />
          )}
          {checking && check && <DeclineItem claimId={claim.id} itemId={item.id} declined={item.declined} decline={check.decline} />}
          {moves.reread && check && item.documents.length > 0 && <RereadReceipt claimId={claim.id} itemId={item.id} reread={check.reread} />}
        </div>
      ) : null;
    return {
      id: item.id,
      title: item.label,
      sub: [CLAIM_CATEGORY_LABEL[item.category], item.description && item.seller ? item.description : null, item.boughtInVietnam ? "bought in Vietnam" : "bought abroad"]
        .filter(Boolean)
        .join(" · "),
      value: <RowValue item={item} />,
      chip: { tone: c.tone, label: c.label },
      detail: (
        <ReceiptDetail
          item={item}
          check={c}
          others={claim.items}
          documents={claim.documents}
          open={(doc, kind) => <OpenDocument claimId={claim.id} fileId={doc.id} label={kind} openFile={openFile} />}
          buyer={buyer}
          controls={controls}
        />
      ),
      counts: item.removed === null,
      struck: item.declined || item.removed !== null,
    };
  });
  const counted = rows.filter((r) => r.counts);
  const matching = counted.filter((r) => r.chip.tone === "ok").length;
  const toLook = counted.filter((r) => r.chip.tone === "warn").length;
  const summary = [`${matching} match the AI reading`, toLook > 0 ? `${toLook} to look at` : null].filter(Boolean).join(" · ");
  const initialOpen = counted.find((r) => r.chip.tone === "warn" || r.chip.tone === "err")?.id ?? null;

  // The checker's note for the approver: the check's own reason, in the history.
  const checked = [...claim.events].reverse().find((e) => e.to === "checked");
  const doneHref = (checking ? check?.doneHref : approve?.doneHref) ?? back.href;

  return (
    <>
      <p className="u-mb-3">
        <Link href={back.href}>← {back.label}</Link>
      </p>
      <PageHead
        eyebrow={claim.ownerName}
        title={claim.title}
        sub={`${claim.receipts} receipt${claim.receipts === 1 ? "" : "s"}${claim.submittedAt ? ` · submitted ${formatDate(claim.submittedAt)}` : ""}`}
        action={
          <span className="u-row u-gap-1 u-items-center">
            <Badge tone={CLAIM_STATUS_TONE[claim.status]}>{CLAIM_STATUS_LABEL[claim.status]}</Badge>
            <ClaimTotal
              totalVnd={FROZEN.has(claim.status) ? claim.totalVnd : claim.keptTotalVnd}
              ratePending={FROZEN.has(claim.status) ? 0 : claim.ratePending}
              large
            />
          </span>
        }
      />
      {notice && (
        <div className="admin-alert admin-alert--info" role="status">
          {notice}
        </div>
      )}
      {/* The Checked step is the checker's: whoever may not check reads three (RB.22). */}
      <ClaimStages status={claim.status} events={claim.events} nextRun={claim.status === "paid" ? null : nextRunDate(new Date().toISOString())} withCheck={!!check} />
      <ReviewWorkspace
        rows={rows}
        summary={summary}
        initialOpen={initialOpen}
        next={next ?? { href: doneHref, label: "Back to the list" }}
        decision={
          checking && check
            ? { claimId: claim.id, kind: "check", decide: check.decide, ownerName: claim.ownerName, totalLabel: kept, passHint: `Then it waits for approval. Approved claims join the payment run on ${runDate}.`, requireSeen: true }
            : approving && approve
              ? { claimId: claim.id, kind: "approve", decide: approve.decide, ownerName: claim.ownerName, totalLabel: kept, passHint: `Fixed at this total. It joins the payment run on ${runDate}.`, requireSeen: false }
              : undefined
        }
        aside={
          <>
            {checked?.reason && (
              <section className="admin-card admin-section-card u-stack u-gap-1">
                <h2 className="admin-card-title">Note from {checked.actorName ?? "the checker"}</h2>
                <p className="admin-rb-note">{checked.reason}</p>
              </section>
            )}
            <ClaimTripAndRebill claim={claim} />
            <section className="admin-card admin-section-card">
              <h2 className="admin-card-title">History</h2>
              <ClaimHistory events={claim.events} />
            </section>
          </>
        }
      />
    </>
  );
}
