// What the deciders' and Admin's pages read (plan section 8, design §1.5): the
// queues of claims waiting to be checked and to be approved, Admin's lists of
// every claim, and one claim in full with its receipts signed so each shows
// beside its line. Each page's guard (reimbursements.check, .approve, .view)
// reaches every claim, so these reads are not narrowed to a person; the two
// queues leave the viewer's own claims out instead, because "never your own
// claim" is a domain rule the access model cannot express (it has no "all
// except me"), unless the viewer may decide their own (the Employer, §1.6).
// Admin's lists leave nobody out: seeing a claim is not deciding it. Every
// read is a must-read: a failed read is an error page, never an empty queue
// that says nothing waits. None of them reads a bank detail (§1.11).
import { countOr, mustRows } from "@/kernel/data/read";
import { personName } from "@/kernel/config/people-name";
import { itemFlagsOf } from "./receipt-flags";
import type { ClaimStatus } from "./claim-rules";
import { claimFigure, figureItemOf, keptOf } from "./claim-figure";
import { stillCounted } from "./retention-rules";
import { signClaimDocuments, type SignedDocument } from "./claim-files";
import { CLAIM_OWNER_EMBED, readClaimDetail, type MyClaim } from "./my-claims";
import { selectReimbursementClaimItems, selectReimbursementClaims } from "./reads";

export type ClaimToCheck = {
  id: string;
  title: string;
  ownerName: string;
  submittedAt: string | null;
  receipts: number;
  declined: number;
  /** What the claim comes to without its declined receipts: what a check passes on. */
  totalVnd: number;
  /**
   * Kept receipts with no VND value yet, their rate pending (RB.10). While
   * any is, `totalVnd` leaves them out and is only so far, and every list
   * says so beside the figure.
   */
  ratePending: number;
  /** What the figure is when it is not plain (RB.29): a settlement's spend, or on a run tab what a run pays for it. */
  figureWord?: "spent" | "to pay" | null;
  /**
   * When the claim reached the stage it waits at: submitted, checked or
   * approved, as its status says. A queue shows how long it has waited from
   * here (RB.14), so the oldest is the one the checker sees first.
   */
  stageAt: string | null;
  /** Kept receipts with a warning, from the AI reading (RB.9) or how they were paid (AD.15): what the row says there is to look at. */
  flagged: number;
};

type Named = Parameters<typeof personName>[0];

type ClaimRowRead = { id: unknown; title: unknown; status?: unknown; submitted_at: unknown; checked_at?: unknown; approved_at?: unknown; approved_total_vnd?: unknown; advance_id?: unknown; owner: unknown };

/**
 * One list of claims with their receipts summed. The total is the frozen
 * approved total once a claim has one (the run pays that, never a recount),
 * otherwise what a check would pass on: the receipts not declined.
 */
async function withReceipts(claims: ClaimRowRead[], what: string): Promise<(ClaimToCheck & { paysVnd: number | null })[]> {
  if (claims.length === 0) return [];
  const items = stillCounted(
    mustRows(
      await selectReimbursementClaimItems("claim_id, amount_vnd, declined_at, removed_at, ai_flags, paid_how").in(
        "claim_id",
        claims.map((c) => String(c.id)),
      ),
      `[reimbursements] the receipts of ${what}`,
    ),
  );
  return claims.map((c) => {
    const mine = items.filter((i) => i.claim_id === c.id);
    const figure = claimFigure({
      status: String(c.status ?? "submitted") as ClaimStatus,
      items: mine.map(figureItemOf),
      approvedTotalVnd: c.approved_total_vnd === null || c.approved_total_vnd === undefined ? null : Number(c.approved_total_vnd),
      settles: Boolean(c.advance_id),
    });
    const flagged = mine.filter((i) => !i.declined_at && itemFlagsOf(i).length > 0).length;
    return {
      id: String(c.id),
      title: String(c.title ?? ""),
      ownerName: personName(c.owner as Named, "Someone"),
      submittedAt: (c.submitted_at as string | null) ?? null,
      receipts: mine.length,
      declined: figure.declined,
      totalVnd: figure.totalVnd,
      // A frozen total was approved with every kept receipt valued.
      ratePending: figure.ratePending,
      figureWord: c.advance_id ? ("spent" as const) : null,
      paysVnd: figure.paysVnd,
      stageAt: stageAtOf(c),
      flagged,
    };
  });
}

/** When a claim reached the stage its status names; a claim not yet past submit has only its submission. */
function stageAtOf(c: ClaimRowRead): string | null {
  const at = (v: unknown) => (typeof v === "string" ? v : null);
  if (c.status === "approved" || c.status === "settled" || c.status === "in_run" || c.status === "paid") return at(c.approved_at) ?? at(c.submitted_at);
  if (c.status === "checked") return at(c.checked_at) ?? at(c.submitted_at);
  return at(c.submitted_at);
}

/** Whether a queue shows the viewer's own claims: only to someone who may decide them (the Employer). */
export type QueueScope = { includeOwn?: boolean };

/** The claims waiting at one decision, the viewer's own left out unless they may decide it, oldest first. */
async function queueAt(status: "submitted" | "checked", viewerPersonId: string, scope: QueueScope, limit: number): Promise<ClaimToCheck[]> {
  const at = selectReimbursementClaims(`id, title, status, person_id, submitted_at, checked_at, advance_id, ${CLAIM_OWNER_EMBED}`).eq("status", status);
  const claims = mustRows(
    await (scope.includeOwn ? at : at.neq("person_id", viewerPersonId))
      .order(status === "submitted" ? "submitted_at" : "checked_at", { ascending: true })
      .limit(limit),
    `[reimbursements] claims ${status === "submitted" ? "to check" : "to approve"}`,
  );
  return (await withReceipts(claims as ClaimRowRead[], status === "submitted" ? "the claims to check" : "the claims to approve")).map(
    ({ paysVnd: _pays, ...queued }) => queued,
  );
}

/** The claims waiting to be checked, the viewer's own left out unless they may decide it, oldest submission first. */
export function listClaimsToCheck(viewerPersonId: string, scope: QueueScope = {}, limit = 200): Promise<ClaimToCheck[]> {
  return queueAt("submitted", viewerPersonId, scope, limit);
}

/** The checked claims waiting to be approved, the viewer's own left out unless they may decide it, oldest check first. */
export function listClaimsToApprove(viewerPersonId: string, scope: QueueScope = {}, limit = 200): Promise<ClaimToCheck[]> {
  return queueAt("checked", viewerPersonId, scope, limit);
}

/** One claim in an Admin list: what the queue shows, and where it stands. */
export type ClaimInList = ClaimToCheck & { status: ClaimStatus };

/** Admin's three lists (design §1.5): every claim past draft, the approved ones not yet paid, and the paid ones. */
export type AdminClaimList = "all" | "approved" | "paid";

/**
 * Admin's lists of claims, newest submission first. A draft is not in any of
 * them: until it is submitted it is its owner's work in progress, and nobody
 * else has anything to help with. "Approved" holds what the next run pays
 * and what a run is paying (approved and in a run).
 */
export async function listClaimsForAdmin(list: AdminClaimList, limit = 300): Promise<ClaimInList[]> {
  const read = selectReimbursementClaims(`id, title, status, person_id, submitted_at, checked_at, approved_at, approved_total_vnd, advance_id, ${CLAIM_OWNER_EMBED}`);
  const filtered = list === "all" ? read.neq("status", "draft") : list === "approved" ? read.in("status", ["approved", "in_run"]) : read.eq("status", "paid");
  const claims = mustRows(await filtered.order("submitted_at", { ascending: false }).limit(limit), `[reimbursements] admin's ${list} claims`) as ClaimRowRead[];
  const summed = await withReceipts(claims, `admin's ${list} claims`);
  return summed.map(({ paysVnd, ...c }, i) => ({
    ...c,
    // A claim's figure is what it comes to (a settlement's is its spend). The Approved and
    // Paid tabs say they show what the run pays and what was paid, which for a settlement is
    // only what it froze, so they show what a run pays.
    totalVnd: list === "all" ? c.totalVnd : (paysVnd ?? c.totalVnd),
    figureWord: claims[i].advance_id ? (list === "all" ? ("spent" as const) : ("to pay" as const)) : null,
    status: String(claims[i].status) as ClaimStatus,
  }));
}

/** How many claims each tab of Reimbursements holds (RB.14); -1 where the count could not be read, and the tab shows none. */
export type QueueCounts = { toCheck: number; toApprove: number; readyToPay: number; paid: number; all: number };

/**
 * The tab counts. The two queues count as their lists do, the viewer's own
 * left out unless they may decide it. A count is a guide, not a decision: a
 * failed one is logged and its tab shows no number, rather than an error page
 * over the list the viewer came for.
 */
const countReimbursementClaims = () => selectReimbursementClaims("id", { count: "exact", head: true });

export async function countQueues(viewerPersonId: string | null, scope: QueueScope = {}): Promise<QueueCounts> {
  const queue = (status: "submitted" | "checked") => {
    const q = countReimbursementClaims().eq("status", status);
    return scope.includeOwn || !viewerPersonId ? q : q.neq("person_id", viewerPersonId);
  };
  const [toCheck, toApprove, readyToPay, paid, all] = await Promise.all([
    queue("submitted"),
    queue("checked"),
    countReimbursementClaims().in("status", ["approved", "in_run"]),
    countReimbursementClaims().eq("status", "paid"),
    countReimbursementClaims().neq("status", "draft"),
  ]);
  return {
    toCheck: countOr(toCheck, "[reimbursements] claims to check, counted", -1),
    toApprove: countOr(toApprove, "[reimbursements] claims to approve, counted", -1),
    readyToPay: countOr(readyToPay, "[reimbursements] approved claims, counted", -1),
    paid: countOr(paid, "[reimbursements] paid claims, counted", -1),
    all: countOr(all, "[reimbursements] every claim, counted", -1),
  };
}

export type ClaimForChecker = MyClaim & {
  /** Without the declined receipts: what the checker confirms it goes to the approver at. */
  keptTotalVnd: number;
  /** How many receipts the check leaves out. */
  declined: number;
  /** Kept receipts whose rate is pending (RB.10): the check is refused while any is. */
  ratePending: number;
  /** Each confirmed receipt and red invoice, by file id, signed to show inline. */
  documents: Map<string, SignedDocument>;
};

/** One claim in full for a checker, with its documents signed, or null when there is no such claim. */
export async function readClaimForChecker(claimId: string): Promise<ClaimForChecker | null> {
  // Unscoped: the page's guard is reimbursements.check, whose reach is every claim.
  const claim = await readClaimDetail(claimId, {});
  if (!claim) return null;
  const documents = claim.items.some((i) => i.documents.length > 0) ? await signClaimDocuments(claimId) : new Map<string, SignedDocument>();
  // A removed receipt is shown, marked, and counted nowhere.
  const kept = keptOf(claim.items.map((i) => ({ amountVnd: i.amountVnd, declined: i.declined, removed: Boolean(i.removed) })));
  return {
    ...claim,
    keptTotalVnd: kept.totalVnd,
    declined: kept.declined,
    ratePending: kept.ratePending,
    documents,
  };
}
