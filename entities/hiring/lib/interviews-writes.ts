// Writes to interviews that a decision triggers. A lib module rather than a
// server action: nothing calls it from the browser, and an exported function
// in an actions file is held to the guard-first rule this one need not carry —
// its two callers have already guarded.
import { companyOs } from "@/kernel/data/supabase";

// A decided candidate has no interviews left to hold. The rounds still marked
// scheduled are cancelled — not deleted, so the scorecards and the record of
// what was planned stay — the moment the application reaches hired or
// rejected (C.23, product call). Returns the count for the caller's message.
export async function cancelScheduledInterviews(applicationId: string): Promise<{ ok: true; cancelled: number } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("interviews")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("application_id", applicationId)
    .eq("status", "scheduled")
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, cancelled: (data ?? []).length };
}
