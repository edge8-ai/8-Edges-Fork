"use server";

// Blocker actions, split from actions.ts for the file-size gate (BL-01).
//
// A blocker is a child task flagged metadata.kind === "blocker": its body is the
// title, the person it is tagged to (a team member or client contact) is the
// assignee, and "resolved" is the done status. It works exactly like a subtask.
// A client contact tag is attribution, not access, so a contact never becomes a
// board member. A teammate tagged does (TH.8.3, Khoa 2026-10-19), as one
// @mentioned does (W.143): the inbox tells them and links the card, and a link
// to a board they cannot open is no way to the blocker. Each action's first
// statement is `boardMutation`, so it is gated
// exactly as the actions in actions.ts (check-action-auth lists it as a guard).

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { readOr } from "@/kernel/data/read";
import { publish } from "@/kernel/events";
import { boardMutation } from "./mutation";
import { ensureMember, refresh } from "./card-helpers";
import { OPEN_STATUS } from "./card-stage";
import type { BoardActor } from "./access";

/**
 * Brings a teammate a blocker is tagged to onto the board, so the card it
 * blocks opens for them; a client contact is left as attribution. Returns why
 * that could not be done, or null, so the caller can say the blocker itself
 * was saved.
 */
async function admitTeammate(boardId: string, personId: string | null): Promise<string | null> {
  if (!personId) return null;
  const { data, error } = await companyOs.from("people").select("is_team_member").eq("id", personId).maybeSingle();
  if (error) return `could not check who it is tagged to: ${error.message}`;
  if (!(data as { is_team_member: boolean | null } | null)?.is_team_member) return null;
  return ensureMember(boardId, personId);
}

const notAdmitted = (why: string): Result => ({ ok: false, error: `Blocker saved, but the person tagged could not be added to the board, so it may not open for them: ${why}` });

/**
 * Tells the inbox a blocker was tagged to someone (TH.8.3), with the card it
 * blocks. Stated after the write; the inbox decides whether the person may
 * open the card and writes nothing when they may not (a client contact).
 */
async function announceHanded(b: { blockerId: string; taskId: string; cardTitle: string | null; body: string; assigneeId: string | null; actor: BoardActor; boardSlug: string }): Promise<void> {
  if (!b.assigneeId || b.assigneeId === b.actor.personId) return;
  await publish("board.blocker.handed", {
    blockerId: b.blockerId,
    taskId: b.taskId,
    boardSlug: b.boardSlug,
    body: b.body,
    title: b.cardTitle || undefined,
    actorName: b.actor.label || undefined,
    assigneeId: b.assigneeId,
    actorPersonId: b.actor.personId,
  });
}

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
  const gate = await boardMutation({ table: "tasks", id: parentTaskId, select: "board_id, title", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const boardId = gate.row.board_id;
  const cardTitle = (gate.row as { title?: string | null }).title ?? null;
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
  const memberErr = await admitTeammate(boardId, assigneeId);
  await announceHanded({ blockerId: data.id, taskId: parentTaskId, cardTitle, body: text, assigneeId, actor, boardSlug });
  refresh(boardSlug);
  return memberErr ? notAdmitted(memberErr) : { ok: true };
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
    .eq("status", OPEN_STATUS)
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
  const gate = await boardMutation({ table: "tasks", id: blockerId, select: "board_id, parent_task_id, title, assignee_id", label: "blocker" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const b = gate.row as { board_id: string; parent_task_id: string | null; title: string; assignee_id: string | null };
  const { error } = await companyOs.from("tasks").update({ assignee_id: assigneeId }).eq("id", blockerId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: blockerId, operation: "update", actor: actor.label, newData: { assignee_id: assigneeId } });
  // Only a tag that moved is news; the card's title names it in the inbox, and
  // a failed read of it only leaves the title out.
  const memberErr = assigneeId && assigneeId !== b.assignee_id ? await admitTeammate(b.board_id, assigneeId) : null;
  if (assigneeId && assigneeId !== b.assignee_id && b.parent_task_id) {
    const card = readOr(await companyOs.from("tasks").select("title").eq("id", b.parent_task_id).maybeSingle(), `[boards] blocker ${blockerId}: the card's title`, null);
    await announceHanded({ blockerId, taskId: b.parent_task_id, cardTitle: card?.title ?? null, body: b.title, assigneeId, actor, boardSlug });
  }
  refresh(boardSlug);
  return memberErr ? notAdmitted(memberErr) : { ok: true };
}
