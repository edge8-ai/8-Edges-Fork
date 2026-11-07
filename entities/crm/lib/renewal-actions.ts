"use server";

import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { RENEWAL_STATUSES } from "@/entities/crm/lib/renewal-vocab";
import type { Result } from "@/kernel/data/result";

// The Renewal card's writes (S.6). Guarded by crm.pipeline, so the same
// action works from /admin/revenue/companies/[id] and /team/revenue/companies/[id]
// and nobody without the Revenue permission can call it. Every write is audited
// against the renewals row.

const renewalInput = z.object({
  companyId: z.string().uuid(),
  renewsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a renewal date."),
  termMonths: z.number().int().positive().max(120).nullable(),
  status: z.enum(RENEWAL_STATUSES),
  note: z.string().trim().max(1000).nullable(),
});

export type RenewalInput = z.input<typeof renewalInput>;

function refresh(companyId: string) {
  revalidateSurfaces(`/revenue/companies/${companyId}`);
  revalidateSurfaces("/revenue/accounts");
}

/**
 * Sets the company's live renewal: edits the live row when there is one, and
 * starts one when there is not. Read-then-write rather than an upsert, because
 * the one-live-row rule is a partial unique index and PostgREST's onConflict
 * cannot name a partial index.
 */
export async function saveRenewal(input: RenewalInput): Promise<Result> {
  const { user: actor } = await requirePermission("crm.pipeline");
  const parsed = renewalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That renewal isn't valid." };
  const { companyId, renewsOn, termMonths, status } = parsed.data;
  const fields = { renews_on: renewsOn, term_months: termMonths, status, note: parsed.data.note || null };

  const { data: live, error: readError } = await companyOs
    .from("renewals")
    .select("id")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };

  if (live) {
    const { error } = await companyOs.from("renewals").update(fields).eq("id", live.id);
    if (error) return { ok: false, error: error.message };
    await recordAudit({ table: "renewals", recordId: live.id, operation: "update", actor: actor.email, newData: fields });
  } else {
    const { data: created, error } = await companyOs
      .from("renewals")
      .insert({ company_id: companyId, ...fields })
      .select("id")
      .single();
    // Two people saving the first renewal at once: the second insert meets the
    // partial unique index. Say so, rather than surfacing a constraint name.
    if (error?.message.includes("renewals_live_company_key")) {
      return { ok: false, error: "Someone else just set this renewal. Reload to see it." };
    }
    if (error) return { ok: false, error: error.message };
    await recordAudit({ table: "renewals", recordId: created.id, operation: "insert", actor: actor.email, newData: { company_id: companyId, ...fields } });
  }
  refresh(companyId);
  return { ok: true };
}

/**
 * Takes the live renewal off the company, keeping the row as history, so the
 * next save starts a fresh one — the step after a renewal is recorded as
 * renewed or churned and the next term begins.
 */
export async function archiveRenewal(companyId: string, renewalId: string): Promise<Result> {
  const { user: actor } = await requirePermission("crm.pipeline");
  const ids = z.object({ companyId: z.string().uuid(), renewalId: z.string().uuid() }).safeParse({ companyId, renewalId });
  if (!ids.success) return { ok: false, error: "That renewal isn't valid." };
  const archivedAt = new Date().toISOString();
  const { error } = await companyOs
    .from("renewals")
    .update({ archived_at: archivedAt })
    .eq("id", renewalId)
    .eq("company_id", companyId)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "renewals", recordId: renewalId, operation: "archive", actor: actor.email, newData: { archived_at: archivedAt } });
  refresh(companyId);
  return { ok: true };
}
