"use server";

// The epic actions, split from actions.ts for the file-size gate and because
// they are one responsibility: an epic is a board-scoped domain, and creating,
// renaming, recolouring and archiving one — plus filing a card
// under one — are the whole of what a board does to them. Same shape as
// blocker-actions.ts and reorder-actions.ts: the guard (`boardMutation`) is the
// first statement of every export, so check-action-auth treats these like every
// other board action.

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";
import { EPIC_COLORS } from "./types";

function cleanEpicColor(c: string | undefined | null): string | null {
  return c && EPIC_COLORS.includes(c as (typeof EPIC_COLORS)[number]) ? c : null;
}

export async function createEpic(
  boardId: string,
  input: { name: string; color?: string; description?: string },
  boardSlug: string,
): Promise<Result & { id?: string }> {
  const gate = await boardMutation({ boardId });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the epic." };
  // sort_order no longer orders anything: since #1680 every board reads its
  // epics A to Z, and the manual reorder that wrote it is gone. It survives as
  // a creation counter, so a new epic's default colour steps through the
  // palette and two epics made in a row do not look alike (W.139).
  const { data: last, error: lastErr } = await companyOs
    .from("epics")
    .select("sort_order")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) return { ok: false, error: lastErr.message };
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;
  const row = {
    board_id: boardId,
    name,
    description: input.description?.trim() || null,
    color: cleanEpicColor(input.color) ?? EPIC_COLORS[nextOrder % EPIC_COLORS.length],
    status: "active",
    sort_order: nextOrder,
  };
  const { data, error } = await companyOs.from("epics").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "epics", recordId: data.id, operation: "insert", actor: actor.label, newData: row });
  refresh(boardSlug);
  return { ok: true, id: data.id };
}

export async function updateEpic(
  epicId: string,
  patch: { name?: string; description?: string | null; color?: string | null },
  boardSlug: string,
): Promise<Result> {
  const gate = await boardMutation({ table: "epics", id: epicId, label: "epic" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const updates: CompanyOsUpdate<"epics"> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "The epic needs a name." };
    updates.name = n;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.color !== undefined) updates.color = cleanEpicColor(patch.color);
  if (Object.keys(updates).length === 0) return { ok: true };
  const { error } = await companyOs.from("epics").update(updates).eq("id", epicId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "epics", recordId: epicId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

// Archive (or restore) an epic. Cards keep their epic_id: an archived epic drops
// out of the toolbar filter but its name/color still resolve on any tagged card.
export async function setEpicArchived(epicId: string, archived: boolean, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "epics", id: epicId, label: "epic" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const updates = archived
    ? { status: "archived", archived_at: new Date().toISOString(), archived_by: actor.label }
    : { status: "active", archived_at: null, archived_by: null };
  const { error } = await companyOs.from("epics").update(updates).eq("id", epicId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "epics",
    recordId: epicId,
    operation: archived ? "archive" : "restore",
    actor: actor.label,
  });
  refresh(boardSlug);
  return { ok: true };
}

// Link (or clear) a card's epic. Scoped to the card's board (an epic from another
// board never reaches the update).
export async function setCardEpic(taskId: string, epicId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, epic_id", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const t = gate.row as { board_id: string; epic_id: string | null };
  if (epicId) {
    const { data: epic, error: epicErr } = await companyOs
      .from("epics")
      .select("id")
      .eq("id", epicId)
      .eq("board_id", t.board_id)
      .maybeSingle();
    if (epicErr) return { ok: false, error: epicErr.message };
    if (!epic) return { ok: false, error: "That epic is not on this board." };
  }
  if (t.epic_id === epicId) return { ok: true };
  const { error } = await companyOs.from("tasks").update({ epic_id: epicId }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { epic_id: epicId } });
  refresh(boardSlug);
  return { ok: true };
}
