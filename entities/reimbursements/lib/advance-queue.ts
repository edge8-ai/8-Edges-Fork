// What the approver's page and Finance's pages read about advances (AD.6, AD.7). Each
// caller's guard reaches every advance, so nothing here is narrowed to a person. A failed
// read raises: a page that showed less would have someone decide or pay on less. Whether
// the bank details are on file comes back to the approver as a fact and never as the
// details: the only page that shows an account is Finance's, which reads it itself so the
// read is audited against the person who opened it.
import { businessDate, saigonToday } from "@/kernel/config/dates";
import { NAME_ONLY_COLUMNS, personName } from "@/kernel/config/people-name";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { formatDate } from "@/kernel/ui/format";
import { accountOf, type BookEntry, type BookTransfer } from "./advance-books";
import { owedOf } from "./advance-card";
import type { FormFacts, Signed } from "./advance-forms";
import { readAdvanceEvents, readAdvanceFiles, type AdvanceEvent, type AdvanceFile } from "./advance-history";
import { advanceRowFrom, type AdvanceRow } from "./advance-lifecycle";
import { signAdvanceEvidence } from "./advance-files";
import { ADVANCE_MAX_VND } from "./advance-policy";
import { OPEN_ADVANCE_STATUSES, returnStillReported } from "./advance-rules";
import { calendarForPreview } from "./my-advances";
import { ownerName } from "./notices";
import { readBankDetailsOnFile } from "./own-bank-details";
import { itemLabel } from "./claim-items";
import { readRedInvoiceBuyer } from "./red-invoice-buyer";
import { stillCounted } from "./retention-rules";
import { selectReimbursementAdvances, selectReimbursementAdvanceTransfers, selectReimbursementClaimItems, selectReimbursementClaims } from "./reads";
import { readTrip } from "./trips";
import { settleByOf } from "./working-days";

const COLUMNS = "id, ref_no, status, person_id, purpose, amount_vnd, spend_ends_on, settle_by, submitted_at, decided_by, balance_vnd, spent_vnd, trip_event_id";

/** One thing the page checked, in words, and whether it holds. */
type DecisionCheck = { holds: boolean; text: string };

type AdvanceForDecision = {
  row: AdvanceRow;
  ownerName: string;
  tripName: string | null;
  evidence: (AdvanceFile & { url: string | null })[];
  events: AdvanceEvent[];
  checks: DecisionCheck[];
};

async function settleByCheck(row: AdvanceRow, today: string): Promise<DecisionCheck> {
  const calendar = await calendarForPreview(today);
  if (!calendar) return { holds: false, text: "The settle-by date could not be worked out: the holiday calendar did not load." };
  const deadline = settleByOf({ spendEndsOn: row.spendEndsOn, paidOutOn: today }, calendar);
  // The refusal is the same words the payout would meet, read before the money is promised.
  return deadline.ok ? { holds: true, text: `Settle by ${formatDate(deadline.settleBy)} if the money is sent today.` } : { holds: false, text: deadline.error };
}

async function bankCheck(personId: string): Promise<DecisionCheck> {
  const bank = await readBankDetailsOnFile(personId);
  if (!bank.ok) return { holds: false, text: "The bank details could not be read." };
  return bank.onFile ? { holds: true, text: "Bank details on file." } : { holds: false, text: "No bank details on file, so Finance has nowhere to send it." };
}

/**
 * One advance, for its approver, or null when there is none. A draft nobody ever sent was
 * asked of no one, so it reads as none. One that was withdrawn is shown, because the link
 * in the approver's email still points here and should say what happened to the request.
 */
export async function readAdvanceForDecision(advanceId: string): Promise<AdvanceForDecision | null> {
  const rows = mustRows(await selectReimbursementAdvances(COLUMNS).eq("id", advanceId).limit(1), "[reimbursements] an advance for its approver");
  const raw = rows[0];
  if (!raw) return null;
  const row = advanceRowFrom(raw);
  if (!row) throw new Error(`Advance ${String(raw.id)} has a status this code does not know.`);
  if (row.status === "draft" && row.submittedAt === null) return null;

  const today = saigonToday();
  const others = mustRows(
    await selectReimbursementAdvances("id").eq("person_id", row.personId).in("status", [...OPEN_ADVANCE_STATUSES]).neq("id", row.id),
    "[reimbursements] the asker's other advances",
  );
  const tripEventId = (raw.trip_event_id as string | null) ?? null;
  const [name, files, events, signed, trip, bank, settleBy] = await Promise.all([
    ownerName(row.personId),
    readAdvanceFiles(row.id),
    readAdvanceEvents(row.id),
    signAdvanceEvidence(row.id),
    tripEventId ? readTrip(tripEventId) : null,
    bankCheck(row.personId),
    settleByCheck(row, today),
  ]);
  return {
    row,
    ownerName: name,
    tripName: trip?.title ?? null,
    evidence: files.filter((f) => f.kind === "evidence").map((f) => ({ ...f, url: signed.get(f.id) ?? null })),
    events,
    checks: [
      { holds: others.length === 0, text: others.length === 0 ? "No other open advance." : "Another advance is open for this person." },
      { holds: row.amountVnd <= ADVANCE_MAX_VND, text: `${row.amountVnd <= ADVANCE_MAX_VND ? "Within" : "Over"} the ₫${ADVANCE_MAX_VND.toLocaleString("en-US")} limit.` },
      bank,
      settleBy,
    ],
  };
}

type Raw = Record<string, unknown>;

function rowFrom(raw: Raw): AdvanceRow {
  const row = advanceRowFrom(raw);
  if (!row) throw new Error(`Advance ${String(raw.id)} has a status this code does not know.`);
  return row;
}

export type QueuedAdvance = { putBack: boolean; row: AdvanceRow; ownerName: string; spentVnd: number | null; returnedVnd: number; claimStatus: string | null };

/**
 * Every advance that was ever asked for, newest first, for Finance's queue. A draft nobody
 * sent is its owner's alone, which is what the filter on submitted_at leaves out: the
 * database allows only a draft to have none.
 */
export async function readAdvanceQueue(): Promise<QueuedAdvance[]> {
  const rows = mustRows(
    await selectReimbursementAdvances(`${COLUMNS}, person:people!reimbursement_advances_person_id_fkey(${NAME_ONLY_COLUMNS})`).not("submitted_at", "is", null).order("created_at", { ascending: false }),
    "[reimbursements] the advance queue",
  ) as unknown as Raw[];
  if (rows.length === 0) return [];
  const waitingOnTransfer = rows.filter((r) => r.status === "approved").map((r) => String(r.id));
  const [returns, claims] = await Promise.all([
    selectReimbursementAdvanceTransfers("advance_id, amount_vnd").eq("direction", "in"),
    selectReimbursementClaims("advance_id, status").not("advance_id", "is", null).order("created_at"),
  ]);
  const putBacks = waitingOnTransfer.length === 0 ? [] : mustRows(await companyOs.from("reimbursement_advance_events").select("advance_id").eq("move", "reinstate").in("advance_id", waitingOnTransfer), "[reimbursements] the queue's put-back advances");
  const putBack = new Set(putBacks.map((e) => String(e.advance_id)));
  const returned = new Map<string, number>();
  for (const r of mustRows(returns, "[reimbursements] the queue's returns")) {
    const id = String(r.advance_id);
    returned.set(id, (returned.get(id) ?? 0) + Number(r.amount_vnd));
  }
  // Oldest first, so an advance with more than one claim reads its newest, as the owner's page does.
  const claimStatus = new Map(mustRows(claims, "[reimbursements] the queue's settlements").map((c) => [String(c.advance_id), String(c.status)]));
  return rows.map((raw) => {
    const row = rowFrom(raw);
    return {
      row,
      putBack: putBack.has(row.id),
      ownerName: personName(raw.person as Parameters<typeof personName>[0], "Someone"),
      spentVnd: raw.spent_vnd === null || raw.spent_vnd === undefined ? null : Number(raw.spent_vnd),
      returnedVnd: returned.get(row.id) ?? 0,
      claimStatus: claimStatus.get(row.id) ?? null,
    };
  });
}

type FinanceTransfer = BookTransfer & { id: string; receiptFileId: string | null; bankName: string | null; accountLast4: string | null };

type AdvanceForFinance = {
  row: AdvanceRow;
  ownerName: string;
  spentVnd: number | null;
  approvedBy: string | null;
  claim: { id: string; status: string } | null;
  returnReported: boolean;
  returnedVnd: number;
  owedVnd: number;
  transfers: FinanceTransfer[];
  account: { entries: BookEntry[]; balanceVnd: number };
  files: AdvanceFile[];
  /** A finished bank receipt no transfer cites yet: uploaded, and the recording lost or not done. */
  unusedReceipt: { id: string; filename: string } | null;
  events: AdvanceEvent[];
};

/** One advance in full, for Finance. A draft nobody sent reads as none. */
export async function readAdvanceForFinance(advanceId: string): Promise<AdvanceForFinance | null> {
  const rows = mustRows(await selectReimbursementAdvances(`${COLUMNS}, metadata`).eq("id", advanceId).limit(1), "[reimbursements] an advance for Finance");
  const raw = rows[0];
  if (!raw) return null;
  const row = rowFrom(raw);
  if (row.status === "draft" && row.submittedAt === null) return null;
  const [name, files, events, transferRows, claimRows] = await Promise.all([
    ownerName(row.personId),
    readAdvanceFiles(row.id),
    readAdvanceEvents(row.id),
    selectReimbursementAdvanceTransfers("id, direction, amount_vnd, transferred_on, bank_receipt_file_id, bank_name_snapshot, bank_account_last4").eq("advance_id", row.id).order("transferred_on"),
    selectReimbursementClaims("id, status").eq("advance_id", row.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const transfers: FinanceTransfer[] = mustRows(transferRows, "[reimbursements] an advance's transfers").map((t) => ({
    id: String(t.id),
    direction: t.direction === "out" ? "out" : "in",
    amountVnd: Number(t.amount_vnd),
    transferredOn: String(t.transferred_on),
    receiptFileId: (t.bank_receipt_file_id as string | null) ?? null,
    bankName: (t.bank_name_snapshot as string | null) ?? null,
    accountLast4: (t.bank_account_last4 as string | null) ?? null,
  }));
  const claim = mustRows(claimRows, "[reimbursements] an advance's settlement")[0];
  const returnedVnd = transfers.filter((t) => t.direction === "in").reduce((sum, t) => sum + t.amountVnd, 0);
  const closed = events.find((e) => e.move === "close" || e.move === "return_unspent");
  const spentVnd = raw.spent_vnd === null || raw.spent_vnd === undefined ? null : Number(raw.spent_vnd);
  const cited = new Set(transfers.map((t) => t.receiptFileId));
  const unused = files.filter((f) => f.kind === "bank_receipt" && !cited.has(f.id)).at(-1);
  return {
    row,
    ownerName: name,
    spentVnd,
    approvedBy: events.find((e) => e.move === "approve")?.actorName ?? null,
    claim: claim ? { id: String(claim.id), status: String(claim.status) } : null,
    returnReported: returnStillReported(raw.metadata, returnedVnd),
    returnedVnd,
    owedVnd: owedOf({ balanceVnd: row.balanceVnd, returnedVnd }),
    transfers,
    account: accountOf({ amountVnd: row.amountVnd, spentVnd, closedOn: closed ? businessDate(closed.at) : null, transfers }),
    files,
    unusedReceipt: unused ? { id: unused.id, filename: unused.filename } : null,
    events,
  };
}

/**
 * What the papers print for one advance. `ownedBy` narrows it in the query for the owner's page,
 * so someone else's reads as none. A draft nobody sent has no paper. A failed read raises: a
 * printed form with a figure missing would look finished. The company comes from the legal
 * entity, and an unset one prints as blank rather than a name written here.
 */
export async function readAdvanceForForm(advanceId: string, scope: { ownedBy?: string }): Promise<{ facts: FormFacts; row: AdvanceRow; spentVnd: number | null } | null> {
  const one = selectReimbursementAdvances(COLUMNS).eq("id", advanceId);
  const rows = mustRows(await (scope.ownedBy ? one.eq("person_id", scope.ownedBy) : one).limit(1), "[reimbursements] an advance for its form");
  const raw = rows[0];
  if (!raw) return null;
  const row = rowFrom(raw);
  if (row.submittedAt === null) return null;
  const [name, events, claimRows, buyer] = await Promise.all([
    ownerName(row.personId),
    readAdvanceEvents(row.id),
    selectReimbursementClaims("id, submitted_at").eq("advance_id", row.id).limit(1),
    readRedInvoiceBuyer(),
  ]);
  // Unset prints blank, but a read that failed must not: the paper would look finished.
  if (buyer.state === "unavailable") throw new Error("[reimbursements] the legal entity could not be read for a form");
  const claim = mustRows(claimRows, "[reimbursements] an advance's settlement for its form")[0];
  const spentVnd = raw.spent_vnd === null || raw.spent_vnd === undefined ? null : Number(raw.spent_vnd);
  const items =
    claim && spentVnd !== null
      ? stillCounted(mustRows(await selectReimbursementClaimItems("seller, description, bought_on, amount_vnd, declined_at, removed_at").eq("claim_id", String(claim.id)).order("position"), "[reimbursements] a settlement's receipts for its form"))
          .filter((i) => !i.declined_at)
          .map((i) => ({ label: itemLabel(i), vnd: Number(i.amount_vnd ?? 0) }))
      : [];
  // Newest first, so a return that came in parts signs for its last. An actor the record cannot
  // name stays unnamed: printing the owner instead would sign the paper in their name.
  const moved = (move: string): Signed | null => {
    const event = events.find((e) => e.move === move);
    return event ? { by: event.actorName, at: event.at } : null;
  };
  const closed = moved("close");
  const closedBy = events.find((e) => e.move === "close")?.approvedAs;
  const returnedUnspent = moved("return_unspent");
  const claimSent = claim && typeof claim.submitted_at === "string" ? { at: claim.submitted_at } : null;
  return {
    row,
    spentVnd,
    facts: {
      refNo: row.refNo,
      owner: name,
      purpose: row.purpose,
      amountVnd: row.amountVnd,
      settleBy: row.settleBy,
      company: "legalName" in buyer ? { name: buyer.legalName, taxCode: buyer.state === "ready" ? buyer.taxCode : null } : { name: null, taxCode: null },
      asked: { at: row.submittedAt },
      approved: moved("approve"),
      settlementApproved: closedBy === "approval" ? closed : null,
      checkApproved: closedBy === "approval" ? null : closed,
      returnRecorded: moved("confirm_return"),
      ownerSent: returnedUnspent ? { at: returnedUnspent.at } : claimSent,
      closedOn: closed || returnedUnspent ? businessDate((closed ?? returnedUnspent)?.at as string) : null,
      spentVnd,
      items,
    },
  };
}
