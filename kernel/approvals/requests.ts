// The one writer of company_os.approvals (S.5): open a request, decide it,
// cancel it, or record one decided on the spot.
//
// Request, decide, audit used to be written three times, by time off, by
// contractor requests and by the assistant, each with its own shape and its own
// audit call. Each flow still owns its domain state (a leave row's status, a
// work request's lifecycle) and still decides WHO may approve, because only it
// knows the rule; the primitive stores the request and its outcome in one
// shape, so "what is waiting on me" is one read and the next approval flow is a
// word in ./vocabulary rather than a fourth implementation.
//
// Writes answer a Result and never throw. The flow's own write has already
// landed by the time these run, and a failed approval row must not undo a leave
// decision; the failure is logged and audited instead, so it is visible.
import { companyOs, type Json } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { isPermissionAtom, type ApprovalDecision, type ApprovalSubject } from "./vocabulary";

export type ApprovalRef = { subjectType: ApprovalSubject; subjectId: string };

type Meta = Record<string, unknown>;

async function failed(what: string, ref: ApprovalRef, message: string, actor?: string | null): Promise<Result> {
  console.error(`[approvals] ${what} ${ref.subjectType}/${ref.subjectId}:`, message);
  await recordAudit({ table: "approvals", operation: "update", actor, context: { failed: what, ...ref, error: message } });
  return { ok: false, error: message };
}

/**
 * Who a pending approval waits on: one person (null for "any admin"), or
 * whoever holds a permission atom ("reimbursements.check"; RB.3). Never both: a
 * request addressed to a role and a person at once has no single answer to
 * "whose is this", so the type refuses it and so does openApproval at run time.
 */
export type ApprovalApprover =
  | { approverPersonId: string | null; approverPermission?: never }
  | { approverPermission: string; approverPersonId?: never };

/**
 * Opens a pending approval for a subject. At most one is ever pending per
 * subject (a partial unique index), so reopening one already open refreshes who
 * it waits on and what it says rather than adding a second. Both approver
 * columns are written every time, so a refresh that moves a request from a
 * permission to a person (or back) leaves the other one null.
 */
export async function openApproval(
  ref: ApprovalRef & ApprovalApprover & { requestedBy: string | null; label: string; metadata?: Meta },
  actor?: string | null,
): Promise<Result> {
  const permission = ref.approverPermission ?? null;
  if (permission !== null && ref.approverPersonId != null) {
    return failed("open", ref, "An approval waits on a person or on a permission, never both.", actor);
  }
  if (permission !== null && !isPermissionAtom(permission)) {
    return failed("open", ref, `"${permission}" is not a permission atom.`, actor);
  }
  const patch = {
    approver_person_id: ref.approverPersonId ?? null,
    approver_permission: permission,
    metadata: { label: ref.label, ...(ref.metadata ?? {}) },
  };
  const { data: open, error: readErr } = await companyOs
    .from("approvals")
    .select("id")
    .eq("subject_type", ref.subjectType)
    .eq("subject_id", ref.subjectId)
    .eq("state", "pending")
    .maybeSingle();
  if (readErr) return failed("open", ref, readErr.message, actor);
  const { error } = open
    ? await companyOs.from("approvals").update(patch).eq("id", open.id)
    : await companyOs.from("approvals").insert({
        subject_type: ref.subjectType,
        subject_id: ref.subjectId,
        requested_by: ref.requestedBy,
        state: "pending",
        ...patch,
      });
  if (error) return failed("open", ref, error.message, actor);
  await recordAudit({ table: "approvals", recordId: open?.id, operation: open ? "update" : "insert", actor, newData: { ...ref, state: "pending" } });
  return { ok: true };
}

/**
 * Records the decision on a subject's pending approval. A subject decided with
 * nothing pending (a request made before approvals existed, or one decided on
 * the spot) gets a row written already decided, so every decision leaves one.
 */
export async function decideApproval(
  ref: ApprovalRef & {
    state: ApprovalDecision;
    decidedBy: string | null;
    // Who asked, for the row written already decided when nothing was pending.
    // The assistant's admin asks and answers at once; a legacy request's asker
    // is not known here, so it stays null rather than being mislabelled.
    requestedBy?: string | null;
    reason?: string | null;
    label?: string;
    metadata?: Meta;
  },
  actor?: string | null,
): Promise<Result> {
  const decision = { state: ref.state, decided_by: ref.decidedBy, decided_at: new Date().toISOString(), reason: ref.reason ?? null };
  const { data: closed, error } = await companyOs
    .from("approvals")
    .update(decision)
    .eq("subject_type", ref.subjectType)
    .eq("subject_id", ref.subjectId)
    .eq("state", "pending")
    .select("id");
  if (error) return failed("decide", ref, error.message, actor);
  const inserted = !closed || closed.length === 0;
  if (inserted) {
    const { error: insErr } = await companyOs.from("approvals").insert({
      subject_type: ref.subjectType,
      subject_id: ref.subjectId,
      requested_by: ref.requestedBy ?? null,
      approver_person_id: ref.decidedBy,
      metadata: { label: ref.label ?? null, ...(ref.metadata ?? {}) },
      ...decision,
    });
    if (insErr) return failed("decide", ref, insErr.message, actor);
  }
  await recordAudit({ table: "approvals", recordId: closed?.[0]?.id, operation: inserted ? "insert" : "update", actor, newData: { ...ref, ...decision } });
  return { ok: true };
}

/**
 * Cancels a subject's approval: withdraws the pending one if there is one, and
 * otherwise records the cancellation after the decision it reverses.
 *
 * A subject's answer is its latest row (A.30.1). Approved leave can still be
 * cancelled, and so can an approved contractor estimate; touching only a
 * pending row left those reading "approved" for a subject that no longer was.
 * The decided row is kept and a cancelled one is appended, so the history
 * holds both who decided and who withdrew it, and the readers that take the
 * latest approved or rejected row still name the decider. Nothing on record,
 * or a latest row already cancelled, is not an error and writes nothing.
 */
export async function cancelApproval(ref: ApprovalRef & { cancelledBy: string | null }, actor?: string | null): Promise<Result> {
  const cancellation = { state: "cancelled" as const, decided_by: ref.cancelledBy, decided_at: new Date().toISOString() };
  const { data: withdrawn, error } = await companyOs
    .from("approvals")
    .update(cancellation)
    .eq("subject_type", ref.subjectType)
    .eq("subject_id", ref.subjectId)
    .eq("state", "pending")
    .select("id");
  if (error) return failed("cancel", ref, error.message, actor);
  if (withdrawn && withdrawn.length > 0) {
    await recordAudit({ table: "approvals", recordId: withdrawn[0].id, operation: "update", actor, newData: { ...ref, state: "cancelled" } });
    return { ok: true };
  }

  const { data: latest, error: readErr } = await companyOs
    .from("approvals")
    .select("state, requested_by, approver_person_id, approver_permission, metadata")
    .eq("subject_type", ref.subjectType)
    .eq("subject_id", ref.subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) return failed("cancel", ref, readErr.message, actor);
  if (!latest || latest.state === "cancelled") return { ok: true };

  const { data: appended, error: insErr } = await companyOs
    .from("approvals")
    .insert({
      subject_type: ref.subjectType,
      subject_id: ref.subjectId,
      requested_by: latest.requested_by,
      approver_person_id: latest.approver_person_id,
      approver_permission: latest.approver_permission,
      metadata: latest.metadata,
      ...cancellation,
      reason: null,
    })
    .select("id")
    .maybeSingle();
  if (insErr) return failed("cancel", ref, insErr.message, actor);
  await recordAudit({ table: "approvals", recordId: appended?.id, operation: "insert", actor, newData: { ...ref, state: "cancelled", after: latest.state } });
  return { ok: true };
}

/**
 * Withdraws a subject's pending approval, and only that. cancelApproval also
 * appends a cancellation after a decision, which is right for leave cancelled
 * once approved and wrong for an agent run restarted or stopped after its
 * draft was published: that post was approved, and nothing reverses it. A
 * subject with nothing pending writes nothing. Answers whether a row was withdrawn.
 */
export async function withdrawPendingApproval(
  ref: ApprovalRef & { cancelledBy: string | null; reason?: string | null },
  actor?: string | null,
): Promise<{ ok: true; withdrawn: boolean } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("approvals")
    .update({ state: "cancelled", decided_by: ref.cancelledBy, decided_at: new Date().toISOString(), reason: ref.reason ?? null })
    .eq("subject_type", ref.subjectType)
    .eq("subject_id", ref.subjectId)
    .eq("state", "pending")
    .select("id");
  if (error) {
    await failed("withdraw", ref, error.message, actor);
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) return { ok: true, withdrawn: false };
  await recordAudit({ table: "approvals", recordId: data[0].id, operation: "update", actor, newData: { ...ref, state: "cancelled" } });
  return { ok: true, withdrawn: true };
}

/**
 * Decides a subject's pending approval only when one is pending, and merges
 * `metadata` into that row. decideApproval records a decision even with nothing
 * pending, which is right for a flow that must leave a row; a signature must
 * not, because a second signature on an agreement already signed is a refusal,
 * not a second row. The update is conditioned on the row still being pending,
 * so two decisions racing each other produce one: the loser reads `decided: false`.
 *
 * `expect` binds the decision to the row and the version the decider checked
 * (Y.16, Y.17): openApproval refreshes a pending row's metadata in place, so
 * without it a click could decide a version asked for after the decider read
 * the page. A row that is not that one, or no longer carries that
 * metadata.version, is not decided.
 */
export async function decidePendingApproval(
  ref: ApprovalRef & {
    state: ApprovalDecision;
    decidedBy: string | null;
    reason?: string | null;
    metadata?: Meta;
    expect?: { id: string; version: string };
  },
  actor?: string | null,
): Promise<{ ok: true; decided: boolean } | { ok: false; error: string }> {
  const { data: open, error: readErr } = await companyOs
    .from("approvals")
    .select("id, metadata")
    .eq("subject_type", ref.subjectType)
    .eq("subject_id", ref.subjectId)
    .eq("state", "pending")
    .maybeSingle();
  if (readErr) {
    await failed("decide", ref, readErr.message, actor);
    return { ok: false, error: readErr.message };
  }
  if (!open) return { ok: true, decided: false };
  if (ref.expect && open.id !== ref.expect.id) return { ok: true, decided: false };
  const decision = { state: ref.state, decided_by: ref.decidedBy, decided_at: new Date().toISOString(), reason: ref.reason ?? null };
  const metadata = { ...((open.metadata ?? {}) as Meta), ...(ref.metadata ?? {}) };
  let update = companyOs
    .from("approvals")
    .update({ ...decision, metadata: metadata as Json })
    .eq("id", open.id)
    .eq("state", "pending");
  if (ref.expect) update = update.eq("metadata->>version", ref.expect.version);
  const { data: closed, error } = await update.select("id");
  if (error) {
    await failed("decide", ref, error.message, actor);
    return { ok: false, error: error.message };
  }
  if (!closed || closed.length === 0) return { ok: true, decided: false };
  await recordAudit({ table: "approvals", recordId: open.id, operation: "update", actor, newData: { ...ref, ...decision } });
  return { ok: true, decided: true };
}

/**
 * Merges `metadata` into a subject's latest approval row, whatever its state.
 * For what a flow learns after the decision (the signed copy written, the
 * invoice raised), so the record of the decision carries its consequences.
 */
export async function annotateApproval(ref: ApprovalRef & { metadata: Meta }, actor?: string | null): Promise<Result> {
  const { data: latest, error: readErr } = await companyOs
    .from("approvals")
    .select("id, metadata")
    .eq("subject_type", ref.subjectType)
    .eq("subject_id", ref.subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) return failed("annotate", ref, readErr.message, actor);
  if (!latest) return failed("annotate", ref, "No approval on record.", actor);
  const metadata = { ...((latest.metadata ?? {}) as Meta), ...ref.metadata };
  const { error } = await companyOs.from("approvals").update({ metadata: metadata as Json }).eq("id", latest.id);
  if (error) return failed("annotate", ref, error.message, actor);
  await recordAudit({ table: "approvals", recordId: latest.id, operation: "update", actor, newData: { ...ref, metadata: ref.metadata } });
  return { ok: true };
}
