import { describe, expect, it } from "vitest";
import { canHostFire, coldFires, EVOLVE_WILL_TRY, evolveOf, isHeld, liveFires, planEvolveFire, satBy, type FireSession, type GrownQuest, type LearningToEvolve } from "./evolve-model";

// Evolve's two thresholds (QS.7; spec "Evolve: an unlock on your own
// learning"), in one table each, and the states the author's pill walks
// through: three will try unlocks a fire, a held fire unlocks a Beacon, and a
// Beacon lit is the last word. The held rule is the ladders' witness for a
// fire (QS.6 used it first), so its table lives here with the other one.

const NOW = new Date("2026-10-24T09:00:00Z");
const ENDED = "2026-10-23T09:20:00Z";
const LATER = "2026-10-24T09:20:00Z";
const session = (over: Partial<FireSession> = {}): FireSession => ({ endsAt: ENDED, cancelled: false, selfLogged: false, attended: ["mai"], ...over });

describe("the will-try threshold: three people other than the author", () => {
  it.each<[number, boolean]>([
    [0, false],
    [1, false],
    [2, false],
    [3, true],
    [4, true],
    [12, true],
  ])("%i will try unlocks the fire: %s", (n, open) => {
    expect(canHostFire(n)).toBe(open);
  });

  it("is three, said once", () => {
    expect(EVOLVE_WILL_TRY).toBe(3);
  });
});

describe("the held threshold: a session ended, uncancelled, with someone other than the Host attended", () => {
  it.each<[string, FireSession | undefined, boolean]>([
    ["ended, someone came", session(), true],
    ["ended, several came, the Host among them", session({ attended: ["host", "mai", "lan"] }), true],
    ["ended, only the Host marked attended", session({ attended: ["host"] }), false],
    ["ended, nobody marked attended", session({ attended: [] }), false],
    ["cancelled, though someone was marked", session({ cancelled: true }), false],
    ["self-logged, though someone was marked: a fire is a taught session", session({ selfLogged: true }), false],
    ["not over yet", session({ endsAt: LATER }), false],
    ["ending this instant counts as ended", session({ endsAt: NOW.toISOString() }), true],
    ["a session Training does not know", undefined, false],
  ])("%s", (_, s, held) => {
    expect(isHeld("host", s, NOW)).toBe(held);
  });

  it("counts who sat by it once each, never the Host", () => {
    expect(satBy("host", session({ attended: ["host", "mai", "lan", "mai"] }))).toBe(2);
  });
});

describe("evolveOf: where the author's own learning stands", () => {
  const raid = (over: Partial<GrownQuest> = {}): GrownQuest => ({ id: "r1", kind: "raid", title: "Our proposal template", trainingId: "t1", createdAt: "2026-10-20T00:00:00Z", ...over });
  const beacon: GrownQuest = { id: "b1", kind: "beacon", title: "The template, as a post", trainingId: null, createdAt: "2026-10-24T00:00:00Z" };
  const sessions = (s: FireSession) => new Map([["t1", s]]);

  it.each<[string, number, GrownQuest[], Map<string, FireSession>, ReturnType<typeof evolveOf>]>([
    ["under three will try and nothing grown: no pill", 2, [], new Map(), null],
    ["three will try: host a fire", 3, [], new Map(), { step: "fire", willTry: 3 }],
    ["a fire lit and burning: lit, whatever the count says now", 1, [raid()], sessions(session({ endsAt: LATER, attended: [] })), { step: "lit", questId: "r1" }],
    ["a fire over with nobody marked yet: still lit", 3, [raid()], sessions(session({ attended: [] })), { step: "lit", questId: "r1" }],
    ["a fire held: light it as a Beacon", 3, [raid()], sessions(session({ attended: ["host", "mai", "lan"] })), { step: "held", questId: "r1", title: "Our proposal template", heldAt: ENDED, sat: 2 }],
    ["a Beacon lit: the last state", 3, [raid(), beacon], sessions(session()), { step: "beacon", questId: "b1" }],
    ["a fire whose session was cancelled: as if never lit", 3, [raid()], sessions(session({ cancelled: true })), { step: "fire", willTry: 3 }],
    ["a cancelled fire under three will try: no pill", 2, [raid()], sessions(session({ cancelled: true })), null],
  ])("%s", (_, willTry, grown, s, want) => {
    expect(evolveOf(willTry, "host", grown, s, NOW)).toEqual(want);
  });

  it("follows the newest live fire when there are two", () => {
    const grown = [raid({ id: "old", trainingId: "t0", createdAt: "2026-10-01T00:00:00Z" }), raid({ id: "new", trainingId: "t1" })];
    const s = new Map([
      ["t0", session()],
      ["t1", session({ endsAt: LATER, attended: [] })],
    ]);
    expect(evolveOf(3, "host", grown, s, NOW)).toEqual({ step: "lit", questId: "new" });
  });

  it("counts as live fires the Raids whose session was not cancelled, newest first, and never a Beacon", () => {
    const grown = [raid({ id: "cancelled", trainingId: "tc" }), raid({ id: "old", trainingId: "t0", createdAt: "2026-10-01T00:00:00Z" }), raid({ id: "new", trainingId: "t1" }), beacon];
    const s = new Map([
      ["tc", session({ cancelled: true })],
      ["t0", session()],
      ["t1", session({ endsAt: LATER, attended: [] })],
    ]);
    expect(liveFires(grown, s).map((q) => q.id)).toEqual(["new", "old"]);
    expect(liveFires([raid()], sessions(session({ cancelled: true })))).toEqual([]);
  });

  // QS.7c: QS.7b's index counts every Raid grown from a learning that is not
  // withdrawn, which is every Raid the read hands here. Each is live, which the
  // pill shows, or cold, which Evolve puts out before it lights: none is ever
  // counted by the index and seen by neither.
  it("splits every Raid grown from a learning into live and cold, so the page and the one-fire index cannot disagree", () => {
    const grown = [
      raid({ id: "cancelled", trainingId: "tc" }),
      raid({ id: "burning", trainingId: "t1" }),
      raid({ id: "untold", trainingId: "tx" }),
      raid({ id: "sessionless", trainingId: null }),
      beacon,
    ];
    const s = new Map([
      ["tc", session({ cancelled: true })],
      ["t1", session({ endsAt: LATER, attended: [] })],
    ]);
    const live = liveFires(grown, s).map((q) => q.id);
    const cold = coldFires(grown, s).map((q) => q.id);
    expect(cold).toEqual(["cancelled", "sessionless"]);
    expect(live.filter((id) => cold.includes(id))).toEqual([]);
    expect([...live, ...cold].sort()).toEqual(grown.filter((q) => q.kind === "raid").map((q) => q.id).sort());
  });
});

describe("planEvolveFire: what the action checks again from the database", () => {
  const AT = "2026-10-30T09:00:00.000Z";
  const learning = (over: Partial<LearningToEvolve> = {}): LearningToEvolve => ({ id: "l1", authorId: "kim", title: "Our proposal template", willTry: 3, ...over });

  it.each<[string, LearningToEvolve | null, string, number, string, { ok: boolean; error?: string; title?: string }]>([
    ["the author, at three will try, with no fire yet", learning(), "kim", 0, AT, { ok: true, title: "Our proposal template" }],
    ["a learning that is gone", null, "kim", 0, AT, { ok: false, error: "That learning isn't here any more." }],
    ["a reader who is not the author", learning(), "chi", 0, AT, { ok: false, error: "Only its author can evolve a learning. Raise a hand for it instead." }],
    ["two will try", learning({ willTry: 2 }), "kim", 0, AT, { ok: false, error: "A learning evolves once 3 people will try it." }],
    ["a fire from it already live", learning(), "kim", 1, AT, { ok: false, error: "You lit a fire on this learning already." }],
    ["a time that has passed", learning(), "kim", 0, "2026-10-24T08:00:00.000Z", { ok: false, error: "Pick a time that has not passed." }],
  ])("%s", (_, l, reader, live, at, want) => {
    expect(planEvolveFire(l, reader, live, at, NOW)).toEqual(want);
  });
});
