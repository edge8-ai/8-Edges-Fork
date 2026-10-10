// What the owner's pages read: their own claims, each with its receipts count,
// its total and its status line (plan section 3), and one claim in full with
// its items, documents and history. Every read is filtered to the owner's
// person id in the query, and every read is a must-read: a failed read is an
// error page the person can retry, never an empty list that says they have
// no claims (rule 2, A.12).
import { mustRows } from "@/kernel/data/read";
import { NAME_ONLY_COLUMNS, personName } from "@/kernel/config/people-name";
import { isClaimCategory, type ClaimCategory } from "./categories";
import { olderThan90Days, statusLine, type ClaimStatus } from "./claim-rules";
import { stillCounted } from "./retention-rules";
import { lineFactsOf, paidPaymentsOf, paidVndOf, runDateFor, runDatesOf, type LineFacts } from "./claim-line-facts";
import { businessDate, saigonToday } from "@/kernel/config/dates";
import type { Trip } from "./trip-rules";
import { readTrip } from "./trips";
import { itemLabel } from "./claim-items";
import { receiptFlagsOf, type ReceiptFlag } from "./claim-labels";
import { storedReadingOf, type StoredReading } from "./receipt-reading";
import { claimRowFrom } from "./own-claims";
import { selectReimbursementClaimEvents, selectReimbursementClaimItems, selectReimbursementClaims, selectReimbursementFiles } from "./reads";

const CLAIM_COLUMNS = "id, title, status, person_id, submitted_at, approved_total_vnd, approved_at, paid_at, created_at, payment_run_id, payment_id";
const OPEN: ReadonlySet<ClaimStatus> = new Set<ClaimStatus>(["draft", "submitted", "sent_back"]);

export type MyClaimSummary = {
  id: string;
  title: string;
  status: ClaimStatus;
  receipts: number;
  totalVnd: number;
  /**
   * Receipts the total leaves out because their rate is pending (RB.10): the
   * list shows "rate pending" beside the figure (ui/ClaimTotal) rather than a
   * total that counts them as nothing. Zero once a total is frozen at approval.
   */
  ratePending: number;
  line: string;
};

type ItemSum = { claim_id: unknown; amount_vnd: unknown; declined_at: unknown; removed_at?: unknown };

/**
 * The receipts a figure counts: every one while the claim is open, the ones
 * not declined after, and never one its owner removed (20261008090000): that
 * stays on the claim, marked, and counts toward nothing.
 */
const countedItems = (status: ClaimStatus, items: ItemSum[]) => stillCounted(items).filter((i) => OPEN.has(status) || !i.declined_at);

const frozen = (status: ClaimStatus, approvedTotal: unknown) => !OPEN.has(status) && approvedTotal !== null && approvedTotal !== undefined;

/**
 * The figure the owner sees: while the claim is still theirs or being checked,
 * the sum of every receipt; once approved, the frozen approved total.
 */
function totalOf(status: ClaimStatus, approvedTotal: unknown, items: ItemSum[]): number {
  if (frozen(status, approvedTotal)) return Number(approvedTotal);
  return countedItems(status, items).reduce((sum, i) => sum + Number(i.amount_vnd ?? 0), 0);
}

/** How many receipts that figure leaves out for want of a rate. */
function ratePendingIn(status: ClaimStatus, approvedTotal: unknown, items: ItemSum[]): number {
  if (frozen(status, approvedTotal)) return 0;
  return countedItems(status, items).filter((i) => i.amount_vnd === null || i.amount_vnd === undefined).length;
}

type Decision = { by: string | null; reason: string | null };

/** The last send back or rejection of each claim, for the owner's line. */
async function lastDecisions(claimIds: string[]): Promise<Map<string, Decision>> {
  const out = new Map<string, Decision>();
  if (claimIds.length === 0) return out;
  const rows = mustRows(
    await selectReimbursementClaimEvents(`claim_id, to_status, reason, created_at, actor:people!reimbursement_claim_events_actor_person_id_fkey(${NAME_ONLY_COLUMNS})`)
      .in("claim_id", claimIds)
      .in("to_status", ["sent_back", "rejected"])
      .order("created_at", { ascending: false }),
    "[reimbursements] the last decision on my claims",
  );
  for (const r of rows) {
    const id = String(r.claim_id);
    if (!out.has(id)) out.set(id, { by: r.actor ? personName(r.actor as Parameters<typeof personName>[0]) : null, reason: (r.reason as string | null) ?? null });
  }
  return out;
}

/** The owner's claims, newest first. */
export async function listMyClaims(personId: string, limit = 200): Promise<MyClaimSummary[]> {
  const claims = mustRows(
    await selectReimbursementClaims(CLAIM_COLUMNS).eq("person_id", personId).order("created_at", { ascending: false }).limit(limit),
    "[reimbursements] my claims",
  );
  if (claims.length === 0) return [];
  const ids = claims.map((c) => String(c.id));
  const items = mustRows(
    await selectReimbursementClaimItems("claim_id, amount_vnd, declined_at, removed_at").in("claim_id", ids),
    "[reimbursements] my claims' receipts",
  ) as ItemSum[];
  const decided = await lastDecisions(claims.filter((c) => c.status === "sent_back" || c.status === "rejected").map((c) => String(c.id)));
  const facts = await lineFactsOf(claims);
  return claims.map((c) => {
    const row = claimRowFrom(c);
    const mine = items.filter((i) => i.claim_id === c.id);
    const decision = decided.get(row.id);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      receipts: stillCounted(mine).length,
      totalVnd: totalOf(row.status, c.approved_total_vnd, mine),
      ratePending: ratePendingIn(row.status, c.approved_total_vnd, mine),
      line: statusLine({
        status: row.status,
        decidedBy: decision?.by,
        reason: decision?.reason,
        approvedTotalVnd: c.approved_total_vnd as number | null,
        approvedAt: c.approved_at as string | null,
        runDate: runDateFor(c, facts),
        paidAt: c.paid_at as string | null,
        paidVnd: paidVndOf(c, facts),
      }),
    };
  });
}

/**
 * A confirmed receipt or red invoice. `replacedAt` is when its owner set it
 * aside for another on a claim that was ever submitted (20261008090000): it
 * stays beside its item, shown as replaced, and satisfies nothing.
 */
export type MyDocument = { id: string; kind: "receipt" | "red_invoice"; filename: string; mimeType: string | null; sizeBytes: number | null; replacedAt: string | null };
export type MyItem = {
  id: string;
  label: string;
  description: string | null;
  seller: string | null;
  boughtOn: string | null;
  category: ClaimCategory;
  /** In the currency's minor units: whole dong for VND, cents for a dollar. */
  amount: number;
  currency: string;
  /** Null while the rate is pending (RB.10). */
  amountVnd: number | null;
  /** VND per one unit the value was computed at, where it came from, and the day it is for. */
  fxRate: number | null;
  fxSource: string;
  fxAsOf: string | null;
  /** What the owner's card actually charged, when they entered it: it wins over the rate. */
  chargedVnd: number | null;
  boughtInVietnam: boolean;
  lostReceiptNote: string | null;
  /** Whether a client is to be billed for it (RB.11), and which: a tag for the export. */
  rebill: boolean;
  rebillCompany: { id: string; name: string } | null;
  /**
   * Bought more than 90 days before the claim was submitted, or before today
   * while it is still a draft: the plan's gentle label, which blocks nothing.
   */
  olderThan90Days: boolean;
  /**
   * Whether a checker declined it: `declined_at` is set. The same fact the
   * checker's queue, the lifecycle and the approval read, so every screen
   * leaves the same receipts out of a total.
   */
  declined: boolean;
  declineReason: string | null;
  /**
   * When and why its owner took it off a claim that was ever submitted
   * (20261008090000), or null while it counts. A removed receipt stays on the
   * claim for everyone who may see it, marked, and counts toward nothing.
   */
  removed: { at: string; reason: string | null } | null;
  documents: MyDocument[];
  /** The AI reading of one of its documents (RB.9): a suggestion, null until read. */
  reading: StoredReading | null;
  /** The reading's warnings; none of them blocks a submit or a check. */
  flags: ReceiptFlag[];
  /** The receipt this one may duplicate, when `possible_duplicate` is raised. */
  duplicateOfItemId: string | null;
};
export type MyEvent = { id: string; from: ClaimStatus | null; to: ClaimStatus; actorName: string | null; reason: string | null; at: string };
export type MyClaim = MyClaimSummary & {
  personId: string;
  /** Who made the claim, as a decider's page names them above the title. */
  ownerName: string;
  /** When the owner confirmed their bank details on this claim (RB.5), or null. */
  bankConfirmedAt: string | null;
  /** The trip the claim belongs to (RB.11), an events row; null when it names none. */
  trip: Trip | null;
  submittedAt: string | null;
  createdAt: string;
  items: MyItem[];
  events: MyEvent[];
  /**
   * The bank's receipt for the transfer that paid the claim (RB.7), which the
   * Paid email links here to download; null until the claim is paid. It may
   * cover several of the owner's claims paid in one transfer.
   */
  bankReceiptFileId: string | null;
};

// The claimant, embedded in a claims read, so a decider's page and the
// queue name them without reading the claim row a second time.
export const CLAIM_OWNER_EMBED = `owner:people!reimbursement_claims_person_id_fkey(${NAME_ONLY_COLUMNS})`;

const numberOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// The client a rebilled receipt names, embedded from the kernel's companies.
const REBILL_COMPANY_EMBED = "rebill_company:companies!reimbursement_claim_items_rebill_company_id_fkey(id, name)";

function companyOf(embed: unknown): { id: string; name: string } | null {
  if (!embed || typeof embed !== "object") return null;
  const c = embed as Record<string, unknown>;
  return typeof c.id === "string" ? { id: c.id, name: String(c.name ?? "") } : null;
}

function bankConfirmedAtOf(metadata: unknown): string | null {
  const at = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).bankConfirmedAt : null;
  return typeof at === "string" ? at : null;
}

/** One of the owner's claims in full, or null when it is not theirs. */
export function readMyClaim(claimId: string, personId: string): Promise<MyClaim | null> {
  return readClaimDetail(claimId, { ownedBy: personId });
}

/**
 * One claim in full, as its owner reads it (`ownedBy`, filtered in the query)
 * or as a decider does (no scope: the caller's guard is a permission whose
 * reach is every claim, design §1.5). Null when there is no such claim, or it
 * is not the owner's.
 */
export async function readClaimDetail(claimId: string, scope: { ownedBy?: string }): Promise<MyClaim | null> {
  const one = selectReimbursementClaims(`${CLAIM_COLUMNS}, metadata, trip_event_id, ${CLAIM_OWNER_EMBED}`).eq("id", claimId);
  const claims = mustRows(await (scope.ownedBy ? one.eq("person_id", scope.ownedBy) : one).limit(1), "[reimbursements] one claim");
  const c = claims[0];
  if (!c) return null;
  const row = claimRowFrom(c);
  const [itemRows, eventRows] = await Promise.all([
    selectReimbursementClaimItems(
      `id, description, seller, bought_on, category, amount_cents, currency, amount_vnd, fx_rate, fx_source, fx_as_of, charged_vnd, declined_at, bought_in_vietnam, lost_receipt_note, decline_reason, removed_at, remove_reason, ai_reading, ai_flags, duplicate_of_item_id, rebill, ${REBILL_COMPANY_EMBED}`,
    )
      .eq("claim_id", claimId)
      .order("position"),
    selectReimbursementClaimEvents(`id, from_status, to_status, reason, created_at, actor:people!reimbursement_claim_events_actor_person_id_fkey(${NAME_ONLY_COLUMNS})`)
      .eq("claim_id", claimId)
      .order("created_at"),
  ]);
  const items = mustRows(itemRows, "[reimbursements] my claim's receipts");
  const events = mustRows(eventRows, "[reimbursements] my claim's history");
  // Unconfirmed uploads are never shown: nobody has looked at what arrived.
  const files =
    items.length === 0
      ? []
      : mustRows(
          await selectReimbursementFiles("id, claim_item_id, kind, filename, mime_type, size_bytes, replaced_at")
            .in("claim_item_id", items.map((i) => String(i.id)))
            .not("confirmed_at", "is", null)
            .order("created_at"),
          "[reimbursements] my claim's documents",
        );
  const trip = typeof c.trip_event_id === "string" && c.trip_event_id ? await readTrip(c.trip_event_id) : null;
  // The day an old receipt is judged on: the day the claim went in, or today
  // while it is still being filled in.
  const asOf = row.submittedAt ? businessDate(row.submittedAt) : saigonToday();
  const lastDecision = [...events].reverse().find((e) => e.to_status === "sent_back" || e.to_status === "rejected");
  // The claim's own history is already read, so its last return comes from it.
  const lastReturn = [...events].reverse().find((e) => e.from_status === "in_run" && e.to_status === "approved");
  const [runDates, paid] = await Promise.all([runDatesOf([c]), paidPaymentsOf([c])]);
  const facts: LineFacts = { runDates, paid, returnedAt: new Map(lastReturn ? [[row.id, String(lastReturn.created_at)]] : []) };
  const name = (actor: unknown) => (actor ? personName(actor as Parameters<typeof personName>[0]) : null);
  return {
    id: row.id,
    personId: row.personId,
    ownerName: personName((c.owner ?? null) as Parameters<typeof personName>[0], "Someone"),
    bankConfirmedAt: bankConfirmedAtOf(c.metadata),
    trip,
    title: row.title,
    status: row.status,
    submittedAt: row.submittedAt,
    createdAt: String(c.created_at),
    receipts: stillCounted(items).length,
    totalVnd: totalOf(row.status, c.approved_total_vnd, items as ItemSum[]),
    ratePending: ratePendingIn(row.status, c.approved_total_vnd, items as ItemSum[]),
    bankReceiptFileId: row.status === "paid" && typeof c.payment_id === "string" ? (facts.paid.get(c.payment_id)?.receiptFileId ?? null) : null,
    line: statusLine({
      status: row.status,
      decidedBy: lastDecision ? name(lastDecision.actor) : null,
      reason: (lastDecision?.reason as string | null) ?? null,
      approvedTotalVnd: c.approved_total_vnd as number | null,
      approvedAt: c.approved_at as string | null,
      runDate: runDateFor(c, facts),
      paidAt: c.paid_at as string | null,
      paidVnd: paidVndOf(c, facts),
    }),
    items: items.map((i) => ({
      id: String(i.id),
      label: itemLabel(i),
      description: (i.description as string | null) ?? null,
      seller: (i.seller as string | null) ?? null,
      boughtOn: (i.bought_on as string | null) ?? null,
      category: isClaimCategory(String(i.category)) ? (String(i.category) as ClaimCategory) : "other",
      amount: Number(i.amount_cents),
      currency: String(i.currency),
      amountVnd: numberOrNull(i.amount_vnd),
      fxRate: numberOrNull(i.fx_rate),
      fxSource: String(i.fx_source ?? "none"),
      fxAsOf: (i.fx_as_of as string | null) ?? null,
      chargedVnd: numberOrNull(i.charged_vnd),
      boughtInVietnam: i.bought_in_vietnam === true,
      lostReceiptNote: (i.lost_receipt_note as string | null) ?? null,
      rebill: i.rebill === true,
      rebillCompany: i.rebill === true ? companyOf(i.rebill_company) : null,
      olderThan90Days: olderThan90Days((i.bought_on as string | null) ?? null, asOf),
      declined: Boolean(i.declined_at),
      declineReason: (i.decline_reason as string | null) ?? null,
      removed: typeof i.removed_at === "string" ? { at: i.removed_at, reason: (i.remove_reason as string | null) ?? null } : null,
      reading: storedReadingOf(i.ai_reading),
      flags: receiptFlagsOf(i.ai_flags),
      duplicateOfItemId: (i.duplicate_of_item_id as string | null) ?? null,
      documents: files
        .filter((f) => f.claim_item_id === i.id)
        .map((f) => ({
          id: String(f.id),
          kind: f.kind as MyDocument["kind"],
          filename: String(f.filename),
          mimeType: (f.mime_type as string | null) ?? null,
          sizeBytes: f.size_bytes === null ? null : Number(f.size_bytes),
          replacedAt: typeof f.replaced_at === "string" ? f.replaced_at : null,
        })),
    })),
    events: events.map((e) => ({
      id: String(e.id),
      from: (e.from_status as ClaimStatus | null) ?? null,
      to: e.to_status as ClaimStatus,
      actorName: name(e.actor),
      reason: (e.reason as string | null) ?? null,
      at: String(e.created_at),
    })),
  };
}
