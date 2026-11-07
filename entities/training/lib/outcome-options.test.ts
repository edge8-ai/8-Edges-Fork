import { describe, expect, it } from "vitest";
import type { MyTrainingRow } from "./training-rules";
import { creditOptions } from "./outcome-options";

// TR.6: the drawer lists the plans the member is on, then the trainings they
// went to, newest first. A skipped training, or one not yet held, is not theirs
// to credit.
const row = (over: Partial<MyTrainingRow>): MyTrainingRow => ({
  attendanceId: "a",
  trainingId: "t",
  title: "English Communication Practice",
  typeId: "ty",
  typeName: "Class",
  typeRank: 0,
  organiserName: "Hoan",
  startsAt: "2026-10-27T07:00:00Z",
  endsAt: "2026-10-27T08:15:00Z",
  selfLogged: false,
  status: "attended",
  source: "member",
  skipReason: null,
  answeredAt: null,
  review: null,
  loggedAt: "2026-10-20T00:00:00Z",
  ...over,
});

describe("what a member may credit", () => {
  it("lists their plans, then the trainings they went to, newest first", () => {
    const now = new Date("2026-11-02T00:00:00Z");
    const rows = [
      row({ trainingId: "old", startsAt: "2026-10-22T07:00:00Z", endsAt: "2026-10-22T08:15:00Z" }),
      row({ trainingId: "new", startsAt: "2026-10-29T07:00:00Z", endsAt: "2026-10-29T08:15:00Z", typeName: "Sharing session" }),
      row({ trainingId: "skipped", status: "skipped" }),
      row({ trainingId: "ahead", startsAt: "2026-11-05T07:00:00Z", endsAt: "2026-11-05T08:15:00Z" }),
    ];
    expect(creditOptions(rows, [{ id: "p1", title: "English Communication Practice", typeName: "Class" }], now)).toEqual([
      { kind: "plan", id: "p1", label: "English Communication Practice", sub: "Class" },
      { kind: "training", id: "new", label: "English Communication Practice", sub: "Sharing session · Thu 29 Oct" },
      { kind: "training", id: "old", label: "English Communication Practice", sub: "Class · Thu 22 Oct" },
    ]);
  });
});
