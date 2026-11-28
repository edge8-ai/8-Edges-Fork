"use server";

import { revalidatePath } from "next/cache";
import { companyOs, rpcArgs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { listAssignments } from "@/entities/org/lib/equipment";
import { saigonToday } from "@/kernel/config/dates";
import type { Result } from "@/entities/crm";
import {
  EQUIPMENT_CONDITIONS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  type EquipmentStatus,
  type EquipmentType,
} from "@/entities/org/lib/equipment-shared";

export type EquipmentInput = {
  type: EquipmentType;
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  processor?: string;
  ram?: string;
  storage?: string;
  screen_size?: string;
  purchase_date?: string;
  model_year?: string;
  vendor_id?: string;
  vendor_name_raw?: string;
  invoice_ref?: string;
  cost_vnd?: string;
  cost_usd?: string;
  status?: EquipmentStatus;
  condition?: string;
  notes?: string;
  image_url?: string;
};

function refresh() {
  revalidatePath("/admin/operations/equipment");
}

// Numeric-ish fields arrive from the form as strings. Empty becomes null so a
// cleared field doesn't persist as "" or 0, and commas/currency symbols typed
// out of the spreadsheet ("43,290,000 ₫") are tolerated.
const NUMERIC = new Set(["screen_size", "model_year", "cost_vnd", "cost_usd"]);

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function clean(input: Partial<EquipmentInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") {
      out[k] = null;
      continue;
    }
    out[k] = NUMERIC.has(k) && typeof v === "string" ? toNumber(v) : v;
  }
  return out;
}

function validate(input: Partial<EquipmentInput>): string | null {
  if (input.type !== undefined && !EQUIPMENT_TYPES.includes(input.type)) return "Invalid equipment type.";
  if (input.status !== undefined && !EQUIPMENT_STATUSES.includes(input.status)) return "Invalid status.";
  if (
    input.condition !== undefined &&
    input.condition !== "" &&
    !(EQUIPMENT_CONDITIONS as readonly string[]).includes(input.condition)
  ) {
    return "Invalid condition.";
  }
  return null;
}

export async function createEquipment(input: EquipmentInput): Promise<Result & { id?: string }> {
  const { user: admin } = await requirePermission("org.operations");

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Equipment name is required." };
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const row = { ...clean(input), name, type: input.type };
  const { data, error } = await companyOs.from("equipment").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "equipment", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function updateEquipment(id: string, patch: Partial<EquipmentInput>): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");

  const invalid = validate(patch);
  if (invalid) return { ok: false, error: invalid };

  const updates = { ...clean(patch), updated_at: new Date().toISOString() };
  if ("name" in updates && !updates.name) return { ok: false, error: "Equipment name can't be empty." };

  const { error } = await companyOs.from("equipment").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "equipment", recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh();
  return { ok: true };
}

// ── Custody ────────────────────────────────────────────────────────────────
// Both go through the RPCs: closing the outgoing period, opening the incoming
// one and moving the denormalised holder have to happen together or not at all.

export async function assignEquipment(input: {
  equipmentId: string;
  personId: string;
  assignedAt?: string;
  conditionOut?: string;
  note?: string;
}): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");

  if (!input.personId) return { ok: false, error: "Pick who is taking it." };
  if (input.conditionOut && !(EQUIPMENT_CONDITIONS as readonly string[]).includes(input.conditionOut)) {
    return { ok: false, error: "Invalid condition." };
  }

  const { error } = await companyOs.rpc(
    "assign_equipment",
    rpcArgs({
      p_equipment_id: input.equipmentId,
      p_person_id: input.personId,
      p_assigned_at: input.assignedAt || saigonToday(),
      p_condition_out: input.conditionOut || null,
      p_note: input.note?.trim() || null,
      p_actor: admin.email ?? null,
    }),
  );
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "equipment",
    recordId: input.equipmentId,
    operation: "update",
    actor: admin.email,
    newData: { assigned_to: input.personId, assigned_at: input.assignedAt },
    context: { action: "assign" },
  });
  refresh();
  return { ok: true };
}

export async function returnEquipment(input: {
  equipmentId: string;
  returnedAt?: string;
  conditionIn?: string;
  note?: string;
}): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");

  if (input.conditionIn && !(EQUIPMENT_CONDITIONS as readonly string[]).includes(input.conditionIn)) {
    return { ok: false, error: "Invalid condition." };
  }

  const { error } = await companyOs.rpc(
    "return_equipment",
    rpcArgs({
      p_equipment_id: input.equipmentId,
      p_returned_at: input.returnedAt || saigonToday(),
      p_condition_in: input.conditionIn || null,
      p_note: input.note?.trim() || null,
    }),
  );
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "equipment",
    recordId: input.equipmentId,
    operation: "update",
    actor: admin.email,
    newData: { returned_at: input.returnedAt, condition_in: input.conditionIn },
    context: { action: "return" },
  });
  refresh();
  return { ok: true };
}

// ── Archive ────────────────────────────────────────────────────────────────
// Not archiveRecord(): that helper's table union covers the CRM tables only.
// Same semantics, and archiving an item that is still out closes its custody
// period first so it doesn't linger as someone's open assignment.

export async function archiveEquipment(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");

  const { data: open, error: openErr } = await companyOs
    .from("equipment_assignments")
    .select("id")
    .eq("equipment_id", id)
    .is("returned_at", null)
    .maybeSingle();
  if (openErr) return { ok: false, error: openErr.message };

  if (open) {
    const { error } = await companyOs.rpc(
      "return_equipment",
      rpcArgs({
        p_equipment_id: id,
        p_returned_at: saigonToday(),
        p_condition_in: null,
        p_note: "Closed automatically when the item was archived.",
      }),
    );
    if (error) return { ok: false, error: error.message };
  }

  const { error } = await companyOs
    .from("equipment")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .eq("id", id)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "equipment", recordId: id, operation: "archive", actor: admin.email });
  refresh();
  return { ok: true };
}

export async function restoreEquipment(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");

  const { error } = await companyOs
    .from("equipment")
    .update({ archived_at: null, archived_by: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "equipment", recordId: id, operation: "restore", actor: admin.email });
  refresh();
  return { ok: true };
}

// Read-through for the shelf: the list row carries the item but not its
// custody history, which is fetched when the drawer opens.
export async function getAssignments(equipmentId: string) {
  await requirePermission("org.operations");
  return listAssignments(equipmentId);
}

// ── Requests from /team ────────────────────────────────────────────────────
// Deciding a request records the outcome and the note the requester sees on
// their own page. Fulfilment stays manual: an admin creates the equipment row
// and assigns it, then marks the request fulfilled.

export async function decideEquipmentRequest(
  id: string,
  status: "approved" | "declined" | "fulfilled",
  note?: string,
): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");
  if (!["approved", "declined", "fulfilled"].includes(status)) {
    return { ok: false, error: "Invalid decision." };
  }

  const { error } = await companyOs
    .from("equipment_requests")
    .update({
      status,
      decided_by: admin.email ?? null,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "equipment_requests",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { status },
  });
  refresh();
  revalidatePath("/team/equipment");
  return { ok: true };
}
