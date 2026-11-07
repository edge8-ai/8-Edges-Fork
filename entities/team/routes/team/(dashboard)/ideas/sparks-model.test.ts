import { describe, expect, it, vi } from "vitest";

// The model imports IDEA_OFFICES from the ideas client door; mocked so the test
// pins the four offices it filters on, not whatever the door carries.
vi.mock("@/entities/ideas/client", () => ({ IDEA_OFFICES: ["revenue", "talent", "operations", "innovation"] }));

import { SKY, constellation, deckRound, fieldHref, filterField, nearestStar, planWithoutPitch, readFieldFilter, skyStars, skyTicks, sparkHook, stepStar, unitHash } from "./sparks-model";

const none = { ai_plan: null, takeaway: null, story: null, problem: null };

// W.187: the plan stops repeating the hook it was taken from.
describe("planWithoutPitch", () => {
  const plan = "## One-line pitch\nSurface the creator so anyone can see who wrote a card.\n\n## The problem\nNo card says who made it.";

  it("drops a leading pitch whose text is the hook the page shows, and keeps the rest", () => {
    const hook = sparkHook({ ...none, ai_plan: plan });
    expect(planWithoutPitch(plan, hook)).toBe("## The problem\nNo card says who made it.");
  });

  it("keeps a pitch someone rewrote, a plan that does not open with one, and any plan when there is no hook", () => {
    expect(planWithoutPitch(plan, "Something else entirely")).toBe(plan);
    const later = "## The problem\nNo card says who made it.\n\n## One-line pitch\nSurface the creator.";
    expect(planWithoutPitch(later, "No card says who made it.")).toBe(later);
    expect(planWithoutPitch(plan, null)).toBe(plan);
  });

  it("matches a clipped hook by its start", () => {
    const long = `## One-line pitch\n${"word ".repeat(80).trim()}\n\n## The problem\nIt is long.`;
    const hook = sparkHook({ ...none, ai_plan: long });
    expect(hook?.endsWith("…")).toBe(true);
    expect(planWithoutPitch(long, hook)).toBe("## The problem\nIt is long.");
  });
});

describe("sparkHook", () => {
  it("leads with the bold takeaway Claude's learning summary opens with", () => {
    const ai_plan = "**Approve the storyboard as stills first.**\n\n## What happened\nI noticed…";
    expect(sparkHook({ ...none, ai_plan })).toBe("Approve the storyboard as stills first.");
  });

  it("skips headings and takes a plan's one-line pitch", () => {
    expect(sparkHook({ ...none, ai_plan: "## Pitch\n\nCut screening from 3 hours to 20 minutes." })).toBe(
      "Cut screening from 3 hours to 20 minutes.",
    );
  });

  it("falls back to the person's own words, takeaway first", () => {
    expect(sparkHook({ ...none, takeaway: "Price the result.", story: "Long story." })).toBe("Price the result.");
    expect(sparkHook({ ...none, problem: "Cards hide comments." })).toBe("Cards hide comments.");
  });

  it("is null for a one-line spark with nothing else, and clips a long hook", () => {
    expect(sparkHook(none)).toBeNull();
    const hook = sparkHook({ ...none, story: "word ".repeat(100) });
    expect(hook!.length).toBeLessThanOrEqual(220);
    expect(hook!.endsWith("…")).toBe(true);
  });
});

describe("skyStars", () => {
  const ideas = [
    { id: "a", title: "First", kind: "build", created_at: "2026-07-15T00:00:00Z", person_id: "p1" },
    { id: "b", title: "Last", kind: "learning", created_at: "2026-10-07T00:00:00Z", person_id: "p2" },
  ];
  const now = new Date("2026-10-07T00:00:00Z");

  it("places the first spark at the left edge and today's at the right, inside the frame", () => {
    const [a, b] = skyStars(ideas, now, "p2");
    expect(a.x).toBe(SKY.pad);
    expect(b.x).toBe(SKY.w - SKY.pad);
    for (const s of [a, b]) {
      expect(s.y).toBeGreaterThanOrEqual(SKY.pad);
      expect(s.y).toBeLessThanOrEqual(SKY.h - SKY.floor - SKY.pad);
    }
  });

  it("marks only the viewer's own sparks, and a star keeps its height between renders", () => {
    const stars = skyStars(ideas, now, "p2");
    expect(stars.map((s) => s.mine)).toEqual([false, true]);
    expect(skyStars(ideas, now, "p2")[0].y).toBe(stars[0].y);
    expect(unitHash("a")).not.toBe(unitHash("b"));
  });

  it("draws nothing for an empty sky", () => {
    expect(skyStars([], now, null)).toEqual([]);
    expect(skyTicks([], now)).toEqual([]);
  });

  it("carries each star's stage, and marks this week's and the viewer's just-posted ones (ID.2.12)", () => {
    const at = new Date("2026-10-07T00:02:00Z");
    const [a, b] = skyStars(ideas, at, "p2", (id) => (id === "a" ? "shipped" : "spark"));
    expect([a.stage, b.stage]).toEqual(["shipped", "spark"]);
    expect([a.isNew, b.isNew]).toEqual([false, true]);
    expect([a.fresh, b.fresh]).toEqual([false, true]);
    expect(skyStars(ideas, new Date("2026-10-07T00:10:00Z"), "p2")[1].fresh).toBe(false);
  });

  it("marks each month from the first spark's to today's, left to right", () => {
    expect(skyTicks(ideas, now).map((t) => t.label)).toEqual(["Jul", "Aug", "Sep", "Oct"]);
    const xs = skyTicks(ideas, now).map((t) => t.x);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
    expect(xs[0]).toBe(SKY.pad);
  });

  it("names every other month once there are more than six, so 12px marks never overlap (W.191)", () => {
    const old = [{ ...ideas[0], created_at: "2025-11-03T00:00:00Z" }, ...ideas];
    const labels = skyTicks(old, now).map((t) => t.label);
    expect(labels.length).toBeLessThanOrEqual(6);
    expect(labels[0]).toBe("Nov");
  });

  it("draws the viewer's constellation through their own stars, oldest first", () => {
    const stars = skyStars(ideas, now, "p2");
    expect(constellation(stars)).toBe(`${stars[1].x},${stars[1].y}`);
    expect(constellation(skyStars(ideas, now, null))).toBe("");
  });
});

// TH.4.5: twelve of this week's stars sat within 4 units at x≈296, so no hit
// circle could tell them apart; a tap picks the nearest and arrows step on.
describe("picking a star in the sky", () => {
  const stars = [
    { id: "a", x: 296, y: 45.5 },
    { id: "b", x: 296, y: 60.6 },
    { id: "c", x: 10, y: 31 },
    { id: "d", x: 309.8, y: 39.3 },
  ];

  it("takes the star nearest the point, wherever in the sky the tap lands", () => {
    expect(nearestStar(stars, 297, 58)?.id).toBe("b");
    expect(nearestStar(stars, 40, 100)?.id).toBe("c");
    expect(nearestStar([], 1, 1)).toBeNull();
  });

  it("steps in time order (left to right, then top to bottom), stopping at either end", () => {
    expect(stepStar(stars, "a", 1)).toBe("b");
    expect(stepStar(stars, "b", 1)).toBe("d");
    expect(stepStar(stars, "a", -1)).toBe("c");
    expect(stepStar(stars, "c", -1)).toBe("c");
    expect(stepStar(stars, "d", 1)).toBe("d");
  });
});

// TH.4.3: the deck serves every unanswered spark in rounds of three.
describe("deckRound", () => {
  it("cuts the deck into rounds of three, the last one short", () => {
    expect(deckRound(0, 8)).toEqual({ start: 0, end: 3 });
    expect(deckRound(2, 8)).toEqual({ start: 0, end: 3 });
    expect(deckRound(3, 8)).toEqual({ start: 3, end: 6 });
    expect(deckRound(7, 8)).toEqual({ start: 6, end: 8 });
  });

  it("lets the first round carry one more card, the did-it-hold check-in", () => {
    expect(deckRound(3, 9, 4)).toEqual({ start: 0, end: 4 });
    expect(deckRound(4, 9, 4)).toEqual({ start: 4, end: 7 });
    expect(deckRound(8, 9, 4)).toEqual({ start: 7, end: 9 });
  });

  it("never runs past a deck shorter than one round", () => {
    expect(deckRound(1, 2)).toEqual({ start: 0, end: 2 });
  });
});

describe("the spark field's filters", () => {
  const open = { kind: null, office: null, stage: null, mine: false, q: "", all: false } as const;

  it("reads only known values from the URL", () => {
    expect(readFieldFilter({ kind: "learning", office: "talent", all: "1" })).toEqual({ ...open, kind: "learning", office: "talent", all: true });
    expect(readFieldFilter({ kind: "x", office: "hr", stage: "lost", mine: "yes" })).toEqual(open);
  });

  // TH.4.4: search, Mine, the stage and the sparks no office was filed for.
  it("reads a search, Mine, a stage and Not filed yet", () => {
    expect(readFieldFilter({ q: "  meeting notes ", mine: "1", stage: "picked_up", office: "none" })).toEqual({
      ...open,
      q: "meeting notes",
      mine: true,
      stage: "picked_up",
      office: "none",
    });
  });

  it("filters by kind and office together, and Not filed yet finds the sparks with no office", () => {
    const rows = [
      { kind: "build", office: "talent" },
      { kind: "learning", office: "talent" },
      { kind: "learning", office: null },
    ];
    expect(filterField(rows, { ...open, kind: "learning" })).toHaveLength(2);
    expect(filterField(rows, { ...open, kind: "learning", office: "talent" })).toEqual([{ kind: "learning", office: "talent" }]);
    expect(filterField(rows, { ...open, office: "none" })).toEqual([{ kind: "learning", office: null }]);
  });

  it("narrows to the viewer's own sparks, to one stage, and to a search that ignores case and Vietnamese marks", () => {
    const rows = [
      { id: "a", kind: "build", office: null, person_id: "me", title: "Meeting notes for client calls", submitterName: "Lan Pham" },
      { id: "b", kind: "learning", office: "talent", person_id: "them", title: "Lock the stills", submitterName: "Minh Trương" },
    ];
    const stageOf = (r: { id: string }): "shipped" | "spark" => (r.id === "b" ? "shipped" : "spark");
    const ctx = { personId: "me", stageOf, searchText: (r: (typeof rows)[number]) => `${r.title} ${r.submitterName}` };
    expect(filterField(rows, { ...open, mine: true }, ctx).map((r) => r.id)).toEqual(["a"]);
    expect(filterField(rows, { ...open, stage: "shipped" }, ctx).map((r) => r.id)).toEqual(["b"]);
    expect(filterField(rows, { ...open, q: "TRUONG" }, ctx).map((r) => r.id)).toEqual(["b"]);
    expect(filterField(rows, { ...open, q: "client" }, ctx).map((r) => r.id)).toEqual(["a"]);
  });

  it("replaces a chip's own group, clears a group set to null, keeps the search, and drops show-all", () => {
    const f = { ...open, kind: "build" as const, office: "talent" as const, all: true };
    expect(fieldHref(f, { kind: "learning" })).toBe("/team/ideas?kind=learning&office=talent");
    expect(fieldHref(f, { office: null })).toBe("/team/ideas?kind=build");
    expect(fieldHref(open, { all: true })).toBe("/team/ideas?all=1");
    expect(fieldHref({ ...open, q: "notes", stage: "shipped" }, { mine: true })).toBe("/team/ideas?q=notes&mine=1&stage=shipped");
    expect(fieldHref({ ...open, mine: true, office: "none" }, { mine: false })).toBe("/team/ideas?office=none");
  });
});
