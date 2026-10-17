// Admin-only access to company_os.people_sensitive (restricted legal/payroll
// PII). Reached ONLY through the service-role client after requireAdmin() in the
// caller. IMPORTANT: the audit trail records which FIELDS changed, never their
// values — writing the values into audit_log would leak them to any reader of
// that table (incl. the NL->SQL assistant), defeating the whole point of the
// restricted store.

import { companyOs } from "@/kernel/data/supabase";
import { selectPeopleSensitive, upsertPeopleSensitiveRow } from "@/entities/contacts";
import { recordAudit } from "@/kernel/audit/audit";

// Every editable column. `notes` is free text; the rest map 1:1 to the table.
export const SENSITIVE_FIELDS = [
  "date_of_birth",
  "place_of_birth",
  "national_id_number",
  "national_id_issue_date",
  "national_id_issue_place",
  "native_province",
  "permanent_address",
  "current_address",
  "marital_status",
  "bank_name",
  "bank_account_number",
  "bank_branch",
  "tax_code",
  "social_insurance_number",
  "notes",
] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];
export type SensitiveInput = Partial<Record<SensitiveField, string | null>>;
export type SensitiveRow = SensitiveInput & {
  person_id: string;
  id_front_path: string | null;
  id_back_path: string | null;
  id_selfie_path: string | null;
};

export async function getPeopleSensitive(personId: string): Promise<SensitiveRow | null> {
  const { data, error: readErr } = await selectPeopleSensitive("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (readErr) console.error("[company-os/crm] people_sensitive", readErr);
  return (data as SensitiveRow | null) ?? null;
}

const DATE_FIELDS = new Set<SensitiveField>(["date_of_birth", "national_id_issue_date"]);

function clean(field: SensitiveField, value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.trim();
  if (!v) return null;
  return v;
}

export type UpsertResult = { ok: true; changed: SensitiveField[] } | { ok: false; error: string };

export async function upsertPeopleSensitive(
  personId: string,
  input: SensitiveInput,
  actorEmail: string,
): Promise<UpsertResult> {
  // Normalize only the fields the caller supplied.
  const patch: Record<string, string | null> = {};
  for (const f of SENSITIVE_FIELDS) {
    if (f in input) {
      const val = clean(f, input[f]);
      if (val !== null && DATE_FIELDS.has(f) && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        return { ok: false, error: `${f.replace(/_/g, " ")} must be a date (YYYY-MM-DD).` };
      }
      patch[f] = val;
    }
  }

  const { data: old, error: oldErr } = await selectPeopleSensitive("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (oldErr) return { ok: false, error: oldErr.message };
  const oldRow = (old as Record<string, unknown> | null) ?? null;

  const { error } = await upsertPeopleSensitiveRow({ person_id: personId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "person_id" });
  if (error) return { ok: false, error: "Could not save the record." };

  // Audit the FIELD NAMES that changed — never the values.
  const changed = Object.keys(patch).filter(
    (k) => String(oldRow?.[k] ?? "") !== String(patch[k] ?? ""),
  ) as SensitiveField[];
  if (changed.length > 0) {
    await recordAudit({
      table: "people_sensitive",
      recordId: personId,
      operation: oldRow ? "update" : "insert",
      actor: actorEmail,
      context: { fields_changed: changed },
    });
  }
  return { ok: true, changed };
}
