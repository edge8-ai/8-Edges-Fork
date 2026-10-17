import type { WorkRequestStatus } from "@/entities/company-os";
import { insertContractorWorkEvents, updateContractorWorkRequests } from "./writes";

// The one place that knows how a contractor work request may move.
//
// Before this file the legal moves were string literals spread across five
// call sites in two entities — the admin actions, the portal client helpers,
// the shared decision functions and the contractor's token page — so "can a
// client cancel approved work?" could only be answered by reading all of
// them, and each new status meant finding every literal again. The vocabulary
// (WORK_REQUEST_STATUSES and its labels) stays in company-os, which owns the
// admin presentation of it; what lives here is the *graph*: which status may
// follow which, and which actor is allowed to cause the move. The matrix is
// keyed by WorkRequestStatus, so adding a status to the vocabulary fails the
// typecheck here until its outgoing edges are declared.
//
// The tables are portal's (entities.manifest.json), so the write goes through
// portal's own writer with the caller's filters. Everything that is not the
// status move — the contractor and client emails, the ops Lark ping, the QBO
// billing run, the audit row — stays with the caller and runs after the move
// exactly as it did before.

// Who is causing the move. `contractor` is the holder of the opaque
// access_token on /work/[token] (the bearer link is the credential);
// `system` is reserved for crons and backfills, which cause no move today.
export type WorkRequestActorKind = "admin" | "client" | "contractor" | "system";

// The Result shape every work-request write returns. It lives here rather
// than in work-requests.ts so that this file — which the decision helpers
// import — does not have to import them back and close a cycle.
export type WorkRequestResult = { ok: true } | { ok: false; error: string };

export type WorkRequestEvent = {
  actor_type: "admin" | "contractor" | "system" | "client";
  actor?: string | null;
  type: string;
  body?: string | null;
  meta?: Record<string, unknown>;
};

// The timeline row. A failed event insert is logged, never surfaced: the
// status move it describes has already happened, and telling the user the
// write failed would invite them to repeat a move that did land.
export async function addWorkEvent(requestId: string, event: WorkRequestEvent): Promise<void> {
  const { error } = await insertContractorWorkEvents({
    request_id: requestId,
    actor_type: event.actor_type,
    actor: event.actor ?? null,
    type: event.type,
    body: event.body ?? null,
    // The column is jsonb; the generated Json type does not accept a plain
    // Record, and the call sites have always passed one.
    meta: (event.meta ?? {}) as never,
  });
  if (error) console.error("[work-requests] event insert failed:", error.message);
}

type Edge = { to: WorkRequestStatus; actors: readonly WorkRequestActorKind[] };

const ADMIN_OR_CLIENT = ["admin", "client"] as const;
const CONTRACTOR = ["contractor"] as const;

// Cancellation is available from every non-terminal status to admins and
// clients alike; the portal narrows it further for clients in
// client-work-requests.ts (CLIENT_CANCELLABLE), because once work is approved
// the contractor may already be mid-job.
const CANCEL: Edge = { to: "cancelled", actors: ADMIN_OR_CLIENT };

export const WORK_REQUEST_TRANSITIONS: Record<WorkRequestStatus, readonly Edge[]> = {
  // An unsent draft only ever goes out to the contractor, or away.
  draft: [{ to: "awaiting_estimate", actors: ["admin"] }, CANCEL],
  awaiting_estimate: [{ to: "estimate_submitted", actors: CONTRACTOR }, CANCEL],
  // The decision fork: approve, decline, or send it back for a new estimate.
  estimate_submitted: [
    { to: "approved", actors: ADMIN_OR_CLIENT },
    { to: "rejected", actors: ADMIN_OR_CLIENT },
    { to: "changes_requested", actors: ADMIN_OR_CLIENT },
    CANCEL,
  ],
  changes_requested: [{ to: "estimate_submitted", actors: CONTRACTOR }, CANCEL],
  scope_added: [{ to: "estimate_submitted", actors: CONTRACTOR }, CANCEL],
  // Approved work can grow (re-estimate loop) or be handed in.
  approved: [
    { to: "scope_added", actors: ADMIN_OR_CLIENT },
    { to: "work_submitted", actors: CONTRACTOR },
    CANCEL,
  ],
  // Submitted work is accepted (→ completed, then billed) or sent back.
  work_submitted: [
    { to: "completed", actors: ADMIN_OR_CLIENT },
    { to: "approved", actors: ADMIN_OR_CLIENT },
    CANCEL,
  ],
  rejected: [],
  completed: [],
  cancelled: [],
};

/** Every status the vocabulary knows, in matrix order. */
export const WORK_REQUEST_LIFECYCLE_STATUSES = Object.keys(
  WORK_REQUEST_TRANSITIONS,
) as WorkRequestStatus[];

/** The statuses `actor` may move a request in `from` to. */
export function allowedWorkRequestTransitions(
  from: string,
  actor: WorkRequestActorKind,
): WorkRequestStatus[] {
  const edges = WORK_REQUEST_TRANSITIONS[from as WorkRequestStatus] ?? [];
  return edges.filter((e) => e.actors.includes(actor)).map((e) => e.to);
}

export function canMoveWorkRequest(
  from: string,
  to: WorkRequestStatus,
  actor: WorkRequestActorKind,
): boolean {
  return allowedWorkRequestTransitions(from, actor).includes(to);
}

export type WorkRequestMove = {
  id: string;
  from: string;
  to: WorkRequestStatus;
  actor: WorkRequestActorKind;
  /** Columns the transition also writes (hours, plan text, decided_at …). */
  patch?: Record<string, unknown>;
  /**
   * The timeline row this move leaves. Omitted only where the call site left
   * none — sending a draft out is announced by the contractor's email, not by
   * an event row, and that stayed as it was.
   */
  event?: WorkRequestEvent;
  /** Message returned when the move is illegal; the call sites' own wording. */
  illegal?: string;
  /** Message returned when the update fails, instead of the Postgres text. */
  failure?: string;
};

/**
 * Perform one status move: refuse it unless the matrix allows this actor to
 * make it, update the row (always filtered by id *and* the from-status, so a
 * second concurrent actor cannot double-apply), then write the timeline row.
 */
export async function moveWorkRequest(move: WorkRequestMove): Promise<WorkRequestResult> {
  if (!canMoveWorkRequest(move.from, move.to, move.actor))
    return {
      ok: false,
      error: move.illegal ?? `A ${move.from} request cannot move to ${move.to}.`,
    };

  const { error } = await updateContractorWorkRequests({
    ...(move.patch ?? {}),
    status: move.to,
    updated_at: new Date().toISOString(),
  })
    .eq("id", move.id)
    .eq("status", move.from);
  if (error) return { ok: false, error: move.failure ?? error.message };

  if (move.event) await addWorkEvent(move.id, move.event);

  return { ok: true };
}
