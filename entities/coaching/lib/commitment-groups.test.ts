import { describe, expect, it } from "vitest";
import { groupByPerson, groupForCoach, groupMine, myWeekRows, newestOpenOwned, type CommitmentRow } from "./commitment-groups";

const row = (over: Partial<CommitmentRow>): CommitmentRow => ({
  id: "c",
  profileId: "p-1",
  side: "mine",
  owner: "member",
  title: "A promise",
  status: "open",
  statusNote: null,
  dueOn: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  statusUpdatedAt: null,
  planMd: null,
  askNowSentAt: null,
  heldOn: null,
  personName: null,
  card: null,
  ...over,
});

describe("groupMine", () => {
  it("splits my open promises from my coach's, and folds everything closed", () => {
    const g = groupMine([
      row({ id: "m1", dueOn: "2026-10-20" }),
      row({ id: "m2", dueOn: "2026-10-16" }),
      row({ id: "m3", status: "blocked" }),
      row({ id: "t1", side: "theirs", owner: "coach" }),
      row({ id: "x1", status: "completed", statusUpdatedAt: "2026-10-02T00:00:00.000Z" }),
      row({ id: "x2", status: "dropped", statusNote: "Not needed", statusUpdatedAt: "2026-10-05T00:00:00.000Z" }),
    ]);
    expect(g.mine.map((r) => r.id)).toEqual(["m2", "m1", "m3"]);
    expect(g.theirs.map((r) => r.id)).toEqual(["t1"]);
    expect(g.closed.map((r) => r.id)).toEqual(["x2", "x1"]);
  });
});

describe("groupForCoach", () => {
  it("splits what the coachee promised from what the coach promised, and folds everything closed", () => {
    const g = groupForCoach([
      row({ id: "t1", side: "coachee", dueOn: "2026-10-20" }),
      row({ id: "t2", side: "coachee", dueOn: "2026-10-16" }),
      row({ id: "c1", side: "coach", owner: "coach" }),
      row({ id: "x1", side: "coachee", status: "dropped", statusNote: "Not needed" }),
    ]);
    expect(g.theirs.map((r) => r.id)).toEqual(["t2", "t1"]);
    expect(g.mine.map((r) => r.id)).toEqual(["c1"]);
    expect(g.closed.map((r) => r.id)).toEqual(["x1"]);
  });
});

describe("groupByPerson", () => {
  it("groups a coach's promises under each person, by name", () => {
    const groups = groupByPerson([
      row({ id: "a", side: "coach", owner: "coach", profileId: "p-ha", personName: "Ha" }),
      row({ id: "b", side: "coach", owner: "coach", profileId: "p-an", personName: "An" }),
      row({ id: "c", side: "coach", owner: "coach", profileId: "p-ha", personName: "Ha", status: "completed" }),
    ]);
    expect(groups.map((g) => g.personName)).toEqual(["An", "Ha"]);
    expect(groups[1].open.map((r) => r.id)).toEqual(["a"]);
    expect(groups[1].closed.map((r) => r.id)).toEqual(["c"]);
  });
});

describe("newestOpenOwned", () => {
  it("takes the three newest open promises I own, as coachee or coach, never my coach's", () => {
    const rows = [
      row({ id: "old", createdAt: "2026-09-01T00:00:00.000Z" }),
      row({ id: "new", createdAt: "2026-10-10T00:00:00.000Z" }),
      row({ id: "coach", side: "coach", owner: "coach", createdAt: "2026-10-09T00:00:00.000Z" }),
      row({ id: "theirs", side: "theirs", owner: "coach", createdAt: "2026-10-12T00:00:00.000Z" }),
      row({ id: "done", status: "completed", createdAt: "2026-10-13T00:00:00.000Z" }),
      row({ id: "mid", createdAt: "2026-10-05T00:00:00.000Z" }),
    ];
    expect(newestOpenOwned(rows).map((r) => r.id)).toEqual(["new", "coach", "mid"]);
  });
});

describe("a coachee's promise seen on their coach page", () => {
  it("never reaches the coach's Home or My Week, which list only the reader's own", () => {
    const rows = [row({ id: "coachee", side: "coachee" }), row({ id: "mine", side: "coach", owner: "coach" })];
    expect(newestOpenOwned(rows).map((r) => r.id)).toEqual(["mine"]);
    expect(myWeekRows(rows, { startsOn: "2026-10-14", endsOn: "2026-10-20" }).map((r) => r.id)).toEqual(["mine"]);
  });
});

describe("myWeekRows", () => {
  const window = { startsOn: "2026-10-14", endsOn: "2026-10-20" };
  it("lists promises due in the sprint window first, then the newest, and none already on the Workboard", () => {
    const rows = [
      row({ id: "later", dueOn: "2026-11-01", createdAt: "2026-10-01T00:00:00.000Z" }),
      row({ id: "due-fri", dueOn: "2026-10-16" }),
      row({ id: "due-wed", dueOn: "2026-10-14" }),
      row({ id: "undated-new", createdAt: "2026-10-12T00:00:00.000Z" }),
      row({ id: "carded", dueOn: "2026-10-15", card: { boardSlug: "b", boardName: "B", columnName: "Doing", done: false } }),
      row({ id: "theirs", side: "theirs", owner: "coach", dueOn: "2026-10-15" }),
      row({ id: "closed", status: "dropped", dueOn: "2026-10-15" }),
    ];
    expect(myWeekRows(rows, window).map((r) => r.id)).toEqual(["due-wed", "due-fri", "undated-new", "later"]);
  });
});
