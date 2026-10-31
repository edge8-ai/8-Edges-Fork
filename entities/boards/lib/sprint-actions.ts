"use server";

// Sprint actions, split out of actions.ts by responsibility: opening a sprint,
// committing a card to one, closing one and rolling its unfinished cards on,
// and the sprint's brief (goal, retro takeaways, the meeting it came from;
// drafting it from that meeting is crm's, which keeps the meetings).
// None of them edits what a card SAYS, which is what actions.ts is left
// holding, and the two sets share no state beyond the board gate.
//
// Each action's first statement is `boardMutation`, so it is gated exactly as
// the actions in actions.ts (check-action-auth lists it as a guard).

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";
import { landInSprint } from "./land-in-sprint";
import type { CardMoveOutcome } from "./land-card";
import { sprintDatesRefusal, sprintWeek } from "./sprint-cadence";
import { saigonToday } from "@/kernel/config/dates";
import { OPEN_STATUS } from "./card-stage";

const FOREIGN_KEY_VIOLATION = "23503";

export async function createSprint(
  boardId: string,
  input: { name: string; startsOn?: string; endsOn?: string; goal?: string },
  boardSlug: string,
): Promise<Result & { id?: string }> {
  const gate = await boardMutation({ boardId });
  if (!gate.ok) return gate;
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the sprint." };
  const refusal = sprintDatesRefusal(input.startsOn || undefined, input.endsOn || undefined, saigonToday());
  if (refusal) return { ok: false, error: refusal };
  const row = {
    board_id: boardId,
    name,
    starts_on: input.startsOn || null, ends_on: input.endsOn || null,
    goal: input.goal?.trim() || null,
    status: "active",
    week: input.startsOn ? sprintWeek(input.startsOn) : null, // the company week of its first day (SW-01)
  };
  const { data, error } = await companyOs.from("sprints").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: data.id, operation: "insert", actor: gate.actor.label, newData: row });
  refresh(boardSlug);
  return { ok: true, id: data.id };
}

// A CardMoveOutcome rather than a Result (A.54): "committed, but the history
// could not be written" is a commit the drawer keeps, and a Result erased the
// mark that says so before the screen could read it.
export async function setCardSprint(taskId: string, sprintId: string | null, boardSlug: string): Promise<CardMoveOutcome> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, sprint_id", label: "card" });
  if (!gate.ok) return gate;
  const t = gate.row as { board_id: string; sprint_id: string | null };
  if (t.sprint_id === sprintId) return { ok: true };
  // The lock applies at both ends (W.120): the drawer and the list reach this
  // action as well as the planning panel, and only the panel knew about it.
  return landInSprint({
    taskIds: [taskId],
    actor: gate.actor,
    boardId: t.board_id,
    from: t.sprint_id,
    to: sprintId,
    kind: "sprint_move",
    lock: "apply",
    logNote: null,
    refreshSlugs: [boardSlug],
  });
}

// Close a sprint: roll its unfinished (not done, not archived) cards to the
// chosen next sprint or back to backlog (null), logging each rollover.
// Exempt from the sprint lock (W.120): Finish planning closes last week's
// sprint, which was itself locked a week earlier, and closing is the act the
// lock exists to make possible rather than a change to a commitment.
export async function closeSprint(
  sprintId: string,
  rolloverToSprintId: string | null,
  boardSlug: string,
): Promise<CardMoveOutcome> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, label: "sprint" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const boardId = gate.row.board_id;

  const { data: openCards, error: openErr } = await companyOs
    .from("tasks")
    .select("id")
    .eq("sprint_id", sprintId)
    .eq("status", OPEN_STATUS)
    .is("archived_at", null);
  // If this read fails we must not go on to close the sprint: an empty list
  // here would silently strand every unfinished card in a closed sprint.
  if (openErr) return { ok: false, error: `Could not load the sprint's open cards: ${openErr.message}` };
  const ids = ((openCards ?? []) as { id: string }[]).map((c) => c.id);
  // The rollover is one landing for every unfinished card. It runs even when
  // there are none, because it is also where the target is checked against
  // this board: a close naming another board's sprint is refused either way.
  const rolled = await landInSprint({
    taskIds: ids,
    actor,
    boardId,
    from: sprintId,
    to: rolloverToSprintId,
    kind: "sprint_rollover",
    lock: "exempt",
    logNote: null,
    refreshSlugs: [boardSlug],
  });
  // On a failure after the cards rolled over, the sprint stays open so the
  // user sees the state is half-applied and can close it again once the
  // history writes; the rolled cards are already audited. The rollover's
  // `persisted` mark is dropped on purpose (A.54): what the person asked for
  // is a closed sprint, and it is still open, so this is a refusal they retry.
  if (!rolled.ok) return { ok: false, error: rolled.error };
  const { error } = await companyOs
    .from("sprints")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "sprints",
    recordId: sprintId,
    operation: "update",
    actor: actor.label,
    newData: { status: "closed", rolled: ids.length, to: rolloverToSprintId },
  });
  refresh(boardSlug);
  return { ok: true };
}

// Update a sprint's brief: goal, the retro takeaways, and the client-specific
// meeting summary. Any board actor may edit (same gate as card writes).
export async function updateSprintBrief(
  sprintId: string,
  patch: { goal?: string | null; focusImprovement?: string | null; goingWell?: string | null; meetingSummary?: string | null },
  boardSlug: string,
): Promise<Result> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, label: "sprint" });
  if (!gate.ok) return gate;
  const { actor } = gate;

  const updates: CompanyOsUpdate<"sprints"> = {};
  if (patch.goal !== undefined) updates.goal = patch.goal?.trim() || null;
  if (patch.focusImprovement !== undefined) updates.focus_improvement = patch.focusImprovement?.trim() || null;
  if (patch.goingWell !== undefined) updates.going_well = patch.goingWell?.trim() || null;
  if (patch.meetingSummary !== undefined) updates.meeting_summary = patch.meetingSummary?.trim() || null;
  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("sprints").update(updates).eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: sprintId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

// Attach (or detach) the planning/retro meeting for a sprint. The meeting is a
// company_os.meetings row; the same meeting may be attached to many sprints.
// The foreign key (sprints_meeting_id_fkey) is what refuses an id that names
// no meeting, so boards need not ask crm, which keeps the meetings, first.
export async function setSprintMeeting(sprintId: string, meetingId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, label: "sprint" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const { error } = await companyOs.from("sprints").update({ meeting_id: meetingId }).eq("id", sprintId);
  if (error?.code === FOREIGN_KEY_VIOLATION) return { ok: false, error: "Meeting not found." };
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: sprintId, operation: "update", actor: actor.label, newData: { meeting_id: meetingId } });
  refresh(boardSlug);
  return { ok: true };
}

