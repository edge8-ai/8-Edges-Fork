import { companyOs, type Json } from "@/kernel/data/supabase";
import { isUuid } from "@/kernel/config/slug";

// Append-only audit trail for admin write actions on CRM records. Best-effort:
// a failed audit insert is logged but never blocks the user-facing mutation
// (mirrors recordTransition). company_os.audit_log fills id, context ({}) and
// changed_at (now()) server-side, so a row only needs table_name + operation.
//
// GDPR note: for `delete` we deliberately do NOT copy PII into old_data — the
// row records *that* an erasure happened and *who* did it, not the erased data.

export type AuditOp =
  | "insert"
  | "update"
  | "archive"
  | "restore"
  | "delete"
  | "bulk_update"
  | "bulk_archive"
  | "bulk_delete"
  // A read of something sensitive (bank details), recorded as what it is.
  // audit_log.operation's check accepts it since 20261008090000.
  | "read";

export type AuditInput = {
  table: string;
  /**
   * The audited row's uuid. A table keyed by anything else (a text scope, a
   * composite key) passes null and names its key in `context`.
   */
  recordId?: string | null;
  operation: AuditOp;
  actor?: string | null; // admin email from requireAdmin()
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
};

// audit_log.record_id is a uuid column, and because a failed insert is only
// logged, a text key there used to cost the whole row without anyone seeing it:
// access_codes kept none from #1486 until B.13. So a key that is not a uuid is
// moved into context.record_key and the row is written anyway. The warning is
// what tells the caller to pass null and name the key itself.
function hasTextKey(input: AuditInput): input is AuditInput & { recordId: string } {
  return input.recordId != null && !isUuid(input.recordId);
}

function toRow(input: AuditInput) {
  const textKey = hasTextKey(input);
  const context = textKey ? { ...input.context, record_key: input.recordId } : (input.context ?? {});
  return {
    actor_label: input.actor ?? null,
    table_name: input.table,
    record_id: textKey ? null : (input.recordId ?? null),
    operation: input.operation,
    // The three jsonb columns. Callers hand us open records, so the jsonb
    // value type is asserted once here rather than at every call site.
    old_data: (input.oldData ?? null) as Json,
    new_data: (input.newData ?? null) as Json,
    context: context as Json,
  };
}

function warnTextKeys(inputs: AuditInput[]): void {
  const tables = [...new Set(inputs.filter(hasTextKey).map((input) => input.table))];
  if (tables.length === 0) return;
  console.warn(
    `audit_log: record id is not a uuid for ${tables.join(", ")}; kept the row with the id in context.record_key. Pass recordId: null and name the key in context.`,
  );
}

export async function recordAudit(input: AuditInput): Promise<void> {
  warnTextKeys([input]);
  const { error } = await companyOs.from("audit_log").insert(toRow(input));
  if (error) console.error("audit_log insert failed:", error.message);
}

export async function recordAuditMany(inputs: AuditInput[]): Promise<void> {
  if (inputs.length === 0) return;
  warnTextKeys(inputs);
  const { error } = await companyOs.from("audit_log").insert(inputs.map(toRow));
  if (error) console.error("audit_log batch insert failed:", error.message);
}
