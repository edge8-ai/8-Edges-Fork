"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAuditMany } from "@/kernel/audit/audit";
import { archiveRecord, guardedDelete } from "@/entities/crm/lib/mutations";
import { clearedForecastInputs, forecastEditError, forecastInputsError, type StageRow } from "@/entities/crm/lib/deal-stage";
import { moveDealToStage } from "@/entities/crm/lib/deal-close";
import { personIdForEmailOrNull } from "@/kernel/identity/person-by-email";

// The list view's multi-select actions, moved out of actions.ts when that file
// reached its size cap (RH-2). A bulk stage move is one move per deal through
// crm/lib/deal-close, so it obeys everything a single move does: the forecast
// gate, the stage's default probability, the stage log the database writes, and
// the lead (a bulk reopen of a won or lost deal puts the person back on an open
// deal). The whole batch is refused up front when any deal fails the gate.

type BulkResult = { ok: true; message?: string } | { ok: false; error: string };

function refresh() {
  revalidateSurfaces("/revenue/deals");
  revalidateSurfaces("/revenue/leads");
}

export type BulkDealPatch = {
  stage_id?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  source?: string | null;
};

export async function bulkUpdateDeals(ids: string[], patch: BulkDealPatch): Promise<BulkResult> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  // Everything but the stage, written for the whole selection in one update.
  const fields: CompanyOsUpdate<"deals"> = {};
  let toStageId: string | null = null;
  if (patch.stage_id !== undefined) {
    const { data: stage, error } = await companyOs.from("pipeline_stages").select("is_won, is_lost")
      .eq("id", patch.stage_id)
      .maybeSingle();
    if (error || !stage) return { ok: false, error: error?.message ?? "Unknown stage." };
    if (stage.is_won || stage.is_lost) {
      return { ok: false, error: "Bulk move is limited to open stages. Close won/lost deals one at a time." };
    }
    toStageId = patch.stage_id;
  }
  if (patch.probability !== undefined) {
    if (patch.probability == null) fields.probability = null;
    else {
      const p = Math.round(patch.probability);
      if (p < 0 || p > 100) return { ok: false, error: "Probability must be between 0 and 100." };
      fields.probability = p;
    }
  }
  if (patch.expected_close_date !== undefined) fields.expected_close_date = patch.expected_close_date || null;
  if (patch.source !== undefined) fields.source = patch.source?.trim() || null;

  if (!toStageId && Object.keys(fields).length === 0) {
    return { ok: false, error: "Nothing to change. Fill at least one field." };
  }

  // Where each deal is now, and whether every one of them may enter the stage,
  // or, with no move, keep the stage it is in: a deal at Proposal or later may
  // not lose its expected close date to the edit (R.23).
  let moving: string[] = [];
  if (toStageId || clearedForecastInputs(fields).length > 0) {
    const [rowsRes, stagesRes] = await Promise.all([
      companyOs.from("deals").select("id, stage_id, amount_cents, expected_close_date").in("id", ids),
      companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").order("position"),
    ]);
    if (rowsRes.error) return { ok: false, error: rowsRes.error.message };
    if (stagesRes.error) return { ok: false, error: stagesRes.error.message };
    const before = (rowsRes.data ?? []) as { id: string; stage_id: string | null; amount_cents: number | null; expected_close_date: string | null }[];
    const stages = (stagesRes.data ?? []) as StageRow[];
    const refusals = before
      .map((d) => (toStageId ? forecastInputsError(stages, toStageId, d, fields) : forecastEditError(stages, d.stage_id, fields)))
      .filter((e): e is string => e !== null);
    if (refusals.length > 0) {
      // One message for the batch: the first deal's reason, which names the
      // stage and what it needs, prefixed with how many are held back.
      return { ok: false, error: `${refusals.length} of ${ids.length} selected deals cannot ${toStageId ? "move" : "change"}. ${refusals[0]}` };
    }
    if (toStageId) moving = before.filter((d) => d.stage_id !== toStageId).map((d) => d.id);
  }

  // The other fields first, so a forecast input set in the same edit is on the
  // row before the move's own gate reads it.
  if (Object.keys(fields).length > 0) {
    const { error } = await companyOs.from("deals").update(fields).in("id", ids);
    if (error) return { ok: false, error: error.message };
  }

  // From here something has landed, so every way out records the audit for what
  // did: the fields on every selected deal, and the stage on the deals that moved.
  const moved: string[] = [];
  const failures: string[] = [];
  if (toStageId) {
    const mover = { email: admin.email, personId: await personIdForEmailOrNull(admin.email, "crm/deals") };
    for (const dealId of moving) {
      const res = await moveDealToStage({ dealId, toStageId, mover, note: "bulk edit" });
      if (res.ok) moved.push(dealId);
      else failures.push(res.error);
    }
    // A probability the edit named outlasts the stage's default, which the
    // move applied on entry.
    if (fields.probability !== undefined && moved.length > 0) {
      const { error } = await companyOs.from("deals").update({ probability: fields.probability }).in("id", moved);
      if (error) failures.push(error.message);
    }
    // Bulk-moved deals land at the bottom of the destination stage's priority
    // order, appended after whatever was already there.
    const { count: existing, error: existingErr } = await companyOs.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", toStageId).not("id", "in", `(${ids.join(",")})`);
    if (existingErr) failures.push(existingErr.message);
    else {
      const { error: posErr } = await companyOs.rpc("set_deal_positions", { p_ids: ids, p_start: existing ?? 0 });
      if (posErr) failures.push(posErr.message);
    }
  }

  const movedSet = new Set(moved);
  await recordAuditMany(
    ids
      .map((id) => ({
        table: "deals",
        recordId: id,
        operation: "bulk_update" as const,
        actor: admin.email,
        newData: { ...fields, ...(toStageId && movedSet.has(id) ? { stage_id: toStageId } : {}) },
      }))
      .filter((row) => Object.keys(row.newData).length > 0),
  );
  refresh();
  if (failures.length > 0) {
    return { ok: false, error: `${failures.length} step${failures.length === 1 ? "" : "s"} of the edit did not land. ${failures[0]}` };
  }
  return { ok: true, message: `Updated ${ids.length} deal${ids.length === 1 ? "" : "s"}.` };
}

export async function bulkArchiveDeals(ids: string[]): Promise<BulkResult> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  const { error } = await companyOs.from("deals").update({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .in("id", ids)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAuditMany(
    ids.map((id) => ({ table: "deals", recordId: id, operation: "bulk_archive" as const, actor: admin.email })),
  );
  refresh();
  return { ok: true, message: `Archived ${ids.length} deal${ids.length === 1 ? "" : "s"}.` };
}

type BulkDeleteResult =
  | { ok: true; message?: string; deletedIds: string[] }
  | { ok: false; error: string };

export async function bulkDeleteDeals(ids: string[]): Promise<BulkDeleteResult> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  const deletedIds: string[] = [];
  let blocked = 0;
  for (const id of ids) {
    const r = await guardedDelete("deals", id, admin.email, { via: "deals_bulk" });
    if (r.ok) deletedIds.push(id);
    else blocked += 1;
  }
  refresh();
  if (deletedIds.length === 0) {
    return { ok: false, error: `None deleted — ${blocked} still referenced by inquiries or projects. Archive them instead.` };
  }
  return {
    ok: true,
    deletedIds,
    message:
      blocked > 0
        ? `Deleted ${deletedIds.length}, kept ${blocked} still referenced.`
        : `Deleted ${deletedIds.length} deal${deletedIds.length === 1 ? "" : "s"}.`,
  };
}
