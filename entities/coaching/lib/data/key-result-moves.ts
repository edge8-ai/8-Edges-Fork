import { companyOs } from "@/kernel/data/supabase";
import { keyResultDelta, type KeyResultAuditRow, type KeyResultMove } from "../key-result-move";

// The audit trail's name for a company key result. The org entity writes these
// rows when a key result is checked in or synced; this read only looks at them.
export const KEY_RESULT_AUDIT_TABLE = "key_results";

// What the key result above the member's goal did since their last 1-1 (K.43).
// `audit_log` is a kernel table — readable by every entity, written only
// through kernel/audit — so this read names it directly, and the key result
// itself belongs to org and is read through that entity's door elsewhere.
//
// A read error returns null rather than throwing: the movement line is a grace
// note on a rung that has to render either way.
export async function getKeyResultMove(
  keyResultId: string,
  currentValue: number | null,
  sinceISO: string | null,
): Promise<KeyResultMove | null> {
  if (!keyResultId || currentValue === null || !sinceISO) return null;
  const { data, error } = await companyOs
    .from("audit_log")
    .select("changed_at, old_data, new_data")
    .eq("table_name", KEY_RESULT_AUDIT_TABLE)
    .eq("record_id", keyResultId)
    .eq("operation", "update");
  if (error) {
    console.error("[team/coaching/key-result-moves] audit_log", error);
    return null;
  }
  return keyResultDelta((data ?? []) as unknown as KeyResultAuditRow[], currentValue, sinceISO);
}
