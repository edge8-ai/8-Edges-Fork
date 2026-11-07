import { describe, expect, it } from "vitest";
import { closesDue, owedReminder, owingStandings, remindersDue, type ClockHead, type ClockQuest, type ClockRow } from "./clock-rules";
import type { QuestFacts, Standing } from "./standing";

// QS.2: what the clock decides, played as tables. A head's due time is 17:00
// Saigon (10:00 UTC); the clock reads at the times each case names.
const DUE = "2026-10-28T10:00:00.000Z";
const at = (iso: string) => new Date(iso);
const required: QuestFacts = { kind: "bounty", state: "open", giverId: "giver", required: true };
const optional: QuestFacts = { ...required, required: false };

const quest = (facts: QuestFacts, id = "q1"): ClockQuest => ({ id, title: "Share one prompt that saved you an hour", facts });
const head = (over: Partial<ClockHead> = {}): ClockHead => ({ id: "h1", questId: "q1", position: 1, ask: "Post it in the thread", closesAt: DUE, closedAt: null, ...over });
const row = (personId: string, standing: Standing, over: Partial<ClockRow> = {}): ClockRow => ({
  id: `r-${personId}`,
  questId: "q1",
  headId: "h1",
  personId,
  standing,
  late: false,
  reacted: false,
  acceptedAt: null,
  turnedInAt: null,
  handedBackAt: null,
  missedAt: null,
  remindedAt: null,
  ...over,
});
const STAFF = new Set(["ana", "bao", "chi", "dan", "eve", "giver"]);

describe("owingStandings: who a reminder or a Missed can reach", () => {
  it.each([
    ["a required Bounty", required, ["called", "accepted"]],
    ["an optional Bounty", optional, ["accepted"]],
    ["a Raid", { ...optional, kind: "raid" as const }, []],
    ["a Beacon", { ...optional, kind: "beacon" as const }, []],
  ])("on %s", (_, facts, standings) => {
    expect(owingStandings(facts)).toEqual(standings);
  });
});

describe("owedReminder: two hours before a head's due time", () => {
  const two = "2026-10-28T08:00:00.000Z";
  it.each<[string, QuestFacts, Standing, string | null, string, boolean]>([
    ["required, accepted, exactly two hours out", required, "accepted", null, two, true],
    ["required, still called", required, "called", null, two, true],
    ["required, one minute before the due time", required, "accepted", null, "2026-10-28T09:59:00.000Z", true],
    ["required, more than two hours out", required, "accepted", null, "2026-10-28T07:59:59.000Z", false],
    ["required, at the due time (it closes instead)", required, "accepted", null, DUE, false],
    ["required, already reminded", required, "accepted", "2026-10-28T08:00:00.000Z", two, false],
    ["required, turned in", required, "turned_in", null, two, false],
    ["required, already missed", required, "missed", null, two, false],
    ["optional, accepted", optional, "accepted", null, two, true],
    ["optional, never accepted", optional, "called", null, two, false],
    ["optional, handed back", optional, "handed_back", null, two, false],
    ["withdrawn", { ...required, state: "withdrawn" }, "accepted", null, two, false],
    ["closed", { ...required, state: "closed" }, "accepted", null, two, false],
    ["a Raid", { ...required, kind: "raid" }, "accepted", null, two, false],
  ])("%s", (_, facts, standing, remindedAt, now, owed) => {
    expect(owedReminder({ standing, remindedAt }, facts, { closesAt: DUE, closedAt: null }, at(now))).toBe(owed);
  });

  it("is never owed on a head the Giver closed early", () => {
    expect(owedReminder({ standing: "accepted", remindedAt: null }, required, { closesAt: DUE, closedAt: "2026-10-28T07:00:00.000Z" }, at("2026-10-28T08:30:00.000Z"))).toBe(false);
  });
});

describe("remindersDue", () => {
  const now = at("2026-10-28T08:30:00.000Z");

  it("reminds everyone still out on a required head, once each, with the Standings the claim may find", () => {
    const rows = [row("ana", "accepted"), row("bao", "called"), row("chi", "turned_in"), row("dan", "accepted", { remindedAt: "2026-10-28T08:10:00.000Z" })];
    expect(remindersDue([quest(required)], [head()], rows, STAFF, now)).toEqual([
      { questId: "q1", headId: "h1", title: "Share one prompt that saved you an hour", ask: "Post it in the thread", closesAt: DUE, rowIds: ["r-ana", "r-bao"], personIds: ["ana", "bao"], standings: ["called", "accepted"] },
    ]);
  });

  it("reminds only those who accepted an optional head", () => {
    const rows = [row("ana", "accepted"), row("bao", "called"), row("chi", "handed_back")];
    expect(remindersDue([quest(optional)], [head()], rows, STAFF, now).map((r) => [r.personIds, r.standings])).toEqual([[["ana"], ["accepted"]]]);
  });

  it("never reminds someone who is not on the team, and does not claim their row", () => {
    const rows = [row("ana", "accepted"), row("left-us", "accepted")];
    expect(remindersDue([quest(required)], [head()], rows, STAFF, now).map((r) => r.rowIds)).toEqual([["r-ana"]]);
  });

  it("reminds per head: a person who landed the first head still hears about the second", () => {
    const heads = [head(), head({ id: "h2", position: 2, ask: "Show it at standup", closesAt: "2026-10-28T09:00:00.000Z" })];
    const rows = [row("ana", "turned_in"), row("ana", "accepted", { id: "r-ana-2", headId: "h2" })];
    expect(remindersDue([quest(required)], heads, rows, STAFF, now).map((r) => [r.headId, r.personIds])).toEqual([["h2", ["ana"]]]);
  });

  it("says nothing when nobody is owed one", () => {
    expect(remindersDue([quest(required)], [head()], [row("ana", "turned_in")], STAFF, now)).toEqual([]);
    expect(remindersDue([quest(required)], [head({ closesAt: "2026-10-28T11:00:00.000Z" })], [row("ana", "accepted")], STAFF, at("2026-10-28T08:30:00.000Z"))).toEqual([]);
  });
});

describe("closesDue: the clock at a head's due time", () => {
  const after = at("2026-10-28T10:05:00.000Z");

  it("marks Missed exactly the rows a required close owes, closes the head at its due time, and the quest with it", () => {
    const rows = [row("ana", "accepted"), row("bao", "called"), row("chi", "turned_in"), row("dan", "missed", { missedAt: "x" })];
    expect(closesDue([quest(required)], [head()], rows, after)).toEqual([
      {
        questId: "q1",
        giverId: "giver",
        rows: [
          { rowId: "r-ana", standing: "accepted", patch: { standing: "missed", missed_at: after.toISOString() } },
          { rowId: "r-bao", standing: "called", patch: { standing: "missed", missed_at: after.toISOString() } },
        ],
        heads: [{ headId: "h1", closedAt: DUE }],
        quest: { state: "closed", closed_at: after.toISOString() },
      },
    ]);
  });

  it("on an optional Bounty marks only accepted rows; a person who never accepted stays Called", () => {
    const rows = [row("ana", "accepted"), row("bao", "called"), row("chi", "handed_back")];
    expect(closesDue([quest(optional)], [head()], rows, after)[0].rows.map((r) => r.rowId)).toEqual(["r-ana"]);
  });

  it("closes one head of a Hydra and leaves the quest open until its last head has passed", () => {
    const heads = [head(), head({ id: "h2", position: 2, closesAt: "2026-10-29T10:00:00.000Z" })];
    const rows = [row("ana", "accepted"), row("ana", "accepted", { id: "r-ana-2", headId: "h2" })];
    const [plan] = closesDue([quest(required)], heads, rows, after);
    expect(plan.heads).toEqual([{ headId: "h1", closedAt: DUE }]);
    expect(plan.rows.map((r) => r.rowId)).toEqual(["r-ana"]);
    expect(plan.quest).toBeNull();
  });

  it("does nothing before a due time, and nothing on a replay once every write landed", () => {
    expect(closesDue([quest(required)], [head()], [row("ana", "accepted")], at("2026-10-28T09:59:59.000Z"))).toEqual([]);
    const replay = closesDue([quest({ ...required, state: "closed" })], [head({ closedAt: DUE })], [row("ana", "missed", { missedAt: "x" })], after);
    expect(replay).toEqual([]);
  });

  it("finishes a quest whose heads an earlier run closed before it stopped", () => {
    expect(closesDue([quest(required)], [head({ closedAt: DUE })], [row("ana", "missed", { missedAt: "x" })], after)).toEqual([
      { questId: "q1", giverId: "giver", rows: [], heads: [], quest: { state: "closed", closed_at: after.toISOString() } },
    ]);
  });

  it("never touches a withdrawn quest: nobody is Missed", () => {
    expect(closesDue([quest({ ...required, state: "withdrawn" })], [head()], [row("ana", "accepted")], after)).toEqual([]);
  });

  it("never completes a Turn-in nobody made: the clock writes Missed or nothing", () => {
    const rows = (["called", "accepted", "turned_in", "handed_back", "missed"] as const).map((s) => row(s, s));
    const written = closesDue([quest(required)], [head()], rows, after).flatMap((p) => p.rows.map((r) => r.patch.standing));
    expect(written.every((s) => s === "missed")).toBe(true);
  });
});
