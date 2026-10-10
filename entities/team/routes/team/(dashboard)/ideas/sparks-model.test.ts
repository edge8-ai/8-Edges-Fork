import { describe, expect, it, vi } from "vitest";

// The model imports IDEA_OFFICES from the ideas client door; mocked so the test
// pins the four offices it filters on, not whatever the door carries.
vi.mock("@/entities/ideas/client", () => ({ IDEA_OFFICES: ["revenue", "talent", "operations", "innovation"] }));

import { SKY, constellation, fieldHref, filterField, planWithoutPitch, readFieldFilter, skyStars, skyTicks, sparkHook, unitHash } from "./sparks-model";

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

describe("the spark field's filters", () => {
  it("reads only known values from the URL", () => {
    expect(readFieldFilter({ kind: "learning", office: "talent", all: "1" })).toEqual({ kind: "learning", office: "talent", all: true });
    expect(readFieldFilter({ kind: "x", office: "hr" })).toEqual({ kind: null, office: null, all: false });
  });

  it("filters by kind and office together", () => {
    const rows = [
      { kind: "build", office: "talent" },
      { kind: "learning", office: "talent" },
      { kind: "learning", office: null },
    ];
    expect(filterField(rows, { kind: "learning", office: null, all: false })).toHaveLength(2);
    expect(filterField(rows, { kind: "learning", office: "talent", all: false })).toEqual([{ kind: "learning", office: "talent" }]);
  });

  it("replaces a chip's own group, clears a group set to null, and drops show-all", () => {
    const f = { kind: "build" as const, office: "talent" as const, all: true };
    expect(fieldHref(f, { kind: "learning" })).toBe("/team/ideas?kind=learning&office=talent");
    expect(fieldHref(f, { office: null })).toBe("/team/ideas?kind=build");
    expect(fieldHref({ kind: null, office: null, all: false }, { all: true })).toBe("/team/ideas?all=1");
  });
});
