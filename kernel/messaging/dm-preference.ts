import { companyOs } from "@/kernel/data/supabase";

// Whether a person has asked not to receive Lark DMs from the platform. Read
// by sendLarkDm before it resolves an open_id, so every caller — the coaching
// cycle, a board assignment, whatever comes next — honours the preference
// without knowing it exists. Email is untouched: it stays the delivery
// guarantee, and this only takes the second ping away.
//
// Fail-open on a read error: a broken read must not silently mute someone who
// never opted out, and the DM side is already fail-soft everywhere else.
export async function larkDmOptedOut(email: string): Promise<boolean> {
  const { data, error } = await companyOs
    .from("people")
    .select("lark_dm_opt_out")
    .eq("email", email.trim().toLowerCase())
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("[kernel/messaging] people.lark_dm_opt_out read failed:", error.message);
    return false;
  }
  return Boolean((data as { lark_dm_opt_out?: boolean | null } | null)?.lark_dm_opt_out);
}
