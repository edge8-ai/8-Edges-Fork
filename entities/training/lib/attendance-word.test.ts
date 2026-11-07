import { describe, expect, it } from "vitest";
import { decide, mayReview, type RegisterRow } from "./attendance-word";

// Every word on a training register goes through one module (A.40). decide is
// the module's pure core: given a row, who speaks and what they say, it returns
// the write, the refusal, or nothing to do. These cases are the rules in
// docs/engineering/2026-10-13-architecture-deepening-tickets.md, decisions 3-8.

// The session ran 07:00-08:15 on 14 October; its window closes on the 21st at 08:15.
const ROW: RegisterRow = {
  personId: "duc",
  status: "pending",
  source: "member",
  reviewed: false,
  training: { organiserId: "hoan", startsAt: "2026-10-14T07:00:00Z", endsAt: "2026-10-14T08:15:00Z", cancelledAt: null, selfLogged: false, loggedAt: "2026-10-01T00:00:00Z", closedToLearners: false },
};
const DURING = new Date("2026-10-14T09:00:00Z");
const AFTER_WINDOW = new Date("2026-10-22T09:00:00Z");
const BEFORE_START = new Date("2026-10-14T06:00:00Z");
const DUC = { member: "duc" } as const;
const HOAN = { organiser: "hoan" } as const;

/** Applies a decision's write to a row, so a sequence of words can be played. */
function after(row: RegisterRow, d: ReturnType<typeof decide>): RegisterRow {
  if (!("write" in d)) return row;
  return { ...row, status: d.write.status, source: d.write.source, reviewed: d.dropReview ? false : row.reviewed };
}

describe("decide: the transcript, then the learner, then the transcript again", () => {
  it("keeps the learner's correction when the transcript is read a second time", () => {
    const heard = decide(ROW, "transcript", { status: "attended" }, DURING);
    expect(heard).toEqual({ write: { status: "attended", source: "transcript", skip_reason: null, answered_at: DURING.toISOString() }, dropReview: false });
    const corrected = decide(after(ROW, heard), DUC, { status: "skipped", reason: "clashed" }, DURING);
    expect(corrected).toEqual({ write: { status: "skipped", source: "member", skip_reason: "clashed", answered_at: DURING.toISOString() }, dropReview: false });
    expect(decide(after(after(ROW, heard), corrected), "transcript", { status: "attended" }, DURING)).toEqual({ keep: true });
  });

  it("re-reads its own earlier reading, and leaves the same reading alone", () => {
    const transcribed = { ...ROW, status: "attended" as const, source: "transcript" as const };
    expect(decide(transcribed, "transcript", { status: "absent" }, DURING)).toMatchObject({ write: { status: "absent", source: "transcript" } });
    expect(decide(transcribed, "transcript", { status: "attended" }, DURING)).toEqual({ keep: true });
  });

  it("never replaces the organiser's correction", () => {
    expect(decide({ ...ROW, status: "absent", source: "organiser" }, "transcript", { status: "attended" }, DURING)).toEqual({ keep: true });
  });
});

describe("decide: the learner's word", () => {
  it("is refused before the session starts and once its window has closed, the confirm included", () => {
    expect(decide(ROW, DUC, { status: "attended" }, BEFORE_START)).toEqual({ refuse: "You can say once it has started." });
    expect(decide(ROW, DUC, { status: "attended" }, AFTER_WINDOW)).toEqual({ refuse: "That one is final now." });
    expect(decide({ ...ROW, status: "attended", source: "transcript" }, DUC, { status: "absent" }, AFTER_WINDOW)).toEqual({ refuse: "That one is final now." });
  });

  it("counts a late self-logged training's window from when it was logged", () => {
    const late = { ...ROW, training: { ...ROW.training, selfLogged: true, organiserId: "duc", loggedAt: "2026-10-20T00:00:00Z" } };
    expect(decide(late, DUC, { status: "attended" }, AFTER_WINDOW)).toMatchObject({ write: { status: "attended", source: "member" } });
  });

  it("removes the learner's own review when they move off attended, by either door", () => {
    const reviewed = { ...ROW, status: "attended" as const, source: "member" as const, reviewed: true };
    expect(decide(reviewed, DUC, { status: "skipped", reason: null }, DURING)).toMatchObject({ dropReview: true, write: { status: "skipped" } });
    expect(decide(reviewed, DUC, { status: "absent" }, DURING)).toMatchObject({ dropReview: true, write: { status: "absent", source: "member" } });
    expect(decide(reviewed, DUC, { status: "attended" }, DURING)).toMatchObject({ dropReview: false });
  });

  it("is only ever about the learner's own row", () => {
    expect(decide(ROW, { member: "harry" }, { status: "attended" }, DURING)).toEqual({ refuse: "That training was not found." });
  });

  it("stands over the organiser's, inside the window: the last word stands", () => {
    expect(decide({ ...ROW, status: "absent", source: "organiser" }, DUC, { status: "attended" }, DURING)).toMatchObject({ write: { status: "attended", source: "member" } });
  });
});

describe("decide: the organiser's correction", () => {
  it("is not bound by the window, and is recorded as the organiser's", () => {
    expect(decide(ROW, HOAN, { status: "absent" }, AFTER_WINDOW)).toEqual({ write: { status: "absent", source: "organiser", skip_reason: null, answered_at: AFTER_WINDOW.toISOString() }, dropReview: false });
  });

  it("is refused on a session they do not run, and before it starts", () => {
    expect(decide(ROW, { organiser: "someone-else" }, { status: "attended" }, DURING)).toEqual({ refuse: "You can correct only a session you run." });
    expect(decide(ROW, HOAN, { status: "attended" }, BEFORE_START)).toEqual({ refuse: "The session has not started." });
  });

  it("never speaks for the organiser about themselves: that word is the member's", () => {
    const own = { ...ROW, personId: "hoan" };
    expect(decide(own, HOAN, { status: "attended" }, AFTER_WINDOW)).toEqual({ refuse: "A word about yourself is yours to give on My Training." });
  });

  it("cannot move a reviewed row off attended, because the review is the learner's", () => {
    const reviewed = { ...ROW, status: "attended" as const, source: "member" as const, reviewed: true };
    expect(decide(reviewed, HOAN, { status: "absent" }, DURING)).toEqual({ refuse: "This learner reviewed the session, so it stays attended. Ask them to change it." });
  });
});

describe("decide: a cancelled session", () => {
  it("takes no word from a person; a transcript reads it as it reads any register", () => {
    const cancelled = { ...ROW, training: { ...ROW.training, cancelledAt: "2026-10-13T00:00:00Z" } };
    expect(decide(cancelled, DUC, { status: "attended" }, DURING)).toEqual({ refuse: "That training was not found." });
    expect(decide(cancelled, HOAN, { status: "attended" }, DURING)).toEqual({ refuse: "That training was not found." });
    expect(decide(cancelled, "transcript", { status: "attended" }, DURING)).toMatchObject({ write: { status: "attended", source: "transcript" } });
  });
});

describe("decide: only the member may say skipped", () => {
  it("is a type error for the organiser or a transcript", () => {
    // @ts-expect-error the organiser records attended or absent, never a member's reason
    decide(ROW, HOAN, { status: "skipped", reason: null }, DURING);
    // @ts-expect-error a transcript hears someone or does not
    decide(ROW, "transcript", { status: "skipped", reason: null }, DURING);
    expect(decide(ROW, DUC, { status: "skipped", reason: "unwell" }, DURING)).toMatchObject({ write: { status: "skipped", skip_reason: "unwell" } });
  });
});

describe("mayReview: the member's review asks the same gate as their word", () => {
  const went = { ...ROW, status: "attended" as const, source: "member" as const };

  it("saves only on an attended row, inside the window, on the member's own row", () => {
    expect(mayReview(went, "duc", "save", DURING)).toBeNull();
    expect(mayReview({ ...went, status: "skipped" }, "duc", "save", DURING)).toBe("Say you went first.");
    expect(mayReview(went, "duc", "save", AFTER_WINDOW)).toBe("That one is final now.");
    expect(mayReview(went, "harry", "save", DURING)).toBe("That training was not found.");
  });

  it("removes inside the window whatever the status, and never after it", () => {
    expect(mayReview(went, "duc", "remove", DURING)).toBeNull();
    expect(mayReview(went, "duc", "remove", AFTER_WINDOW)).toBe("That one is final now.");
    expect(mayReview({ ...went, training: { ...went.training, cancelledAt: "2026-10-13T00:00:00Z" } }, "duc", "remove", DURING)).toBe("That training was not found.");
  });
});
