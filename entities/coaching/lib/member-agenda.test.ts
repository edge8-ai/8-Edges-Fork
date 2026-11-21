import { describe, expect, it } from "vitest";
import { MEMBER_AGENDA_LEAD_DAYS, hubOneOnOnePrompt, memberAgendaOpen, preMeetingAnswered } from "./member-agenda";

const TODAY = "2026-09-18";

describe("memberAgendaOpen", () => {
  // K.68, the member's half. hubOneOnOnePrompt in this same module has always
  // refused a past date, and says in its own docstring that a 1-1 which did not
  // happen is the missed prompt's business. This function did not agree, so the
  // hub said nothing while My Coach held the pre-meeting form open for a
  // meeting that was already over.
  it("closes once the day has passed and nothing was written", () => {
    expect(memberAgendaOpen({ nextOn: "2026-09-17", answered: false }, TODAY)).toBe(false);
  });

  it("still opens on the day itself", () => {
    expect(memberAgendaOpen({ nextOn: TODAY, answered: false }, TODAY)).toBe(true);
  });

  // The two screens must now give the same answer for every date, which is what
  // the comment in my-coaching-page.ts has always claimed they do.
  it("agrees with the hub prompt about whether a past 1-1 is still ahead", () => {
    for (const nextOn of ["2026-09-15", "2026-09-17", TODAY, "2026-09-20", "2026-09-22", "2026-09-25"]) {
      const formOpen = memberAgendaOpen({ nextOn, answered: false }, TODAY);
      const hub = hubOneOnOnePrompt({ coachName: null, nextOn, answered: false, weekday: null }, TODAY);
      expect(formOpen, `disagreed about ${nextOn}`).toBe(hub !== null);
    }
  });

  it("opens inside the member's window", () => {
    expect(memberAgendaOpen({ nextOn: "2026-09-22", answered: false }, TODAY)).toBe(true);
  });

  it("stays shut beyond it", () => {
    expect(memberAgendaOpen({ nextOn: "2026-09-23", answered: false }, TODAY)).toBe(false);
  });

  it("opens exactly on the boundary", () => {
    const boundary = "2026-09-22"; // four days out
    expect(MEMBER_AGENDA_LEAD_DAYS).toBe(4);
    expect(memberAgendaOpen({ nextOn: boundary, answered: false }, TODAY)).toBe(true);
  });

  // The rule that matters most: a form that closes over somebody's draft has
  // eaten it, as far as they can tell.
  it("stays open over anything already written, whatever the date says", () => {
    expect(memberAgendaOpen({ nextOn: "2026-12-01", answered: true }, TODAY)).toBe(true);
    expect(memberAgendaOpen({ nextOn: null, answered: true }, TODAY)).toBe(true);
  });

  it("is shut with no 1-1 booked and nothing written", () => {
    expect(memberAgendaOpen({ nextOn: null, answered: false }, TODAY)).toBe(false);
  });
});

describe("hubOneOnOnePrompt", () => {
  const base = { coachName: "Robin", nextOn: "2026-09-21", answered: false, weekday: "Monday" };

  it("names the coach and the day, and points at the member's own page", () => {
    const p = hubOneOnOnePrompt(base, TODAY);
    expect(p?.text).toBe("1-1 with Robin Monday. Your agenda is yours to set.");
    // /team/coaching is the COACH's roster; a member who is not a coach cannot
    // open it, which is what the hub linked to before this existed.
    expect(p?.href).toBe("/team/my-coaching?tab=my");
  });

  it("says today and tomorrow rather than a weekday", () => {
    expect(hubOneOnOnePrompt({ ...base, nextOn: TODAY }, TODAY)?.text).toContain("today");
    expect(hubOneOnOnePrompt({ ...base, nextOn: "2026-09-19" }, TODAY)?.text).toContain("tomorrow");
  });

  it("copes with no coach and no weekday", () => {
    const p = hubOneOnOnePrompt({ coachName: null, nextOn: "2026-09-21", answered: false, weekday: null }, TODAY);
    expect(p?.text).toBe("1-1 in 3 days. Your agenda is yours to set.");
  });

  // Null is the normal state, and the whole design: this is an answer to "is
  // there something for me to do", never a permanent band.
  it("says nothing once the member has written something", () => {
    expect(hubOneOnOnePrompt({ ...base, answered: true }, TODAY)).toBeNull();
  });

  it("says nothing when the 1-1 is too far off to prepare for", () => {
    expect(hubOneOnOnePrompt({ ...base, nextOn: "2026-10-01" }, TODAY)).toBeNull();
  });

  it("says nothing when no 1-1 is booked", () => {
    expect(hubOneOnOnePrompt({ ...base, nextOn: null }, TODAY)).toBeNull();
  });

  // A 1-1 that did not happen is the missed prompt's business on My Coach, not
  // a cheerful reminder on the hub.
  it("says nothing about a date that has passed", () => {
    expect(hubOneOnOnePrompt({ ...base, nextOn: "2026-09-17" }, TODAY)).toBeNull();
  });
});

describe("preMeetingAnswered", () => {
  it("is true when any one field carries words", () => {
    expect(preMeetingAnswered({ moved: "shipped the draft", stuck: null, talk: null })).toBe(true);
    expect(preMeetingAnswered({ moved: null, stuck: "the API", talk: null })).toBe(true);
    expect(preMeetingAnswered({ moved: null, stuck: null, talk: "my next step" })).toBe(true);
  });

  it("is false when the member has written nothing", () => {
    expect(preMeetingAnswered({ moved: null, stuck: null, talk: null })).toBe(false);
    expect(preMeetingAnswered({ moved: "", stuck: "", talk: "" })).toBe(false);
  });
});
