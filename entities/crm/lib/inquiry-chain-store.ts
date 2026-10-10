import { selectPersonCompanies, upsertPersonCompanies } from "@/entities/contacts";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { findOrCreateCompanyByHost, updatePeople } from "@/kernel/identity/writes";
import { insertInteractions } from "@/kernel/messaging/writes";
import { companyDomainOf } from "@/kernel/identity/free-mail";
import { promotePersonToLead } from "./lifecycle";
import { selectDeals, selectInquiries } from "./reads";
import { updateInquiries } from "./writes";
import { DRIVEN_STEPS, type CustomerDeal, type InquiryFacts, type LeadChainStore, type QualifyContext, type TriageRow } from "./inquiry-chain-types";

// The inquiry-to-lead chain's store over the database (Z.11). Every read that
// decides where an inquiry goes raises on failure (rule 2): "no deal" or "no
// company" must never be what an outage says, because each is the branch that
// acts. A raise fails the step, and the driver retries it.

const WHAT = "[crm/inquiry-chain]";

// One row or none; a failed read raises. Typed by the caller, because the
// PostgREST response union does not unify against a single generic shape.
function must(res: { data: unknown; error: { message: string } | null }, what: string): unknown {
  if (res.error) throw new ReadFailure(`${WHAT} ${what}`, res.error.message);
  return res.data ?? null;
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

type DealRow = {
  id: string;
  title: string | null;
  company_id: string | null;
  owner: NamedPerson | NamedPerson[] | null;
  company: { name: string } | { name: string }[] | null;
};

type PersonNames = NamedPerson & { first_name: string | null; last_name: string | null; persona: string | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toDeal(d: DealRow): CustomerDeal {
  const owner = one(d.owner);
  return { id: d.id, title: d.title, ownerName: owner ? personName(owner, null) : null, companyId: d.company_id, companyName: one(d.company)?.name ?? null };
}

const DEAL_COLUMNS = `id, title, company_id, owner:people!owner_id(${NAME_COLUMNS}), company:companies!company_id(name)`;

// A name a PostgREST ilike would read as a pattern is escaped, so the match is
// exact apart from case.
const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// A function rather than a module-level object: the store's methods read other
// entities' door helpers, and nothing an index reaches may touch a door value
// while the module loads (scripts/entity-door-load-order.test.mjs).
export function supabaseLeadChainStore(): LeadChainStore {
  return {
    async triage(id) {
      return must(await companyOs.from("inquiry_triage").select("*").eq("inquiry_id", id).maybeSingle(), "inquiry_triage") as TriageRow | null;
    },

    async open(id, mode) {
      const { data, error } = await companyOs
        .from("inquiry_triage")
        .upsert({ inquiry_id: id, mode, step: "qualify" }, { onConflict: "inquiry_id", ignoreDuplicates: true })
        .select("inquiry_id");
      fail("inquiry_triage open", error);
      return data && data.length > 0 ? "opened" : "exists";
    },

    async move(id, at, patch) {
      const { data, error } = await companyOs
        .from("inquiry_triage")
        .update(patch)
        .eq("inquiry_id", id)
        .eq("step", at.step)
        .eq("started_at", at.startedAt)
        .select("inquiry_id");
      fail("inquiry_triage move", error);
      return (data ?? []).length === 1;
    },

    async due(limit, only = {}) {
      let q = companyOs.from("inquiry_triage").select("inquiry_id, started_at, step").in("step", [...DRIVEN_STEPS]);
      if (only.mode) q = q.eq("mode", only.mode);
      // A run opened live waits at notify while the tick is in shadow.
      if (only.skipLiveNotify) q = q.or("mode.eq.shadow,step.neq.notify");
      return mustRows(await q.order("created_at", { ascending: true }).limit(limit), `${WHAT} due runs`);
    },

    async inquiry(id) {
      const row = must(
        await selectInquiries(`id, person_id, type, status, message, source, metadata, created_at, person:people!person_id(${NAME_COLUMNS}, first_name, last_name, persona)`).eq("id", id).maybeSingle(),
        "inquiry",
      ) as {
        id: string;
        person_id: string;
        type: string | null;
        status: string;
        message: string | null;
        source: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
        person: PersonNames | PersonNames[] | null;
      } | null;
      if (!row) return null;
      const person = one(row.person);
      const meta = row.metadata ?? {};
      const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
      const facts: InquiryFacts = {
        id: row.id,
        personId: row.person_id,
        type: row.type,
        status: row.status,
        message: row.message,
        company: text(meta.company),
        teamSize: text(meta.team_size),
        utm: meta.utm ?? null,
        source: row.source,
        createdAt: row.created_at,
        email: person?.email ?? text(meta.email),
        // The names are only masked out of the message and searched for
        // duplicates; none is ever sent to the model.
        typedName: text(meta.name),
        names: [person?.display_name, person?.preferred_name, person?.full_name, person?.first_name, person?.last_name, text(meta.name)].filter(
          (n): n is string => typeof n === "string" && n.trim().length > 0,
        ),
        fullName: person?.full_name ?? null,
        persona: person?.persona ?? null,
      };
      return facts;
    },

    async context(facts): Promise<QualifyContext> {
      const links = mustRows(await selectPersonCompanies("company_id").eq("person_id", facts.personId), `${WHAT} person_companies`) as unknown as { company_id: string }[];
      const companyIds = links.map((l) => l.company_id);
      const open = (q: ReturnType<typeof selectDeals>) => q.in("status", ["open", "won"]).is("archived_at", null).order("created_at", { ascending: false }).limit(1);
      const [prior, byPerson, byCompany] = await Promise.all([
        selectInquiries("id", { count: "exact", head: true }).eq("person_id", facts.personId).neq("id", facts.id),
        open(selectDeals(DEAL_COLUMNS).eq("person_id", facts.personId)),
        companyIds.length ? open(selectDeals(DEAL_COLUMNS).in("company_id", companyIds)) : Promise.resolve({ data: [], error: null }),
      ]);
      if (prior.error) throw new ReadFailure(`${WHAT} prior inquiries`, prior.error.message);
      const deals = [...mustRows(byPerson, `${WHAT} deals by person`), ...mustRows(byCompany as { data: unknown[] | null; error: { message: string } | null }, `${WHAT} deals by company`)] as unknown as DealRow[];

      // The company the inquiry names: by its sender's company domain first,
      // read only (create false), then by a unique exact name.
      let companyMatch: { id: string; name: string } | null = null;
      const byHost = await this.companyForHost(companyDomainOf(facts.email) ?? "", null, false);
      if (byHost) companyMatch = { id: byHost.companyId, name: (await this.companyName(byHost.companyId)) ?? "" };
      // A name match only for a sender at a free mailbox: someone writing from
      // another company's domain must not attach themselves to a client by
      // typing its name.
      if (!companyMatch && facts.company && !companyDomainOf(facts.email)) {
        const named = mustRows(
          await companyOs.from("companies").select("id, name").is("archived_at", null).ilike("name", likeExact(facts.company.trim())).limit(2),
          `${WHAT} companies by name`,
        ) as { id: string; name: string }[];
        const exact = named.filter((c) => c.name.trim().toLowerCase() === facts.company!.trim().toLowerCase());
        if (exact.length === 1 && named.length === 1) companyMatch = exact[0];
      }

      // Other people with the same full name at the matched company or under
      // the same company domain: shown on the card as a possible duplicate,
      // never merged.
      let duplicates: string[] = [];
      const name = facts.fullName?.trim();
      const domain = companyDomainOf(facts.email);
      if (name && name.includes(" ") && (domain || companyMatch)) {
        const same = mustRows(
          await companyOs.from("people").select("id, email").is("archived_at", null).neq("id", facts.personId).ilike("full_name", likeExact(name)).limit(10),
          `${WHAT} people by name`,
        ) as { id: string; email: string | null }[];
        let atCompany = new Set<string>();
        if (companyMatch && same.length) {
          const linked = mustRows(
            await selectPersonCompanies("person_id").eq("company_id", companyMatch.id).in("person_id", same.map((p) => p.id)),
            `${WHAT} duplicate links`,
          ) as unknown as { person_id: string }[];
          atCompany = new Set(linked.map((l) => l.person_id));
        }
        duplicates = same.filter((p) => atCompany.has(p.id) || (domain && companyDomainOf(p.email) === domain)).map((p) => p.id).slice(0, 5);
      }

      return { priorInquiries: prior.count ?? 0, customerDeal: deals[0] ? toDeal(deals[0]) : null, companyMatch, duplicates };
    },

    async deal(id) {
      const row = must(await selectDeals(DEAL_COLUMNS).eq("id", id).maybeSingle(), "deal") as DealRow | null;
      return row ? toDeal(row) : null;
    },

    async companyName(id) {
      const row = must(await companyOs.from("companies").select("name").eq("id", id).maybeSingle(), "company name") as { name: string } | null;
      return row?.name ?? null;
    },

    async companyForHost(host, name, create) {
      if (!host) return null;
      const { data, error } = await findOrCreateCompanyByHost(host, name, create);
      fail("find_or_create_company_by_host", error);
      const row = (data ?? [])[0] as { company_id: string; created: boolean } | undefined;
      return row ? { companyId: row.company_id, created: row.created } : null;
    },

    async linkPersonCompany(personId, companyId) {
      const primary = mustRows(await selectPersonCompanies("id").eq("person_id", personId).eq("is_primary", true).limit(1), `${WHAT} primary company`);
      const { error } = await upsertPersonCompanies({ person_id: personId, company_id: companyId, is_primary: primary.length === 0 });
      fail("person_companies link", error);
    },

    async fillPersona(personId, persona) {
      const { error } = await updatePeople({ persona }).eq("id", personId).is("persona", null);
      fail("people persona", error);
    },

    promote(personId, slaFrom) {
      return promotePersonToLead(personId, { reason: "inbound_inquiry", slaFrom });
    },

    async moveInquiryStatus(id, from, to) {
      const { data, error } = await updateInquiries({ status: to }).eq("id", id).eq("status", from).select("id");
      fail("inquiries status", error);
      return (data ?? []).length === 1;
    },

    async logCustomerInquiry(facts, deal) {
      // Keyed on the inquiry, so a retried file step adds no second note.
      const existing = mustRows(
        await companyOs.from("interactions").select("id").eq("subject_type", "inquiry").eq("subject_id", facts.id).eq("kind", "system").limit(1),
        `${WHAT} customer note`,
      );
      if (existing.length) return;
      const { error } = await insertInteractions({
        kind: "system",
        category: "client",
        person_id: facts.personId,
        company_id: deal.companyId,
        subject: "Inquiry from a current client",
        body: `A person on ${deal.title ?? "an open deal"} sent the website contact form. The inquiry is on the Inquiries board; the qualifier did not add them to the Leads queue.`,
        subject_type: "inquiry",
        subject_id: facts.id,
        owner_id: null,
        metadata: { deal_id: deal.id, by: "inquiry-to-lead" },
      });
      fail("interactions customer note", error);
    },
  };
}
