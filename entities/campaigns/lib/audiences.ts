import { RELATIONSHIPS, RELATIONSHIP_LABEL, audienceRulesSchema, type AudienceRow, type AudienceRules, type Relationship } from "./audience-rules";
import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";
import { clientStatus } from "@/kernel/identity/client-status";
import { saigonToday } from "@/kernel/config/dates";
import { selectPersonCompanies, selectTaggables } from "@/entities/contacts";
import { selectDeals } from "@/entities/crm";

// Saved audiences: a named set of rules resolved to people each time a
// recipient list is built. Nothing here is a stored label. A person's
// relationship is worked out from the data, in this order of precedence:
//   team     - an Edge8 team member
//   client   - currently linked to a company that is a current client
//   prospect - named on an open deal, or linked to a company with one
//   network  - everyone else
// Every non-empty rule list must match; within a list any value matches; an
// excluded tag removes the person. Consent, do-not-contact and delivery history
// are applied afterwards by resolveAudience, the only gate that decides sends.

export { RELATIONSHIP_LABEL, audienceRulesSchema, type AudienceRow, type AudienceRules, type Relationship };

function parseRules(raw: unknown): AudienceRules {
  const parsed = audienceRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : audienceRulesSchema.parse({});
}

export async function listAudiences(): Promise<{ rows: AudienceRow[]; error?: string }> {
  const { data, error } = await companyOs.from("email_audiences").select("id, name, rules, created_at")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return {
    rows: (data ?? []).map((r) => ({ id: r.id, name: r.name, rules: parseRules(r.rules), createdAt: r.created_at })),
  };
}

export async function getAudience(id: string): Promise<AudienceRow | null> {
  const { data, error } = await companyOs.from("email_audiences").select("id, name, rules, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[campaigns/audiences] audience read", error);
  if (error || !data) return null;
  return { id: data.id, name: data.name, rules: parseRules(data.rules), createdAt: data.created_at };
}

// What the rules are matched against, loaded once per resolution.
export type AudienceFacts = {
  people: { id: string; isTeam: boolean }[];
  currentClientIds: Set<string>;
  links: { personId: string; companyId: string }[];
  openDeals: { personId: string | null; companyId: string | null }[];
  tagsByPerson: Map<string, Set<string>>;
};

export function relationshipOf(personId: string, isTeam: boolean, facts: AudienceFacts, index = indexFacts(facts)): Relationship {
  if (isTeam) return "team";
  const companies = index.companiesByPerson.get(personId) ?? [];
  if (companies.some((c) => facts.currentClientIds.has(c))) return "client";
  if (index.dealPeople.has(personId) || companies.some((c) => index.dealCompanies.has(c))) return "prospect";
  return "network";
}

function indexFacts(facts: AudienceFacts) {
  const companiesByPerson = new Map<string, string[]>();
  for (const l of facts.links) companiesByPerson.set(l.personId, [...(companiesByPerson.get(l.personId) ?? []), l.companyId]);
  const dealPeople = new Set(facts.openDeals.map((d) => d.personId).filter((id): id is string => !!id));
  const dealCompanies = new Set(facts.openDeals.map((d) => d.companyId).filter((id): id is string => !!id));
  return { companiesByPerson, dealPeople, dealCompanies };
}

// The rules applied to the facts. Pure, so the precedence and the AND/OR shape
// are pinned by tests rather than by reading the queries.
export function matchAudience(rules: AudienceRules, facts: AudienceFacts): string[] {
  const index = indexFacts(facts);
  const relationships = new Set(rules.relationships);
  const companyIds = new Set(rules.companyIds);
  return facts.people
    .filter((p) => {
      const tags = facts.tagsByPerson.get(p.id) ?? new Set<string>();
      if (relationships.size > 0 && !relationships.has(relationshipOf(p.id, p.isTeam, facts, index))) return false;
      if (companyIds.size > 0 && !(index.companiesByPerson.get(p.id) ?? []).some((c) => companyIds.has(c))) return false;
      if (rules.tagIds.length > 0 && !rules.tagIds.some((t) => tags.has(t))) return false;
      if (rules.excludeTagIds.some((t) => tags.has(t))) return false;
      return true;
    })
    .map((p) => p.id);
}

// Paged: PostgREST caps an unbounded select and truncates silently, which here
// would quietly drop people from an audience.
const PAGE = 500;
async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<{ rows: T[]; error?: string }> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await fetchPage(offset, offset + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return { rows };
  }
}

export async function loadAudienceFacts(today: string = saigonToday()): Promise<{ facts: AudienceFacts | null; error?: string }> {
  const [people, companies, links, deals, taggables] = await Promise.all([
    pageAll<{ id: string; is_team_member: boolean }>((from, to) =>
      companyOs.from("people").select("id, is_team_member").is("archived_at", null).eq("marketing_consent", "subscribed").order("id").range(from, to),
    ),
    pageAll<{ id: string; client_start_date: string | null; client_end_date: string | null }>((from, to) =>
      selectCompanies("id, client_start_date, client_end_date").not("client_start_date", "is", null).order("id").range(from, to),
    ),
    pageAll<{ person_id: string; company_id: string; end_date: string | null }>((from, to) =>
      selectPersonCompanies("person_id, company_id, end_date").order("id").range(from, to),
    ),
    pageAll<{ person_id: string | null; company_id: string | null }>((from, to) =>
      selectDeals("person_id, company_id").eq("status", "open").is("archived_at", null).order("id").range(from, to),
    ),
    pageAll<{ entity_id: string; tag_id: string }>((from, to) =>
      selectTaggables("entity_id, tag_id").eq("entity_type", "person").order("id").range(from, to),
    ),
  ]);
  const error = people.error ?? companies.error ?? links.error ?? deals.error ?? taggables.error;
  if (error) return { facts: null, error };

  const tagsByPerson = new Map<string, Set<string>>();
  for (const t of taggables.rows) tagsByPerson.set(t.entity_id, (tagsByPerson.get(t.entity_id) ?? new Set()).add(t.tag_id));
  return {
    facts: {
      people: people.rows.map((p) => ({ id: p.id, isTeam: p.is_team_member })),
      currentClientIds: new Set(companies.rows.filter((c) => clientStatus(c, today) === "current").map((c) => c.id)),
      // A link that has ended no longer places the person at the company.
      links: links.rows.filter((l) => !l.end_date || l.end_date >= today).map((l) => ({ personId: l.person_id, companyId: l.company_id })),
      openDeals: deals.rows.map((d) => ({ personId: d.person_id, companyId: d.company_id })),
      tagsByPerson,
    },
  };
}

export async function resolveAudienceIds(rules: AudienceRules): Promise<{ ids: string[]; error?: string }> {
  const { facts, error } = await loadAudienceFacts();
  if (!facts) return { ids: [], error: error ?? "Audience facts could not be loaded." };
  return { ids: matchAudience(rules, facts) };
}
