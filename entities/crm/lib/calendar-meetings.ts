import { companyIdsOfPerson } from "@/entities/contacts";
import { mustRows } from "@/kernel/data/read";
import { companyOs, type Json } from "@/kernel/data/supabase";
import { peopleByEmails } from "@/kernel/identity/person-by-email";
import { isDiscoveryCall } from "./scheduled-discovery-call";
import { addMeetingParticipants, recordMeeting, unwindMeeting, type MeetingParticipantInput } from "./meeting-records";
import { selectDeals, selectLead } from "./reads";
import type { MeetingType } from "./meeting-type";

// Every meeting on a connected calendar becomes a CRM meeting (CS.1). Until
// now only booked AI Discovery Calls reached the CRM from the calendar, and
// only as an interaction, so "Meetings booked this week" missed calls the
// calendar already knew about, and a person's record showed no meeting until a
// recording was imported.
//
// The rules, decided with Dave on 2026-11-17 and narrowed after the Fable
// review on PR #2681:
//   - Only a prospect's or a client's meeting is filed. A booked discovery
//     call, or a one-off call with a prospect on it, is Sales; a meeting with
//     a client on it is an AI Program Review. Everything else (team meetings,
//     partners, investors, a lawyer, a doctor) stays off the CRM: meetings of
//     those types are readable by every team member through the assistant's
//     team_chatbot_reader policy, and a calendar title is not something its
//     owner chose to share.
//   - An event marked private in Lark, or titled as a 1-1, coaching,
//     performance or forum meeting, is never filed. Nor is one with nobody
//     else on it, or one the owner declined; a filed meeting that becomes one
//     of these is archived.
//   - The company is linked through meeting_associations only, never
//     meetings.company_id: a client's portal managers see every meeting filed
//     against their company (entities/portal/lib/meetings.ts), and a calendar
//     entry is not notes anyone chose to share.
//
// A calendar meeting is keyed on (source 'lark', external_id 'calendar:<event
// id>'), the unique index the Lark Minutes rows already use. Its recording
// usually arrives later from another writer (a pasted Minutes link, Zoom, the
// coaching pickup) as a meeting of its own, so foldCalendarMeetings
// (calendar-meeting-folds.ts) retires the calendar row into the recorded one. Done here, in one place, rather than in
// every writer that files a recording.

export const CALENDAR_SOURCE = "lark";
export const calendarExternalId = (eventId: string) => `calendar:${eventId}`;
export const CALENDAR_PREFIX = "calendar:";

const PRIVATE_TITLE =
  /\b(1[-:\s]?on[-:\s]?1|1[-:]1|one[-\s]on[-\s]one|coaching|performance|review conversation|salary|compensation|hr|interview|legal|lawyer|termination|forum|therapy|personal)\b/i;
const PROSPECT_LEADS = ["new", "attempting", "connected", "meeting_booked", "open_deal"];
const CUSTOMER_STAGES = ["customer", "evangelist"];

export type CalendarAttendee = {
  email: string | null;
  name: string | null;
  /** Lark open id of someone in the tenant; null for an outside guest. */
  userId: string | null;
  rsvp: string | null;
  type: string;
};

export type CalendarEvent = {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  /** Lark's visibility is "private": only the owner sees the details. */
  private?: boolean;
  attendees: CalendarAttendee[];
};

/** What the CRM knows about one guest with an address. */
export type GuestFacts = {
  email: string;
  personId: string | null;
  isTeam: boolean;
  prospect: boolean;
  client: boolean;
  companyId: string | null;
  companyIsCustomer: boolean;
  openDealId: string | null;
};

export type CalendarDecision =
  | { file: false; reason: "alone" | "declined" | "private" | "not_a_client_meeting" }
  | {
      file: true;
      title: string;
      meetingType: Extract<MeetingType, "Sales" | "AI Program Review">;
      /** The company and deal the meeting is linked to, through meeting_associations. */
      linkCompanyId: string | null;
      dealId: string | null;
    };

/**
 * Whether an event id is one instance of a repeating event. Lark's instance
 * view names a one-off event "<id>_0" and each instance of a series
 * "<id>_<start in seconds>".
 */
export function isRecurring(eventId: string): boolean {
  const m = /_(\d+)$/.exec(eventId);
  return m !== null && m[1] !== "0";
}

/** The people on the invite other than the calendar's owner. Meeting rooms are not people. */
export function othersOn(event: CalendarEvent, ownerOpenId: string): CalendarAttendee[] {
  return event.attendees.filter((a) => a.type !== "resource" && !(a.userId && a.userId === ownerOpenId));
}

/** The pure rule: whether an event is a meeting, and what kind. */
export function decideCalendarMeeting(event: CalendarEvent, ownerOpenId: string, facts: GuestFacts[]): CalendarDecision {
  const owner = event.attendees.find((a) => a.userId && a.userId === ownerOpenId);
  if (owner?.rsvp === "decline") return { file: false, reason: "declined" };
  const others = othersOn(event, ownerOpenId);
  if (others.length === 0) return { file: false, reason: "alone" };

  if (event.private || PRIVATE_TITLE.test(event.title)) return { file: false, reason: "private" };

  const outsiders = facts.filter((f) => !f.isTeam);
  const prospect = outsiders.find((f) => f.prospect || f.openDealId);
  const client = outsiders.find((f) => f.client || f.companyIsCustomer);
  // A weekly or fortnightly sync is a relationship, not a call being sold, so a
  // repeating event is never Sales unless it is a booked discovery call.
  const sold = isDiscoveryCall(event.title) || (prospect !== undefined && client === undefined && !isRecurring(event.eventId));
  if (!sold && !client) return { file: false, reason: "not_a_client_meeting" };

  const lead = sold ? (prospect ?? client ?? outsiders.find((f) => f.companyId) ?? null) : client!;
  return {
    file: true,
    title: event.title.trim() || "Meeting",
    meetingType: sold ? "Sales" : "AI Program Review",
    linkCompanyId: lead?.companyId ?? null,
    dealId: lead?.openDealId ?? null,
  };
}

/** Reads what the CRM knows about every guest with an address. A failed read throws: "nobody known" would mistype the meeting. */
export async function guestFacts(emails: string[]): Promise<GuestFacts[]> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const people = mustRows(
    await peopleByEmails<{ id: string; email: string | null; persona: string | null; is_team_member: boolean | null }>(wanted, {
      columns: "id, email, persona, is_team_member",
    }),
    "[crm/calendar-meetings] people",
  );
  const byEmail = new Map<string, (typeof people)[number]>();
  for (const p of people) if (p.email && !byEmail.has(p.email.toLowerCase())) byEmail.set(p.email.toLowerCase(), p);
  const ids = [...byEmail.values()].map((p) => p.id);

  const leads = ids.length
    ? (mustRows(await selectLead("person_id, status").in("person_id", ids), "[crm/calendar-meetings] lead") as unknown as { person_id: string; status: string }[])
    : [];
  const deals = ids.length
    ? (mustRows(
        await selectDeals("id, person_id, company_id, created_at").in("person_id", ids).eq("status", "open").is("archived_at", null).order("created_at", { ascending: false }),
        "[crm/calendar-meetings] deals",
      ) as unknown as { id: string; person_id: string; company_id: string | null }[])
    : [];

  const out: GuestFacts[] = [];
  for (const email of wanted) {
    const p = byEmail.get(email);
    if (!p) {
      out.push({ email, personId: null, isTeam: false, prospect: false, client: false, companyId: null, companyIsCustomer: false, openDealId: null });
      continue;
    }
    const deal = deals.find((d) => d.person_id === p.id) ?? null;
    let companyId = deal?.company_id ?? null;
    if (!companyId) {
      const links = mustRows(await companyIdsOfPerson(p.id), "[crm/calendar-meetings] person_companies") as { company_id: string }[];
      companyId = links[0]?.company_id ?? null;
    }
    let stage: string | null = null;
    if (companyId) {
      const [row] = mustRows(
        await companyOs.from("companies").select("lifecycle_stage").eq("id", companyId).limit(1),
        "[crm/calendar-meetings] companies",
      ) as { lifecycle_stage: string | null }[];
      stage = row?.lifecycle_stage ?? null;
    }
    const leadStatus = leads.find((l) => l.person_id === p.id)?.status ?? null;
    out.push({
      email,
      personId: p.id,
      isTeam: p.is_team_member === true,
      prospect: p.persona === "prospect" || (leadStatus !== null && PROSPECT_LEADS.includes(leadStatus)),
      client: p.persona === "client",
      companyId,
      companyIsCustomer: stage !== null && CUSTOMER_STAGES.includes(stage),
      openDealId: deal?.id ?? null,
    });
  }
  return out;
}

export type FileOutcome = "filed" | "updated" | "unchanged" | "recorded" | "skipped";

type CalendarRow = { id: string; title: string | null; started_at: string | null; ended_at: string | null; archived_at: string | null; metadata: Json };

export const meta = (m: Json): Record<string, Json | undefined> => (m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, Json | undefined>) : {});

/**
 * Files one calendar event as a meeting, or brings the one already filed up to
 * date. A call already on record from another writer (it carries the event id)
 * is left as it is. Throws on a failed read or write.
 */
export async function fileCalendarMeeting(input: {
  event: CalendarEvent;
  ownerOpenId: string;
  ownerPersonId: string | null;
  ownerTeamMemberId: string;
  facts: GuestFacts[];
}): Promise<FileOutcome> {
  const { event, ownerOpenId, ownerPersonId, ownerTeamMemberId, facts } = input;
  const decision = decideCalendarMeeting(event, ownerOpenId, facts);

  const [recorded] = mustRows(
    await companyOs
      .from("meetings")
      .select("id")
      .eq("metadata->>lark_event_id", event.eventId)
      .not("external_id", "like", `${CALENDAR_PREFIX}%`)
      .is("archived_at", null)
      .limit(1),
    "[crm/calendar-meetings] recorded meeting",
  ) as { id: string }[];
  if (recorded) return decision.file ? "recorded" : "skipped";

  const [existing] = mustRows(
    await companyOs
      .from("meetings")
      .select("id, title, started_at, ended_at, archived_at, metadata")
      .eq("source", CALENDAR_SOURCE)
      .eq("external_id", calendarExternalId(event.eventId))
      .limit(1),
    "[crm/calendar-meetings] calendar meeting",
  ) as CalendarRow[];

  if (!decision.file) {
    // Declined or made private since it was filed: it is off the CRM. A call
    // that has already happened stays, even when the deal closed since; only
    // a slot still to come is withdrawn for no longer being a client meeting.
    const withdraw = decision.reason === "declined" || decision.reason === "private" || Date.parse(event.startsAt) > Date.now();
    if (withdraw && existing && existing.archived_at === null && !meta(existing.metadata).folded_into) {
      const now = new Date().toISOString();
      const { error } = await companyOs
        .from("meetings")
        .update({ archived_at: now, metadata: { ...meta(existing.metadata), cancelled_at: now }, updated_at: now })
        .eq("id", existing.id)
        .is("archived_at", null);
      if (error) throw new Error(`meeting withdraw: ${error.message}`);
    }
    return "skipped";
  }

  const endsAt = event.endsAt ?? event.startsAt;
  if (existing) {
    const m = meta(existing.metadata);
    // Folded into its recording: that row is the meeting now. Archived by a
    // person rather than by this routine: their call, left alone.
    if (m.folded_into || (existing.archived_at !== null && !m.cancelled_at)) return "unchanged";
    const same =
      Date.parse(existing.started_at ?? "") === Date.parse(event.startsAt) &&
      Date.parse(existing.ended_at ?? "") === Date.parse(endsAt) &&
      existing.title === decision.title &&
      existing.archived_at === null;
    if (same) return "unchanged";
    const { error } = await companyOs
      .from("meetings")
      .update({
        title: decision.title,
        started_at: event.startsAt,
        ended_at: endsAt,
        duration_seconds: Math.max(0, Math.round((Date.parse(endsAt) - Date.parse(event.startsAt)) / 1000)),
        // It is on the calendar again, so this routine's own cancellation is undone.
        archived_at: null,
        metadata: { ...m, cancelled_at: null },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(`meeting update: ${error.message}`);
    return "updated";
  }

  const { data, error } = await recordMeeting({
    source: CALENDAR_SOURCE,
    external_id: calendarExternalId(event.eventId),
    title: decision.title,
    meeting_type: decision.meetingType,
    owner_id: ownerPersonId,
    company_id: null,
    started_at: event.startsAt,
    ended_at: endsAt,
    duration_seconds: Math.max(0, Math.round((Date.parse(endsAt) - Date.parse(event.startsAt)) / 1000)),
    metadata: {
      origin: "calendar",
      lark_event_id: event.eventId,
      calendar_owner: ownerTeamMemberId,
    },
  });
  // Another run filed it a moment ago.
  if (error?.code === "23505") return "unchanged";
  if (error || !data) throw new Error(`meeting insert: ${error?.message ?? "no row"}`);
  const meetingId = (data as { id: string }).id;

  try {
    const participants: MeetingParticipantInput[] = [];
    if (ownerPersonId) participants.push({ meeting_id: meetingId, person_id: ownerPersonId, role: "host", attended: true });
    for (const a of othersOn(event, ownerOpenId)) {
      const f = a.email ? facts.find((x) => x.email === a.email!.toLowerCase()) : undefined;
      const role = a.rsvp === "decline" ? "absent" : a.rsvp === "accept" ? "attendee" : "optional";
      participants.push(
        f?.personId
          ? { meeting_id: meetingId, person_id: f.personId, role, attended: role !== "absent" }
          : { meeting_id: meetingId, external_email: a.email, display_name: a.name, role, attended: role !== "absent" },
      );
    }
    if (participants.length) {
      const { error: pErr } = await addMeetingParticipants(participants);
      if (pErr) throw new Error(`participants: ${pErr.message}`);
    }
    const links = [
      ...(decision.linkCompanyId ? [{ meeting_id: meetingId, entity_type: "company", entity_id: decision.linkCompanyId }] : []),
      ...(decision.dealId ? [{ meeting_id: meetingId, entity_type: "deal", entity_id: decision.dealId }] : []),
    ];
    if (links.length) {
      const { error: lErr } = await companyOs.from("meeting_associations").insert(links);
      if (lErr) throw new Error(`associations: ${lErr.message}`);
    }
  } catch (err) {
    await unwindMeeting(meetingId);
    throw err;
  }
  return "filed";
}

/**
 * Archives the calendar meetings of one calendar, inside the window it was
 * read for, whose events are no longer on it: they were cancelled. Called only
 * after a successful read of the window, so a failed read is never taken for
 * "everything was cancelled". Answers how many it archived.
 */
export async function archiveCancelledCalendarMeetings(ownerTeamMemberId: string, from: Date, to: Date, seenEventIds: Set<string>): Promise<number> {
  const rows = mustRows(
    await companyOs
      .from("meetings")
      .select("id, external_id, metadata")
      .eq("source", CALENDAR_SOURCE)
      .like("external_id", `${CALENDAR_PREFIX}%`)
      .eq("metadata->>calendar_owner", ownerTeamMemberId)
      .is("archived_at", null)
      .gte("started_at", from.toISOString())
      .lte("started_at", to.toISOString()),
    "[crm/calendar-meetings] calendar window",
  ) as { id: string; external_id: string; metadata: Json }[];
  const gone = rows.filter((r) => !seenEventIds.has(r.external_id.slice(CALENDAR_PREFIX.length)));
  const now = new Date().toISOString();
  for (const r of gone) {
    const { error } = await companyOs
      .from("meetings")
      .update({ archived_at: now, metadata: { ...meta(r.metadata), cancelled_at: now }, updated_at: now })
      .eq("id", r.id)
      .is("archived_at", null);
    if (error) throw new Error(`meeting cancel: ${error.message}`);
  }
  return gone.length;
}
