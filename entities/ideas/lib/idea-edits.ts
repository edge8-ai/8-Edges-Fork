import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import type { TeamActor } from "@/kernel/identity/team-auth";

// The spark edit /team makes for an employee. Until A.88.6 team's funnel made
// it (teamUpdateInScope: assertInScope, then editIdea); editIdeaInScope below
// now carries that check itself, so the edit and its scope rule live together.

/** Writes `patch` to one spark by id. Resolves to PostgREST's `{ error }`, which the caller reports. */
export function editIdea(id: string, patch: TablesUpdate<{ schema: "company_os" }, "ideas">) {
  return companyOs.from("ideas").update(patch).eq("id", id);
}

/**
 * Edits a spark only when its author is in the actor's person scope (themself
 * or a report), re-read immediately before the write so a stale or forged id
 * never authorises it (A.88.6, the rule team's teamUpdateInScope applied).
 * Callers that need a narrower check (strictly self) still make it first.
 * A failed ownership read refuses: an unknown owner is not permission.
 */
export async function editIdeaInScope(
  actor: Pick<TeamActor, "personScope">,
  id: string,
  patch: TablesUpdate<{ schema: "company_os" }, "ideas">,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await companyOs.from("ideas").select("person_id").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const owner = (data as { person_id: string | null } | null)?.person_id ?? null;
  if (!owner || !actor.personScope.includes(owner)) return { ok: false, error: "Not found." };
  const { error: writeError } = await editIdea(id, patch);
  return { ok: !writeError, error: writeError?.message ?? null };
}
