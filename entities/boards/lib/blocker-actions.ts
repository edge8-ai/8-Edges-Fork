"use server";

// Blocker actions, split from actions.ts for the file-size gate (BL-01).
//
// A blocker is a child task flagged metadata.kind === "blocker": its body is the
// title, the person it is tagged to (a team member or client contact) is the
// assignee, and "resolved" is the done status. It works exactly like a subtask,
// and never becomes a board member — a client contact tag is attribution, not
// access. Each action's first statement is `boardMutation`, so it is gated
// exactly as the actions in actions.ts (check-action-auth lists it as a guard).

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";

// A blocker may NAME the card it is waiting on (W.56). The link is optional
// and free text still works; what it buys is that "waiting on the auth
// migration" can point at the card that IS the auth migration, instead of the
// link existing in somebody's head and nowhere else.
//
// THIS IS ONE LINK, NOT A DEPENDENCY GRAPH, and the difference is that a
// graph SCHEDULES while a link merely POINTS. Nothing in this file or in any
// reader derives a date, an order or a critical path from it: no start_date,
// no rescheduling, no arrows. Q6 (2026-09-17, true Gantt is off the list)
// stays closed and this does not reopen it.
//
// Returns null when `taskId` may be named, or the reason it may not.
async function checkBlockedBy(taskId: string, boardId: string, parentTaskId: string): Promise<string | null> {
  if (taskId === parentTaskId) return "A card cannot be waiting on itself.";
  const { data, error } = await companyOs
    .from("tasks")
    .select("id, board_id, parent_task_id, archived_at")
    .eq("id", taskId)
    .maybeSingle();
  // A failed lookup is not "no such card": saying so would send the user
  // hunting for a card that is still there.
  if (error) return `Could not check that card: ${error.message}`;
  const t = data as { board_id: string | null; parent_task_id: string | null; archived_at: string | null } | null;
  if (!t || t.archived_at) return "That card is not on this board.";
  // Same board only, and a top-level card only. A blocker pointing at another
  // card's subtask would be a link into someone else's checklist, which is a
  // different thing from "this card is waiting on that card".
  if (t.board_id !== boardId || t.parent_task_id) return "That card is not on this board.";
  return null;
}

export async function addBlocker(
  parentTaskId: string,
  body: string,
  assigneeId: string | null,
  boardSlug: string,
  blockedByTaskId?: string | null,
): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: parentTaskId, label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const boardId = gate.row.board_id;
  const text = body?.trim();
  if (!text) return { ok: false, error: "Describe the blocker." };
  if (blockedByTaskId) {
    const refused = await checkBlockedBy(blockedByTaskId, boardId, parentTaskId);
    if (refused) return { ok: false, error: refused };
  }
  const metadata = blockedByTaskId ? { kind: "blocker", blocked_by_task_id: blockedByTaskId } : { kind: "blocker" };
  const { data, error } = await companyOs
    .from("tasks")
    .insert({ board_id: boardId, parent_task_id: parentTaskId, title: text, assignee_id: assigneeId, status: "open", priority: "p3", position: 0, metadata })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: data.id, operation: "insert", actor: actor.label, newData: { parent_task_id: parentTaskId, kind: "blocker", title: text, assignee_id: assigneeId, blocked_by_task_id: blockedByTaskId ?? null } });
  refresh(boardSlug);
  return { ok: true };
}

/** Point an existing blocker at a card, or clear the link (W.56). */
export async function setBlockerCard(blockerId: string, taskId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: blockerId, select: "board_id, parent_task_id, metadata", label: "blocker" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const b = gate.row as { board_id: string; parent_task_id: string | null; metadata: Record<string, unknown> | null };
  if (taskId) {
    const refused = await checkBlockedBy(taskId, b.board_id, b.parent_task_id ?? "");
    if (refused) return { ok: false, error: refused };
  }
  const meta = { ...(b.metadata ?? {}) };
  if (taskId) meta.blocked_by_task_id = taskId;
  else delete meta.blocked_by_task_id;
  const updates: CompanyOsUpdate<"tasks"> = { metadata: meta as CompanyOsUpdate<"tasks">["metadata"] };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", blockerId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: blockerId, operation: "update", actor: actor.label, newData: { blocked_by_task_id: taskId } });
  refresh(boardSlug);
  return { ok: true };
}

/**
 * Resolve every open blocker that names this card (W.56).
 *
 * Offered, never automatic. Finishing a card is strong evidence that what was
 * waiting on it can go, but it is the person who decides — a card can be
 * closed for reasons that leave the thing somebody else was waiting for
 * undone, and quietly ticking three other people's blockers would be the
 * board asserting something it does not know.
 */
export async function resolveBlockersNaming(taskId: string, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const { error } = await companyOs
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("metadata->>blocked_by_task_id", taskId)
    // Open ones only (W.139). "Not done" also caught a blocker closed with its
    // card in Not Doing, and stamped it finished with a completion date.
    .eq("status", "open")
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { resolved_blockers_naming: taskId } });
  refresh(boardSlug);
  return { ok: true };
}

export async function toggleBlocker(blockerId: string, resolved: boolean, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: blockerId, label: "blocker" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const { error } = await companyOs
    .from("tasks")
    .update({ status: resolved ? "done" : "open", completed_at: resolved ? new Date().toISOString() : null })
    .eq("id", blockerId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: blockerId, operation: "update", actor: actor.label, newData: { resolved } });
  refresh(boardSlug);
  return { ok: true };
}

export async function setBlockerAssignee(blockerId: string, assigneeId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: blockerId, label: "blocker" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const { error } = await companyOs.from("tasks").update({ assignee_id: assigneeId }).eq("id", blockerId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: blockerId, operation: "update", actor: actor.label, newData: { assignee_id: assigneeId } });
  refresh(boardSlug);
  return { ok: true };
}
