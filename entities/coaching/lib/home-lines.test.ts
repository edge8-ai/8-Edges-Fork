import { describe, expect, it } from "vitest";
import { afterName, cardWhen, homeSummary, sinceLine, waitingItems, type HomeRow } from "./home-lines";

// 2026-10-07 is a Wednesday.
const TODAY = "2026-10-07";

const row = (o: Partial<HomeRow>): HomeRow => ({
  profileId: "p",
  name: "Coachee One",
  state: { kind: "none", everMet: true, suggestedOn: null },
  checkinWritten: false,
  lastHeldOn: null,
  lastHeldFormat: null,
  nextStartsAt: null,
  ...o,
});

describe("waitingItems", () => {
  it("lists only what waits on the coach, by first name", () => {
    const items = waitingItems(
      [
        row({ profileId: "a", name: "Minh Pham", state: { kind: "member-proposed", on: "2026-10-09" } }),
        row({ profileId: "b", name: "Derek Nguyen", state: { kind: "missed", on: "2026-10-06", meetingId: "m", worthPrompting: true } }),
        row({ profileId: "c", name: "Away Person", state: { kind: "missed", on: "2026-10-06", meetingId: "m", worthPrompting: false } }),
        row({ profileId: "d", name: "New Person", state: { kind: "none", everMet: false, suggestedOn: null } }),
        row({ profileId: "e", name: "Linh Tran", checkinWritten: true, state: { kind: "booked", on: "2026-10-08", agendaWritten: false, everMet: true } }),
        row({ profileId: "f", name: "Quiet Person", state: { kind: "booked", on: "2026-10-20", agendaWritten: false, everMet: true } }),
      ],
      TODAY,
    );
    expect(items.map((i) => `${i.first}${afterName(i)}`)).toEqual([
      "Minh proposed Fri 9 Oct",
      "Derek’s Tuesday 6 Oct session isn’t marked done",
      "New has no first session yet",
      "Linh sent a check-in for tomorrow",
    ]);
  });
});

describe("homeSummary", () => {
  it("counts people and the sessions left this week, never results", () => {
    const rows = [
      row({ state: { kind: "booked", on: "2026-10-08", agendaWritten: false, everMet: true } }),
      row({ state: { kind: "booked", on: "2026-10-14", agendaWritten: false, everMet: true } }),
      row({}),
    ];
    expect(homeSummary(rows, TODAY)).toBe("Wednesday 7 Oct · 3 people · 1 session left this week");
  });
});

describe("cardWhen", () => {
  it("says the next booking with its time", () => {
    expect(cardWhen(row({ state: { kind: "booked", on: "2026-10-08", agendaWritten: false, everMet: true }, nextStartsAt: "10:00" }), TODAY)).toBe(
      "Next: Tomorrow, 10:00",
    );
  });

  it("says when they last met and how, and the rhythm's next day", () => {
    expect(
      cardWhen(row({ lastHeldOn: "2026-10-06", lastHeldFormat: "call", state: { kind: "none", everMet: true, suggestedOn: "2026-10-20" } }), TODAY),
    ).toBe("Met yesterday · call · next: Tue 20 Oct keeps the rhythm");
  });

  it("names a passed session plainly", () => {
    expect(cardWhen(row({ state: { kind: "missed", on: "2026-10-06", meetingId: "m", worthPrompting: true } }), TODAY)).toBe(
      "Tuesday 6 Oct session · not marked done",
    );
  });
});

describe("sinceLine", () => {
  it("leaves zeroes out and says a quiet stretch in words", () => {
    expect(sinceLine("2026-09-24", TODAY, { topicsFromThem: 2, kept: 1, stuck: 0, onTheGo: 0 })).toEqual({
      label: "Since Thu 24 Sep:",
      text: "2 new talking points · 1 kept",
    });
    expect(sinceLine("2026-10-06", TODAY, { topicsFromThem: 0, kept: 0, stuck: 0, onTheGo: 0 })).toEqual({
      label: "Since yesterday:",
      text: "nothing new yet",
    });
  });
});
