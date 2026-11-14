// The one step that moves an advance (AD.4, design section 2), and the only code
// that writes reimbursement_advances.status. It mirrors claim-lifecycle: every
// surface calls `transitionAdvance` with its own scoped writer, the write is guarded
// on the status it read, and a write that matched nothing records nothing.
//
// What stays with the caller is authorization (ADR 0007): the action's first
// statement is its guard. The database holds the line behind this module: a status
// can never disagree with the ledger, whatever raced whatever (20261104100000).
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { ReadFailure } from "@/kernel/data/read";
import { recordAdvanceApproval } from "./advance-decisions";
import { ownerIsOnlyOtherPayer, payoutRefusalFor } from "./advance-payers";
import { canDeleteAdvance, canSubmitAdvance, isAdvanceStatus, moveNeedsReason, nextAdvanceStatus, OPEN_ADVANCE_STATUSES, ownAdvanceRefusal, type AdvanceActorKind, type AdvanceMove, type AdvanceStatus } from "./advance-rules";
import { ADVANCE_MAX_VND } from "./advance-policy";
import { removeObjects } from "./document-store";
import { tellOwnerOfReinstate, tellPayersOfReinstate, tellApproversOfRequest, tellOwnerOfClose, tellOwnerOfDecision, tellOwnerOfPayout, tellOwnerOfReturnConfirmed, tellPayersOfMoneyOwed, tellPayersOfCancel, tellPayersToTransfer } from "./advance-notices";
import { readBankDetailsOnFile } from "./own-bank-details";
import { selectReimbursementAdvanceFiles, selectReimbursementAdvances } from "./reads";
import { deleteReimbursementAdvances, insertReimbursementAdvanceEvents, insertReimbursementAdvances, updateReimbursementAdvances } from "./writes";

/** An advance as the rules read it. */
export type AdvanceRow = {
  id: string;
  refNo: number;
  status: AdvanceStatus;
  personId: string;
  purpose: string;
  amountVnd: number;
  spendEndsOn: string;
  settleBy: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  balanceVnd: number | null;
};

const ADVANCE_COLUMNS = "id, ref_no, status, person_id, purpose, amount_vnd, spend_ends_on, settle_by, submitted_at, decided_by, balance_vnd";

/** A row as it comes back, or null when its status is not one this code knows, which is never guessed at. */
export function advanceRowFrom(r: Record<string, unknown>): AdvanceRow | null {
  const status = String(r.status);
  if (!isAdvanceStatus(status)) return null;
  return {
    id: String(r.id),
    refNo: Number(r.ref_no),
    status,
    personId: String(r.person_id),
    purpose: String(r.purpose),
    amountVnd: Number(r.amount_vnd),
    spendEndsOn: String(r.spend_ends_on),
    settleBy: (r.settle_by as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
    decidedBy: (r.decided_by as string | null) ?? null,
    balanceVnd: r.balance_vnd === null || r.balance_vnd === undefined ? null : Number(r.balance_vnd),
  };
}

/** One advance, or null when there is none. A failed read raises: "not found" would be a wrong answer. */
export async function readAdvanceRow(id: string): Promise<AdvanceRow | null> {
  const { data, error } = await selectReimbursementAdvances(ADVANCE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new ReadFailure("[reimbursements] advance", error.message);
  return data ? advanceRowFrom(data) : null;
}

type WriteError = { message: string; code?: string };
type WriteAnswer<T> = PromiseLike<{ data: T | null; error: WriteError | null }>;

/** What a move writes onto the advance: its status, and the stamps and figures each move carries. */
export type AdvancePatch = {
  status: AdvanceStatus;
  submitted_at?: string;
  decided_at?: string;
  decided_by?: string | null;
  paid_out_at?: string;
  settle_by?: string;
  settled_at?: string;
  spent_vnd?: number;
  balance_vnd?: number;
  settled_claim_id?: string | null;
  reminded_at?: null;
  overdue_told_at?: null;
};

/** The caller's scoped update of one advance; this module adds the status it read (and a decider's stamp). It ends in `.select("id")`. */
type AdvanceWriter = (patch: AdvancePatch, from: AdvanceStatus, submittedAt?: string) => WriteAnswer<{ id: string }[]>;

/** Who is moving it: the part they play, their people id, whether they may decide their own, and how the audit names them. */
export type AdvanceActor = { kind: AdvanceActorKind; personId: string | null; mayDecideOwn: boolean; label?: string | null };

/**
 * The writer for one advance. `ownedBy` narrows it to one person's own, in the query that
 * writes, for the owner's actions. A decision's stamp (the mark, `transitionAdvance`)
 * narrows it to the very request the decider read, so a request sent again between the
 * read and the write matches nothing.
 */
export function advanceWriterFor(id: string, scope: { ownedBy?: string }): AdvanceWriter {
  return (patch, from, submittedAt) => {
    let one = updateReimbursementAdvances(patch).eq("id", id);
    if (scope.ownedBy) one = one.eq("person_id", scope.ownedBy);
    if (submittedAt !== undefined) one = one.eq("submitted_at", submittedAt);
    return one.eq("status", from).select("id");
  };
}

/**
 * What the approver read when they decided (RB.28): when the request was last sent. An
 * owner can withdraw, change the amount and send it again, which leaves the status just
 * as it was and moves only this stamp. Without it, an approval clicked on an open page
 * would land on a figure nobody looked at.
 */
type AdvanceMark = { submittedAt: string };

const READ_IT_AGAIN = "This request changed after you opened it. Reload and read it again before you decide.";

const CHANGED = "This advance changed while you were working on it. Reload and try again.";
const ONE_OPEN = "Settle your open advance first: one at a time.";
const ANOTHER_OPEN = "They have opened another advance, so this one cannot go back yet. Ask them to cancel or finish the other one first.";

/**
 * A database refusal in the person's words. The unique index is the one-open rule.
 * A guard's P0R02 means the advance moved under this write, so a cancel that lost to
 * a transfer says the money has gone. A raw message would show them a row id.
 */
function writeRefusal(error: WriteError, move: AdvanceMove | "create"): string {
  if (error.code === "23505") return move === "reinstate" ? ANOTHER_OPEN : ONE_OPEN;
  if (error.code === "P0R02") return move === "cancel" ? "The money has already been sent, so this advance can no longer be cancelled." : CHANGED;
  return error.message;
}

/** What a move carries that the rules cannot work out alone. */
type MoveFacts = {
  /** A close's ending and what it freezes. */
  balanceVnd?: number;
  spentVnd?: number;
  settledClaimId?: string | null;
  /** What is still owed once a confirmed return is counted. */
  outstandingAfterVnd?: number;
  /** The deadline a payout sets. */
  settleBy?: string;
  /** Whether the person ticked the promise to settle, for a submit. */
  promised?: boolean;
  /** Detail for the history row: the transfer, the claim. */
  metadata?: Record<string, string | number>;
};

function patchFor(move: AdvanceMove, to: AdvanceStatus, actor: AdvanceActor, facts: MoveFacts): AdvancePatch {
  const now = new Date().toISOString();
  switch (move) {
    case "submit":
      return { status: to, submitted_at: now };
    case "approve":
    case "send_back":
    case "reject":
      return { status: to, decided_at: now, decided_by: actor.personId };
    case "pay_out":
      return { status: to, paid_out_at: now, settle_by: facts.settleBy };
    case "close":
    case "return_unspent":
      return {
        status: to,
        spent_vnd: facts.spentVnd,
        balance_vnd: facts.balanceVnd,
        settled_claim_id: facts.settledClaimId ?? null,
        ...(to === "settled" ? { settled_at: now } : {}),
        // What they were reminded of was settling. Money owed back is a new ask, so it gets its own notices.
        ...(move === "return_unspent" ? { reminded_at: null, overdue_told_at: null } : {}),
      };
    case "confirm_return":
      return to === "settled" ? { status: to, settled_at: now } : { status: to };
    default:
      return { status: to };
  }
}

/** The history row and the audit row for a move that landed; the history row's id keys the notices, so a retry never sends twice. */
async function record(input: {
  advanceId: string;
  move: AdvanceMove | "create";
  from: AdvanceStatus | null;
  to: AdvanceStatus;
  actor: AdvanceActor;
  reason?: string | null;
  metadata?: Record<string, string | number>;
}): Promise<string | null> {
  const { data, error } = await insertReimbursementAdvanceEvents({
    advance_id: input.advanceId,
    move: input.move,
    from_status: input.from,
    to_status: input.to,
    actor_person_id: input.actor.personId,
    reason: input.reason ?? null,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  })
    .select("id")
    .maybeSingle();
  // The move has landed and cannot be taken back, so a lost history row is logged
  // and audited loudly rather than answered as a failure the person would retry.
  if (error) console.error("[reimbursements] the advance moved but its history row was not written", input.advanceId, input.to, error.message);
  await recordAudit({
    table: "reimbursement_advances",
    recordId: input.advanceId,
    operation: input.from === null ? "insert" : "update",
    actor: input.actor.label ?? null,
    oldData: input.from === null ? null : { status: input.from },
    newData: { status: input.to },
    context: { move: input.move, ...(error ? { historyRowMissing: true } : {}) },
  });
  return error || !data ? null : String((data as { id: unknown }).id);
}

/** The facts a submit is checked on, read here so no surface can submit without asking. */
async function submitRefusal(row: AdvanceRow, promised: boolean): Promise<string | null> {
  const { data: evidence, error: evidenceError } = await selectReimbursementAdvanceFiles("id")
    .eq("advance_id", row.id)
    .eq("kind", "evidence")
    .not("confirmed_at", "is", null)
    .is("replaced_at", null);
  if (evidenceError) return `Could not read the evidence: ${evidenceError.message}`;
  const bank = await readBankDetailsOnFile(row.personId);
  if (!bank.ok) return bank.error;
  const { data: others, error: othersError } = await selectReimbursementAdvances("id")
    .eq("person_id", row.personId)
    .in("status", [...OPEN_ADVANCE_STATUSES])
    .neq("id", row.id);
  if (othersError) return `Could not read your other advances: ${othersError.message}`;
  const ready = canSubmitAdvance({
    purpose: row.purpose,
    amountVnd: row.amountVnd,
    spendEndsOn: row.spendEndsOn,
    evidenceCount: (evidence ?? []).length,
    promised,
    bankDetailsOnFile: bank.onFile,
    anotherOpen: (others ?? []).length > 0,
  });
  return ready.ok ? null : ready.reasons.join(" ");
}

/**
 * Moves an advance. Refused by the rules or the own-advance rule, it changes
 * nothing; a repeated owner's move answers ok without writing; a write that matched
 * nothing answers that the advance changed.
 */
export async function transitionAdvance(input: {
  row: AdvanceRow;
  move: AdvanceMove;
  actor: AdvanceActor;
  write: AdvanceWriter;
  reason?: string;
  facts?: MoveFacts;
  /** What the approver read: the decision lands only on that request. */
  mark?: AdvanceMark;
}): Promise<Result> {
  const { row, move, actor } = input;
  if (input.mark && (row.submittedAt === null || row.submittedAt !== input.mark.submittedAt)) return { ok: false, error: READ_IT_AGAIN };
  const facts = input.facts ?? {};
  const next = nextAdvanceStatus(row.status, move, actor.kind, { balanceVnd: facts.balanceVnd, outstandingAfterVnd: facts.outstandingAfterVnd });
  if (next.outcome === "refuse") return { ok: false, error: next.error };

  const refusal = ownAdvanceRefusal(row, actor);
  if (refusal) return { ok: false, error: refusal };
  if (next.outcome === "noop") return { ok: true };

  const reason = input.reason?.trim() || null;
  if (moveNeedsReason(move, row.status) && !reason) return { ok: false, error: "Give a reason." };
  if (move === "cancel" && canDeleteAdvance(row)) return { ok: false, error: "This draft was never sent, so delete it instead." };

  if (move === "pay_out") {
    const refused = await payoutRefusalFor(row, actor);
    if (refused) return { ok: false, error: refused };
    if (!facts.settleBy) return { ok: false, error: "A payout needs its settle-by date." };
  }
  if (move === "close" || move === "return_unspent") {
    if (facts.spentVnd === undefined || facts.balanceVnd === undefined) return { ok: false, error: "The figures this move ends on are missing." };
    // The database's shape check does not require this, and a close is only ever a claim's
    // approval: without its claim, a positive balance would have nothing to pay it.
    if (move === "close" && !facts.settledClaimId) return { ok: false, error: "A close needs the settlement that closes it." };
  }
  if (move === "submit") {
    const refused = await submitRefusal(row, facts.promised === true);
    if (refused) return { ok: false, error: refused };
  }

  const { data: landed, error } = await input.write(patchFor(move, next.status, actor, facts), row.status, input.mark?.submittedAt);
  if (error) return { ok: false, error: writeRefusal(error, move) };
  if (!landed?.length) return { ok: false, error: CHANGED };

  const eventId = await record({ advanceId: row.id, move, from: row.status, to: next.status, actor, reason, metadata: facts.metadata });
  await recordAdvanceApproval({ row, move, actor, reason });

  // After the write landed, and never for a write that matched nothing. A notice
  // never throws: the money rule has already moved.
  const about = { advanceId: row.id, refNo: row.refNo, ownerPersonId: row.personId, purpose: row.purpose, amountVnd: row.amountVnd, eventId };
  if (move === "submit") await tellApproversOfRequest(about);
  if (move === "approve") {
    await tellOwnerOfDecision({ ...about, became: "approved", reason: null });
    // Where only the approver can record it, they are who is asked to transfer it.
    const approverRecords = actor.personId !== null && (await ownerIsOnlyOtherPayer(row.personId, actor.personId));
    await tellPayersToTransfer({ ...about, approvedBy: approverRecords ? null : actor.personId });
  }
  if ((move === "send_back" || move === "reject") && reason) await tellOwnerOfDecision({ ...about, became: next.status === "rejected" ? "rejected" : "sent_back", reason });
  if (move === "cancel" && row.status === "approved" && reason) await tellPayersOfCancel({ ...about, reason });
  if (move === "pay_out" && facts.settleBy) await tellOwnerOfPayout({ ...about, settleBy: facts.settleBy });
  if (move === "close" && facts.balanceVnd !== undefined) await tellOwnerOfClose({ ...about, balanceVnd: facts.balanceVnd });
  // A close that leaves money owed, and "I spent none of it": Finance is who records it arriving.
  if ((move === "close" || move === "return_unspent") && facts.balanceVnd !== undefined && facts.balanceVnd < 0) await tellPayersOfMoneyOwed({ ...about, owedVnd: -facts.balanceVnd });
  if (move === "reinstate" && reason) {
    await tellOwnerOfReinstate({ ...about, reason });
    await tellPayersOfReinstate({ ...about, reason, putBackBy: actor.personId });
  }
  if (move === "confirm_return") await tellOwnerOfReturnConfirmed({ ...about, outstandingAfterVnd: facts.outstandingAfterVnd ?? 0 });
  return { ok: true };
}

function requestRefusal(input: { purpose: string; amountVnd: number; spendEndsOn: string }): string | null {
  const purpose = input.purpose.trim();
  if (!purpose) return "Say what it is for.";
  if (purpose.length > 500) return "Keep what it is for under 500 characters.";
  if (!Number.isSafeInteger(input.amountVnd) || input.amountVnd < 1) return "Give the amount.";
  if (input.amountVnd > ADVANCE_MAX_VND) return `At most ₫${ADVANCE_MAX_VND.toLocaleString("en-US")}. Ask for less, or split the purchase.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.spendEndsOn)) return "Give the purchase date, or the trip's last day.";
  return null;
}

/**
 * Starts an advance as a draft for its owner. `owner` comes from the caller's guard,
 * so the employment always belongs to the person: nothing the browser sends can name
 * someone else's, which the database would not catch.
 */
export async function createAdvance(input: {
  purpose: string;
  amountVnd: number;
  spendEndsOn: string;
  tripEventId?: string | null;
  owner: { personId: string; teamMemberId: string };
  actor: AdvanceActor;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const refused = requestRefusal(input);
  if (refused) return { ok: false, error: refused };
  const { data, error } = await insertReimbursementAdvances({
    purpose: input.purpose.trim(),
    amount_vnd: input.amountVnd,
    spend_ends_on: input.spendEndsOn,
    person_id: input.owner.personId,
    team_member_id: input.owner.teamMemberId,
    ...(input.tripEventId ? { trip_event_id: input.tripEventId } : {}),
  })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error ? writeRefusal(error, "create") : "Could not start the advance." };
  const id = String((data as { id: unknown }).id);
  await record({ advanceId: id, move: "create", from: null, to: "draft", actor: input.actor });
  return { ok: true, id };
}

/** Changes what an advance asks, only while it is the owner's to change. The filters repeat the rule, and the database freezes it past them. */
export async function editAdvance(input: { row: AdvanceRow; purpose: string; amountVnd: number; spendEndsOn: string; tripEventId?: string | null; actor: AdvanceActor }): Promise<Result> {
  const { row, actor } = input;
  if (actor.personId !== row.personId) return { ok: false, error: "Advance not found." };
  if (row.status !== "draft" && row.status !== "sent_back") return { ok: false, error: "This advance is with the approver now, so it can no longer be changed." };
  const refused = requestRefusal(input);
  if (refused) return { ok: false, error: refused };
  const { data, error } = await updateReimbursementAdvances({
    purpose: input.purpose.trim(),
    amount_vnd: input.amountVnd,
    spend_ends_on: input.spendEndsOn,
    trip_event_id: input.tripEventId ?? null,
  })
    .eq("id", row.id)
    .eq("person_id", row.personId)
    .eq("status", row.status)
    .select("id");
  if (error) return { ok: false, error: writeRefusal(error, "create") };
  if (!data?.length) return { ok: false, error: CHANGED };
  return { ok: true };
}

/** Deletes a draft that was never submitted, with its files and history. The objects go after the row, from the paths read first. */
export async function deleteDraftAdvance(input: { row: AdvanceRow; actor: AdvanceActor }): Promise<Result> {
  const { row, actor } = input;
  if (actor.personId !== row.personId) return { ok: false, error: "Advance not found." };
  if (!canDeleteAdvance(row)) {
    return { ok: false, error: row.submittedAt !== null ? "This advance was submitted once, so it is kept for ten years and cannot be deleted." : "Only a draft can be deleted." };
  }
  const { data: files, error: filesError } = await selectReimbursementAdvanceFiles("storage_path").eq("advance_id", row.id);
  if (filesError) return { ok: false, error: `Could not delete the draft: ${filesError.message}` };
  const { data, error } = await deleteReimbursementAdvances().eq("id", row.id).eq("person_id", row.personId).eq("status", "draft").is("submitted_at", null).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: CHANGED };
  await recordAudit({ table: "reimbursement_advances", recordId: row.id, operation: "delete", actor: actor.label ?? null, oldData: { status: "draft", purpose: row.purpose } });
  await removeObjects((files ?? []).map((f) => String(f.storage_path)));
  return { ok: true };
}
