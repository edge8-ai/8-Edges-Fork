"use server";

// Sprint actions, split out of actions.ts by responsibility: opening a sprint,
// committing a card to one, closing one and rolling its unfinished cards on,
// and the sprint's brief (goal, retro takeaways, the meeting it came from).
// None of them edits what a card SAYS, which is what actions.ts is left
// holding, and the two sets share no state beyond the board gate.
//
// Each action's first statement is `boardMutation`, so it is gated exactly as
// the actions in actions.ts (check-action-auth lists it as a guard).

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";
import { sprintDatesRefusal, sprintWeek } from "./sprint-cadence";
import { sprintLockRefusal, type LockableSprint } from "./sprint-lock";
import { saigonToday } from "@/kernel/config/dates";

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

export async function setCardSprint(taskId: string, sprintId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, sprint_id", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const t = gate.row as { board_id: string; sprint_id: string | null };
  if (t.sprint_id === sprintId) return { ok: true };
  // Both ends of the move, in one read: the requested sprint must be on this
  // board, and neither end may be a locked sprint still in its planning
  // window (W.120) — the drawer and the list reach this action as well as the
  // planning panel, and only the panel knew about the lock.
  const ids = [sprintId, t.sprint_id].filter((id): id is string => id !== null);
  const { data: rows, error: sprintErr } = await companyOs
    .from("sprints")
    .select("id, board_id, name, locked_at, starts_on")
    .in("id", ids);
  if (sprintErr) return { ok: false, error: sprintErr.message };
  const byId = new Map(((rows ?? []) as (LockableSprint & { id: string; board_id: string })[]).map((s) => [s.id, s]));
  const to = sprintId ? byId.get(sprintId) : null;
  if (sprintId && (!to || to.board_id !== t.board_id)) return { ok: false, error: "That sprint is not on this board." };
  const refusal = sprintLockRefusal(t.sprint_id ? byId.get(t.sprint_id) ?? null : null, to ?? null, saigonToday());
  if (refusal) return { ok: false, error: refusal };
  const { error } = await companyOs.from("tasks").update({ sprint_id: sprintId }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  const { error: logErr } = await companyOs
    .from("task_stage_log")
    .insert({ task_id: taskId, from_sprint_id: t.sprint_id, to_sprint_id: sprintId, kind: "sprint_move", moved_by: actor.personId });
  if (logErr) {
    refresh(boardSlug);
    return { ok: false, error: `Sprint changed, but the stage history could not be written: ${logErr.message}` };
  }
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { sprint_id: sprintId } });
  refresh(boardSlug);
  return { ok: true };
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
): Promise<Result> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, label: "sprint" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const boardId = gate.row.board_id;
  if (rolloverToSprintId) {
    const { data: target, error: targetErr } = await companyOs
      .from("sprints")
      .select("id")
      .eq("id", rolloverToSprintId)
      .eq("board_id", boardId)
      .maybeSingle();
    if (targetErr) return { ok: false, error: targetErr.message };
    if (!target) return { ok: false, error: "That sprint is not on this board." };
  }

  const { data: openCards, error: openErr } = await companyOs
    .from("tasks")
    .select("id")
    .eq("sprint_id", sprintId)
    .eq("status", "open")
    .is("archived_at", null);
  // If this read fails we must not go on to close the sprint: an empty list
  // here would silently strand every unfinished card in a closed sprint.
  if (openErr) return { ok: false, error: `Could not load the sprint's open cards: ${openErr.message}` };
  const ids = ((openCards ?? []) as { id: string }[]).map((c) => c.id);
  if (ids.length) {
    const { error: upErr } = await companyOs.from("tasks").update({ sprint_id: rolloverToSprintId }).in("id", ids);
    if (upErr) return { ok: false, error: upErr.message };
    const { error: logErr } = await companyOs.from("task_stage_log").insert(
      ids.map((id) => ({
        task_id: id,
        from_sprint_id: sprintId,
        to_sprint_id: rolloverToSprintId,
        kind: "sprint_rollover",
        moved_by: actor.personId,
      })),
    );
    // Cards have already rolled over; the sprint stays open so the user sees
    // the state is half-applied and can close it again once history writes.
    if (logErr) {
      refresh(boardSlug);
      return { ok: false, error: `Cards rolled over, but the stage history could not be written: ${logErr.message}` };
    }
  }
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
export async function setSprintMeeting(sprintId: string, meetingId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, label: "sprint" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  if (meetingId) {
    const { data: m, error: meetingErr } = await (await import("@/entities/crm")).selectMeetings("id").eq("id", meetingId).maybeSingle();
    if (meetingErr) return { ok: false, error: meetingErr.message };
    if (!m) return { ok: false, error: "Meeting not found." };
  }
  const { error } = await companyOs.from("sprints").update({ meeting_id: meetingId }).eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: sprintId, operation: "update", actor: actor.label, newData: { meeting_id: meetingId } });
  refresh(boardSlug);
  return { ok: true };
}

// Extract this client's slice of the attached meeting into a DRAFT brief. Reads
// the transcript, returns the draft for review; saving is a separate, explicit
// updateSprintBrief call by the user.
export async function pullSprintBriefFromMeeting(
  sprintId: string,
): Promise<{ ok: true; draft: { goal: string | null; focusImprovement: string | null; goingWell: string | null; meetingSummary: string | null } } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, select: "board_id, meeting_id", label: "sprint" });
  if (!gate.ok) return gate;
  const s = gate.row as { board_id: string; meeting_id: string | null };
  if (!s.meeting_id) return { ok: false, error: "Attach a meeting first." };

  const { data: board, error: briefBoardErr } = await companyOs
    .from("boards")
    .select("client_company_id, name")
    .eq("id", s.board_id)
    .maybeSingle();
  if (briefBoardErr) return { ok: false, error: briefBoardErr.message };
  const b = board as { client_company_id: string | null; name: string } | null;
  let clientName = b?.name ?? "";
  if (b?.client_company_id) {
    const { data: co, error: coErr } = await selectCompanies("name").eq("id", b.client_company_id).maybeSingle();
    if (coErr) console.error("[boards] companies", coErr);
    clientName = (co as { name: string } | null)?.name ?? clientName;
  }

  // Deliberately dynamic and through the door: turning a meeting transcript
  // into a sprint brief reads crm's call_transcripts. A static import here
  // would put boards above an entity that renders boards. Loading it at call
  // time keeps the static graph a DAG and makes the feature optional.
  const { extractSprintBrief } = await import("@/entities/crm");
  const r = await extractSprintBrief(s.meeting_id, clientName);
  if (!r.ok) return r;
  return {
    ok: true,
    draft: {
      goal: r.draft.goal,
      focusImprovement: r.draft.focus_improvement,
      goingWell: r.draft.going_well,
      meetingSummary: r.draft.meeting_summary,
    },
  };
}

