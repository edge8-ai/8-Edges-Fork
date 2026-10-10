import { describe, expect, it } from "vitest";
import { rowActions, type RowActionState } from "./row-actions";

// One test per row state in doc §C.3's table, plus the two invariants the bar
// must never break: at most one filled control, and the escape hatch always
// present. The subjects are placeholders, never real colleagues — a test that
// names a person would put a person's name in a repository that ships.

const base: RowActionState = {
  profileId: "p1",
  name: "Coachee One",
  proposedOn: null,
  proposedBy: null,
  nextOneOnOneOn: null,
  agendaWritten: false,
  todayISO: "2026-09-22",
  missedOn: null,
  missedMeetingId: null,
  nextMeetingId: null,
  nextStartsAt: null,
  hasHeldOneOnOne: false,
};

const ids = (bar: ReturnType<typeof rowActions>) => bar.quiet.map((a) => a.id);

describe("rowActions", () => {
  it("offers Mark it done on the session's own day, with the prep beside it (K.80)", () => {
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-09-22", nextMeetingId: "m1", nextStartsAt: "10:00", agendaWritten: true });
    expect(bar.filled).toEqual(expect.objectContaining({ id: "mark-held", label: "Mark it done" }));
    expect(ids(bar)).toContain("open-prep");
  });


  // K.68. A booking whose day has passed is not something to prepare for, and
  // the sibling that renders the help list has always known it: help-lines.ts
  // bounds the same window with `away >= 0`. This site did not, so for the
  // hours between midnight and the daily pass — 7h45m every day, because the
  // Saigon date flips at 17:00 UTC and the pass runs at 00:45 UTC — the row's
  // one filled control told the coach to write an agenda for a 1-1 that had
  // already not happened, while the help list above it said nothing at all.
  it("stops offering the agenda once the day has passed", () => {
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-09-21", hasHeldOneOnOne: true });
    expect(bar.filled?.id).not.toBe("write-agenda");
  });

  it("still offers it on the day itself", () => {
    // The boundary the fix must not eat: today is still a day to prepare for.
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-09-22", hasHeldOneOnOne: true });
    expect(bar.filled?.id).toBe("write-agenda");
  });

  it("names the day on the filled button when the member has proposed one", () => {
    const bar = rowActions({ ...base, proposedOn: "2026-09-24", proposedBy: "member" });
    expect(bar.filled?.id).toBe("confirm");
    // "Confirm Thu 24 Sep", not "Confirm": the label carries the decision.
    expect(bar.filled?.label).toContain("24 Sep");
    expect(bar.filled?.href).toBeNull();
    expect(ids(bar)).toEqual(["decline", "open"]);
  });

  it("answers the member's proposal before a booking that passed unmarked", () => {
    const bar = rowActions({
      ...base,
      proposedOn: "2026-09-24",
      proposedBy: "member",
      missedOn: "2026-09-10",
      missedMeetingId: "m1",
    });
    expect(bar.filled?.id).toBe("confirm");
  });

  it("offers Mark it held when a booked day passed without the 1-1 being closed", () => {
    const bar = rowActions({ ...base, missedOn: "2026-09-10", missedMeetingId: "m1" });
    expect(bar.filled?.id).toBe("mark-held");
    expect(bar.filled?.href).toBeNull();
    expect(ids(bar)).toEqual(["rebook", "open"]);
  });

  it("does not offer Mark it held without the meeting row it would write", () => {
    // The roster can know a day passed and still not have the booking's id, and
    // an action with nothing to write is worse than no action at all.
    const bar = rowActions({ ...base, missedOn: "2026-09-10", nextOneOnOneOn: "2026-09-23" });
    expect(bar.filled?.id).toBe("write-agenda");
  });

  it("asks for the agenda when the next 1-1 is within the lead window and nothing is written", () => {
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-09-24" });
    expect(bar.filled?.id).toBe("write-agenda");
    expect(bar.filled?.href).toBe("/team/coaching/p1?tab=next");
  });

  it("fills nothing for a booked 1-1 still far off, and keeps the prep reachable", () => {
    // The help list only mentions a blank agenda two days out; a row that
    // shouted "Write the agenda" thirteen days out contradicted it.
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-10-05" });
    expect(bar.filled).toBeNull();
    expect(bar.quiet[0]?.id).toBe("open-prep");
  });

  it("opens the prep when the booked 1-1 already carries an agenda", () => {
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-09-24", agendaWritten: true });
    expect(bar.filled?.id).toBe("open-prep");
  });

  it("asks the coach to propose a day when there is no date at all", () => {
    expect(rowActions(base).filled?.id).toBe("propose");
  });

  it("fills nothing while the coach's own proposal is with the member", () => {
    const bar = rowActions({ ...base, proposedOn: "2026-09-24", proposedBy: "coach" });
    expect(bar.filled).toBeNull();
    expect(ids(bar)).toEqual(["open"]);
  });

  it("adds Last recap only once a 1-1 has been held", () => {
    expect(ids(rowActions({ ...base, hasHeldOneOnOne: true }))).toEqual(["last-recap", "open"]);
  });

  it("always ends the bar with the person's own page", () => {
    const states: RowActionState[] = [
      base,
      { ...base, nextOneOnOneOn: "2026-09-24" },
      { ...base, missedOn: "2026-09-10", missedMeetingId: "m1" },
      { ...base, proposedOn: "2026-09-24", proposedBy: "member" },
      { ...base, proposedOn: "2026-09-24", proposedBy: "coach" },
    ];
    for (const s of states) {
      const bar = rowActions(s);
      const last = bar.quiet[bar.quiet.length - 1];
      expect(last.id).toBe("open");
      expect(last.label).toBe("Open Coachee One");
      expect(last.href).toBe("/team/coaching/p1?tab=next");
      // "One dominant element", per row: never two filled controls.
      expect(bar.quiet.filter((a) => a.id === bar.filled?.id)).toHaveLength(0);
    }
  });
});

// BH-2: the coach's side of L.2. The member's page stayed quiet about a 1-1
// missed over a holiday; the coach's roster did not — and the coach is the one
// who might chase.
describe("a 1-1 missed while the person was away", () => {
  const AWAY = [{ startDate: "2026-09-21", endDate: "2026-09-23" }];
  const base = {
    profileId: "p1",
    name: "Robin",
    proposedOn: null,
    proposedBy: null,
    nextOneOnOneOn: null,
    agendaWritten: false,
    todayISO: "2026-09-28",
    missedOn: "2026-09-23",
    missedMeetingId: "m1",
    nextMeetingId: null,
    nextStartsAt: null,
    hasHeldOneOnOne: true,
  };

  it("leads with Rebook, not Mark it held", () => {
    // "Mark it held" as the one filled action would be the page asking a coach
    // to record a holiday as a meeting.
    const bar = rowActions({ ...base, leave: AWAY });
    expect(bar.filled?.id).toBe("rebook");
    expect(bar.quiet.map((q) => q.id)).toContain("mark-held");
  });

  it("still leads with Mark it held when the day was a working day", () => {
    const bar = rowActions({ ...base, leave: [] });
    expect(bar.filled?.id).toBe("mark-held");
  });

  it("behaves exactly as before for a caller that passes no leave", () => {
    const { leave: _drop, ...noLeave } = { ...base, leave: undefined };
    expect(rowActions(noLeave).filled?.id).toBe("mark-held");
  });
});

// K.71. Before this, starts_at could only ever be copied from the member's own
// preferred_time when the row was inserted, so a booking made for somebody who
// had never opened that form stayed timeless with no screen able to change it.
describe("a booking with no time on it", () => {
  const booked: RowActionState = {
    ...base,
    nextOneOnOneOn: "2026-09-24",
    nextMeetingId: "m9",
    hasHeldOneOnOne: true,
  };

  it("offers Set the time, quietly", () => {
    const bar = rowActions({ ...booked, nextStartsAt: null });
    expect(ids(bar)).toContain("set-time");
  });

  // The row is two days out, so the agenda is the filled control. A missing
  // time must not take that place: it is the smaller of the two omissions, and
  // one filled control per row is the rule this module exists to hold.
  it("never takes the filled slot", () => {
    const bar = rowActions({ ...booked, nextStartsAt: null });
    expect(bar.filled?.id).toBe("write-agenda");
  });

  it("says nothing once the booking has a time", () => {
    expect(ids(rowActions({ ...booked, nextStartsAt: "15:00" }))).not.toContain("set-time");
  });

  // next_one_on_one_on can name a day whose scheduled row was archived. There
  // is then nothing to write to, and offering the control would be offering a
  // button that cannot do anything.
  it("says nothing when there is no row to write to", () => {
    expect(ids(rowActions({ ...booked, nextMeetingId: null, nextStartsAt: null }))).not.toContain("set-time");
  });
});
