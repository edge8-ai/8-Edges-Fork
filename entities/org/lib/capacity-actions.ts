"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import {
  capacityCommitmentSchema,
  capacityRoleSchema,
  type CapacityCommitmentInput,
  type CapacityRoleInput,
} from "./capacity-schemas";

// The writes behind Operations -> Capacity (S.7): roles and the commitments
// against them. They live in lib/ rather than beside the page because the
// screen's client components under routes/ receive them as imports, and org
// owns both tables. Each guards first, parses second, audits after the write.
//
// Archive, never delete: a commitment that was on the books is part of why a
// past deal was or was not taken, and archiving is reversible.

const PATH = "/admin/operations/capacity";
const zId = z.string().uuid();

// Postgres's unique_violation. The only unique column in either table is a
// role's name, so the code alone says which rule was broken.
const UNIQUE_VIOLATION = "23505";

function roleRow(v: z.output<typeof capacityRoleSchema>) {
  return {
    name: v.name,
    position_id: v.positionId,
    hours_per_week: v.hoursPerWeek,
    effective_from: v.effectiveFrom,
  };
}

function commitmentRow(v: z.output<typeof capacityCommitmentSchema>) {
  return {
    role_id: v.roleId,
    company_id: v.companyId,
    hours_per_week: v.hoursPerWeek,
    starts_on: v.startsOn,
    ends_on: v.endsOn,
    source: v.source,
    note: v.note,
  };
}

function writeError(error: { code?: string; message: string }): string {
  return error.code === UNIQUE_VIOLATION ? "A role with that name already exists." : error.message;
}

export async function createCapacityRole(raw: CapacityRoleInput): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");
  const parsed = capacityRoleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const row = roleRow(parsed.data);
  const { data, error } = await companyOs.from("capacity_roles").insert(row).select("id").single();
  if (error) return { ok: false, error: writeError(error) };

  await recordAudit({ table: "capacity_roles", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateCapacityRole(id: string, raw: CapacityRoleInput): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");
  if (!zId.safeParse(id).success) return { ok: false, error: "Not a valid role." };
  const parsed = capacityRoleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const row = roleRow(parsed.data);
  const { error } = await companyOs.from("capacity_roles").update(row).eq("id", id);
  if (error) return { ok: false, error: writeError(error) };

  await recordAudit({ table: "capacity_roles", recordId: id, operation: "update", actor: admin.email, newData: row });
  revalidatePath(PATH);
  return { ok: true };
}

// The role's commitments are left as they are: they drop off the screen with
// the role, and come back with it if it is ever restored.
export async function archiveCapacityRole(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");
  if (!zId.safeParse(id).success) return { ok: false, error: "Not a valid role." };

  const { error } = await companyOs
    .from("capacity_roles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "capacity_roles", recordId: id, operation: "archive", actor: admin.email });
  revalidatePath(PATH);
  return { ok: true };
}

export async function createCapacityCommitment(raw: CapacityCommitmentInput): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");
  const parsed = capacityCommitmentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const row = commitmentRow(parsed.data);
  const { data, error } = await companyOs.from("capacity_commitments").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "capacity_commitments", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateCapacityCommitment(id: string, raw: CapacityCommitmentInput): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");
  if (!zId.safeParse(id).success) return { ok: false, error: "Not a valid commitment." };
  const parsed = capacityCommitmentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const row = commitmentRow(parsed.data);
  const { error } = await companyOs.from("capacity_commitments").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "capacity_commitments", recordId: id, operation: "update", actor: admin.email, newData: row });
  revalidatePath(PATH);
  return { ok: true };
}

export async function archiveCapacityCommitment(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("org.operations");
  if (!zId.safeParse(id).success) return { ok: false, error: "Not a valid commitment." };

  const { error } = await companyOs
    .from("capacity_commitments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "capacity_commitments", recordId: id, operation: "archive", actor: admin.email });
  revalidatePath(PATH);
  return { ok: true };
}
