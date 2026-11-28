import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import {
  LARK_CALENDAR_SCOPE,
  listCalendarEvents,
  listEventAttendees,
  primaryCalendarId,
} from "@/kernel/messaging/lark-user";
import { personIdOfTeamMember } from "@/kernel/identity/team-people";
import {
  archiveCancelledCalendarMeetings,
  fileCalendarMeeting,
  foldCalendarMeetings,
  guestFacts,
  isDiscoveryCall,
  recordScheduledDiscoveryCall,
} from "@/entities/crm";
import { freshAccessToken, listLarkConnections, noteLarkError } from "@/entities/coaching/lib/lark-connection";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 23 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Meetings from the calendar",
  description: "Daily at 06:00 Vietnam time. Reads the calendar of whoever connected Lark with calendar access, two days back and two weeks ahead. Every event with another person on it becomes a CRM meeting (private ones as time and attendees only), moved events are updated, cancelled ones archived, and a meeting whose recording was filed since is folded into it. Each AI Discovery Call also makes its outside guests leads if they are not already, moves early leads to meeting booked, and leaves any later stage alone.",
  content: ["Lark calendar", "Meetings", "People", "Leads", "Companies", "Interactions"],
  apps: ["Lark", "Supabase"],
};

// Vercel cron: daily 23:00 UTC = 06:00 Saigon. This lives in coaching, not crm,
// because coaching owns the Lark connections and requires crm; crm reaching back
// for them would be a cycle. What a booking means for a lead is crm's rule, one
// door call away.
//
// The window starts two days back so a call booked and held between two runs is
// still seen. Every write is keyed on who the person is and the event id, so
// seeing an event on fourteen mornings changes nothing after the first. Since
// CS.1 every event with another person on it is filed as a meeting, not only
// discovery calls; the rules for which, and how, are crm's
// (entities/crm/lib/calendar-meetings.ts). Recordings arrive days after their
// slot, so the fold looks back a fortnight.

const DAY_MS = 86_400_000;
const LOOK_BACK_DAYS = 2;
const LOOK_AHEAD_DAYS = 14;
const FOLD_BACK_DAYS = 14;

type Failure = { subject: string; step: string; error: string };

export async function handler(): Promise<Response> {
  const connections = (await listLarkConnections()).filter((c) => (c.scope ?? "").split(" ").includes(LARK_CALENDAR_SCOPE));
  if (connections.length === 0) {
    return routineResult({ status: "skipped", reason: "nobody has connected Lark with calendar access" });
  }

  const now = Date.now();
  const from = new Date(now - LOOK_BACK_DAYS * DAY_MS);
  const to = new Date(now + LOOK_AHEAD_DAYS * DAY_MS);
  const totals = {
    calls: 0, leadsCreated: 0, leadsAdvanced: 0, stageKept: 0, callsLogged: 0, callsMoved: 0, noEmail: 0,
    meetingsFiled: 0, meetingsUpdated: 0, meetingsOnRecord: 0, eventsSkipped: 0, meetingsCancelled: 0, meetingsFolded: 0,
  };
  const failures: Failure[] = [];

  for (const connection of connections) {
    const subject = `Lark connection ${connection.teamMemberId}`;
    const fail = async (step: string, error: string) => {
      failures.push({ subject, step, error });
      await noteLarkError(connection.teamMemberId, `${step}: ${error}`);
    };

    const token = await freshAccessToken(connection);
    if (!token.ok) {
      await fail("token", token.error);
      continue;
    }
    const primary = await primaryCalendarId(token.token);
    if (!primary.ok) {
      await fail("primary calendar", primary.error);
      continue;
    }
    const listed = await listCalendarEvents(token.token, primary.calendarId, from, to);
    if (!listed.ok) {
      await fail("events", listed.error);
      continue;
    }

    let ownerPersonId: string | null;
    try {
      ownerPersonId = await personIdOfTeamMember(connection.teamMemberId);
    } catch (err) {
      await fail("owner", err instanceof Error ? err.message : String(err));
      continue;
    }

    for (const event of listed.events) {
      // The event id and never the title: a booking's title names a person.
      const eventSubject = `Lark event ${event.eventId}`;
      const invited = await listEventAttendees(token.token, primary.calendarId, event.eventId);
      if (!invited.ok) {
        failures.push({ subject: eventSubject, step: "attendees", error: invited.error });
        continue;
      }
      if (isDiscoveryCall(event.title)) await recordDiscoveryCall(event, invited.attendees, eventSubject);
      try {
        const attendees = invited.attendees.map((a) => ({ email: a.email, name: a.displayName, userId: a.userId, rsvp: a.rsvp, type: a.type }));
        const facts = await guestFacts(attendees.flatMap((a) => (a.email ? [a.email] : [])));
        const filed = await fileCalendarMeeting({
          event: { ...event, attendees },
          ownerOpenId: connection.openId,
          ownerPersonId,
          ownerTeamMemberId: connection.teamMemberId,
          facts,
        });
        if (filed === "filed") totals.meetingsFiled++;
        else if (filed === "updated") totals.meetingsUpdated++;
        else if (filed === "recorded") totals.meetingsOnRecord++;
        else if (filed === "skipped") totals.eventsSkipped++;
      } catch (err) {
        failures.push({ subject: eventSubject, step: "meeting", error: err instanceof Error ? err.message : String(err) });
      }
    }

    try {
      totals.meetingsCancelled += await archiveCancelledCalendarMeetings(connection.teamMemberId, from, to, new Set(listed.events.map((e) => e.eventId)));
    } catch (err) {
      failures.push({ subject, step: "cancelled", error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    totals.meetingsFolded = await foldCalendarMeetings(new Date(now - FOLD_BACK_DAYS * DAY_MS));
  } catch (err) {
    failures.push({ subject: "meetings", step: "fold", error: err instanceof Error ? err.message : String(err) });
  }

  return routineResult({ status: "ok", ...totals, failures });

  async function recordDiscoveryCall(
    event: { eventId: string; title: string; startsAt: string },
    invitees: { email: string | null; displayName: string | null }[],
    eventSubject: string,
  ) {
    totals.calls++;
    // A guest on Lark in another company shows as external with no address,
    // and an address is the only way to know who they are.
    const guests = invitees.flatMap((a) =>
      a.email ? [{ email: a.email, name: a.displayName && a.displayName !== a.email ? a.displayName : null }] : [],
    );
    if (guests.length === 0) {
      totals.noEmail++;
      return;
    }
    try {
      const outcome = await recordScheduledDiscoveryCall({ ...event, attendees: guests });
      totals.leadsCreated += outcome.leadsCreated;
      totals.leadsAdvanced += outcome.leadsAdvanced;
      totals.stageKept += outcome.stageKept;
      if (outcome.call === "logged") totals.callsLogged++;
      if (outcome.call === "moved") totals.callsMoved++;
    } catch (err) {
      failures.push({ subject: eventSubject, step: "record", error: err instanceof Error ? err.message : String(err) });
    }
  }
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/discovery-calendar/", req, handler);
