import { companyOs } from "@/kernel/data/supabase";
import { DONE_STATUS, OPEN_STATUS } from "./card-stage";

// The questions other entities ask about cards (A.68, ADR 0018). Until A.68
// the door handed out `selectTasks(columns)`, and each caller chose its columns
// and spelled a card's stage, "live" (not archived) and "top-level" (no parent)
// in its own filters. Each question here is the exact query one or more
// callers built by hand: same table, filters, order, limit and single-row
// form, with a card's stage asked in A.42's words (card-stage.ts). Where two
// callers read different columns of the same rows, the question selects their
// union; where their filters or row form differ, they are different
// questions. entities/boards/lib/card-lookups.test.ts pins each one.
//
// The selects are literal, so PostgREST types the rows and no caller casts.

// ── Cards linked to a subject (tasks.subject_type, tasks.subject_id) ─────

/** Every done card linked to a subject of this type, archived ones included (coaching's backstop for missed completions). */
export function doneCardsOfSubjectType(subjectType: string) {
  return companyOs.from("tasks").select("id, subject_id").eq("subject_type", subjectType).eq("status", DONE_STATUS);
}

/** Whether a subject has a live card, as rows of at most one (coaching's "already on the board" check). */
export function anyLiveCardOfSubject(subjectType: string, subjectId: string) {
  return companyOs.from("tasks").select("id").eq("subject_type", subjectType).eq("subject_id", subjectId).is("archived_at", null).limit(1);
}

/** A subject's live card, or null (portal's contractor work request card). */
export function liveCardOfSubject(subjectType: string, subjectId: string) {
  return companyOs
    .from("tasks")
    .select("id, board_id, status")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
}

/** The live cards of these subjects, where they sit and their stage (coaching's "on the board" note). */
export function liveCardsOfSubjects(subjectType: string, subjectIds: string[]) {
  return companyOs
    .from("tasks")
    .select("subject_id, board_id, board_column_id, status")
    .eq("subject_type", subjectType)
    .in("subject_id", subjectIds)
    .is("archived_at", null);
}

/** What a card is linked to, or null when there is no such card. */
export function cardSubject(taskId: string) {
  return companyOs.from("tasks").select("subject_type, subject_id").eq("id", taskId).maybeSingle();
}

// ── The content sync's cards on its board (campaigns) ─────────────────────

/** Every card on a board linked to one of these subjects, archived ones included (the campaign cards). */
export function cardsOfSubjectsOnBoard(boardId: string, subjectType: string, subjectIds: string[]) {
  return companyOs
    .from("tasks")
    .select("id, title, due_date, status, archived_at, subject_id, description, metadata")
    .eq("board_id", boardId)
    .eq("subject_type", subjectType)
    .in("subject_id", subjectIds);
}

/** Every top-level card on a board with this subject type, archived ones included (the content days). */
export function topCardsOfSubjectType(boardId: string, subjectType: string) {
  return companyOs.from("tasks").select("id, title, status, archived_at, metadata").eq("board_id", boardId).eq("subject_type", subjectType).is("parent_task_id", null);
}

/** The one top-level card of that type whose `metadata.content_day` is this day, or null (the content day another pass just made). */
export function contentDayCard(boardId: string, subjectType: string, day: string) {
  return companyOs
    .from("tasks")
    .select("id, title, status, archived_at, metadata")
    .eq("board_id", boardId)
    .eq("subject_type", subjectType)
    .is("parent_task_id", null)
    .eq("metadata->>content_day", day)
    .maybeSingle();
}

/**
 * The cards on a board with this subject type that are linked to one of these
 * subjects or sit under one of these parents, archived ones included (the
 * content sync's post subtasks). With neither list there is nothing to ask,
 * and the answer is no rows without a read.
 */
export async function subtasksOfSubjectsOrParents(boardId: string, subjectType: string, subjectIds: string[], parentIds: string[]) {
  const reach = [
    subjectIds.length ? `subject_id.in.(${subjectIds.join(",")})` : null,
    parentIds.length ? `parent_task_id.in.(${parentIds.join(",")})` : null,
  ].filter((c): c is string => c !== null);
  if (reach.length === 0) return { data: [], error: null };
  return companyOs
    .from("tasks")
    .select("id, parent_task_id, title, status, archived_at, subject_id")
    .eq("board_id", boardId)
    .eq("subject_type", subjectType)
    .or(reach.join(","));
}

/** A card's live children with this subject type (a content day's posts). */
export function liveChildrenOfType(parentId: string, subjectType: string) {
  return companyOs.from("tasks").select("id, status, subject_id").eq("parent_task_id", parentId).eq("subject_type", subjectType).is("archived_at", null);
}

/** The name of the board a card is on, embedded as `boards`, or null when there is no such card. */
export function boardNameOfCard(taskId: string) {
  return companyOs.from("tasks").select("boards:boards!board_id(name)").eq("id", taskId).maybeSingle();
}

// ── Cards finished by people (coaching) ───────────────────────────────────

/** A person's latest live done cards, newest first, at most `limit` (coaching's "what moved" draft). */
export function recentDoneCardsOf(personId: string, limit: number) {
  return companyOs
    .from("tasks")
    .select("id, title, status, completed_at, assignee_id")
    .eq("assignee_id", personId)
    .eq("status", DONE_STATUS)
    .is("archived_at", null)
    .order("completed_at", { ascending: false })
    .limit(limit);
}

/** The live done cards of these people completed at or after `sinceIso`, a timestamp (coaching's roster). */
export function doneCardsOfPeopleSince(personIds: string[], sinceIso: string) {
  return companyOs
    .from("tasks")
    .select("assignee_id, completed_at")
    .in("assignee_id", personIds)
    .eq("status", DONE_STATUS)
    .is("archived_at", null)
    .gte("completed_at", sinceIso);
}

/** One page, ordered by id, of the live done cards of these people completed in [sinceIso, beforeIso) (coaching's team signals). */
export function doneCardsOfPeopleBetweenPage(personIds: string[], sinceIso: string, beforeIso: string, from: number, to: number) {
  return companyOs
    .from("tasks")
    .select("assignee_id, completed_at")
    .in("assignee_id", personIds)
    .eq("status", DONE_STATUS)
    .is("archived_at", null)
    .gte("completed_at", sinceIso)
    .lt("completed_at", beforeIso)
    .order("id")
    .range(from, to);
}

// ── Counting cards per board ───────────────────────────────────────────────

/** The board of each live top-level card on these boards, one page ordered by id (the team hub's program page). */
export function liveTopCardBoardsPage(boardIds: string[], from: number, to: number) {
  return companyOs.from("tasks").select("board_id").in("board_id", boardIds).is("archived_at", null).is("parent_task_id", null).order("id").range(from, to);
}

/** The board of every open, live top-level card on every board (the innovation page's open-work count). */
export function openTopCardBoards() {
  return companyOs.from("tasks").select("board_id").eq("status", OPEN_STATUS).is("archived_at", null).is("parent_task_id", null);
}
