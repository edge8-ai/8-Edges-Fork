// crm's answers to the global search (S.1): people, companies and deals.
//
// crm contributes people, although `people` is a kernel table, because it owns
// the screen a person opens on (/admin/contacts/[id]). The entity that owns the
// screen a hit opens owns the hit, so no contribution links into another
// entity's routes. Each kind names the page its hits open on each surface, and
// runSearch asks it only of someone who may open that page (its declared
// permission, ADR 0013). People have no team screen, so they are admin only.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { matchEveryTerm } from "@/kernel/data/postgrest-filter";
import { NAME_COLUMNS, PERSON_SEARCH_COLUMNS, personName } from "@/kernel/config/people-name";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { SearchContribution } from "@/kernel/shell/search";

// Revenue answers on both surfaces, so its links follow the one the searcher is on.
function revenueBase(actor: SearchActor): string {
  return actor.surface === "team" ? "/team/revenue" : "/admin/revenue";
}

const people: SearchContribution = {
  kind: "person",
  label: "People",
  opens: { admin: "/admin/contacts/[id]" },
  async search(_actor, terms, limit) {
    const rows = mustRows(
      await matchEveryTerm(
        companyOs.from("people").select(`id, ${NAME_COLUMNS}`).is("archived_at", null),
        PERSON_SEARCH_COLUMNS,
        terms,
      )
        .order("full_name")
        .limit(limit),
      "[crm/search] people",
    );
    return rows.map((p) => ({ id: p.id, title: personName(p), detail: p.email, href: `/admin/contacts/${p.id}` }));
  },
};

const companies: SearchContribution = {
  kind: "company",
  label: "Companies",
  opens: { admin: "/admin/revenue/companies/[id]", team: "/team/revenue/companies/[id]" },
  async search(actor, terms, limit) {
    const rows = mustRows(
      await matchEveryTerm(
        companyOs.from("companies").select("id, name, website_url").is("archived_at", null),
        ["name", "website_url"],
        terms,
      )
        .order("name")
        .limit(limit),
      "[crm/search] companies",
    );
    const base = revenueBase(actor);
    return rows.map((c) => ({ id: c.id, title: c.name, detail: c.website_url, href: `${base}/companies/${c.id}` }));
  },
};

const deals: SearchContribution = {
  kind: "deal",
  label: "Deals",
  opens: { admin: "/admin/revenue/deals/[id]", team: "/team/revenue/deals/[id]" },
  async search(actor, terms, limit) {
    const rows = mustRows(
      await matchEveryTerm(
        companyOs.from("deals").select("id, title, company:companies!company_id(name)").is("archived_at", null),
        ["title"],
        terms,
      )
        .order("updated_at", { ascending: false })
        .limit(limit),
      "[crm/search] deals",
    );
    const base = revenueBase(actor);
    return rows.map((d) => ({ id: d.id, title: d.title, detail: d.company?.name ?? null, href: `${base}/deals/${d.id}` }));
  },
};

export const searchContributions: SearchContribution[] = [people, companies, deals];
