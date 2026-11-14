"use server";

import { cleanTokens, NEGATIVE_TOKENS } from "./tokens";
import { estimateWritten, membershipChanged, planEstimate, type EstimatePlan } from "./card-estimate";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { backlogItemInCompany } from "@/entities/client-programs";
import { recordAudit } from "@/kernel/audit/audit";
import { publish } from "@/kernel/events";
import { type Result } from "@/kernel/data/result";
import type { CardMoveOutcome } from "./land-card";
import { readOr } from "@/kernel/data/read";
import { boardMutation } from "./mutation";
import { notifyBoardAssignee } from "./notify";
import { ensureMember, mergeCardMeta, refresh } from "./card-helpers";
import { TASK_PRIORITIES, SUBJECT_COMMITMENT, SUBJECT_BACKLOG_ITEM, EPIC_COLORS, type TaskPriority } from "./types";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { createCardInput, type CreateCardInput, type CommentInput } from "./schemas";
import { saveComment, type CommentCard } from "./comment-save";
import { announcePrLink } from "./pr-stamp";
import { sparkLabelMetadata } from "./card-spark";
import { bearCard, bearSubtasks } from "./bear-card";

type CommentThreadFields = Omit<CommentInput, "body">;

function cleanPriority(p: string | undefined): TaskPriority {
  return TASK_PRIORITIES.includes(p as TaskPriority) ? (p as TaskPriority) : "p3";
}

export async function createCard(raw: CreateCardInput): Promise<CardMoveOutcome & { id?: string }> {
  const gate = await boardMutation({ boardId: raw.boardId });
  if (!gate.ok) return gate;
  const { actor } = gate;
  // The guard stays first (the action-auth check insists on it); the schema
  // runs next so everything below sees a trimmed, well-typed input.
  const parsed = createCardInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const input = parsed.data;
  const title = input.title;

  // assigned_at drives the "New" chip the assignee sees on the board; the PR
  // link is written by the same helper a saved card's Save uses.
  const metadata = {
    ...mergeCardMeta({}, { assignedAt: !!input.assigneeId, prUrl: input.prUrl?.trim() ? input.prUrl : undefined }).meta,
    ...(input.ideaId ? { idea_id: input.ideaId, ...(input.spark ? sparkLabelMetadata(input.spark) : {}) } : {}),
  } as CompanyOsUpdate<"tasks">["metadata"];
  // The birth is bearCard's (A.53): the column's status and completion date,
  // the position, the create row the card's age starts from (W.184), the audit
  // row and the events. A card made straight into Done is a completion.
  const born = await bearCard({
    card: {
      board_id: input.boardId,
      board_column_id: input.columnId,
      title,
      description: input.description?.trim() || null,
      priority: cleanPriority(input.priority),
      assignee_id: input.assigneeId || null,
      due_date: input.dueDate || null,
      human_tokens: cleanTokens(input.humanTokens),
      internal: input.internal ?? false,
      metadata,
    },
    actor,
  });
  if (!born.ok && !("persisted" in born)) return { ok: false, error: born.error };
  // A PR pasted on the new card asks HTT for its title and state now (F8),
  // before anything below can return early; the card exists from here on.
  await announcePrLink(born.id, null, metadata as Record<string, unknown>);
  if (!born.ok) {
    // The card row exists, so its id goes back with the failure and the
    // client turns its retry into an update instead of a second card.
    refresh();
    return { ok: false, persisted: true, error: born.error, id: born.id };
  }
  // The sprint is set after this by setCardSprint, which logs its own move.
  if (input.assigneeId) {
    const memberErr = await ensureMember(input.boardId, input.assigneeId);
    if (memberErr) {
      refresh();
      return { ok: false, persisted: true, error: `Card created, but the assignee could not be added to the board: ${memberErr}`, id: born.id };
    }
    // A card born in Done was announced as finished (board.card.completed),
    // and the notifications entity tells its assignee that already. An
    // "assigned to you" beside it is two notices for one moment, about work
    // nobody is being asked to do.
    if (!born.completed) {
      await notifyBoardAssignee(input.boardId, input.assigneeId, title, actor.personId, null, { taskId: born.id, actorName: actor.label });
    }
  }
  refresh();
  return { ok: true, id: born.id };
}

// Link (or clear) a card's roadmap item. Scoped to the board's client, and only
// when the card isn't already linked to a commitment (one link per card).
export async function setCardRoadmapItem(
  taskId: string,
  backlogItemId: string | null,
  boardSlug: string,
): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "id, board_id, subject_type", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const t = gate.row as { id: string; board_id: string; subject_type: string | null };
  if (t.subject_type === SUBJECT_COMMITMENT) {
    return { ok: false, error: "This card is linked to a commitment. A card links to one thing." };
  }

  if (backlogItemId) {
    const { data: board, error: boardErr } = await companyOs.from("boards").select("client_company_id").eq("id", t.board_id).maybeSingle();
    if (boardErr) return { ok: false, error: boardErr.message };
    const clientId = (board as { client_company_id: string | null } | null)?.client_company_id;
    if (!clientId) return { ok: false, error: "This board has no linked client." };
    const { data: item, error: itemErr } = await backlogItemInCompany(backlogItemId, clientId);
    if (itemErr) return { ok: false, error: itemErr.message };
    if (!item) return { ok: false, error: "That roadmap item is not on this client's roadmap." };
  }

  const updates = backlogItemId
    ? { subject_type: SUBJECT_BACKLOG_ITEM, subject_id: backlogItemId }
    : { subject_type: null, subject_id: null };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

export async function updateCard(
  taskId: string,
  patch: {
    title?: string;
    description?: string | null;
    priority?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    humanTokens?: number | null;
    prUrl?: string | null; // related PR + a short build summary of it, kept in
    buildSummary?: string | null; // metadata; "" clears the value
    // One line of context for the person the card is being handed to (W.60).
    // Optional by design: an empty line still reassigns, because this is an
    // invitation and not a required field. It is used only when the assignee
    // actually changes to somebody other than the person doing the handing.
    handoverNote?: string | null;
  },
  boardSlug: string,
): Promise<CardMoveOutcome> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, assignee_id, title, metadata", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const c = gate.row as { board_id: string; assignee_id: string | null; title: string; metadata: Record<string, unknown> };
  const boardId = c.board_id;

  const updates: CompanyOsUpdate<"tasks"> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The card needs a title." };
    updates.title = t;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.priority !== undefined) updates.priority = cleanPriority(patch.priority);
  if (patch.assigneeId !== undefined) updates.assignee_id = patch.assigneeId || null;
  const cardMeta = mergeCardMeta(c.metadata, { assignedAt: !!(patch.assigneeId && patch.assigneeId !== c.assignee_id), prUrl: patch.prUrl, buildSummary: patch.buildSummary });
  if (cardMeta.changed) updates.metadata = cardMeta.meta as CompanyOsUpdate<"tasks">["metadata"];
  if (patch.dueDate !== undefined) updates.due_date = patch.dueDate || null;
  // The estimate is DECIDED by its module (A.29.2) before anything is written, so
  // a refusal — a typed figure on a card whose subtasks are sized — stops the
  // whole save. Its value then rides in the same write as the other fields
  // (W.130): one write and one audit row, a failed write leaves no estimate
  // behind, and the parent is re-derived only once the write has landed.
  let estimate: EstimatePlan | null = null;
  if (patch.humanTokens !== undefined) {
    if (patch.humanTokens !== null && patch.humanTokens < 0) return { ok: false, error: NEGATIVE_TOKENS };
    const plan = await planEstimate(taskId, patch.humanTokens);
    if (!plan.ok) return { ok: false, error: plan.error };
    estimate = plan;
    updates.human_tokens = plan.human_tokens;
  }
  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  // Audited as soon as the write holds, so no early return below skips it.
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: updates });
  // A link set or changed asks HTT for that PR's title and state (F8), now
  // that the write holding it has landed.
  if (patch.prUrl !== undefined && updates.metadata !== undefined) await announcePrLink(taskId, c.metadata, cardMeta.meta);
  // A subtask's estimate changed: its parent follows, now that the write held.
  const problem = estimate ? await estimateWritten(estimate, actor.label) : null;
  const estimateProblem = !problem
    ? null
    : problem.reverted
      ? `its estimate was put back, because ${problem.error}. Save again to retry`
      : problem.error;
  if (patch.assigneeId) {
    const memberErr = await ensureMember(boardId, patch.assigneeId);
    if (memberErr) {
      refresh(boardSlug);
      // Both half-done writes are said, so a failed parent re-derive is not
      // hidden behind the membership failure.
      const also = estimateProblem ? `; and ${estimateProblem}` : "";
      return { ok: false, persisted: true, error: `Card saved, but the assignee could not be added to the board: ${memberErr}${also}` };
    }
    if (patch.assigneeId !== c.assignee_id) {
      // A handover carries a sentence (W.60). The line lands in two places on
      // purpose: as a comment, so it lives on the card where the next reader
      // will look, and in the DM, so the person receiving the work reads it
      // without opening anything. Self-assignment is not a handover — it
      // sends no DM and leaves no comment, exactly as before.
      const note = patch.handoverNote?.trim();
      if (note && patch.assigneeId !== actor.personId) {
        const { error: noteErr } = await companyOs
          .from("task_comments")
          .insert({ task_id: taskId, author_person_id: actor.personId, author_label: actor.label, body: note });
        // The reassignment has persisted. A comment that did not write is
        // said out loud rather than swallowed, because the context is the
        // point of the handover and the person would otherwise believe it
        // was passed on.
        if (noteErr) {
          await notifyBoardAssignee(boardId, patch.assigneeId, (updates.title as string) ?? c.title, actor.personId, note, { taskId, actorName: actor.label });
          refresh(boardSlug);
          return { ok: false, persisted: true, error: `Card reassigned and the note was sent, but it could not be saved on the card: ${noteErr.message}` };
        }
      }
      await notifyBoardAssignee(boardId, patch.assigneeId, (updates.title as string) ?? c.title, actor.personId, note ?? null, { taskId, actorName: actor.label });
    }
  }
  refresh(boardSlug);
  if (estimateProblem) return { ok: false, persisted: true, error: `Card saved, but ${estimateProblem}` };
  return { ok: true };
}

export async function archiveCard(taskId: string, boardSlug: string): Promise<CardMoveOutcome> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, parent_task_id, human_tokens", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const row = gate.row as { board_id: string; parent_task_id: string | null; human_tokens: number | null };
  const updates = { archived_at: new Date().toISOString(), archived_by: actor.label };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId).is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "archive", actor: actor.label });
  // An archived subtask leaves its parent's sum; the parent is worth what remains.
  if (row.parent_task_id) {
    const parentErr = await membershipChanged(row.parent_task_id, row.human_tokens !== null);
    if (parentErr) {
      refresh(boardSlug);
      return { ok: false, persisted: true, error: `Card archived, but ${parentErr}` };
    }
  }
  refresh(boardSlug);
  return { ok: true };
}

// Hide/show a card in the linked client's portal (client boards only in the UI).
export async function setCardInternal(taskId: string, internal: boolean, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const { error } = await companyOs.from("tasks").update({ internal }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { internal } });
  refresh(boardSlug);
  return { ok: true };
}

// ── Subtasks (checklist under a card) ─────────────────────────────────────
export async function addSubtask(parentTaskId: string, title: string, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: parentTaskId, label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const boardId = gate.row.board_id;
  const t = title?.trim();
  if (!t) return { ok: false, error: "Give the subtask a title." };
  const { data, error } = await bearSubtasks({ board_id: boardId, parent_task_id: parentTaskId, title: t, status: "open", priority: "p3", position: 0 })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: data.id, operation: "insert", actor: actor.label, newData: { parent_task_id: parentTaskId, title: t } });
  refresh(boardSlug);
  return { ok: true };
}

export async function toggleSubtask(subtaskId: string, done: boolean, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: subtaskId, select: "id, board_id, title, parent_task_id, subject_type, subject_id", label: "subtask" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const sub = gate.row as unknown as { title: string; parent_task_id: string | null; subject_type: string | null; subject_id: string | null };
  const { error } = await companyOs
    .from("tasks")
    .update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null })
    .eq("id", subtaskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: subtaskId, operation: "update", actor: actor.label, newData: { status: done ? "done" : "open" } });
  refresh(boardSlug);
  // A subtask may stand for something outside the board (a post on the
  // content calendar); whoever owns that thing listens. The tick has landed
  // and been audited whatever the listener does, so the announcement runs
  // after the response (W.194): the inbox's listener alone is half a dozen
  // sequential reads and a write, and the person ticking the box was waiting
  // on every one of them before the box would change.
  after(async () => {
    const parent = await subtaskParent(sub.parent_task_id);
    await publish("board.subtask.toggled", {
      subtaskId,
      parentTaskId: sub.parent_task_id,
      done,
      subjectType: sub.subject_type,
      subjectId: sub.subject_id,
      title: sub.title,
      boardSlug,
      actorPersonId: actor.personId,
      ...(parent ? { assigneeId: parent.assignee_id, parentTitle: parent.title } : {}),
    });
  });
  return { ok: true };
}

// The parent card's title and assignee, which the tick event states for the
// inbox (S.3): a subtask belongs to whoever owns its card. A failed read only
// leaves the event unaddressed, so the inbox skips it; the tick itself landed.
async function subtaskParent(parentId: string | null): Promise<{ title: string; assignee_id: string | null } | null> {
  if (!parentId) return null;
  return readOr(await companyOs.from("tasks").select("title, assignee_id").eq("id", parentId).maybeSingle(), "[boards/actions] subtask parent", null);
}

// ── Comments ──────────────────────────────────────────────────────────────
// A reply names its thread and a comment may @mention people (W.143); the
// rest of the work lives in comment-save.ts, and resolving is in comment-actions.ts.
export async function addComment(taskId: string, body: string, boardSlug: string, thread: CommentThreadFields = {}): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, title, assignee_id", label: "card" });
  if (!gate.ok) return gate;
  const card = gate.row as Omit<CommentCard, "id">;
  return saveComment(gate.actor, { ...card, id: taskId }, { ...thread, body }, boardSlug);
}

// Restore an archived card (bring it back to its board/column).
export async function restoreCard(taskId: string, boardSlug: string): Promise<CardMoveOutcome> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, parent_task_id, human_tokens", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const row = gate.row as { board_id: string; parent_task_id: string | null; human_tokens: number | null };
  const { error } = await companyOs.from("tasks").update({ archived_at: null, archived_by: null }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "restore", actor: actor.label });
  // A restored subtask rejoins its parent's sum.
  if (row.parent_task_id) {
    const parentErr = await membershipChanged(row.parent_task_id, row.human_tokens !== null);
    if (parentErr) {
      refresh(boardSlug);
      return { ok: false, persisted: true, error: `Card restored, but ${parentErr}` };
    }
  }
  refresh(boardSlug);
  return { ok: true };
}
