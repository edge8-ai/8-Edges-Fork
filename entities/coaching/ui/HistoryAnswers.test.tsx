import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Answers } from "./HistoryAnswers";
import type { HistoryMeetingView } from "./MyHistory";

// K.70. The "held in writing instead" sentence could never render: it sits
// inside `{m.heldLate && …}`, heldLate needs the missed stamp, and the one
// writer that sets held_source to "written" clears that stamp in the same
// patch. So the branch read as a live product decision and was dead.
//
// A 1-1 held in writing did not happen on the day it was booked — that is what
// the written path IS (K.35) — so the row already carries the fact, in
// held_source. The sentence now reads that instead of inferring it from a stamp
// nobody writes.

const meeting = (over: Partial<HistoryMeetingView> = {}): HistoryMeetingView =>
  ({
    id: "m-1", heldOn: "2026-09-16", sharedSummaryMarkdown: null, html: null,
    movedFrom: null, moveReason: null, heldLate: false, heldSource: "meeting",
    movedMd: null, stuckMd: null, talkMd: null, made: 0, kept: 0,
    ...over,
  }) as HistoryMeetingView;

const html = (m: HistoryMeetingView) => renderToStaticMarkup(<Answers m={m} />);

describe("what History says about a 1-1 that did not run on its day", () => {
  it("says it was held in writing, for a written 1-1", () => {
    expect(html(meeting({ heldSource: "written" }))).toContain("held in writing instead");
  });

  it("says it was held after the day, for one marked held late", () => {
    const out = html(meeting({ heldLate: true }));
    expect(out).toContain("held after it");
    expect(out).not.toContain("in writing");
  });

  it("says nothing at all about an ordinary 1-1 that ran on its day", () => {
    expect(html(meeting())).toBe("");
  });

  it("still renders the written sentence when there is nothing else on the row", () => {
    // The early return has to know about the written case too, or a row with no
    // answers and no move drops the sentence on the floor.
    expect(html(meeting({ heldSource: "written" }))).not.toBe("");
  });
});
