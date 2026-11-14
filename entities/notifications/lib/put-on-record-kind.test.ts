import { describe, expect, it } from "vitest";
import { putOnRecordDrafts } from "./training-kinds";

// TR.4: what the Inbox says when an organiser puts a person on a training. A
// one-off training is one line per training; a plan is one line per plan, keyed
// on the plan, so a term of twenty sessions (or a second publish of it) never
// writes a second line. The organiser is not told about themselves.

describe("a training put on your record", () => {
  it("names a one-off training and its time, and keys the line on the training", () => {
    const drafts = putOnRecordDrafts({ organiserId: "hoan", title: "Scrim review", personIds: ["duc", "hoan"], on: { kind: "training", trainingId: "t1", startsAt: "2026-10-14T03:00:00.000Z" } });
    expect(drafts).toEqual([
      {
        personId: "duc",
        kind: "training.put_on_record",
        title: "Scrim review, Wed 14 Oct, 10:00, is on your record",
        body: "It is on My Training. Once it has happened, say whether you went and how it was.",
        adminHref: null,
        teamHref: "/team/my-training",
        eventKey: "t1",
      },
    ]);
  });

  it("names a plan without a date, and keys every person's line on the plan", () => {
    const drafts = putOnRecordDrafts({ organiserId: "hoan", title: "English Communication Practice", personIds: ["duc", "harry"], on: { kind: "plan", planId: "p1" } });
    expect(drafts.map((d) => [d.personId, d.title, d.eventKey])).toEqual([
      ["duc", "You are on English Communication Practice", "plan:p1"],
      ["harry", "You are on English Communication Practice", "plan:p1"],
    ]);
  });
});
