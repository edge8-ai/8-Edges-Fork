import type { PersonPurchases, PersonPurchasesSlot } from "@/entities/billing";
import type { PersonSurveyResponse, PersonSurveyResponsesSlot } from "@/entities/org";
import { companyOs } from "@/kernel/data/supabase";
import { personName } from "@/kernel/config/people-name";
import { companyLinksOfPerson } from "@/entities/contacts";

// Person 360 aggregator. Everything in company_os joins on person_id, so this
// fans out parallel reads and returns one object the detail page renders.
// Related queries are tolerant: a denied/empty table yields [] rather than
// throwing, so the page degrades gracefully (e.g. deals before grants land).

export type Person = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  persona: string | null;
  source: string | null;
  linkedin_url: string | null;
  country: string | null;
  city: string | null;
  state_province: string | null;
  timezone: string | null;
  is_team_member: boolean | null;
  do_not_contact: boolean | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
};

// The lead satellite row, when the person is (or was) worked as a lead.
export type PersonLead = {
  status: string;
  sla_due_at: string | null;
  attempt_count: number;
  disqualified_reason: string | null;
};

// The candidate_profile satellite row, when the person is in the talent pool.
export type CandidateProfile = {
  headline: string | null;
  current_title: string | null;
  portfolio_url: string | null;
  do_not_hire: boolean;
  pool_status: string | null;
};

export type Person360 = {
  // The name to show, decided once in the kernel (S.14), not by each screen.
  name: string;
  person: Person;
  lead: PersonLead | null;
  candidateProfile: CandidateProfile | null;
  inquiries: Array<{ id: string; type: string | null; subject: string | null; status: string | null; source: string | null; created_at: string; deal_id: string | null }>;
  deals: Array<{ id: string; title: string | null; amount_cents: number | null; amount_usd_cents: number | null; currency: string | null; status: string | null; stage_id: string | null; created_at: string }>;
  /** null when billing is not installed: the page then has no Orders or AIO Pad tab. */
  orders: PersonPurchases["orders"] | null;
  bookings: PersonPurchases["bookings"] | null;
  applications: Array<{ id: string; job_requisition_id: string | null; job_title: string | null; status: string | null; rating: number | null; applied_at: string | null; created_at: string; resume_document_id: string | null }>;
  documents: Array<{ id: string; title: string | null; mime_type: string | null; byte_size: number | null; created_at: string }>;
  /** null when org is not installed: the page then has no Surveys tab. */
  surveyResponses: PersonSurveyResponse[] | null;
  interactions: Array<{ id: string; kind: string | null; subject: string | null; body: string | null; occurred_at: string | null; created_at: string }>;
  meetings: Array<{ id: string; title: string | null; meeting_type: string | null; started_at: string | null; source: string | null }>;
  transitions: Array<{ id: string; from_stage: string | null; to_stage: string | null; from_status: string | null; to_status: string | null; reason: string | null; note: string | null; occurred_at: string }>;
  companies: Array<{ company_id: string; name: string | null; title: string | null; role: string | null; is_primary: boolean }>;
};

async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error: error } = await p;
  if (error) console.error("[company-os/crm] person 360 related read", error);
  return data ?? [];
}

/**
 * The person page's data, minus the parts other entities own. `hiring` is passed
 * in rather than fetched: company-os renders the ATS screens, so its door graph
 * may not also import hiring, and a person page is a composition of what each
 * entity knows about someone. The contact route fans out and merges.
 *
 * `others` are the slots the contact page takes from entities crm does not
 * require (ADR 0032): billing's orders and bookings, org's survey responses.
 * A reader left out (its provider is not installed, or the caller is the
 * contacts shelf, which shows none of them) leaves its list null.
 */
export async function getPerson360(
  id: string,
  hiring: { candidateProfile: Record<string, unknown> | null; applications: Record<string, unknown>[] } = {
    candidateProfile: null,
    applications: [],
  },
  others: { purchases?: PersonPurchasesSlot; surveyResponses?: PersonSurveyResponsesSlot } = {},
): Promise<Person360 | null> {
  // Fire the person lookup in the SAME batch as the related reads: none of them
  // depend on the person row (they all key on the same `id`), so serializing the
  // person query first was one wasted round-trip wave. Null-check after.
  const [personRes, leadRows, inquiries, deals, purchases, documents, surveyResponses, interactions, participantRows, transitions, companyLinks] =
    await Promise.all([
      companyOs.from("people").select("*").eq("id", id).maybeSingle(),
      safe(companyOs.from("lead").select("status, sla_due_at, attempt_count, disqualified_reason").eq("person_id", id)),
      safe(companyOs.from("inquiries").select("id, type, subject, status, source, created_at, deal_id").eq("person_id", id).order("created_at", { ascending: false })),
      safe(companyOs.from("deals").select("id, title, amount_cents, amount_usd_cents, currency, status, stage_id, created_at").eq("person_id", id).order("created_at", { ascending: false })),
      others.purchases ? others.purchases(id) : null,
      safe(companyOs.from("documents").select("id, title, mime_type, byte_size, created_at").eq("entity_type", "person").eq("entity_id", id).order("created_at", { ascending: false })),
      others.surveyResponses ? others.surveyResponses(id) : null,
      safe(companyOs.from("interactions").select("id, kind, subject, body, occurred_at, created_at").eq("person_id", id).order("occurred_at", { ascending: false }).limit(100)),
      safe(companyOs.from("meeting_participants").select("meetings(id, title, meeting_type, started_at, source)").eq("person_id", id)),
      safe(companyOs.from("lifecycle_transitions").select("id, from_stage, to_stage, from_status, to_status, reason, note, occurred_at").eq("person_id", id).order("occurred_at", { ascending: false }).limit(100)),
      safe(companyLinksOfPerson(id)),
    ]);

  if (personRes.error || !personRes.data) return null;
  const person = personRes.data as Person;

  const profileRows = hiring.candidateProfile ? [hiring.candidateProfile] : [];
  const applications: Person360["applications"] = (
    hiring.applications as Array<{
      id: string;
      job_requisition_id: string | null;
      status: string | null;
      rating: number | null;
      applied_at: string | null;
      created_at: string;
      resume_document_id: string | null;
      job_requisitions: { title: string | null } | Array<{ title: string | null }> | null;
    }>
  ).map((a) => {
    const jr = Array.isArray(a.job_requisitions) ? a.job_requisitions[0] : a.job_requisitions;
    return {
      id: a.id,
      job_requisition_id: a.job_requisition_id,
      job_title: jr?.title ?? null,
      status: a.status,
      rating: a.rating,
      applied_at: a.applied_at,
      created_at: a.created_at,
      resume_document_id: a.resume_document_id,
    };
  });

  return {
    person,
    name: personName(person),
    lead: (leadRows[0] as PersonLead | undefined) ?? null,
    candidateProfile: (profileRows[0] as CandidateProfile | undefined) ?? null,
    inquiries: inquiries as Person360["inquiries"],
    deals: deals as Person360["deals"],
    orders: purchases?.orders ?? null,
    bookings: purchases?.bookings ?? null,
    applications,
    documents: documents as Person360["documents"],
    surveyResponses,
    interactions: interactions as Person360["interactions"],
    meetings: (participantRows as Array<{ meetings: Person360["meetings"][number] | Person360["meetings"] | null }>)
      .flatMap((r) => (Array.isArray(r.meetings) ? r.meetings : r.meetings ? [r.meetings] : []))
      .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? "")),
    transitions: transitions as Person360["transitions"],
    companies: (companyLinks as Array<{ company_id: string; title: string | null; role: string | null; is_primary: boolean; companies: { id: string; name: string | null } | Array<{ id: string; name: string | null }> | null }>)
      .map((l) => {
        const c = Array.isArray(l.companies) ? l.companies[0] : l.companies;
        return { company_id: l.company_id, name: c?.name ?? null, title: l.title, role: l.role, is_primary: l.is_primary };
      }),
  };
}
