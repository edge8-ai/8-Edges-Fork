import { describe, expect, it } from "vitest";
import { firstDateToOffer, inSendWindow, pickWords, reminderDue, reminderLine, resolvePick, whenLabel, type PlanClient } from "./member-email-plan";

// CR.5.4: what the owner's choice comes to. The client below is on New York time
// (UTC-5 in November), starting at 9:00 am, so 9:00 am there is 14:00 UTC and
// 9:00 pm in Saigon. The words are the approved prototype's.
const CLIENT: PlanClient = { name: "Northwind", timeZone: "America/New_York", zoneLabel: "Eastern", startMinute: 540 };
const NO_ZONE: PlanClient = { ...CLIENT, timeZone: null, zoneLabel: null };
const at = (iso: string) => new Date(iso);
// Tuesday 17 November 2026, 10:00 am in New York (inside its day), and 7:00 pm there (outside).
const INSIDE = at("2026-11-17T15:00:00Z");
const OUTSIDE = at("2026-11-18T00:00:00Z");

describe("resolvePick: now", () => {
  it("sends now inside the client's working day", () => {
    expect(resolvePick({ how: "now" }, CLIENT, INSIDE)).toEqual({ kind: "now" });
  });

  it("waits for the client's next working-day start outside it", () => {
    expect(resolvePick({ how: "now" }, CLIENT, OUTSIDE)).toEqual({ kind: "scheduled", at: "2026-11-18T14:00:00.000Z", moved: true });
  });

  it("with no time zone, sends inside Saigon's hours and refuses outside them", () => {
    // 03:00 UTC is 10:00 in Saigon.
    expect(resolvePick({ how: "now" }, NO_ZONE, at("2026-11-17T03:00:00Z"))).toEqual({ kind: "now" });
    expect(resolvePick({ how: "now" }, NO_ZONE, OUTSIDE)).toMatchObject({ kind: "refused", needsZone: true });
  });
});

describe("resolvePick: on a date", () => {
  it("reads a blank time as the start of the client's day, in the client's zone", () => {
    expect(resolvePick({ how: "scheduled", date: "2026-11-18", time: null }, CLIENT, INSIDE)).toEqual({ kind: "scheduled", at: "2026-11-18T14:00:00.000Z", moved: false });
  });

  it("keeps a time inside the day and moves one outside it to the next start", () => {
    expect(resolvePick({ how: "scheduled", date: "2026-11-18", time: "13:30" }, CLIENT, INSIDE)).toEqual({ kind: "scheduled", at: "2026-11-18T18:30:00.000Z", moved: false });
    // 8:00 pm on Friday moves to Monday's 9:00 am.
    expect(resolvePick({ how: "scheduled", date: "2026-11-20", time: "20:00" }, CLIENT, INSIDE)).toEqual({ kind: "scheduled", at: "2026-11-23T14:00:00.000Z", moved: true });
  });

  it("refuses a time that has passed, a missing date and a client with no zone", () => {
    expect(resolvePick({ how: "scheduled", date: "2026-11-17", time: "09:00" }, CLIENT, INSIDE)).toMatchObject({ kind: "refused", needsZone: false, error: "That time has already passed. Pick a later one, or email them now." });
    expect(resolvePick({ how: "scheduled", date: "", time: null }, CLIENT, INSIDE)).toMatchObject({ kind: "refused", error: "Pick a date." });
    expect(resolvePick({ how: "scheduled", date: "2026-11-18", time: null }, NO_ZONE, INSIDE)).toEqual({
      kind: "refused",
      needsZone: true,
      error: "Northwind has no time zone yet, so a time at Northwind cannot be worked out. Set it on Northwind's page first.",
    });
  });
});

describe("the words", () => {
  it("names a time at the client and in Saigon, with the day shift", () => {
    expect(whenLabel("2026-11-18T14:00:00.000Z", CLIENT)).toBe("Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon)");
    // 3:00 pm in New York is 3:00 am on Thursday in Saigon.
    expect(whenLabel("2026-11-18T20:00:00.000Z", CLIENT)).toBe("Wed 18 Nov, 3:00 pm Eastern (3:00 am in Saigon the next day)");
    expect(whenLabel("2026-11-18T03:00:00.000Z", NO_ZONE)).toBe("Wed 18 Nov, 10:00 am in Saigon");
  });

  it("says when the reminder goes, or why none does", () => {
    expect(reminderLine("2026-12-04", "2026-11-18")).toBe("Reminder Tue 1 Dec to anyone who has not sent theirs. Due Fri 4 Dec.");
    expect(reminderLine("2026-11-20", "2026-11-18")).toBe("No reminder: the due date, Fri 20 Nov, is too close to the email.");
    expect(reminderLine(null, "2026-11-18")).toBe("No reminder: set a due date on the cycle to send one.");
  });

  it("gives the dialog's summary and button for each choice", () => {
    const ctx = { client: CLIENT, dueDate: "2026-12-04", recipients: 8, now: INSIDE };
    const later = { how: "scheduled", date: "2026-11-18", time: null } as const;
    expect(pickWords(later, resolvePick(later, CLIENT, INSIDE), ctx)).toEqual({
      summary: "Goes Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon). Reminder Tue 1 Dec to anyone who has not sent theirs. Due Fri 4 Dec.",
      saveLabel: "Schedule for Wed 18 Nov",
    });
    expect(pickWords({ how: "now" }, { kind: "now" }, ctx)).toEqual({
      summary: "Goes now to all 8. Reminder Tue 1 Dec to anyone who has not sent theirs. Due Fri 4 Dec.",
      saveLabel: "Email 8 now",
    });
    expect(pickWords({ how: "now" }, resolvePick({ how: "now" }, CLIENT, OUTSIDE), { ...ctx, now: OUTSIDE }).summary).toBe(
      "It is outside Northwind's working day now, so it goes Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon). Reminder Tue 1 Dec to anyone who has not sent theirs. Due Fri 4 Dec.",
    );
    expect(pickWords({ how: "manual" }, { kind: "manual" }, ctx)).toEqual({
      summary: "The app sends nothing and no reminder. After you send it, press Mark as sent on the overview.",
      saveLabel: "Done",
    });
  });

  it("offers the next working day at the client as the first date", () => {
    // Friday evening in New York offers Monday.
    expect(firstDateToOffer(CLIENT, at("2026-11-20T23:00:00Z"))).toBe("2026-11-23");
    expect(firstDateToOffer(CLIENT, INSIDE)).toBe("2026-11-18");
  });
});

// CR.5.5: when the scheduler may send. The window is the client's working day
// in its own zone, and Saigon's 09:00 to 18:00 when the client has no zone.
describe("inSendWindow", () => {
  it("follows the client's working day when the client has a zone", () => {
    expect(inSendWindow(INSIDE, CLIENT)).toBe(true);
    expect(inSendWindow(OUTSIDE, CLIENT)).toBe(false);
    // Saturday 21 November, 10:00 am in New York: a weekend at the client.
    expect(inSendWindow(at("2026-11-21T15:00:00Z"), CLIENT)).toBe(false);
  });

  it("keeps to Saigon's working hours when the client has no zone", () => {
    // 10:00 am and 10:00 pm on Tuesday 1 December in Saigon.
    expect(inSendWindow(at("2026-12-01T03:00:00Z"), NO_ZONE)).toBe(true);
    expect(inSendWindow(at("2026-12-01T15:00:00Z"), NO_ZONE)).toBe(false);
  });
});

// Due Friday 4 December: the reminder day is Tuesday 1 December, three
// working days before it, at the client.
describe("reminderDue", () => {
  const SENT = "2026-11-18T15:00:00Z";
  it("goes on the reminder day, inside the client's working day", () => {
    expect(reminderDue("2026-12-04", SENT, CLIENT, at("2026-12-01T15:00:00Z"))).toBe(true);
    // 7:00 am in New York on the day: not yet.
    expect(reminderDue("2026-12-04", SENT, CLIENT, at("2026-12-01T12:00:00Z"))).toBe(false);
  });

  it("does not go before the reminder day", () => {
    expect(reminderDue("2026-12-04", SENT, CLIENT, at("2026-11-30T15:00:00Z"))).toBe(false);
  });

  it("catches up a missed day up to the due date, and never after it", () => {
    expect(reminderDue("2026-12-04", SENT, CLIENT, at("2026-12-04T15:00:00Z"))).toBe(true);
    expect(reminderDue("2026-12-04", SENT, CLIENT, at("2026-12-07T15:00:00Z"))).toBe(false);
  });

  it("has no reminder when the email went on or after the reminder day, as the dialog said", () => {
    expect(reminderDue("2026-12-04", "2026-12-01T14:30:00Z", CLIENT, at("2026-12-02T15:00:00Z"))).toBe(false);
  });

  it("counts the days and the hours in Saigon when the client has no zone", () => {
    expect(reminderDue("2026-12-04", SENT, NO_ZONE, at("2026-12-01T03:00:00Z"))).toBe(true);
    expect(reminderDue("2026-12-04", SENT, NO_ZONE, at("2026-12-01T15:00:00Z"))).toBe(false);
  });
});
