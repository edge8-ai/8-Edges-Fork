import { describe, expect, it } from "vitest";
import { LogInput, ReviewInput, ScheduleInput, answerLine, coolDown, organiserMay, saigonRange, trainingState, windowStart, wordOpen, finalAt, type MyTrainingRow } from "./training-rules";

const NOW = new Date("2026-10-11T10:00:00Z");

const row = (over: Partial<MyTrainingRow>): MyTrainingRow => ({
  attendanceId: "a1",
  trainingId: "t1",
  title: "Sharing session: Claude Code subagents",
  typeId: "ty1",
  typeName: "Sharing session",
  typeRank: 3,
  source: "member",
  organiserName: "An organiser",
  startsAt: "2026-10-09T09:00:00Z",
  endsAt: "2026-10-09T10:00:00Z",
  selfLogged: false,
  status: "pending",
  skipReason: null,
  answeredAt: null,
  review: null,
  loggedAt: "2026-10-01T00:00:00Z",
  ...over,
});

const REVIEW = { stars: 4, load: "about_right" as const, tags: ["useful" as const], note: null, signed: false };

describe("what an organiser may still change (TR.2)", () => {
  it("lets everything change before the training starts", () => {
    expect(organiserMay({ startsAt: "2026-10-12T09:00:00Z", cancelledAt: null }, NOW)).toEqual({
      move: true,
      cancel: true,
      changeWho: true,
      editText: true,
    });
  });

  it("allows only the title and notes once it has started", () => {
    expect(organiserMay({ startsAt: "2026-10-11T10:00:00Z", cancelledAt: null }, NOW)).toEqual({
      move: false,
      cancel: false,
      changeWho: false,
      editText: true,
    });
  });

  it("allows nothing on a cancelled training", () => {
    expect(organiserMay({ startsAt: "2026-10-12T09:00:00Z", cancelledAt: "2026-10-10T00:00:00Z" }, NOW)).toEqual({
      move: false,
      cancel: false,
      changeWho: false,
      editText: false,
    });
  });
});

describe("where a training stands (TR.2)", () => {
  it("is upcoming before it starts, started from then, and cancelled whatever its time", () => {
    expect(trainingState({ startsAt: "2026-10-12T09:00:00Z", cancelledAt: null }, NOW)).toBe("upcoming");
    expect(trainingState({ startsAt: "2026-10-11T10:00:00Z", cancelledAt: null }, NOW)).toBe("started");
    expect(trainingState({ startsAt: "2026-10-12T09:00:00Z", cancelledAt: "2026-10-10T00:00:00Z" }, NOW)).toBe("cancelled");
  });
});

describe("the Cool-down tray (TR.2)", () => {
  it("waits for a member's word only on a training that has started, oldest first", () => {
    const view = coolDown(
      [
        row({ attendanceId: "later", startsAt: "2026-10-10T09:00:00Z", endsAt: "2026-10-10T10:00:00Z" }),
        row({ attendanceId: "earlier" }),
        row({ attendanceId: "future", startsAt: "2026-10-14T09:00:00Z", endsAt: "2026-10-14T10:00:00Z" }),
      ],
      NOW,
    );
    expect(view.waiting.map((r) => r.attendanceId)).toEqual(["earlier", "later"]);
    expect(view.comingUp.map((r) => r.attendanceId)).toEqual(["future"]);
  });

  it("puts an answered training in the log, newest first, and never in the tray", () => {
    const view = coolDown(
      [
        // Reviewed: since TR.3 an attended training waits in the tray for its review.
        row({ attendanceId: "went", status: "attended", answeredAt: "2026-10-09T11:00:00Z", review: REVIEW }),
        row({ attendanceId: "skipped", status: "skipped", skipReason: "unwell", answeredAt: "2026-10-10T11:00:00Z", startsAt: "2026-10-10T09:00:00Z", endsAt: "2026-10-10T10:00:00Z" }),
      ],
      NOW,
    );
    expect(view.waiting).toEqual([]);
    expect(view.log.map((r) => r.attendanceId)).toEqual(["skipped", "went"]);
  });
});

describe("the seven-day window (TR.3)", () => {
  const ends = "2026-10-09T10:00:00Z";

  it("closes seven days after the training ends", () => {
    expect(finalAt(ends)).toBe("2026-10-16T10:00:00.000Z");
  });

  it("is open until that moment and final from it", () => {
    expect(wordOpen(ends, new Date("2026-10-16T09:59:59Z"))).toBe(true);
    expect(wordOpen(ends, new Date("2026-10-16T10:00:00Z"))).toBe(false);
  });
});

describe("where a training's window starts (TR.3, Khoa 2026-10-12)", () => {
  it("is the training's end for one an organiser scheduled", () => {
    expect(windowStart({ endsAt: "2026-10-01T10:00:00Z", selfLogged: false, loggedAt: "2026-10-09T00:00:00Z" })).toBe("2026-10-01T10:00:00Z");
  });

  it("is the moment it was logged for one the member logged late, so a late log can still be reviewed", () => {
    expect(windowStart({ endsAt: "2026-10-01T10:00:00Z", selfLogged: true, loggedAt: "2026-10-09T00:00:00Z" })).toBe("2026-10-09T00:00:00Z");
  });

  it("is still the end for one the member logged before it ended", () => {
    expect(windowStart({ endsAt: "2026-10-01T10:00:00Z", selfLogged: true, loggedAt: "2026-10-01T09:30:00Z" })).toBe("2026-10-01T10:00:00Z");
  });
});

describe("the Cool-down tray with reviews (TR.3)", () => {
  it("keeps a training logged late in the tray for its review", () => {
    const late = row({ attendanceId: "late", status: "attended", selfLogged: true, startsAt: "2026-09-20T09:00:00Z", endsAt: "2026-09-20T10:00:00Z", loggedAt: "2026-10-10T12:00:00Z" });
    expect(coolDown([late], NOW).waiting.map((r) => r.attendanceId)).toEqual(["late"]);
  });

  it("keeps an attended training without a review in the tray while its window is open", () => {
    const view = coolDown([row({ attendanceId: "went", status: "attended", answeredAt: "2026-10-09T11:00:00Z" })], NOW);
    expect(view.waiting.map((r) => r.attendanceId)).toEqual(["went"]);
    expect(view.log).toEqual([]);
  });

  it("moves a reviewed training to the log", () => {
    const view = coolDown([row({ attendanceId: "reviewed", status: "attended", answeredAt: "2026-10-09T11:00:00Z", review: REVIEW })], NOW);
    expect(view.waiting).toEqual([]);
    expect(view.log.map((r) => r.attendanceId)).toEqual(["reviewed"]);
  });

  it("lets an unanswered or unreviewed training leave the tray once its window closes", () => {
    const old = { startsAt: "2026-10-01T09:00:00Z", endsAt: "2026-10-01T10:00:00Z" };
    const view = coolDown(
      [
        row({ attendanceId: "never-answered", ...old }),
        row({ attendanceId: "never-reviewed", status: "attended", answeredAt: "2026-10-01T11:00:00Z", ...old }),
      ],
      NOW,
    );
    expect(view.waiting).toEqual([]);
    expect(view.log.map((r) => r.attendanceId).sort()).toEqual(["never-answered", "never-reviewed"]);
  });
});

describe("the line a log row shows (TR.3)", () => {
  it("says stars and load for a review, went or skipped otherwise, and no answer for a closed silence", () => {
    expect(answerLine(row({ status: "attended", review: REVIEW }))).toBe("4 stars · about right");
    expect(answerLine(row({ status: "attended", review: { ...REVIEW, stars: 1, load: null } }))).toBe("1 star");
    expect(answerLine(row({ status: "attended" }))).toBe("Went");
    expect(answerLine(row({ status: "skipped", skipReason: "needed_rest" }))).toBe("Skipped · needed rest");
    expect(answerLine(row({ status: "pending" }))).toBe("No answer");
  });
});

describe("the review input (TR.3)", () => {
  it("is saved by the stars alone", () => {
    expect(ReviewInput.parse({ stars: 5, load: null, tags: [], note: null, signed: false })).toEqual({ stars: 5, load: null, tags: [], note: null, signed: false });
  });

  it("refuses stars outside 1 to 5, an unknown load and an unknown tag", () => {
    const ok = { stars: 3, load: null, tags: [], note: null, signed: false };
    expect(ReviewInput.safeParse({ ...ok, stars: 0 }).success).toBe(false);
    expect(ReviewInput.safeParse({ ...ok, stars: 6 }).success).toBe(false);
    expect(ReviewInput.safeParse({ ...ok, stars: 2.5 }).success).toBe(false);
    expect(ReviewInput.safeParse({ ...ok, load: "meh" }).success).toBe(false);
    expect(ReviewInput.safeParse({ ...ok, tags: ["great"] }).success).toBe(false);
  });

  it("treats a blank note as none, drops repeated tags, and has nothing to sign without a note", () => {
    const parsed = ReviewInput.parse({ stars: 3, load: "too_much", tags: ["hard", "hard", "useful"], note: "   ", signed: false });
    expect(parsed).toMatchObject({ note: null, tags: ["hard", "useful"] });
    // The box can stay ticked while the note is cleared; the review saves unsigned rather than failing.
    expect(ReviewInput.parse({ stars: 3, load: null, tags: [], note: "  ", signed: true })).toMatchObject({ note: null, signed: false });
    expect(ReviewInput.parse({ stars: 3, load: null, tags: [], note: " Slower please ", signed: true })).toMatchObject({ note: "Slower please", signed: true });
  });

  it("caps the note at 2,000 characters", () => {
    expect(ReviewInput.safeParse({ stars: 3, load: null, tags: [], note: "x".repeat(2001), signed: false }).success).toBe(false);
  });
});

describe("times are Vietnam time (TR.2)", () => {
  it("turns a date, a start and a length into an instant range", () => {
    expect(saigonRange("2026-10-09", "16:00", 90)).toEqual({ startsAt: "2026-10-09T09:00:00.000Z", endsAt: "2026-10-09T10:30:00.000Z" });
  });
});

describe("the inputs (TR.2)", () => {
  const typeId = "6f1c6a9e-2b8f-4a3e-9d6e-1a2b3c4d5e6f";
  const personId = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

  it("accepts a member's own training", () => {
    expect(LogInput.safeParse({ typeId, title: "Next.js 16 course, sitting 3", date: "2026-10-10", start: "20:00", minutes: 90 }).success).toBe(true);
  });

  it("refuses a blank title, a bad time and a zero length", () => {
    expect(LogInput.safeParse({ typeId, title: "  ", date: "2026-10-10", start: "20:00", minutes: 90 }).success).toBe(false);
    expect(LogInput.safeParse({ typeId, title: "x", date: "2026-10-10", start: "25:00", minutes: 90 }).success).toBe(false);
    expect(LogInput.safeParse({ typeId, title: "x", date: "2026-10-10", start: "20:00", minutes: 0 }).success).toBe(false);
  });

  it("asks an organiser for at least one person", () => {
    const base = { typeId, title: "Workshop: evals", date: "2026-10-14", start: "14:00", minutes: 120 };
    expect(ScheduleInput.safeParse({ ...base, personIds: [] }).success).toBe(false);
    expect(ScheduleInput.safeParse({ ...base, personIds: [personId] }).success).toBe(true);
  });
});
