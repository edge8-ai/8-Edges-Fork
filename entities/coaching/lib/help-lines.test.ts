import { describe, it, expect } from "vitest";
import { goalLine } from "./goal-line";
import {
  HELP_GROUPS_SHOWN,
  helpGroups,
  helpLines,
  nextMeetingLine,
  sinceCluster,
  type HelpGroupInput,
  type HelpInput,
} from "./help-lines";

// Neutral names throughout: no real person or client ever appears in a test.
const TODAY = "2026-09-17";

function input(over: Partial<HelpInput> = {}): HelpInput {
  return {
    profileId: "p1",
    name: "Alex",
    proposedOn: null,
    proposedBy: null,
    missedOn: null,
    stuckSince: null,
    hasGoal: true,
    nextOneOnOneOn: null,
    nextStartsAt: "15:00",
    agendaWritten: true,
    heldCount: 3,
    ...over,
  };
}

describe("helpLines — one line per signal", () => {
  it("says nothing when nothing is waiting on the coach", () => {
    expect(helpLines(input(), TODAY)).toEqual([]);
  });

  it("names a date the member proposed and points at the row that answers it", () => {
    const [line] = helpLines(input({ proposedOn: "2026-09-24", proposedBy: "member" }), TODAY);
    expect(line.text).toBe("Alex proposed Thursday 24 Sep — answer them.");
    expect(line.href).toBe("#roster-p1");
  });

  it("ignores a date the coach proposed, which is nobody's reply to give", () => {
    expect(helpLines(input({ proposedOn: "2026-09-24", proposedBy: "coach" }), TODAY)).toEqual([]);
  });

  it("asks for the first 1-1 when none was ever held and none is on the calendar", () => {
    const lines = helpLines(input({ heldCount: 0 }), TODAY);
    expect(lines.map((l) => l.signal)).toEqual(["date"]);
    expect(lines[0].text).toBe("Alex has no first 1-1 yet — propose a day.");
    // A pending proposal already covers it, whichever side made it.
    expect(helpLines(input({ heldCount: 0, proposedOn: "2026-09-24", proposedBy: "coach" }), TODAY)).toEqual([]);
  });

  it("names a 1-1 that did not happen and offers the ways out", () => {
    const [line] = helpLines(input({ missedOn: "2026-09-11" }), TODAY);
    expect(line.text).toBe(
      "Your 1-1 with Alex on 11 Sep was not marked done — mark it done if you met, or rebook it.",
    );
    expect(line.href).toBe("/team/coaching/p1?tab=next");
  });

  it("counts the days a commitment has been stuck, in days not in blame", () => {
    const [line] = helpLines(input({ stuckSince: "2026-09-08" }), TODAY);
    expect(line.text).toBe("Alex has a commitment stuck 9 days — ask what is in the way.");
  });

  it("uses the singular for a commitment stuck one day", () => {
    const [line] = helpLines(input({ stuckSince: "2026-09-16" }), TODAY);
    expect(line.text).toContain("stuck 1 day —");
  });

  it("invites a goal rather than flagging its absence", () => {
    const [line] = helpLines(input({ hasGoal: false }), TODAY);
    expect(line.text).toBe("Alex has no FAST goal yet — shape one together.");
    expect(line.href).toBe("/team/coaching/p1?tab=goals");
  });

  it("asks for the agenda inside the two-day window", () => {
    const [line] = helpLines(
      input({ nextOneOnOneOn: "2026-09-19", agendaWritten: false }),
      TODAY,
    );
    expect(line.text).toBe("Your 1-1 with Alex is in 2 days and the agenda is still blank — write it.");
  });

  it("says nothing about an agenda further out than two days", () => {
    expect(helpLines(input({ nextOneOnOneOn: "2026-09-20", agendaWritten: false }), TODAY)).toEqual([]);
  });

  it("says nothing about an agenda that is written", () => {
    expect(helpLines(input({ nextOneOnOneOn: "2026-09-18", agendaWritten: true }), TODAY)).toEqual([]);
  });

  it("reads today's meeting as today", () => {
    const [line] = helpLines(input({ nextOneOnOneOn: TODAY, agendaWritten: false }), TODAY);
    expect(line.text).toContain("is today and the agenda");
  });
});

describe("helpLines — the sort", () => {
  it("puts a reply the coach owes first, then missed, stuck, no goal, agenda", () => {
    const lines = helpLines(
      input({
        proposedOn: "2026-09-24",
        proposedBy: "member",
        missedOn: "2026-09-11",
        stuckSince: "2026-09-08",
        hasGoal: false,
        nextOneOnOneOn: "2026-09-18",
        agendaWritten: false,
      }),
      TODAY,
    );
    expect(lines.map((l) => l.text.slice(0, 24))).toEqual([
      "Alex proposed Thursday 2",
      "Your 1-1 with Alex on 11",
      "Alex has a commitment st",
      "Alex has no FAST goal ye",
      "Your 1-1 with Alex is to",
    ]);
  });

  it("holds that order however the signals arrive", () => {
    const lines = helpLines(input({ hasGoal: false, missedOn: "2026-09-11" }), TODAY);
    expect(lines[0].text).toContain("was not marked done");
    expect(lines[1].text).toContain("no FAST goal");
  });
});

describe("helpGroups — one card per person, ordered by their top signal", () => {
  function person(id: string, name: string, over: Partial<HelpGroupInput> = {}): HelpGroupInput {
    return { ...input(), profileId: id, name, avatarUrl: null, ...over };
  }

  it("gathers a person's lines under them and drops their name from each one", () => {
    const { groups } = helpGroups(
      [person("p1", "Sam", { proposedOn: "2026-09-24", proposedBy: "member", hasGoal: false })],
      TODAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Sam");
    expect(groups[0].lines.map((l) => l.underName)).toEqual([
      "Proposed Thursday 24 Sep — answer them.",
      "No FAST goal yet — shape one together.",
    ]);
  });

  it("leaves out anybody with nothing waiting on the coach", () => {
    expect(helpGroups([person("p1", "Alex")], TODAY).groups).toEqual([]);
  });

  it("orders people by their most urgent signal: proposal, missed, stuck, agenda", () => {
    const { groups } = helpGroups(
      [
        person("p1", "Alex", { nextOneOnOneOn: "2026-09-18", agendaWritten: false }),
        person("p2", "Robin", { stuckSince: "2026-09-08" }),
        person("p3", "Sam", { missedOn: "2026-09-11" }),
        person("p4", "Kai", { proposedOn: "2026-09-24", proposedBy: "member" }),
      ],
      TODAY,
    );
    expect(groups.map((g) => g.name)).toEqual(["Kai", "Sam", "Robin", "Alex"]);
    expect(groups.map((g) => g.topSignal)).toEqual(["proposal", "missed", "stuck", "agenda"]);
  });

  it("never lets a person with more lines outrank a person with a more urgent one", () => {
    const { groups } = helpGroups(
      [
        person("p1", "Alex", {
          missedOn: "2026-09-11",
          stuckSince: "2026-09-08",
          hasGoal: false,
          nextOneOnOneOn: "2026-09-18",
          agendaWritten: false,
        }),
        person("p2", "Robin", { proposedOn: "2026-09-24", proposedBy: "member" }),
      ],
      TODAY,
    );
    // Robin has one line and Alex has four; the one reply somebody is waiting
    // on still comes first, because the order is a category and not a total.
    expect(groups.map((g) => g.name)).toEqual(["Robin", "Alex"]);
  });

  it("keeps the roster's own order among people waiting on the same kind of answer", () => {
    const { groups } = helpGroups(
      [
        person("p1", "Alex", { stuckSince: "2026-09-08" }),
        person("p2", "Robin", { stuckSince: "2026-09-01" }),
      ],
      TODAY,
    );
    expect(groups.map((g) => g.name)).toEqual(["Alex", "Robin"]);
  });

  it("moves everybody whose only signal is a missing goal into the footer", () => {
    const groups = helpGroups(
      [
        person("p1", "Jordan", { hasGoal: false }),
        person("p2", "Kai", { hasGoal: false }),
        person("p3", "Sam", { hasGoal: false, missedOn: "2026-09-11" }),
      ],
      TODAY,
    );
    expect(groups.noGoalOnly.map((p) => p.name)).toEqual(["Jordan", "Kai"]);
    expect(groups.noGoalOnly[0].href).toBe("/team/coaching/p1?tab=goals");
    // Sam has a missed 1-1 as well, so Sam is a card and keeps both lines.
    expect(groups.groups.map((g) => g.name)).toEqual(["Sam"]);
    expect(groups.groups[0].lines).toHaveLength(2);
  });

  it("counts people who are waiting, not lines and not the footer", () => {
    const groups = helpGroups(
      [
        person("p1", "Jordan", { hasGoal: false }),
        person("p2", "Sam", { proposedOn: "2026-09-24", proposedBy: "member", hasGoal: false }),
        person("p3", "Robin", { missedOn: "2026-09-11", stuckSince: "2026-09-08" }),
      ],
      TODAY,
    );
    expect(groups.peopleWaiting).toBe(2);
  });

  it("caps the cards at five people and hands the rest back as overflow", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      person(`p${i}`, `Person ${i}`, { stuckSince: "2026-09-08" }),
    );
    const groups = helpGroups(many, TODAY);
    expect(groups.groups).toHaveLength(HELP_GROUPS_SHOWN);
    expect(groups.overflow.map((g) => g.name)).toEqual(["Person 5", "Person 6"]);
    expect(groups.peopleWaiting).toBe(7);
  });
});

describe("nextMeetingLine", () => {
  it("writes the first-1-1 sentence rather than a dash for someone never met", () => {
    expect(
      nextMeetingLine({ nextOneOnOneOn: "2026-09-30", agendaWritten: false, heldCount: 0 }, TODAY),
    ).toBe("First 1-1 on Wednesday 30 Sep — pick a preferred slot together.");
  });

  it("writes a sentence when there is no date at all", () => {
    expect(nextMeetingLine({ nextOneOnOneOn: null, agendaWritten: false, heldCount: 0 }, TODAY)).toBe(
      "No first 1-1 booked yet — pick a day together.",
    );
    expect(nextMeetingLine({ nextOneOnOneOn: null, agendaWritten: false, heldCount: 3 }, TODAY)).toBe(
      "Nothing booked yet — put one in.",
    );
  });

  it("says nothing is booked and names the day that keeps the rhythm, never as a booking", () => {
    // ADR-0010: a suggestion sits beside "Nothing booked" and is never phrased
    // as "Next 1-1", which is what the Wednesday guess used to read as.
    const line = nextMeetingLine(
      { nextOneOnOneOn: null, agendaWritten: false, heldCount: 3, suggestedOn: "2026-09-22" },
      TODAY,
    );
    expect(line).toBe("Nothing booked · Tuesday 22 Sep keeps the rhythm.");
    expect(line).not.toMatch(/Next 1-1/);
  });

  it("states the day, the agenda and how far off it is", () => {
    expect(
      nextMeetingLine({ nextOneOnOneOn: "2026-09-18", agendaWritten: true, heldCount: 4 }, TODAY),
    ).toBe("Next 1-1: Friday 18 Sep · agenda drafted · tomorrow");
  });
});

describe("goalLine", () => {
  it("reads the goal's number, not the person's", () => {
    expect(
      goalLine(
        {
          title: "Onboard the new cohort",
          currentValue: 119,
          targetValue: 200,
          metricUnit: "students",
          updatedAt: "2026-09-14T09:00:00Z",
        },
        TODAY,
      ),
    ).toBe("Onboard the new cohort — 119 of 200 students · updated Monday");
  });

  it("reads a cut as heading down to its target (K.78)", () => {
    expect(
      goalLine(
        { title: "Cut onboarding time", startValue: 3, currentValue: 2.5, targetValue: 2, metricUnit: "hours", updatedAt: null },
        TODAY,
      ),
    ).toBe("Cut onboarding time — 2.5 hours, down to 2");
  });

  it("drops the numbers when the goal carries none", () => {
    expect(
      goalLine(
        { title: "Ship the rewrite", currentValue: null, targetValue: null, metricUnit: null, updatedAt: null },
        TODAY,
      ),
    ).toBe("Ship the rewrite");
  });

  it("invites a goal when there is none", () => {
    expect(goalLine(null, TODAY)).toBe("No FAST goal yet — shape one together.");
  });
});

// The roster row's right-hand column (K.58), which replaced the "since your
// last 1-1" sentence. Every case that sentence had, in the shape the column
// prints it.
describe("sinceCluster", () => {
  const nothing = { kept: 0, stuck: 0, notes: 0, cardsDone: 0 };

  it("names the day in the eyebrow and the movement in short phrases", () => {
    expect(sinceCluster("2026-09-03", { kept: 3, stuck: 1, notes: 1, cardsDone: 2 }, TODAY)).toEqual({
      eyebrow: "Since 3 Sep",
      items: ["3 kept", "1 stuck", "2 cards done", "1 note written"],
      note: null,
    });
  });

  it("leaves out the phrases that are zero rather than printing a zero", () => {
    expect(
      sinceCluster("2026-09-03", { kept: 2, stuck: 0, notes: 0, cardsDone: 0 }, TODAY).items,
    ).toEqual(["2 kept"]);
  });

  it("uses the singular for one card and one note", () => {
    expect(
      sinceCluster("2026-09-03", { kept: 0, stuck: 0, notes: 1, cardsDone: 1 }, TODAY).items,
    ).toEqual(["1 card done", "1 note written"]);
  });

  it("keeps the column's shape with a note when nothing moved", () => {
    const quiet = sinceCluster("2026-09-03", nothing, TODAY);
    expect(quiet.items).toEqual([]);
    expect(quiet.note).toBe("Nothing has moved.");
  });

  it("does not ask what went wrong on the day of the 1-1 itself", () => {
    expect(sinceCluster(TODAY, nothing, TODAY).note).toBe("Nothing yet.");
  });

  it("looks forward when no 1-1 was ever held", () => {
    expect(sinceCluster(null, nothing, TODAY)).toEqual({
      eyebrow: "No 1-1 yet",
      items: [],
      note: "Their first one is the start of it.",
    });
  });

  it("never prints more than the four phrases the column has room for", () => {
    const busy = sinceCluster("2026-09-03", { kept: 9, stuck: 4, notes: 7, cardsDone: 6 }, TODAY);
    expect(busy.items).toHaveLength(4);
    expect(busy.note).toBeNull();
  });
});

// BH-2, the other half: the roster's help list is where a coach decides who
// needs something this week, so a holiday appearing there as "did not happen"
// is the version of this bug that actually causes a chase.
describe("a missed 1-1 during leave", () => {
  const AWAY = [{ startDate: "2026-09-21", endDate: "2026-09-23" }];

  it("raises nothing in the help list", () => {
    const lines = helpLines(input({ missedOn: "2026-09-23", leave: AWAY }), TODAY);
    expect(lines.some((l) => l.signal === "missed")).toBe(false);
  });

  it("still raises a 1-1 missed on a working day", () => {
    const lines = helpLines(input({ missedOn: "2026-09-25", leave: AWAY }), TODAY);
    expect(lines.some((l) => l.signal === "missed")).toBe(true);
  });

  it("is unchanged for a caller that passes no leave", () => {
    const lines = helpLines(input({ missedOn: "2026-09-23" }), TODAY);
    expect(lines.some((l) => l.signal === "missed")).toBe(true);
  });
});

// K.71. Both people in the coach's shortlist on 2026-09-21 had a 1-1 the next
// day and no time on either, because neither had ever filled in "When 1-1s suit
// you" — and nothing on the page said so.
describe("helpLines — a booking with no time", () => {
  const signals = (over: Partial<HelpInput>) => helpLines(input(over), TODAY).map((l) => l.signal);

  it("says so as soon as the day is booked", () => {
    const lines = helpLines(input({ nextOneOnOneOn: "2026-09-18", nextStartsAt: null, heldCount: 1 }), TODAY);
    const line = lines.find((l) => l.signal === "time");
    expect(line?.text).toBe("Your 1-1 with Alex on 18 Sep has no time on it — set one.");
    expect(line?.underName).toBe("1-1 on 18 Sep has no time on it — set one.");
  });

  // It is answered by the control on the person's own row, as a proposal is,
  // rather than by a trip to their profile.
  it("points at the row, where the control is", () => {
    const line = helpLines(input({ nextOneOnOneOn: "2026-09-18", nextStartsAt: null }), TODAY).find(
      (l) => l.signal === "time",
    );
    expect(line?.href).toBe("#roster-p1");
  });

  // Unlike the agenda, which is only worth asking for inside its two-day
  // window: an agenda takes reading and thinking, a time takes one click, and
  // the member needs it in their calendar from the moment the day is set.
  it("says so well outside the agenda window", () => {
    expect(signals({ nextOneOnOneOn: "2026-10-30", nextStartsAt: null, heldCount: 1 })).toContain("time");
  });

  it("says nothing when the booking has a time", () => {
    expect(signals({ nextOneOnOneOn: "2026-09-18", nextStartsAt: "15:00", heldCount: 1 })).not.toContain("time");
  });

  // A day that has gone by belongs to the missed line, which asks for a real
  // decision; a second sentence about the same meeting asking for its time
  // would be noise on top of it.
  it("says nothing about a day that has passed", () => {
    expect(signals({ nextOneOnOneOn: "2026-09-10", nextStartsAt: null, heldCount: 1 })).not.toContain("time");
  });
});

// K.71's "shows its time on the coach roster". The row used to print the day
// alone, so the one fact a coach needed before the meeting lived on another
// page.
describe("nextMeetingLine — the hour beside the day", () => {
  it("says when the 1-1 starts", () => {
    expect(
      nextMeetingLine(
        { nextOneOnOneOn: "2026-09-18", startsAt: "15:00", agendaWritten: true, heldCount: 4 },
        TODAY,
      ),
    ).toBe("Next 1-1: Friday 18 Sep at 15:00 · agenda drafted · tomorrow");
  });

  it("says it on a first 1-1 too", () => {
    expect(
      nextMeetingLine({ nextOneOnOneOn: "2026-09-30", startsAt: "09:30", agendaWritten: false, heldCount: 0 }, TODAY),
    ).toBe("First 1-1 on Wednesday 30 Sep at 09:30 — pick a preferred slot together.");
  });

  // The row keeps its old shape when there is no hour to add, rather than
  // printing an empty separator where one would have gone.
  it("prints the day alone when nobody has named an hour", () => {
    expect(
      nextMeetingLine({ nextOneOnOneOn: "2026-09-18", startsAt: null, agendaWritten: true, heldCount: 4 }, TODAY),
    ).toBe("Next 1-1: Friday 18 Sep · agenda drafted · tomorrow");
  });
});
