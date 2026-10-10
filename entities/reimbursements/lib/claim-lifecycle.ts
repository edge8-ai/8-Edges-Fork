// The one step that moves a claim (design §2.3), and the only code that writes
// reimbursement_claims.status. Every surface that moves a claim — the owner's
// pages now; the checker's, the approver's, the payer's and the payment run's
// cron as their tickets arrive — calls `transitionClaim` with its own scoped
// writer, exactly as time-off's `transitionLeave` does (A.30).
//
// What stays with the caller is authorization (ADR 0007): the action's first
// statement is its guard, and the writer it hands over is already narrowed to
// what the actor may touch (`claimWriterFor(id, { ownedBy })` for the owner).
// This module adds the status it read to that write — `.eq("status", from)` —
// so a claim somebody else moved in between matches nothing, and a write that
// matched nothing records nothing and answers "this claim changed".
//
// A move that lands leaves one row in reimbursement_claim_events, the claim's
// append-only history, and one audit row. `submitted_at` is stamped by every
// submit and cleared by nothing: the database refuses to delete a claim whose
// `submitted_at` is set (ten-year retention), so a withdrawn claim keeps it.
//
// RB.1 wired the owner's moves, RB.3 the checker's (check, send back,
// reject, and declining a receipt), RB.4 the approver's (approve, send back,
// reject), RB.6 the payment run's (a claim enters a run, payment-runs.ts) and
// RB.7 the payer's (paid, or returned to approved, payments.ts), so every
// arrow of the transition table (claim-rules.ts) now moves a claim. A move
// that lands also keeps the
// kernel's approvals in step (design §1.3, claim-decisions.ts): each one waits
// on whoever holds a permission, never on a person, so a claim reaches its
// checkers' and approvers' "Waiting on you" and nobody else's.
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { canSubmit, decidingStep, nextClaimStatus, ownerCan, REASONED, type ClaimActorKind, type ClaimMove, type ClaimStatus } from "./claim-rules";
import { approvedOnCheck } from "./approval-limit";
import { ownClaimRefusal, waitsOn } from "./claim-moves";
import { receiptWriteError } from "./receipt-freeze";
import { approvedTotalOf, declinedItemsOf, DECISIONS, recordDecision } from "./claim-decisions";
import { checkBlockedBy, loadSubmitItems } from "./claim-items";
import { readBankDetailsOnFile } from "./own-bank-details";
import { removeObjects } from "./claim-files";
import { tellApproversOfCheck, tellOwnerOfDecision } from "./notices";
import { announceMove } from "./claim-events";
import type { ClaimRow } from "./own-claims";
import { selectReimbursementFiles } from "./reads";
import { deleteReimbursementClaims, insertReimbursementClaims, insertReimbursementClaimEvents, updateReimbursementClaimItems, updateReimbursementClaims } from "./writes";

export type { ClaimRow } from "./own-claims";

/** What a write answers, as PostgREST does: the rows it matched and the database's refusal. */
type WriteAnswer<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/** What a move writes onto the claim: its status, and the stamps and links each move carries. */
export type ClaimPatch = {
  status: ClaimStatus;
  submitted_at?: string;
  checked_at?: string;
  checked_by?: string | null;
  approved_at?: string;
  approved_by?: string | null;
  /** The kept receipts' total in whole VND, frozen at approval: the payment run reads it and never recomputes it. */
  approved_total_vnd?: number;
  /** The run that took the claim (enter_run), cleared when a failed transfer returns it (return_to_approved). */
  payment_run_id?: string | null;
  in_run_at?: string;
  /** The payment that paid it (pay), cleared with the run on a return. */
  payment_id?: string | null;
  paid_at?: string;
};

/**
 * The caller's scoped update of one claim. It must already be filtered to the
 * claim and to what the caller may touch; this module adds `.eq("status",
 * from)` through `from`, and reads a landed write from the rows it returns, so
 * it ends in `.select("id")`.
 */
export type ClaimWriter = (patch: ClaimPatch, from: ClaimStatus) => WriteAnswer<{ id: string }[]>;

/**
 * Who is moving the claim: the part they play, their people id (null for the
 * cron), whether they may decide their own claim (the Employer role, design
 * §1.6), and how the audit log names them.
 */
export type ClaimActor = { kind: ClaimActorKind; personId: string | null; mayDecideOwn: boolean; label?: string | null };

/**
 * The writer for one claim. `ownedBy` narrows it to one person's own claims in
 * the query that writes, for the owner's actions; the deciders' writers, when
 * their tickets arrive, are unscoped because their guard is a permission.
 */
export function claimWriterFor(id: string, scope: { ownedBy?: string }): ClaimWriter {
  return (patch, from) => {
    const one = updateReimbursementClaims(patch).eq("id", id);
    return (scope.ownedBy ? one.eq("person_id", scope.ownedBy) : one).eq("status", from).select("id");
  };
}

const CHANGED = "This claim changed while you were working on it. Reload and try again.";


/** The run and the payment a payment-run move is about, handed in by the payment-runs and payments modules. */
type Links = { runId: string | null; paymentId: string | null };

/**
 * The patch a landed move writes. Withdraw writes the status alone:
 * `submitted_at` stays. Approve stamps who and when, and freezes the total it
 * was handed (read before the write, see approvedTotalOf). Entering a run
 * links the claim to it; paying links it to its payment; a return unlinks
 * both, so the next run picks the claim up again (design §2.3).
 */
function patchFor(move: ClaimMove, to: ClaimStatus, actor: ClaimActor, approvedTotalVnd: number | null, links: Links): ClaimPatch {
  const now = new Date().toISOString();
  if (move === "submit") return { status: to, submitted_at: now };
  if (move === "check") return { status: to, checked_at: now, checked_by: actor.personId };
  if (move === "approve" && approvedTotalVnd !== null) return { status: to, approved_at: now, approved_by: actor.personId, approved_total_vnd: approvedTotalVnd };
  if (move === "enter_run") return { status: to, in_run_at: now, payment_run_id: links.runId };
  if (move === "pay") return { status: to, paid_at: now, ...(links.paymentId ? { payment_id: links.paymentId } : {}) };
  if (move === "return_to_approved") return { status: to, payment_run_id: null, payment_id: null };
  return { status: to };
}

/** The detail a history row keeps: the total frozen at approval, the run and the payment. Undefined when there is none. */
function historyMetadata(m: { approvedTotalVnd: number | null } & Links): Record<string, string | number> | undefined {
  const out: Record<string, string | number> = {};
  if (m.approvedTotalVnd !== null) out.approvedTotalVnd = m.approvedTotalVnd;
  if (m.runId) out.runId = m.runId;
  if (m.paymentId) out.paymentId = m.paymentId;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Appends the history row and the audit row for a move that landed, and
 * answers the history row's id (null when it was not written), which keys the
 * notices so a retried action never sends twice.
 */
async function record(input: {
  claimId: string;
  from: ClaimStatus | null;
  to: ClaimStatus;
  actor: ClaimActor;
  move: ClaimMove | "create";
  reason?: string | null;
  declinedItemIds?: string[];
  /** Detail of the move for the history row: the approved total at approval. */
  metadata?: Record<string, string | number | null>;
}): Promise<string | null> {
  const { data, error } = await insertReimbursementClaimEvents({
    claim_id: input.claimId,
    from_status: input.from,
    to_status: input.to,
    actor_person_id: input.actor.personId,
    reason: input.reason ?? null,
    ...(input.declinedItemIds?.length ? { declined_item_ids: input.declinedItemIds } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  })
    .select("id")
    .maybeSingle();
  // The move has landed and cannot be taken back, so a lost history row is
  // logged and audited loudly rather than answered as a failure the person
  // would retry into a refusal.
  if (error) console.error("[reimbursements] the claim moved but its history row was not written", input.claimId, input.to, error.message);
  await recordAudit({
    table: "reimbursement_claims",
    recordId: input.claimId,
    operation: input.from === null ? "insert" : "update",
    actor: input.actor.label ?? null,
    oldData: input.from === null ? null : { status: input.from },
    newData: { status: input.to },
    context: { move: input.move, ...(error ? { historyRowMissing: true } : {}) },
  });
  return error || !data ? null : String((data as { id: unknown }).id);
}

/**
 * Moves a claim. Refused by the rules, by the own-claim rule or by a lost
 * write, it changes nothing; a no-op answers ok without writing. A submit is
 * refused unless the claim's items and the owner's bank details on file pass
 * `canSubmit`, read here so no surface can submit without asking. A check is
 * refused while a receipt it would keep is rate pending (`checkRefusal`).
 */
export async function transitionClaim(input: {
  row: ClaimRow;
  move: ClaimMove;
  actor: ClaimActor;
  write: ClaimWriter;
  reason?: string;
  /** The run a claim enters (enter_run): required there, ignored elsewhere. */
  runId?: string;
  /** The payment that pays it (pay), recorded on the claim and its history. */
  paymentId?: string;
}): Promise<Result> {
  const { row, move, actor } = input;
  const next = nextClaimStatus(row.status, move, actor.kind);
  if (next.outcome === "refuse") return { ok: false, error: next.error };

  // The owner's moves are the owner's alone; the deciders' are never on their
  // own claim unless they hold the employer's exemption (design §1.5). Every
  // decision, not only the check: sending your own claim back, or rejecting
  // it, is still deciding it. The rule is claim-moves', which the deciders'
  // pages read too (A.34).
  const refusal = ownClaimRefusal(row, actor);
  if (refusal) return { ok: false, error: refusal };
  if (next.outcome === "noop") return { ok: true };
  if (REASONED.has(move) && !input.reason?.trim()) return { ok: false, error: "Give a reason." };
  if (move === "enter_run" && !input.runId) return { ok: false, error: "A claim enters a run only with the run it enters." };
  const links: Links = { runId: input.runId ?? null, paymentId: input.paymentId ?? null };

  let declinedItemIds: string[] = [];
  let approvedTotalVnd: number | null = null;
  // How many receipts a submission carries, for its notice (RB.8).
  let receipts: number | null = null;
  if (move === "approve") {
    const total = await approvedTotalOf(row.id);
    if (!total.ok) return total;
    approvedTotalVnd = total.totalVnd;
    declinedItemIds = total.declinedIds;
  } else if (DECISIONS.has(move)) {
    const declined = await declinedItemsOf(row.id);
    if (!declined.ok) return declined;
    declinedItemIds = declined.ids;
  }

  if (move === "check") {
    const blocked = await checkBlockedBy(row.id);
    if (blocked) return { ok: false, error: blocked };
  }

  if (move === "submit") {
    const items = await loadSubmitItems(row.id);
    if (!items.ok) return items;
    receipts = items.items.length;
    // The owner's own row only: whether Finance could pay them, never the values.
    const bank = await readBankDetailsOnFile(row.personId);
    if (!bank.ok) return bank;
    const ready = canSubmit({ title: row.title, items: items.items, bankDetailsOnFile: bank.onFile });
    if (!ready.ok) return { ok: false, error: ready.reasons.join(" ") };
  }

  const { data: landed, error } = await input.write(patchFor(move, next.status, actor, approvedTotalVnd, links), row.status);
  if (error) return { ok: false, error: error.message };
  if (!landed?.length) return { ok: false, error: CHANGED };

  const reason = input.reason?.trim() || null;
  const eventId = await record({
    claimId: row.id,
    from: row.status,
    to: next.status,
    actor,
    move,
    reason,
    declinedItemIds,
    metadata: historyMetadata({ approvedTotalVnd, ...links }),
  });
  await recordDecision({ row, move, actor, reason, declinedItemIds, approvedTotalVnd });
  // The catalogue fact and, for a submission, the channel notice (design §1.8,
  // RB.8). After the write landed, and never for a write that matched nothing.
  await announceMove({ row, move, actor, reason, approvedTotalVnd, eventId, receipts, ...links });
  if (move === "check") {
    // Under the approval limit the check is enough (RB.22, Dave): the same
    // person approves it in the next move, through every rule an approval
    // follows (its frozen total, its history row, its Approvals bookkeeping),
    // and nobody is asked. At or over it, or when the total cannot be read or
    // the approval does not land, the claim waits on whoever holds
    // reimbursements.approve and they are emailed (design §1.8), so it never
    // sits unseen.
    const total = await approvedTotalOf(row.id);
    if (total.ok && approvedOnCheck(total.totalVnd)) {
      const approved = await transitionClaim({ row: { ...row, status: next.status }, move: "approve", actor: { ...actor, kind: "approver" }, write: input.write });
      if (approved.ok) return { ok: true };
      console.error("[reimbursements] a claim under the approval limit was checked but not approved", row.id, approved.error);
    }
    await tellApproversOfCheck({ claimId: row.id, ownerPersonId: row.personId, title: row.title, checkedBy: actor.personId, eventId });
  }
  // Sent back or rejected, the owner is told why (design §1.8). After the
  // write landed, and never for a write that matched nothing.
  if ((next.status === "sent_back" || next.status === "rejected") && reason) {
    await tellOwnerOfDecision({
      claimId: row.id,
      ownerPersonId: row.personId,
      title: row.title,
      became: next.status,
      step: decidingStep(row.status),
      reason,
      eventId,
    });
  }
  return { ok: true };
}

/**
 * Declines one receipt of a claim waiting to be checked, with the reason the
 * owner reads, or restores it (`reason: null`). A declined receipt stays on the
 * claim and leaves the total that is approved; the check, send back or
 * rejection that follows carries the declined ids into its history row and its
 * approval. It is the checker's decision, so it follows the checker's rules:
 * never on your own claim (unless you may decide your own), and only while the
 * claim is submitted. The approver declines nothing line by line: RB.4 gives
 * them approve, send back and reject, and a receipt they would not pay is a
 * send back with the reason.
 */
export async function declineClaimItem(input: { row: ClaimRow; itemId: string; actor: ClaimActor; reason: string | null }): Promise<Result> {
  const { row, actor } = input;
  if (actor.kind !== "checker") return { ok: false, error: "Only a checker can decline a receipt." };
  const refusal = ownClaimRefusal(row, actor);
  if (refusal) return { ok: false, error: refusal };
  if (!waitsOn(row.status, "checker")) return { ok: false, error: "Receipts can be declined only while the claim waits to be checked." };
  const restore = input.reason === null;
  const reason = input.reason?.trim() ?? "";
  if (!restore && !reason) return { ok: false, error: "Give a reason." };
  // The three columns move together: the table's shape check refuses a
  // declined line without its reason.
  const patch = restore
    ? { declined_at: null, declined_by: null, decline_reason: null }
    : { declined_at: new Date().toISOString(), declined_by: actor.personId, decline_reason: reason };
  // A receipt its owner removed (20261008090000) counts toward nothing, so
  // there is nothing to decline or restore: the write matches no such row.
  const { data, error } = await updateReimbursementClaimItems(patch).eq("id", input.itemId).eq("claim_id", row.id).is("removed_at", null).select("id");
  if (error) return { ok: false, error: receiptWriteError(error, `Could not ${restore ? "restore" : "decline"} the receipt: ${error.message}`) };
  if ((data ?? []).length === 0) return { ok: false, error: "That receipt is no longer on the claim, or its owner removed it." };
  await recordAudit({
    table: "reimbursement_claim_items",
    recordId: input.itemId,
    operation: "update",
    actor: actor.label ?? null,
    newData: restore ? { declined: false } : { declined: true, reason },
    context: { claimId: row.id, move: restore ? "restore_item" : "decline_item" },
  });
  return { ok: true };
}

/** Starts a claim as a draft for its owner, and records that it was started. */
export async function createClaim(input: {
  title: string;
  /** The trip the claim belongs to (RB.11), already checked to be one by the caller. */
  tripEventId?: string | null;
  owner: { personId: string; teamMemberId: string };
  actor: ClaimActor;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the claim a title." };
  if (title.length > 200) return { ok: false, error: "Keep the title under 200 characters." };
  const { data, error } = await insertReimbursementClaims({
    title,
    person_id: input.owner.personId,
    team_member_id: input.owner.teamMemberId,
    status: "draft",
    ...(input.tripEventId ? { trip_event_id: input.tripEventId } : {}),
  })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: `Could not start the claim: ${error?.message ?? "no row"}` };
  await record({ claimId: data.id, from: null, to: "draft", actor: input.actor, move: "create" });
  return { ok: true, id: data.id };
}

/**
 * Deletes a draft that was never submitted, with its items and documents. The
 * delete repeats the rule in its own filters (owner, draft, never submitted),
 * and the database refuses it besides, so a claim submitted from another tab
 * in between is kept. The objects go after the rows, from the paths read first.
 */
export async function deleteDraftClaim(input: { row: ClaimRow; actor: ClaimActor }): Promise<Result> {
  const { row, actor } = input;
  if (actor.personId !== row.personId) return { ok: false, error: "Claim not found." };
  if (!ownerCan(row).delete) {
    return {
      ok: false,
      error:
        row.submittedAt !== null
          ? "This claim was submitted once, so it is kept for ten years and cannot be deleted."
          : "Only a draft can be deleted.",
    };
  }
  const { data: files, error: filesError } = await selectReimbursementFiles("storage_path, reimbursement_claim_items!inner(claim_id)").eq(
    "reimbursement_claim_items.claim_id",
    row.id,
  );
  if (filesError) return { ok: false, error: `Could not delete the draft: ${filesError.message}` };
  const { data, error } = await deleteReimbursementClaims()
    .eq("id", row.id)
    .eq("person_id", row.personId)
    .eq("status", "draft")
    .is("submitted_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((data ?? []).length === 0) return { ok: false, error: CHANGED };
  await recordAudit({ table: "reimbursement_claims", recordId: row.id, operation: "delete", actor: actor.label ?? null, oldData: { status: "draft", title: row.title } });
  await removeObjects((files ?? []).map((f) => String(f.storage_path)));
  return { ok: true };
}
