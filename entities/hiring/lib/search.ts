// Hiring's answer to the global search (S.1): candidates, admin only, because
// the team hub has no candidate screen to open.
//
// A candidate's name and email live on their person row (people is a kernel
// table, readable by every entity), so the match is made there first and the
// candidates behind the matching people come second. The first read is capped
// well above the hit limit, so people who are not candidates do not crowd out
// the ones who are.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { matchEveryTerm } from "@/kernel/data/postgrest-filter";
import { NAME_COLUMNS, PERSON_SEARCH_COLUMNS, personName } from "@/kernel/config/people-name";
import type { SearchContribution } from "@/kernel/shell/search";

const PEOPLE_SCAN = 100;

const candidates: SearchContribution = {
  kind: "candidate",
  label: "Candidates",
  opens: { admin: "/admin/talent/candidates/[id]" },
  async search(_actor, terms, limit) {
    const people = mustRows(
      await matchEveryTerm(
        companyOs.from("people").select(`id, ${NAME_COLUMNS}`).is("archived_at", null),
        PERSON_SEARCH_COLUMNS,
        terms,
      ).limit(PEOPLE_SCAN),
      "[hiring/search] people",
    );
    if (people.length === 0) return [];
    const byId = new Map(people.map((p) => [p.id, p]));

    const rows = mustRows(
      await companyOs
        .from("candidates")
        .select("id, person_id, current_title")
        .in("person_id", [...byId.keys()])
        .order("updated_at", { ascending: false })
        .limit(limit),
      "[hiring/search] candidates",
    );
    return rows.map((c) => ({
      id: c.id,
      title: personName(byId.get(c.person_id)),
      detail: c.current_title,
      href: `/admin/talent/candidates/${c.id}`,
    }));
  },
};

export const searchContributions: SearchContribution[] = [candidates];
