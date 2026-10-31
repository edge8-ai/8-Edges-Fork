import { describe, expect, it } from "vitest";
import { fireTime, isColdFire, planFire, shapeBurning, shapeWanted, splitWanted, withHand } from "./campfires-model";
import type { HandRow } from "./rows";

// The three-hand rule (QS.5; spec "Wanted fires: hands"): a topic's hands are
// counted by distinct person; under three it is a line, at three or more a
// cold fire anyone may light. Matching words to a topic is the database's
// generated key, so these rows carry the key the database would write.
const hand = (person: string, topic = "prompt evals", at = "2026-10-20T00:00:00Z", key = "prompt evals"): HandRow => ({ person_id: person, topic, topic_key: key, created_at: at });
const people = (n: number) => Array.from({ length: n }, (_, i) => hand(`p${i}`, "prompt evals", `2026-10-20T0${i}:00:00Z`));

describe("the three-hand rule", () => {
  it.each([
    [0, null, null],
    [1, "line", false],
    [2, "line", false],
    [3, "cold", true],
    [6, "cold", true],
  ] as const)("%i hands make %s", (n, shape, lightable) => {
    const topics = shapeWanted(people(n), "reader");
    if (shape === null) {
      expect(topics).toEqual([]);
      return;
    }
    expect(topics).toEqual([{ key: "prompt evals", topic: "prompt evals", hands: n, mine: false }]);
    const { cold, lines } = splitWanted(topics);
    expect(shape === "cold" ? cold : lines).toHaveLength(1);
    expect(isColdFire(n)).toBe(lightable);
    const plan = planFire(people(n), "2026-10-30T09:00:00Z", new Date("2026-10-23T00:00:00Z"));
    expect(plan.ok).toBe(lightable);
  });

  it("counts a person once however many rows name them", () => {
    const rows = [hand("a"), hand("a"), hand("b")];
    expect(shapeWanted(rows, "x")[0].hands).toBe(2);
  });

  it("says whether the reader's own hand is up, and names nobody", () => {
    const [t] = shapeWanted([hand("chi"), hand("reader"), hand("lan")], "reader");
    expect(t.mine).toBe(true);
    expect(JSON.stringify(t)).not.toMatch(/chi|lan|reader/);
  });

  it("joins a hand typed differently to the topic whose key matches, and keeps the first hand's words", () => {
    const rows = [hand("a", "prompt evals", "2026-10-20T01:00:00Z"), hand("b", "prompt evals", "2026-10-20T02:00:00Z"), hand("c", "Prompt  evals ", "2026-10-20T03:00:00Z")];
    expect(shapeWanted(rows, "c")).toEqual([{ key: "prompt evals", topic: "prompt evals", hands: 3, mine: true }]);
  });

  it("shows the earliest hand's words, trimmed, whichever order the rows arrive in", () => {
    const rows = [hand("b", "Figma to code ", "2026-10-21T00:00:00Z", "figma to code"), hand("a", " figma to code", "2026-10-20T00:00:00Z", "figma to code")];
    expect(shapeWanted(rows, "x")[0].topic).toBe("figma to code");
  });

  it("puts the most-wanted topic first, then the one wanted longest", () => {
    const rows = [hand("a", "rls", "2026-10-20T00:00:00Z", "rls"), hand("b", "evals", "2026-10-21T00:00:00Z", "evals"), hand("c", "evals", "2026-10-21T01:00:00Z", "evals"), hand("d", "figma", "2026-10-19T00:00:00Z", "figma")];
    expect(shapeWanted(rows, "x").map((t) => t.key)).toEqual(["evals", "figma", "rls"]);
  });

  it("refuses to light below three hands, and for a time that has passed", () => {
    expect(planFire(people(2), "2026-10-30T09:00:00Z", new Date("2026-10-23T00:00:00Z"))).toEqual({ ok: false, error: "A fire needs three hands before anyone can light it." });
    expect(planFire(people(3), "2026-10-22T09:00:00Z", new Date("2026-10-23T00:00:00Z"))).toEqual({ ok: false, error: "Pick a time that has not passed." });
    expect(planFire([], "2026-10-30T09:00:00Z", new Date("2026-10-23T00:00:00Z"))).toEqual({ ok: false, error: "Nobody wants that topic any more." });
    expect(planFire(people(3), "2026-10-30T09:00:00Z", new Date("2026-10-23T00:00:00Z"))).toEqual({ ok: true, title: "prompt evals" });
  });

  it("moves a topic between line and cold fire as the reader's hand goes up and down", () => {
    const two = shapeWanted(people(2), "reader");
    const up = withHand(two, "prompt evals", true);
    expect(up[0]).toMatchObject({ hands: 3, mine: true });
    expect(splitWanted(up).cold).toHaveLength(1);
    expect(withHand(up, "prompt evals", true)).toEqual(up);
    expect(withHand(up, "prompt evals", false)[0]).toMatchObject({ hands: 2, mine: false });
  });
});

describe("burning fires", () => {
  const raid = (id: string, host: string, training: string) => ({ id, title: `Raid ${id}`, host_id: host, training_id: training });
  const session = (startsAt: string, endsAt: string, seated: string[] = [], cancelled = false, organiserId = "chi", marked = false) => ({ startsAt, endsAt, cancelled, organiserId, organiserPage: `/organiser/${startsAt}`, seated, marked });
  const names = new Map([["chi", "Chi"], ["lan", "Lan Anh"], ["s1", "One"], ["s2", "Two"], ["s3", "Three"], ["s4", "Four"], ["s5", "Five"], ["s6", "Six"]]);
  const NOW = new Date("2026-10-23T03:00:00Z");

  it("draws lit Raids whose session has not ended, soonest first, with the Host and up to five faces", () => {
    const sessions = new Map([
      ["t1", session("2026-10-30T09:00:00Z", "2026-10-30T09:20:00Z", ["s1", "s2", "s3", "s4", "s5", "s6"])],
      ["t2", session("2026-10-24T09:00:00Z", "2026-10-24T09:20:00Z", ["reader"])],
      ["t3", session("2026-10-22T09:00:00Z", "2026-10-22T09:20:00Z")],
      ["t4", session("2026-10-25T09:00:00Z", "2026-10-25T09:20:00Z", [], true)],
    ]);
    const fires = shapeBurning([raid("q1", "chi", "t1"), raid("q2", "reader", "t2"), raid("q3", "lan", "t3"), raid("q4", "lan", "t4"), raid("q5", "lan", "t-missing")], sessions, names, "reader", NOW);
    expect(fires.map((f) => f.questId)).toEqual(["q2", "q1"]);
    expect(fires[0]).toMatchObject({ youHost: true, seats: 1, seated: true });
    expect(fires[1]).toMatchObject({ youHost: false, seats: 6, seated: false, host: { name: "Chi" } });
    expect(fires[1].faces.map((f) => f.name)).toEqual(["One", "Two", "Three", "Four", "Five"]);
  });

  it("offers the session's organiser page to the reader only when Training says they organise it (QS.5b)", () => {
    const sessions = new Map([
      ["t1", session("2026-10-30T09:00:00Z", "2026-10-30T09:20:00Z", [], false, "reader")],
      ["t2", session("2026-10-24T09:00:00Z", "2026-10-24T09:20:00Z", ["reader"], false, "chi")],
    ]);
    const fires = shapeBurning([raid("q1", "reader", "t1"), raid("q2", "chi", "t2")], sessions, names, "reader", NOW);
    expect(fires.find((f) => f.questId === "q1")?.sessionHref).toBe("/organiser/2026-10-30T09:00:00Z");
    expect(fires.find((f) => f.questId === "q2")?.sessionHref).toBeNull();
    expect(shapeBurning([raid("q1", "reader", "t1")], sessions, names, "chi", NOW)[0]?.sessionHref).toBeNull();
  });

  it("keeps an ended fire for its Host alone, first, until its register has a mark (QS.5c)", () => {
    const ended = (over: { seated?: string[]; organiser?: string; marked?: boolean; cancelled?: boolean } = {}) =>
      session("2026-10-22T09:00:00Z", "2026-10-22T09:20:00Z", over.seated ?? ["s1", "s2"], over.cancelled ?? false, over.organiser ?? "reader", over.marked ?? false);
    const sessions = new Map([
      ["t-ended", ended()],
      ["t-burning", session("2026-10-24T09:00:00Z", "2026-10-24T09:20:00Z", ["s1"], false, "reader")],
    ]);
    const raids = [raid("q-burning", "reader", "t-burning"), raid("q-ended", "reader", "t-ended")];
    const mine = shapeBurning(raids, sessions, names, "reader", NOW);
    expect(mine.map((f) => [f.questId, f.endedAt])).toEqual([
      ["q-ended", "2026-10-22T09:20:00Z"],
      ["q-burning", null],
    ]);
    expect(mine[0]).toMatchObject({ youHost: true, sessionHref: "/organiser/2026-10-22T09:00:00Z", seats: 2 });
    // Nobody else sees it: not a seated person, not anyone else.
    expect(shapeBurning(raids, sessions, names, "s1", NOW).map((f) => f.questId)).toEqual(["q-burning"]);
    // It goes once the register carries a word, and never shows when nobody sat by it, the Host no longer organises it, or it was cancelled.
    for (const s of [ended({ marked: true }), ended({ seated: [] }), ended({ organiser: "chi" }), ended({ cancelled: true })]) {
      expect(shapeBurning([raid("q-ended", "reader", "t-ended")], new Map([["t-ended", s]]), names, "reader", NOW)).toEqual([]);
    }
  });

  it("says the time in Saigon", () => {
    expect(fireTime("2026-10-29T09:00:00Z")).toBe("Thu 29 Oct · 16:00 Saigon");
  });
});
