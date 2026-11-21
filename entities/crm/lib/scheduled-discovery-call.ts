import { companyIdsOfPerson, linkPersonToCompanyOnce } from "@/entities/contacts";
import { getOrCreatePerson } from "@/kernel/data/company-os";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { companyDomainOf } from "@/kernel/identity/free-mail";
import { findOrCreateCompanyByHost, updatePeople } from "@/kernel/identity/writes";
import { insertInteractions, updateInteractions } from "@/kernel/messaging/writes";
import { bumpPersonCompanies, getLead, recordTransition, type LeadStatus } from "./lifecycle";
import { selectDeals } from "./reads";
import { upsertLead } from "./writes";

// A call someone booked with us, as the daily calendar check finds it. Being on
// the calendar means a conversation is coming, so the person becomes a lead if
// they are not one, and everyone's record says the call is scheduled. Stages
// only ever move forward from early outreach: a deal in progress, a customer or
// a lead someone parked keeps its stage and just gains the call.

export type ScheduledDiscoveryCall = {
  /** Lark's event id, the same one for every day this event is seen. */
  eventId: string;
  title: string;
  startsAt: string;
  attendees: { email: string; name: string | null }[];
};

export type ScheduledCallOutcome = {
  leadsCreated: number;
  leadsAdvanced: number;
  stageKept: number;
  teamSkipped: number;
  call: "logged" | "moved" | "unchanged" | "no_contact";
};

export type LeadMove = "create" | "advance" | "none";

const SOURCE = "lark_calendar";
const REASON = "meeting_booked";
const EARLY_STATUSES: LeadStatus[] = ["new", "attempting", "connected"];
const CUSTOMER_STAGES = ["customer", "evangelist"];

export function isDiscoveryCall(title: string): boolean {
  return /\bAI Discovery Call\b/i.test(title);
}

/** What a scheduled call does to this person's lead. */
export function leadMoveFor(status: LeadStatus | null, isCustomer: boolean): LeadMove {
  if (status === null) return isCustomer ? "none" : "create";
  return EARLY_STATUSES.includes(status) ? "advance" : "none";
}

async function isCustomer(personId: string, companyIds: string[]): Promise<boolean> {
  const deals = await selectDeals("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .in("status", ["open", "won"])
    .is("archived_at", null);
  if (deals.error) throw new Error(`deals: ${deals.error.message}`);
  if ((deals.count ?? 0) > 0) return true;
  if (companyIds.length === 0) return false;
  const companies = mustRows(
    await companyOs.from("companies").select("id").in("id", companyIds).in("lifecycle_stage", CUSTOMER_STAGES).limit(1),
    "[crm/discovery-calendar] companies",
  );
  return companies.length > 0;
}

/** The person's companies, first linking them to a company their email domain already names. */
async function companiesOf(personId: string, email: string): Promise<string[]> {
  const links = await companyIdsOfPerson(personId);
  if (links.error) throw new Error(`person_companies: ${links.error.message}`);
  const linked = (links.data ?? []).map((l: { company_id: string }) => l.company_id);
  if (linked.length > 0) return linked;
  // A free mailbox has no domain to go by, and a booking never creates a company.
  const domain = companyDomainOf(email);
  if (!domain) return [];
  const { data, error } = await findOrCreateCompanyByHost(domain, null, false);
  if (error) throw new Error(`company by host: ${error.message}`);
  const companyId = ((data ?? [])[0] as { company_id: string } | undefined)?.company_id;
  if (!companyId) return [];
  const { error: linkError } = await linkPersonToCompanyOnce(personId, companyId, true);
  if (linkError) throw new Error(`person_companies link: ${linkError.message}`);
  return [companyId];
}

async function applyLeadMove(personId: string, move: LeadMove, fromStatus: LeadStatus | null): Promise<void> {
  const { error } = await upsertLead(
    { person_id: personId, status: "meeting_booked", sla_due_at: null, updated_at: new Date().toISOString() },
    { onConflict: "person_id" },
  );
  if (error) throw new Error(`lead: ${error.message}`);
  await recordTransition({ personId, fromStatus, toStatus: "meeting_booked", reason: REASON });
  if (move === "create") {
    const { error: personaError } = await updatePeople({ persona: "prospect" }).eq("id", personId).is("persona", null);
    if (personaError) throw new Error(`persona: ${personaError.message}`);
  }
  await bumpPersonCompanies(personId, "lead", { reason: REASON });
}

/** One entry per event: a later run finds it by event id, and a rescheduled call moves it. */
async function logCall(
  call: ScheduledDiscoveryCall,
  contact: { personId: string; companyId: string | null },
): Promise<"logged" | "moved" | "unchanged"> {
  const existing = mustRows(
    await companyOs.from("interactions").select("id, occurred_at").eq("kind", "meeting").eq("metadata->>lark_event_id", call.eventId).limit(1),
    "[crm/discovery-calendar] interactions",
  ) as { id: string; occurred_at: string }[];
  const row = existing[0];
  if (row) {
    if (Date.parse(row.occurred_at) === Date.parse(call.startsAt)) return "unchanged";
    const { error } = await updateInteractions({ occurred_at: call.startsAt }).eq("id", row.id);
    if (error) throw new Error(`interaction move: ${error.message}`);
    return "moved";
  }
  const { error } = await insertInteractions({
    kind: "meeting",
    subject: call.title,
    body: "Call scheduled on the Lark calendar.",
    occurred_at: call.startsAt,
    person_id: contact.personId,
    company_id: contact.companyId,
    metadata: { source: SOURCE, lark_event_id: call.eventId, attendee_emails: call.attendees.map((a) => a.email) },
  });
  if (error) throw new Error(`interaction: ${error.message}`);
  return "logged";
}

/** Throws on a failed read or write, so the daily run reports this event and moves to the next. */
export async function recordScheduledDiscoveryCall(call: ScheduledDiscoveryCall): Promise<ScheduledCallOutcome> {
  const outcome: ScheduledCallOutcome = { leadsCreated: 0, leadsAdvanced: 0, stageKept: 0, teamSkipped: 0, call: "no_contact" };
  let contact: { personId: string; companyId: string | null } | null = null;

  for (const attendee of call.attendees) {
    const person = await getOrCreatePerson({ email: attendee.email, name: attendee.name, source: SOURCE });
    if (!person.ok) throw new Error(`person: ${person.error}`);
    const [row] = mustRows(
      await companyOs.from("people").select("is_team_member").eq("id", person.id).limit(1),
      "[crm/discovery-calendar] people",
    ) as { is_team_member: boolean }[];
    // A colleague added to the invite is not a prospect.
    if (row?.is_team_member) {
      outcome.teamSkipped++;
      continue;
    }

    const companyIds = await companiesOf(person.id, attendee.email);
    contact ??= { personId: person.id, companyId: companyIds[0] ?? null };

    const lookup = await getLead(person.id);
    if (!lookup.ok) throw new Error(lookup.error);
    const status = lookup.lead?.status ?? null;
    const move = leadMoveFor(status, await isCustomer(person.id, companyIds));
    if (move === "none") {
      outcome.stageKept++;
      continue;
    }
    await applyLeadMove(person.id, move, status);
    if (move === "create") outcome.leadsCreated++;
    else outcome.leadsAdvanced++;
  }

  if (contact) outcome.call = await logCall(call, contact);
  return outcome;
}
