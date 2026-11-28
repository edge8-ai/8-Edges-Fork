import { describe, expect, it, vi } from "vitest";

// The pure rules of CS.1: which calendar events become meetings, how they are
// typed and linked, what stays private, and which recording a calendar slot
// folds into. The database writes are exercised by the routine's own test.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

const { decideCalendarMeeting } = await import("./calendar-meetings");
const { matchFolds, FOLD_WINDOW_MS } = await import("./calendar-meeting-folds");
type Facts = Parameters<typeof decideCalendarMeeting>[2][number];

const OWNER = "ou_owner";
const owner = { email: null, name: "Dave", userId: OWNER, rsvp: "accept", type: "user" };
const guest = (email: string) => ({ email, name: email, userId: null, rsvp: "accept", type: "third_party" });
const colleague = (id: string) => ({ email: null, name: "Colleague", userId: id, rsvp: "accept", type: "user" });
const event = (title: string, attendees: Parameters<typeof decideCalendarMeeting>[0]["attendees"]) => ({
  eventId: "e1",
  title,
  startsAt: "2026-11-17T02:30:00.000Z",
  endsAt: "2026-11-17T03:00:00.000Z",
  attendees,
});
const fact = (email: string, over: Partial<Facts> = {}): Facts => ({
  email,
  personId: `p-${email}`,
  isTeam: false,
  prospect: false,
  client: false,
  companyId: null,
  companyIsCustomer: false,
  openDealId: null,
  ...over,
});

describe("which calendar events are meetings", () => {
  it("skips an event with nobody else on it, and one the owner declined", () => {
    expect(decideCalendarMeeting(event("Focus", [owner]), OWNER, [])).toEqual({ file: false, reason: "alone" });
    const declined = event("Lunch", [{ ...owner, rsvp: "decline" }, guest("a@x.test")]);
    expect(decideCalendarMeeting(declined, OWNER, [fact("a@x.test")])).toEqual({ file: false, reason: "declined" });
  });

  it("ignores meeting rooms when deciding whether anyone else is there", () => {
    const room = { email: null, name: "Room 1", userId: null, rsvp: "accept", type: "resource" };
    expect(decideCalendarMeeting(event("Focus", [owner, room]), OWNER, [])).toMatchObject({ file: false });
  });
});

describe("how a calendar meeting is typed and linked", () => {
  it("types a prospect's call Sales and links it to their company and open deal", () => {
    const d = decideCalendarMeeting(event("Catch up", [owner, guest("p@x.test")]), OWNER, [
      fact("p@x.test", { prospect: true, companyId: "co1", openDealId: "d1" }),
    ]);
    expect(d).toEqual({ file: true, title: "Catch up", meetingType: "Sales", linkCompanyId: "co1", dealId: "d1" });
  });

  it("types a booked discovery call Sales even when the guest is unknown", () => {
    const d = decideCalendarMeeting(event("Ada and Sam Host: AI Discovery Call", [owner, guest("new@x.test")]), OWNER, [fact("new@x.test", { personId: null })]);
    expect(d).toMatchObject({ file: true, meetingType: "Sales", linkCompanyId: null });
  });

  it("types a client's meeting AI Program Review, linked to the company", () => {
    const d = decideCalendarMeeting(event("Sprint review", [owner, guest("c@x.test")]), OWNER, [
      fact("c@x.test", { client: true, companyId: "co2", companyIsCustomer: true }),
    ]);
    expect(d).toMatchObject({ file: true, meetingType: "AI Program Review", linkCompanyId: "co2" });
  });

  it("never types a repeating sync or a client's call Sales, unless it is a booked discovery call", () => {
    const weekly = { ...event("Weekly sync", [owner, guest("p@x.test")]), eventId: "e9_1787727600" };
    expect(decideCalendarMeeting(weekly, OWNER, [fact("p@x.test", { prospect: true, companyId: "co1" })])).toEqual({ file: false, reason: "not_a_client_meeting" });
    const both = event("Planning", [owner, guest("p@x.test"), guest("c@x.test")]);
    expect(
      decideCalendarMeeting(both, OWNER, [fact("p@x.test", { prospect: true, companyId: "co1" }), fact("c@x.test", { client: true, companyId: "co2", companyIsCustomer: true })]),
    ).toMatchObject({ meetingType: "AI Program Review", linkCompanyId: "co2" });
    const booked = { ...event("Bo and Sam Host: AI Discovery Call", [owner, guest("c@x.test")]), eventId: "e8_1787727600" };
    expect(decideCalendarMeeting(booked, OWNER, [fact("c@x.test", { client: true })])).toMatchObject({ meetingType: "Sales" });
  });
});

describe("what stays off the CRM", () => {
  it("files no team meeting, and no meeting with outside guests who are not prospects or clients", () => {
    expect(decideCalendarMeeting(event("Weekly sync", [owner, colleague("u1"), colleague("u2")]), OWNER, [])).toEqual({ file: false, reason: "not_a_client_meeting" });
    expect(decideCalendarMeeting(event("Investor update", [owner, guest("v@x.test")]), OWNER, [fact("v@x.test")])).toEqual({ file: false, reason: "not_a_client_meeting" });
  });

  it("files nothing marked private in Lark or titled as a private conversation, even with a prospect on it", () => {
    const prospect = [fact("g@x.test", { prospect: true, companyId: "co1", openDealId: "d1" })];
    for (const title of ["Ada / Dave 1:1", "Coaching with Bo", "Shadow Forum", "One on one", "Salary review", "Interview: Bo", "Legal"]) {
      expect(decideCalendarMeeting(event(title, [owner, guest("g@x.test")]), OWNER, prospect)).toEqual({ file: false, reason: "private" });
    }
    expect(decideCalendarMeeting({ ...event("Catch up", [owner, guest("g@x.test")]), private: true }, OWNER, prospect)).toEqual({ file: false, reason: "private" });
    // A company's name is not a private subject.
    expect(decideCalendarMeeting(event("Edge8 <> Bethany Medical Intro", [owner, guest("g@x.test")]), OWNER, prospect)).toMatchObject({ file: true, meetingType: "Sales" });
  });
});

describe("folding a calendar slot into its recording", () => {
  const at = (min: number) => new Date(Date.parse("2026-11-17T02:30:00.000Z") + min * 60_000).toISOString();
  const hosts = new Set(["dave"]);

  it("folds into a recording near the slot that shares a company", () => {
    const out = matchFolds([{ id: "cal", startedAt: at(0), companyIds: ["co1"], personIds: ["dave"] }], [{ id: "rec", startedAt: at(4), companyIds: ["co1"], personIds: [] }], hosts);
    expect(out).toEqual([{ calendarId: "cal", recordedId: "rec" }]);
  });

  it("never matches on the host alone, or outside the window", () => {
    const cal = { id: "cal", startedAt: at(0), companyIds: [], personIds: ["dave", "ada"] };
    expect(matchFolds([cal], [{ id: "r1", startedAt: at(2), companyIds: [], personIds: ["dave"] }], hosts)).toEqual([]);
    const late = FOLD_WINDOW_MS / 60_000 + 1;
    expect(matchFolds([cal], [{ id: "r2", startedAt: at(late), companyIds: [], personIds: ["ada"] }], hosts)).toEqual([]);
    expect(matchFolds([cal], [{ id: "r3", startedAt: at(10), companyIds: [], personIds: ["ada"] }], hosts)).toEqual([{ calendarId: "cal", recordedId: "r3" }]);
  });

  it("gives one recording to one slot, the nearest, whichever slot comes first", () => {
    const slots = [
      { id: "c1", startedAt: at(0), companyIds: ["co1"], personIds: [] },
      { id: "c2", startedAt: at(15), companyIds: ["co1"], personIds: [] },
    ];
    expect(matchFolds(slots, [{ id: "rec", startedAt: at(1), companyIds: ["co1"], personIds: [] }], hosts)).toEqual([{ calendarId: "c1", recordedId: "rec" }]);
    expect(matchFolds(slots, [{ id: "rec", startedAt: at(14), companyIds: ["co1"], personIds: [] }], hosts)).toEqual([{ calendarId: "c2", recordedId: "rec" }]);
  });
});

describe("filing a calendar meeting", () => {
  it("never files it on meetings.company_id, which the client portal reads, only through meeting_associations", async () => {
    vi.resetModules();
    const inserts: { table: string; row: unknown }[] = [];
    const chain = (table: string) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "not", "is", "limit", "like", "update"]) q[k] = () => q;
      q.then = (ok: (v: unknown) => void) => ok({ data: [], error: null });
      q.insert = (row: unknown) => {
        inserts.push({ table, row });
        return { error: null, select: () => ({ single: async () => ({ data: { id: "m1" }, error: null }) }) };
      };
      return q;
    };
    vi.doMock("@/kernel/data/supabase", () => ({ companyOs: { from: chain } }));
    const { fileCalendarMeeting } = await import("./calendar-meetings");
    const outcome = await fileCalendarMeeting({
      event: event("Sprint review", [owner, guest("c@x.test")]),
      ownerOpenId: OWNER,
      ownerPersonId: "p-dave",
      ownerTeamMemberId: "t1",
      facts: [fact("c@x.test", { client: true, companyId: "co2", companyIsCustomer: true })],
    });
    expect(outcome).toBe("filed");
    const meeting = inserts.find((i) => i.table === "meetings")!.row as Record<string, unknown>;
    expect(meeting).toMatchObject({ company_id: null, meeting_type: "AI Program Review", external_id: "calendar:e1" });
    expect(inserts.find((i) => i.table === "meeting_associations")!.row).toEqual([{ meeting_id: "m1", entity_type: "company", entity_id: "co2" }]);
  });
});
