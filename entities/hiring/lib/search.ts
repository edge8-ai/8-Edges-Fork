// Hiring's answer to the global search (S.1): candidates, admin only, because
// the team hub has no candidate screen to open.
//
// A candidate's name and email live on their person row, so the database's
// company_os.search_candidates matches the candidate's live person and ranks
// the candidates themselves (SR.2.2): one read, accents ignored, best match
// first, so people who are not candidates can no longer crowd out the ones who
// are.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName } from "@/kernel/config/people-name";
import type { SearchContribution } from "@/kernel/shell/search";

const candidates: SearchContribution = {
  kind: "candidate",
  label: "Candidates",
  opens: { admin: "/admin/talent/candidates/[id]" },
  async search(_actor, terms, limit) {
    const rows = mustRows(await companyOs.rpc("search_candidates", { terms, lim: limit }), "[hiring/search] search_candidates");
    return rows.map((c) => ({
      id: c.id,
      title: personName(c),
      detail: c.current_title,
      href: `/admin/talent/candidates/${c.id}`,
    }));
  },
};

export const searchContributions: SearchContribution[] = [candidates];
