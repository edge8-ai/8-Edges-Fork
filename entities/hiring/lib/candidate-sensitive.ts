// Admin-only access to company_os.candidate_sensitive (restricted candidate
// salary). Reached ONLY through the service-role client, and callers MUST gate
// on the people.pay atom (super admins = Dave + Mai) before invoking any of this,
// exactly like lib/admin/people-sensitive.ts. The audit trail records which
// FIELDS changed, never their values — writing amounts into audit_log would
// leak them to any reader of that table (incl. the NL->SQL assistant).

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";

export type CandidateSensitiveRow = {
  person_id: string;
  salary_expectation_cents: number | null;
  salary_expectation_currency: string | null;
  ai_salary_expectation: string | null;
  notes: string | null;
};

// Caller MUST have already checked the people.pay atom. Returns null when there
// is no row yet (the common case) so the UI shows empty fields.
export async function getCandidateSensitive(personId: string): Promise<CandidateSensitiveRow | null> {
  if (!personId) return null;
  const { data, error: readErr } = await companyOs.from("candidate_sensitive").select("person_id, salary_expectation_cents, salary_expectation_currency, ai_salary_expectation, notes")
    .eq("person_id", personId)
    .maybeSingle();
  if (readErr) console.error("[company-os/hiring] candidate_sensitive", readErr);
  return (data as CandidateSensitiveRow | null) ?? null;
}

export type SalaryInput = {
  salary_expectation_cents?: number | null;
  salary_expectation_currency?: string | null;
};

export type CandidateUpsertResult = { ok: true } | { ok: false; error: string };

// Recruiter save of the structured expectation. Caller MUST have checked
// the people.pay atom. Audits field names only.
export async function upsertCandidateSalary(
  personId: string,
  input: SalaryInput,
  actorEmail: string,
): Promise<CandidateUpsertResult> {
  if (!personId) return { ok: false, error: "Missing candidate." };
  const patch: Record<string, number | string | null> = {};
  if (input.salary_expectation_cents !== undefined) {
    const c = input.salary_expectation_cents;
    patch.salary_expectation_cents =
      c == null || Number.isNaN(c) ? null : Math.max(0, Math.round(c));
  }
  if (input.salary_expectation_currency !== undefined) {
    patch.salary_expectation_currency = input.salary_expectation_currency?.trim() || null;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data: old, error: oldErr } = await companyOs.from("candidate_sensitive").select("salary_expectation_cents, salary_expectation_currency")
    .eq("person_id", personId)
    .maybeSingle();
  if (oldErr) return { ok: false, error: oldErr.message };
  const oldRow = (old as Record<string, unknown> | null) ?? null;

  const { error } = await companyOs.from("candidate_sensitive").upsert(
      { person_id: personId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "person_id" },
    );
  if (error) return { ok: false, error: "Could not save the salary." };

  const changed = Object.keys(patch).filter(
    (k) => String(oldRow?.[k] ?? "") !== String(patch[k] ?? ""),
  );
  if (changed.length > 0) {
    await recordAudit({
      table: "candidate_sensitive",
      recordId: personId,
      operation: oldRow ? "update" : "insert",
      actor: actorEmail,
      context: { fields_changed: changed },
    });
  }
  return { ok: true };
}

// System write from resume screening: store the AI-extracted salary string on
// the restricted store instead of applications.ai_summary. Not audited (no human
// actor); best-effort, must never throw the screen.
export async function setCandidateAiSalary(
  personId: string | null | undefined,
  aiSalary: string | null | undefined,
): Promise<void> {
  if (!personId) return;
  const value = aiSalary?.trim() || null;
  const { error } = await companyOs.from("candidate_sensitive").upsert(
      { person_id: personId, ai_salary_expectation: value, updated_at: new Date().toISOString() },
      { onConflict: "person_id" },
    );
  if (error) console.error("[candidate-sensitive] ai salary upsert failed:", error.message);
}
