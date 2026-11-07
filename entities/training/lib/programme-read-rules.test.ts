// TR.7: the programme read's rules, each proved on facts built by hand.
import { describe, expect, it } from "vitest";
import { figuresOf, hiddenSentence, inScope, programmeRead, type Fact, type ProgrammeViewer, type ReadFilter, type Slice } from "./programme-read-rules";

const NOW = new Date("2026-11-03T00:00:00Z");
const RECENT = "2026-10-20T07:00:00Z";
const OLDER = "2026-09-20T07:00:00Z";
const OLD = "2026-07-01T07:00:00Z";
const TYPES = [
  { id: "class", name: "Class" },
  { id: "sharing", name: "Sharing session" },
];
const PLANS = [
  { id: "ecp", title: "English Communication Practice" },
  { id: "duc", title: "English 1-1: Đức" },
];
const ALL: ReadFilter = { period: "start", typeId: null, planId: null };

function fact(personId: string, over: Partial<Fact> = {}): Fact {
  return {
    trainingId: "t1",
    startsAt: RECENT,
    typeId: "class",
    planId: null,
    personId,
    status: "attended",
    skipReason: null,
    review: { stars: 4, load: "about_right", tags: ["useful"], note: null, signed: false },
    ...over,
  };
}

const reviewedBy = (ids: string[], over: Partial<Fact> = {}) => ids.map((id) => fact(id, over));
const read = (facts: Fact[], filter: ReadFilter = ALL) => programmeRead({ facts, types: TYPES, plans: PLANS, now: NOW }, filter);
function slices(facts: Fact[], filter: ReadFilter = ALL): Slice[] {
  const r = read(facts, filter);
  if (r.refused) throw new Error("refused");
  return r.slices;
}
const find = (s: Slice[], id: string) => s.find((x) => x.id === id);

describe("rule 1: three reviewers", () => {
  it("hides a slice two people reviewed, with the reason and no figures", () => {
    const s = find(slices(reviewedBy(["a", "b"])), "class");
    expect(s).toMatchObject({ shown: false, reason: "few" });
    expect(s).not.toHaveProperty("figures");
  });

  it("hides a slice when three people went but only two reviewed", () => {
    const facts = [...reviewedBy(["a", "b"]), fact("c", { review: null })];
    expect(find(slices(facts), "class")).toMatchObject({ shown: false, reason: "few" });
  });

  it("shows a slice three people reviewed", () => {
    expect(find(slices(reviewedBy(["a", "b", "c"])), "class")).toMatchObject({ shown: true });
  });

  it("counts people, not reviews: one person's three reviews are still one reviewer", () => {
    const facts = ["t1", "t2", "t3"].map((t) => fact("a", { trainingId: t }));
    expect(find(slices(facts), "class")).toMatchObject({ shown: false, reason: "few" });
  });
});

describe("the figures", () => {
  it("adds up stars, load, feelings, attendance, skips and notes", () => {
    const f = figuresOf([
      fact("a", { review: { stars: 5, load: "about_right", tags: ["useful", "clear"], note: "Good pace", signed: true } }),
      fact("b", { review: { stars: 4, load: "too_much", tags: ["useful", "too_fast"], note: "Fast", signed: false } }),
      fact("c", { review: { stars: 3, load: null, tags: [], note: "  ", signed: false } }),
      fact("d", { status: "skipped", skipReason: "clashed", review: null }),
      fact("e", { status: "skipped", skipReason: null, review: null }),
      fact("f", { status: "pending", review: null }),
      fact("g", { status: "absent", review: null }),
    ]);
    expect(f).toMatchObject({ reviewers: 3, reviews: 3, stars: 4, listed: 7, went: 3, skipped: 2, absent: 1, noAnswer: 1, namelessNotes: 1, signedNotes: 1 });
    expect(f.load).toEqual({ too_little: 0, about_right: 1, too_much: 1 });
    expect(f.tags).toEqual([
      { label: "Useful", n: 2 },
      { label: "Clear", n: 1 },
      { label: "Too fast", n: 1 },
    ]);
    expect(f.skips).toEqual([
      { label: "Clashed", n: 1 },
      { label: "No reason given", n: 1 },
    ]);
  });
});

describe("rule 2: a narrowing filter is refused", () => {
  it("refuses a type filter that leaves two reviewers", () => {
    const facts = [...reviewedBy(["a", "b", "c"]), ...reviewedBy(["d", "e"], { typeId: "sharing", trainingId: "t2" })];
    expect(read(facts, { period: "start", typeId: "sharing", planId: null })).toEqual({ refused: true });
  });

  it("refuses a period that leaves two reviewers", () => {
    const facts = [...reviewedBy(["a", "b"]), ...reviewedBy(["c", "d"], { startsAt: OLD, trainingId: "t0" })];
    expect(read(facts, { period: "m", typeId: null, planId: null })).toEqual({ refused: true });
  });

  it("never refuses the unfiltered read: too few reviews show as hidden slices instead", () => {
    const r = read(reviewedBy(["a"]));
    expect(r.refused).toBe(false);
    expect(r.refused === false && r.slices.every((s) => !s.shown)).toBe(true);
  });

  it("does not refuse a filter that keeps three reviewers", () => {
    expect(read(reviewedBy(["a", "b", "c"]), { period: "m", typeId: "class", planId: null }).refused).toBe(false);
  });
});

describe("rule 3: no slice may be worked out by subtraction", () => {
  // Class: five on the plan, two more on a class of their own.
  const planFacts = reviewedBy(["a", "b", "c", "d", "e"], { planId: "ecp", trainingId: "p1" });
  const looseFacts = reviewedBy(["f", "g"], { trainingId: "c1" });

  it("hides a plan when its type without it would leave two reviewers", () => {
    const s = slices([...planFacts, ...looseFacts]);
    expect(find(s, "class")).toMatchObject({ shown: true });
    const plan = find(s, "ecp");
    expect(plan).toMatchObject({ shown: false, reason: "beside", beside: "Class" });
    expect(hiddenSentence(plan as { reason: "beside"; beside: string })).toBe("Beside Class, it would leave fewer than three people's reviews to work out.");
  });

  it("keeps that plan hidden when it is filtered on alone, so no view shows what another subtracts", () => {
    expect(find(slices([...planFacts, ...looseFacts], { period: "start", typeId: null, planId: "ecp" }), "ecp")).toMatchObject({ shown: false, reason: "beside" });
  });

  it("shows both when the rest of the type is three people too", () => {
    const s = slices([...planFacts, ...reviewedBy(["f", "g", "h"], { trainingId: "c1" })]);
    expect(find(s, "ecp")).toMatchObject({ shown: true });
    expect(find(s, "class")).toMatchObject({ shown: true });
  });

  it("shows both when the plan is the whole type", () => {
    const s = slices(planFacts);
    expect(find(s, "ecp")).toMatchObject({ shown: true });
    expect(find(s, "class")).toMatchObject({ shown: true });
  });

  it("counts attendance too: two people who only skipped are still two people to work out", () => {
    const skippers = [fact("f", { trainingId: "c1", status: "skipped", skipReason: "unwell", review: null }), fact("g", { trainingId: "c1", status: "skipped", skipReason: "clashed", review: null })];
    expect(find(slices([...planFacts, ...skippers]), "ecp")).toMatchObject({ shown: false, reason: "beside" });
  });

  it("hides the narrower period when the older reviews would be fewer than three", () => {
    const facts = [...reviewedBy(["a", "b", "c"]), fact("d", { startsAt: OLD, trainingId: "t0" })];
    expect(find(slices(facts), "class")).toMatchObject({ shown: true });
    expect(find(slices(facts, { period: "m", typeId: null, planId: null }), "class")).toMatchObject({ shown: false, reason: "beside", beside: "since the start" });
  });

  it("checks the middle period against both of the others", () => {
    // Three in the last thirty days, one more within three months, three older still.
    const facts = [...reviewedBy(["a", "b", "c"]), fact("d", { startsAt: OLDER, trainingId: "t9" }), ...reviewedBy(["e", "f", "g"], { startsAt: OLD, trainingId: "t0" })];
    const shownIn = (period: ReadFilter["period"]) => find(slices(facts, { period, typeId: null, planId: null }), "class")?.shown;
    // Last 30 days beside 3 months would give away one person; one of the two is hidden.
    expect([shownIn("m"), shownIn("q")]).toContain(false);
    expect(shownIn("start")).toBe(true);
  });

  it("hides against three slices at once, not just pairs (the PR 2472 boundary review's counterexample)", () => {
    // Class since the start: a plan four months ago (a, b, c), one stand-alone
    // class (x) in between, and three recent scrims (d, e, g). Every pair
    // differs by four people or more, yet since-the-start less the last three
    // months less the plan is x alone.
    const facts = [
      ...reviewedBy(["a", "b", "c"], { planId: "ecp", trainingId: "p1", startsAt: OLD }),
      fact("x", { trainingId: "c1", startsAt: OLD, review: { stars: 1, load: "too_much", tags: ["boring"], note: null, signed: false } }),
      ...reviewedBy(["d", "e", "g"], { trainingId: "c2" }),
    ];
    const shown = (period: ReadFilter["period"]) => slices(facts, { period, typeId: null, planId: null }).filter((s) => s.shown).map((s) => s.id);
    // Whatever stays shown across the periods, x's cell must be merged away:
    // Class since the start, Class over three months and the plan are never all shown.
    const all = [shown("start").includes("class"), shown("q").includes("class"), shown("start").includes("ecp")];
    expect(all).toContain(false);
  });

  it("hides a plan when the type minus all of its shown plans leaves one person", () => {
    const facts = [
      ...reviewedBy(["a", "b", "c"], { planId: "ecp", trainingId: "p1" }),
      ...reviewedBy(["d", "e", "f", "h"], { planId: "duc", trainingId: "p2" }),
      fact("g", { trainingId: "c1" }),
    ];
    const s = slices(facts);
    expect(find(s, "class")).toMatchObject({ shown: true });
    expect(find(s, "ecp")).toMatchObject({ shown: false, reason: "beside", beside: "Class" });
    expect(find(s, "duc")).toMatchObject({ shown: true });
  });
});

describe("the totals", () => {
  it("add up the shown types only, so a hidden one cannot be worked out from them", () => {
    const facts = [...reviewedBy(["a", "b", "c"]), ...reviewedBy(["d", "e"], { typeId: "sharing", trainingId: "t2", review: { stars: 1, load: null, tags: [], note: null, signed: false } })];
    const r = read(facts);
    expect(r.refused === false && r.totals).toEqual({ reviews: 3, stars: 4, went: 3, listed: 3 });
  });

  it("are absent when no type is shown", () => {
    const r = read(reviewedBy(["a"]));
    expect(r.refused === false && r.totals).toBeNull();
  });
});

describe("the filters", () => {
  it("narrow to one type and its plans", () => {
    const facts = [...reviewedBy(["a", "b", "c"], { planId: "ecp" }), ...reviewedBy(["d", "e", "f"], { typeId: "sharing", trainingId: "t2" })];
    expect(slices(facts, { period: "start", typeId: "class", planId: null }).map((s) => s.id)).toEqual(["class", "ecp"]);
  });

  it("narrow to one plan", () => {
    const facts = reviewedBy(["a", "b", "c"], { planId: "ecp" });
    expect(slices(facts, { period: "start", typeId: null, planId: "ecp" }).map((s) => s.id)).toEqual(["ecp"]);
  });
});

describe("the notes", () => {
  it("come in the order of their words, not of their trainings, and keep who signed", () => {
    const facts = [
      fact("a", { trainingId: "t3", review: { stars: 4, load: null, tags: [], note: "Zoom kept dropping", signed: false } }),
      fact("b", { trainingId: "t1", review: { stars: 4, load: null, tags: [], note: " Avoid Fridays ", signed: true } }),
      fact("c", { trainingId: "t2", review: { stars: 4, load: null, tags: [], note: null, signed: true } }),
    ];
    const s = find(slices(facts), "class");
    expect(s?.shown && s.notes).toEqual([
      { text: "Avoid Fridays", personId: "b", signed: true },
      { text: "Zoom kept dropping", personId: "a", signed: false },
    ]);
  });

  it("are not carried by a hidden slice", () => {
    expect(find(slices(reviewedBy(["a", "b"], { review: { stars: 4, load: null, tags: [], note: "Words", signed: false } })), "class")).not.toHaveProperty("notes");
  });
});

describe("the viewer's scope", () => {
  const holder = (reach: string[] | "all"): ProgrammeViewer => ({
    personId: "me",
    planIds: new Set(),
    may: (permission, target) => permission === "training.programme" && (reach === "all" || (target?.person !== undefined && reach.includes(target.person))),
  });
  const nobody: ProgrammeViewer = { personId: "me", planIds: new Set(), may: () => false };

  it("gives an organiser what they organised, and nothing else", () => {
    expect(inScope({ organiserId: "me", selfLogged: false, planId: null }, ["x"], nobody)).toBe(true);
    expect(inScope({ organiserId: "other", selfLogged: false, planId: null }, ["x"], nobody)).toBe(false);
  });

  it("does not count a member's own logged training as organising", () => {
    expect(inScope({ organiserId: "me", selfLogged: true, planId: null }, ["me"], nobody)).toBe(false);
  });

  it("gives a manager every training one of their reports is on", () => {
    expect(inScope({ organiserId: "other", selfLogged: false, planId: null }, ["x", "report"], holder(["report"]))).toBe(true);
    expect(inScope({ organiserId: "other", selfLogged: false, planId: null }, ["x", "y"], holder(["report"]))).toBe(false);
  });

  it("gives a member the plans they are on, and not the others", () => {
    const member: ProgrammeViewer = { personId: "me", planIds: new Set(["ecp"]), may: () => false };
    expect(inScope({ organiserId: "other", selfLogged: false, planId: "ecp" }, ["x"], member)).toBe(true);
    expect(inScope({ organiserId: "other", selfLogged: false, planId: "duc" }, ["x"], member)).toBe(false);
  });

  it("gives Admin every training", () => {
    expect(inScope({ organiserId: "other", selfLogged: true, planId: null }, ["x"], holder("all"))).toBe(true);
  });
});

describe("rule 3 holds on any programme (seeded random)", () => {
  // A small seeded generator, so a failure names a case that replays.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }
  const DATES = [RECENT, OLDER, OLD];

  it("never shows slices whose facts split into a cell fewer than three people stand for", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const r = rng(seed);
      const facts: Fact[] = [];
      const trainings = 2 + Math.floor(r() * 6);
      for (let t = 0; t < trainings; t += 1) {
        const typeId = r() < 0.6 ? "class" : "sharing";
        const planId = r() < 0.5 ? (r() < 0.5 ? "ecp" : "duc") : null;
        const startsAt = DATES[Math.floor(r() * 3)]!;
        const people = 1 + Math.floor(r() * 4);
        for (let p = 0; p < people; p += 1) {
          const personId = `p${Math.floor(r() * 9)}`;
          if (facts.some((f) => f.trainingId === `t${t}` && f.personId === personId)) continue;
          const reviewed = r() < 0.8;
          facts.push(fact(personId, { trainingId: `t${t}`, typeId, planId, startsAt, review: reviewed ? { stars: 1 + Math.floor(r() * 5), load: null, tags: [], note: null, signed: false } : null }));
        }
      }
      // Every slice shown in any period, with the facts it stands for.
      const shownSets: Fact[][] = [];
      for (const period of ["start", "q", "m"] as const) {
        const res = read(facts, { period, typeId: null, planId: null });
        if (res.refused) continue;
        for (const s of res.slices) {
          if (!s.shown) continue;
          shownSets.push(facts.filter((f) => (s.grain === "type" ? f.typeId === s.id : f.planId === s.id) && (period === "start" || new Date(f.startsAt).getTime() >= NOW.getTime() - (period === "q" ? 91 : 30) * 86_400_000)));
        }
      }
      const cells = new Map<string, Fact[]>();
      for (const f of facts) {
        const id = shownSets.map((set, i) => (set.includes(f) ? i : -1)).filter((i) => i >= 0).join(",");
        if (id === "") continue;
        cells.set(id, [...(cells.get(id) ?? []), f]);
      }
      for (const [id, cell] of cells) {
        const people = new Set(cell.map((f) => f.personId)).size;
        const reviewers = new Set(cell.filter((f) => f.review).map((f) => f.personId)).size;
        expect({ seed, id, ok: people >= 3 && (reviewers === 0 || reviewers >= 3) }).toEqual({ seed, id, ok: true });
      }
    }
  });
});
