"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit, recordAuditMany } from "@/kernel/audit/audit";
import { type Result } from "@/entities/crm";
import { reorderRefusal, VALUE_DESC_MAX, VALUE_TITLE_MAX } from "@/entities/org/lib/core-values";

// The Core Values editor's writes (/admin/company/values). Every write is
// admin-gated, validated on the server (the old editor capped the title only
// in the browser and the description nowhere), confirms it touched a row, is
// audited, and revalidates both the editor and the team page that reads the
// same rows.

const ValueInput = z.object({
  title: z.string().trim().min(1, "A value needs a title.").max(VALUE_TITLE_MAX, `Keep the title to ${VALUE_TITLE_MAX} characters.`),
  description: z
    .string()
    .trim()
    .min(1, "A value needs a description.")
    .max(VALUE_DESC_MAX, `Keep the description to ${VALUE_DESC_MAX} characters.`),
});
export type ValueDraft = z.input<typeof ValueInput>;

const Id = z.string().uuid();
const issue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the value and try again.";
const GONE = "That value no longer exists. Reload the page.";

function refreshValues() {
  revalidatePath("/admin/company/values");
  revalidatePath("/team/values");
}

export async function createValue(input: ValueDraft): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  const parsed = ValueInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: issue(parsed.error) };

  // Append after the current last value.
  const { data: last, error: lastErr } = await companyOs
    .from("core_values")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) return { ok: false, error: "Could not read the values. Please try again." };
  const row = { ...parsed.data, sort_order: (last?.sort_order ?? 0) + 1 };
  const { data, error } = await companyOs.from("core_values").insert(row).select("id").single();
  if (error) return { ok: false, error: "Could not add the value. Please try again." };
  await recordAudit({ table: "core_values", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refreshValues();
  return { ok: true };
}

export async function updateValue(id: string, input: ValueDraft): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  const parsed = ValueInput.safeParse(input);
  if (!parsed.success || !Id.safeParse(id).success) return { ok: false, error: parsed.success ? GONE : issue(parsed.error) };
  const { data, error } = await companyOs
    .from("core_values")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: "Could not save the value. Please try again." };
  if (!data?.length) return { ok: false, error: GONE };
  await recordAudit({ table: "core_values", recordId: id, operation: "update", actor: admin.email, newData: parsed.data });
  refreshValues();
  return { ok: true };
}

export async function deleteValue(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  if (!Id.safeParse(id).success) return { ok: false, error: GONE };
  const { data, error } = await companyOs.from("core_values").delete().eq("id", id).select("id");
  // coaching_noticed.value_id points here with no ON DELETE rule, so a value a
  // coach has named in a Noticed note cannot go; say so instead of the raw
  // foreign-key error the old editor showed.
  if (error?.code === "23503") {
    return { ok: false, error: "Coaches have named this value in Noticed notes, so it can't be deleted. Edit its wording instead." };
  }
  if (error) return { ok: false, error: "Could not delete the value. Please try again." };
  if (!data?.length) return { ok: false, error: GONE };
  await recordAudit({ table: "core_values", recordId: id, operation: "delete", actor: admin.email });
  refreshValues();
  return { ok: true };
}

/**
 * Save the whole order at once. sort_order is UNIQUE and not deferrable, so
 * writing a neighbour's number over a row collides: that is why every ↑/↓ on
 * the old editor failed with a duplicate-key error. Instead every row is first
 * parked on a number past the current range, then given its final 1..n; each
 * pass only writes numbers nobody holds. If a write fails part-way the order is
 * odd but valid, and saving again repairs it.
 */
export async function reorderValues(ids: string[]): Promise<Result> {
  const { user: admin } = await requirePermission("org.company");
  const parsed = z.array(Id).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "That order isn't a list of values." };
  const { data: rows, error } = await companyOs.from("core_values").select("id, sort_order");
  if (error) return { ok: false, error: "Could not read the values. Please try again." };
  const refusal = reorderRefusal(
    rows.map((r) => r.id),
    parsed.data,
  );
  if (refusal) return { ok: false, error: refusal };

  const park = Math.max(0, ...rows.map((r) => r.sort_order)) + 1;
  const now = new Date().toISOString();
  for (const pass of [(i: number) => park + i, (i: number) => i + 1]) {
    for (const [i, id] of parsed.data.entries()) {
      const { error: writeErr } = await companyOs.from("core_values").update({ sort_order: pass(i), updated_at: now }).eq("id", id);
      if (writeErr) {
        console.error("[org/core-values] reorder write failed:", writeErr.message);
        return { ok: false, error: "Could not save the new order. Please try again." };
      }
    }
  }
  await recordAuditMany(
    parsed.data.map((id, i) => ({ table: "core_values", recordId: id, operation: "update" as const, actor: admin.email, newData: { sort_order: i + 1 } })),
  );
  refreshValues();
  return { ok: true };
}
