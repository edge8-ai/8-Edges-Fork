import { selectKrLogs } from "@/entities/org";
import { readOr } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { KEY_RESULT_AUDIT_TABLE } from "./key-result-moves";

// Which company key results have never been measured (K.78). key_results.
// current_value is not null and defaults to 0, so a key result nobody has ever
// checked in reads "0 of 4.5 score" under a member's goal — a CSAT of zero, when
// the truth is that nobody has measured it.
//
// Neither trail is complete on its own: a human check-in writes the audit row
// and no kr_logs row, the nightly sync writes a kr_logs row, and a value typed
// at creation writes neither. So "never measured" is all three at once: the
// value is still the default 0, the audit trail never saw it change, and the
// check-in log is empty. A 0 somebody set on purpose has an audit row and keeps
// reading as 0.
//
// A read that fails claims nothing: the key result shows its number, which is
// what every screen showed before this existed.

type AuditRow = { record_id: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

export async function getNeverMeasuredKeyResults(
  keyResults: { id: string; current_value: number | null }[],
): Promise<Set<string>> {
  const atDefault = keyResults.filter((kr) => kr.current_value === 0).map((kr) => kr.id);
  if (atDefault.length === 0) return new Set();
  const [audit, logs] = await Promise.all([
    companyOs
      .from("audit_log")
      .select("record_id, old_data, new_data")
      .eq("table_name", KEY_RESULT_AUDIT_TABLE)
      .eq("operation", "update")
      .in("record_id", atDefault),
    selectKrLogs("key_result_id").in("key_result_id", atDefault),
  ]);
  const auditRows = readOr(audit, "coaching/key-result-measured audit_log", null) as AuditRow[] | null;
  const logRows = readOr(logs, "coaching/key-result-measured kr_logs", null) as { key_result_id: string }[] | null;
  if (auditRows === null || logRows === null) return new Set();
  const measured = new Set<string>([
    ...auditRows
      .filter((r) => String(r.old_data?.current_value ?? "") !== String(r.new_data?.current_value ?? ""))
      .map((r) => r.record_id),
    ...logRows.map((r) => r.key_result_id),
  ]);
  return new Set(atDefault.filter((id) => !measured.has(id)));
}

// What a screen prints for a company number nobody has measured.
export const NOT_MEASURED_YET = "not measured yet";
