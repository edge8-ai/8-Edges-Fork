import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";

// The name a sprint brief drafted from a meeting is about: the client the
// board serves, or the board's own name when it serves none. Drafting the brief
// reads the meeting's transcript, which is crm's (ADR 0032), so crm asks this
// after it has gated the sprint through boardMutation; boards keeps the read of
// its own table.
export async function boardClientName(boardId: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { data: board, error: boardErr } = await companyOs
    .from("boards")
    .select("client_company_id, name")
    .eq("id", boardId)
    .maybeSingle();
  if (boardErr) return { ok: false, error: boardErr.message };
  const b = board as { client_company_id: string | null; name: string } | null;
  let name = b?.name ?? "";
  if (b?.client_company_id) {
    const { data: co, error: coErr } = await selectCompanies("name").eq("id", b.client_company_id).maybeSingle();
    if (coErr) console.error("[boards] companies", coErr);
    name = (co as { name: string } | null)?.name ?? name;
  }
  return { ok: true, name };
}
