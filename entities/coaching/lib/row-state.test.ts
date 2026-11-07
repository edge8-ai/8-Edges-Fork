import { describe, expect, it } from "vitest";
import { needsADate, rowState, type RowStateInput } from "./row-state";
import { rowActions, type RowActionState } from "./row-actions";
import { nextMeetingLine } from "./help-lines";

// Neutral subjects throughout: a test that names a colleague puts a person's
// name in a repository that ships.

const TODAY = "2026-09-20";

const bare: RowStateInput = {
  proposedOn: null,
  proposedBy: null,
  nextOneOnOneOn: null,
  agendaWritten: false,
  missedOn: null,
  missedMeetingId: null,
  everMet: false,
};

describe("rowState", () => {
  it("answers a member's proposal before anything else", () => {
    // Both a proposal and a missed booking: somebody is waiting on the coach,
    // which outranks something that already went wrong.
    const s = rowState({
      ...bare,
      proposedOn: "2026-09-24",
      proposedBy: "member",
      missedOn: "2026-09-17",
      missedMeetingId: "m-1",
    });
    expect(s.kind).toBe("member-proposed");
  });

  it("does not call it missed without the row Mark it held would write", () => {
    const s = rowState({ ...bare, missedOn: "2026-09-17", nextOneOnOneOn: "2026-09-28", everMet: true });
    expect(s.kind).toBe("booked");
  });

  it("reads a miss that fell in the person's time off as not worth prompting", () => {
    const s = rowState({
      ...bare,
      missedOn: "2026-09-17",
      missedMeetingId: "m-1",
      leave: [{ startDate: "2026-09-15", endDate: "2026-09-19" }],
    });
    expect(s).toMatchObject({ kind: "missed", worthPrompting: false });
  });

  it("separates the coach's own proposal from having nothing on the table", () => {
    expect(rowState({ ...bare, proposedOn: "2026-09-26", proposedBy: "coach" }).kind).toBe("coach-proposed");
    expect(rowState(bare).kind).toBe("none");
  });
});

describe("needsADate", () => {
  it("is true only where a day actually has to be put in", () => {
    expect(needsADate(rowState(bare))).toBe(true);
    expect(needsADate(rowState({ ...bare, missedOn: "2026-09-17", missedMeetingId: "m-1" }))).toBe(true);
    // The three states where a day is already on the table. "Plan the week"
    // used to land on the first of these, because it only asked whether
    // nextOneOnOneOn was set.
    expect(needsADate(rowState({ ...bare, proposedOn: "2026-09-24", proposedBy: "member" }))).toBe(false);
    expect(needsADate(rowState({ ...bare, proposedOn: "2026-09-24", proposedBy: "coach" }))).toBe(false);
    expect(needsADate(rowState({ ...bare, nextOneOnOneOn: "2026-09-24", everMet: true }))).toBe(false);
  });
});

// ── The invariant this module exists for ─────────────────────────────────
//
// The row's headline sentence and the row's one filled button are two
// derivations of the same facts, and they drifted: three of the four rows that
// printed "No next 1-1 booked yet — put one in." had a day on the table or a
// booking that had passed. The matrix below is every state the roster can be
// in; the assertion is that the two can never say different things about
// whether a date exists.

type Case = { name: string; row: Omit<RowStateInput, "everMet"> & { everMet: boolean } };

const cases: Case[] = [
  { name: "member proposed", row: { ...bare, proposedOn: "2026-09-24", proposedBy: "member", everMet: true } },
  { name: "coach proposed", row: { ...bare, proposedOn: "2026-09-26", proposedBy: "coach", everMet: true } },
  { name: "missed, worth prompting", row: { ...bare, missedOn: "2026-09-17", missedMeetingId: "m-1", everMet: true } },
  {
    name: "missed over leave",
    row: {
      ...bare,
      missedOn: "2026-09-17",
      missedMeetingId: "m-1",
      everMet: true,
      leave: [{ startDate: "2026-09-15", endDate: "2026-09-19" }],
    },
  },
  { name: "booked, agenda written", row: { ...bare, nextOneOnOneOn: "2026-09-23", agendaWritten: true, everMet: true } },
  { name: "booked, agenda blank, near", row: { ...bare, nextOneOnOneOn: "2026-09-22", everMet: true } },
  { name: "booked, far off", row: { ...bare, nextOneOnOneOn: "2026-10-04", everMet: true } },
  { name: "booked, never met", row: { ...bare, nextOneOnOneOn: "2026-09-30", everMet: false } },
  { name: "nothing, met before", row: { ...bare, everMet: true } },
  { name: "nothing, met before, a day suggested", row: { ...bare, everMet: true, suggestedOn: "2026-09-22" } },
  { name: "nothing, never met", row: { ...bare, everMet: false } },
];

const SAYS_NO_DATE = /No first 1-1 booked yet|Nothing booked/;

describe("the row's sentence and its filled button agree", () => {
  for (const { name, row } of cases) {
    it(name, () => {
      const sentence = nextMeetingLine({ ...row, heldCount: row.everMet ? 3 : 0 }, TODAY);
      const bar = rowActions({
        ...(row as unknown as RowActionState),
        profileId: "p1",
        name: "Coachee One",
        todayISO: TODAY,
        hasHeldOneOnOne: row.everMet,
        nextMeetingId: null,
        nextStartsAt: "15:00",
      });

      // "Nothing is booked" may only be said where nothing is: the same state
      // that is the only one offering "Propose a day".
      const saysNoDate = SAYS_NO_DATE.test(sentence);
      const offersPropose = bar.filled?.id === "propose";
      expect(saysNoDate).toBe(offersPropose);

      // And the converse of the original defect: wherever a day exists, the
      // sentence names it rather than asking for one.
      const state = rowState(row);
      if (state.kind !== "none") expect(sentence).not.toMatch(SAYS_NO_DATE);
    });
  }
});
