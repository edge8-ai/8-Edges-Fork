"use server";

// Settings → Training types (TR.2): add, rename and retire the kinds of training
// an organisation runs. Admin only (training.types). Retiring keeps a type's
// history: its trainings keep it, new ones cannot choose it. Each change is audited.
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { TypeName } from "@/entities/training/lib/training-rules";
import { addType, renameType, retireType } from "@/entities/training/lib/trainings";

const PATH = "/admin/settings/training-types";

export async function addTrainingType(name: unknown): Promise<Result> {
  const access = await requirePermission("training.types");
  const parsed = TypeName.safeParse(name);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const res = await addType(access.personId, parsed.data);
  if (!res.ok) return res;
  await recordAudit({ table: "training_types", operation: "insert", actor: access.user.email, newData: { name: parsed.data } });
  revalidatePath(PATH);
  return { ok: true };
}

export async function renameTrainingType(typeId: string, name: unknown): Promise<Result> {
  const access = await requirePermission("training.types");
  const parsed = TypeName.safeParse(name);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const id = String(typeId ?? "");
  const res = await renameType(id, parsed.data);
  if (!res.ok) return res;
  await recordAudit({ table: "training_types", recordId: id, operation: "update", actor: access.user.email, newData: { name: parsed.data } });
  revalidatePath(PATH);
  return { ok: true };
}

export async function retireTrainingType(typeId: string): Promise<Result> {
  const access = await requirePermission("training.types");
  const id = String(typeId ?? "");
  const res = await retireType(access.personId, id, new Date());
  if (!res.ok) return res;
  await recordAudit({ table: "training_types", recordId: id, operation: "archive", actor: access.user.email });
  revalidatePath(PATH);
  return { ok: true };
}
