// The lead temperature read (weekly personal emails, PR 2): every prospect
// with the list they belong on and the reason, computed on the way out from
// deals, the lead satellite, human touches and client status. Nothing is
// stored. The rules themselves are in lead-temperature-rules.ts.
//
// The reads are raised with mustPages: a failed read must not render as an
// empty list, because an empty "warm" list is the answer that stops the
// week's emails (CLAUDE.md rule 2).
import { companyOs } from "@/kernel/data/supabase";
import { mustPages } from "@/kernel/data/read";
import { selectCompanies } from "@/kernel/identity/reads";
import { clientStatus } from "@/kernel/identity/client-status";
import { saigonToday } from "@/kernel/config/dates";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { personCompanyLinksPage } from "@/entities/contacts";
import { pipelineStageNames } from "./pipelines";
import { COLD_DAYS, isHumanTouch, temperatureOf, type Temperature, type TemperatureFacts, type Touch } from "./lead-temperature-rules";

export type { Temperature } from "./lead-temperature-rules";

export type TemperatureRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  temperature: Temperature;
  reason: string;
  /** The most recent human touch, or null. */
  lastTouch: Touch | null;
};

export type LeadTemperatures = {
  rows: TemperatureRow[];
  counts: Record<Temperature, number>;
  /** How many people the rules kept off every list, by reason. */
  excluded: Record<string, number>;
};

type PersonRow = NamedPerson & {
  id: string;
  email: string;
  persona: string | null;
  is_team_member: boolean;
  do_not_contact: boolean;
  marketing_consent: string | null;
};
type CompanyRow = { id: string; name: string | null; client_start_date: string | null; client_end_date: string | null };
type LinkRow = { person_id: string; company_id: string; end_date: string | null };
type DealRow = { person_id: string | null; status: string; stage_id: string | null; lost_reason: string | null; closed_at: string | null; updated_at: string };
type LeadRow = { person_id: string; status: string; disqualified_reason: string | null; updated_at: string };
type InteractionRow = { person_id: string | null; kind: string; category: string | null; occurred_at: string; source: string | null };
type ParticipantRow = { person_id: string | null; meetings: { started_at: string | null } | { started_at: string | null }[] | null };

const isoDaysAgo = (today: string, days: number) => new Date(new Date(today).getTime() - days * 86_400_000).toISOString();

/** Every prospect's temperature, as of `today` (a Saigon calendar date). */
export async function loadLeadTemperatures(today: string = saigonToday()): Promise<LeadTemperatures> {
  const since = isoDaysAgo(today, COLD_DAYS);
  const what = (table: string) => `[crm/lead-temperature] ${table}`;

  const [people, companies, links, deals, leads, interactions, participants] = await Promise.all([
    mustPages<PersonRow>(what("people"), (from, to) =>
      companyOs.from("people").select(`id, ${NAME_COLUMNS}, persona, is_team_member, do_not_contact, marketing_consent`).is("archived_at", null).order("id").range(from, to),
    ),
    mustPages<CompanyRow>(what("companies"), (from, to) =>
      selectCompanies("id, name, client_start_date, client_end_date").is("archived_at", null).order("id").range(from, to),
    ),
    mustPages<LinkRow>(what("person_companies"), (from, to) => personCompanyLinksPage(from, to)),
    mustPages<DealRow>(what("deals"), (from, to) =>
      companyOs.from("deals").select("person_id, status, stage_id, lost_reason, closed_at, updated_at").is("archived_at", null).in("status", ["open", "lost"]).order("id").range(from, to),
    ),
    mustPages<LeadRow>(what("lead"), (from, to) => companyOs.from("lead").select("person_id, status, disqualified_reason, updated_at").order("id").range(from, to)),
    // A year of touches, newest first, so the first one seen per person is the latest.
    mustPages<InteractionRow>(what("interactions"), (from, to) =>
      companyOs
        .from("interactions")
        .select("person_id, kind, category, occurred_at, source:metadata->>source")
        .not("person_id", "is", null)
        .in("kind", ["call", "meeting", "email", "lark", "whatsapp", "note"])
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    // Meetings a person sat in: the transcript record, which the CRM may not
    // have logged as an interaction.
    mustPages<ParticipantRow>(what("meeting_participants"), (from, to) =>
      companyOs.from("meeting_participants").select("person_id, meetings!inner(started_at)").gte("meetings.started_at", since).is("meetings.archived_at", null).order("id").range(from, to),
    ),
  ]);

  const stageIds = [...new Set(deals.flatMap((d) => (d.status === "open" && d.stage_id ? [d.stage_id] : [])))];
  const stages = stageIds.length > 0 ? mustRowsOf(await pipelineStageNames(stageIds), what("pipeline_stages")) : [];
  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  const companyById = new Map(companies.map((c) => [c.id, c]));
  const clientCompanies = new Set(companies.filter((c) => clientStatus(c, today) === "current").map((c) => c.id));
  const companiesOf = new Map<string, string[]>();
  for (const l of links) companiesOf.set(l.person_id, [...(companiesOf.get(l.person_id) ?? []), l.company_id]);

  const openDeals = new Map<string, { stage: string | null; updatedAt: string }[]>();
  const lostDeals = new Map<string, { lostReason: string | null; closedAt: string | null }[]>();
  for (const d of deals) {
    if (!d.person_id) continue;
    if (d.status === "open") openDeals.set(d.person_id, [...(openDeals.get(d.person_id) ?? []), { stage: d.stage_id ? (stageName.get(d.stage_id) ?? null) : null, updatedAt: d.updated_at }]);
    else lostDeals.set(d.person_id, [...(lostDeals.get(d.person_id) ?? []), { lostReason: d.lost_reason, closedAt: d.closed_at }]);
  }
  for (const list of openDeals.values()) list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const list of lostDeals.values()) list.sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));

  const leadOf = new Map(leads.map((l) => [l.person_id, l]));

  const lastTouch = new Map<string, Touch>();
  const consider = (personId: string, touch: Touch) => {
    const have = lastTouch.get(personId);
    if (!have || touch.at > have.at) lastTouch.set(personId, touch);
  };
  for (const i of interactions) {
    if (i.person_id && isHumanTouch(i)) consider(i.person_id, { kind: i.kind, at: i.occurred_at });
  }
  for (const p of participants) {
    const m = Array.isArray(p.meetings) ? p.meetings[0] : p.meetings;
    if (p.person_id && m?.started_at) consider(p.person_id, { kind: "meeting", at: m.started_at });
  }

  const rows: TemperatureRow[] = [];
  const counts: Record<Temperature, number> = { warm: 0, cold: 0, other: 0 };
  const excluded: Record<string, number> = {};
  for (const p of people) {
    const companyIds = companiesOf.get(p.id) ?? [];
    const facts: TemperatureFacts = {
      isTeamMember: p.is_team_member,
      doNotContact: p.do_not_contact,
      marketingConsent: p.marketing_consent,
      persona: p.persona,
      atClientCompany: companyIds.some((id) => clientCompanies.has(id)),
      openDeals: openDeals.get(p.id) ?? [],
      lostDeals: lostDeals.get(p.id) ?? [],
      lead: leadOf.has(p.id) ? { status: leadOf.get(p.id)!.status, disqualifiedReason: leadOf.get(p.id)!.disqualified_reason, updatedAt: leadOf.get(p.id)!.updated_at } : null,
      lastTouch: lastTouch.get(p.id) ?? null,
    };
    const verdict = temperatureOf(facts, today);
    if (verdict.temperature === null) {
      excluded[verdict.excluded] = (excluded[verdict.excluded] ?? 0) + 1;
      continue;
    }
    counts[verdict.temperature] += 1;
    rows.push({
      id: p.id,
      name: personName(p, "(no name)"),
      email: p.email,
      company: companyIds.map((id) => companyById.get(id)?.name ?? null).find((n): n is string => !!n) ?? null,
      temperature: verdict.temperature,
      reason: verdict.reason,
      lastTouch: facts.lastTouch,
    });
  }

  const order: Record<Temperature, number> = { warm: 0, cold: 1, other: 2 };
  rows.sort((a, b) => order[a.temperature] - order[b.temperature] || (b.lastTouch?.at ?? "").localeCompare(a.lastTouch?.at ?? "") || a.name.localeCompare(b.name));
  return { rows, counts, excluded };
}

// pipelineStageNames answers a plain PostgREST response; raise it like the
// paged reads above so a failed stage lookup is a failure, not a nameless deal.
function mustRowsOf<T>(res: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  if (res.error) throw new Error(`read failed: ${what}: ${res.error.message}`);
  return res.data ?? [];
}
