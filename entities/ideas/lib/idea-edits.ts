import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";

// The one spark edit another entity makes (A.70, ADR 0018): team's
// own-service update for /team, which until A.70 called the door's raw
// `updateIdeas(patch)` and chained `.eq("id", id)` itself. team checks the
// spark is the actor's own (assertInScope) before it calls this.

/** Writes `patch` to one spark by id. Resolves to PostgREST's `{ error }`, which the caller reports. */
export function editIdea(id: string, patch: TablesUpdate<{ schema: "company_os" }, "ideas">) {
  return companyOs.from("ideas").update(patch).eq("id", id);
}
