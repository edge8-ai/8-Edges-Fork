"use server";

import { companyOs, type Json } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { requirePermission } from "@/kernel/identity/access-request";
import { type Result } from "@/kernel/data/result";
import { refresh } from "./card-helpers";
import { boardMutation } from "./mutation";
import { SPRINT_CHATS, WEEKLY_SPRINTS_KEY, type SprintChat } from "./sprint-cadence";

// The weekly-sprints switch on a board (WS-01): the team chat the Tuesday
// routine tells, or null to switch it off. Its own action rather than a field
// of updateBoard because it lives in the board's metadata side-car, which the
// other settings never touch.
export async function setBoardWeeklySprints(boardId: string, chat: SprintChat | null, boardSlug: string): Promise<Result> {
  const { user: admin } = await requirePermission("boards.plan");
  if (chat !== null && !SPRINT_CHATS.some((c) => c.key === chat)) return { ok: false, error: "Pick one of the team chats." };
  // One key of the side-car, so whatever else lives there is kept.
  const { data: b, error: readErr } = await companyOs.from("boards").select("metadata").eq("id", boardId).maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!b) return { ok: false, error: "Board not found." };
  const metadata = { ...((b as { metadata: Record<string, unknown> | null }).metadata ?? {}) };
  if (chat) metadata[WEEKLY_SPRINTS_KEY] = chat;
  else delete metadata[WEEKLY_SPRINTS_KEY];
  const { error } = await companyOs.from("boards").update({ metadata: metadata as Json }).eq("id", boardId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "boards", recordId: boardId, operation: "update", actor: admin.email, newData: { [WEEKLY_SPRINTS_KEY]: chat } });
  refresh(boardSlug);
  return { ok: true };
}

// Sprint planning (SP-01) renames the sprint the routine opened: the name is
// the one field the brief action does not take, since it was never editable.
export async function renameSprint(sprintId: string, name: string, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, label: "sprint" });
  if (!gate.ok) return gate;
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name the sprint." };
  const { error } = await companyOs.from("sprints").update({ name: trimmed }).eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: sprintId, operation: "update", actor: gate.actor.label, newData: { name: trimmed } });
  refresh(boardSlug);
  return { ok: true };
}

// Delete a sprint that holds nothing: one opened by mistake, or a duplicate.
// A sprint with cards (open, done or archived) cannot be deleted, because the
// cards' history names it; close it instead. Stage-log rows that only point
// at it as a from/to sprint are detached first, so the row can go.
export async function deleteSprint(sprintId: string, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "sprints", id: sprintId, label: "sprint" });
  if (!gate.ok) return gate;
  const { count, error: countErr } = await companyOs.from("tasks").select("id", { count: "exact", head: true }).eq("sprint_id", sprintId);
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) return { ok: false, error: `This sprint has ${count} card${count === 1 ? "" : "s"}. Move them out or close the sprint instead.` };
  const fromErr = (await companyOs.from("task_stage_log").update({ from_sprint_id: null }).eq("from_sprint_id", sprintId)).error;
  const toErr = fromErr ?? (await companyOs.from("task_stage_log").update({ to_sprint_id: null }).eq("to_sprint_id", sprintId)).error;
  if (toErr) return { ok: false, error: `Could not detach the sprint's history: ${toErr.message}` };
  const { error } = await companyOs.from("sprints").delete().eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: sprintId, operation: "delete", actor: gate.actor.label });
  refresh(boardSlug);
  return { ok: true };
}
