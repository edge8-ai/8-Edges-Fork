import { describe, expect, it } from "vitest";
import { HEADER_FIELDS, PLANNING_FIELDS, addableFields, availableFields, filledFields, shownFields, type FieldFacts, type PlanningField } from "./card-field-visibility";

// W.142: the drawer draws a planning field only when it holds something or the
// person added it; the rest wait behind "+ Add field", most used first.
const facts = (o: Partial<FieldFacts> = {}): FieldFacts => ({
  sprintId: "", epicId: "", prUrl: "", buildSummary: "", internal: false, roadmapItemId: "",
  blockers: 0, ...o,
});
const all = new Set<PlanningField>(["sprint", "epic", "pr", "internal", "roadmap", "build", "blocker"]);
const none = new Set<PlanningField>();

describe("the drawer's planning fields", () => {
  it("draws only what the card holds", () => {
    const shown = shownFields(all, filledFields(facts({ internal: true, buildSummary: "Ships it" })), none, false);
    expect([...shown]).toEqual(["internal", "build"]);
  });

  it("never draws or offers epic, sprint or PR, which the header's pills show on every card", () => {
    const filled = filledFields(facts({ epicId: "e1", sprintId: "s1", prUrl: "https://github.com/x/pull/1" }));
    const shown = shownFields(all, filled, new Set<PlanningField>(["epic", "sprint", "pr"]), false);
    expect([...shown]).toEqual([]);
    for (const f of HEADER_FIELDS) expect(addableFields(all, shown).some((a) => a.key === f)).toBe(false);
  });

  it("draws a field the person added, even while it is empty", () => {
    const shown = shownFields(all, filledFields(facts()), new Set<PlanningField>(["blocker"]), false);
    expect([...shown]).toEqual(["blocker"]);
  });

  it("offers every other field, most used first, and nothing it already draws", () => {
    const shown = shownFields(all, filledFields(facts({ internal: true })), none, false);
    expect(addableFields(all, shown).map((f) => f.key)).toEqual(["roadmap", "build", "blocker"]);
  });

  it("never offers a field this card or surface cannot have", () => {
    const internalBoard = new Set<PlanningField>(["sprint", "epic", "pr", "build"]);
    expect(addableFields(internalBoard, none).map((f) => f.key)).toEqual(["build"]);
    expect([...shownFields(internalBoard, filledFields(facts({ internal: true })), none, false)]).toEqual([]);
  });

  it("draws only what is filled on a read-only surface, whatever was added", () => {
    const shown = shownFields(all, filledFields(facts({ internal: true })), new Set<PlanningField>(["blocker"]), true);
    expect([...shown]).toEqual(["internal"]);
  });

  it("counts a blocker as filled", () => {
    expect([...filledFields(facts({ blockers: 1 }))]).toEqual(["blocker"]);
  });

  it("no longer knows Snooze, Repeat or Needs a hand: the drawer does not offer them (W.152)", () => {
    const keys = PLANNING_FIELDS.map((f) => f.key) as string[];
    for (const gone of ["snooze", "repeat", "hand"]) expect(keys).not.toContain(gone);
  });

  it("does not count whitespace as a PR or a build summary", () => {
    expect(filledFields(facts({ prUrl: "  ", buildSummary: " " })).size).toBe(0);
  });
});

describe("availableFields", () => {
  const ctx = (o: Partial<Parameters<typeof availableFields>[0]> = {}) => ({
    isNew: false, isClientBoard: false, isCommitment: false, hasBacklog: false, roadmapItemId: "", ...o,
  });

  it("always has Epic, Sprint and PR, on every board and on a new card (W.152)", () => {
    for (const c of [ctx(), ctx({ isNew: true }), ctx({ isClientBoard: true })]) {
      const available = availableFields(c);
      for (const core of ["epic", "sprint", "pr"] as const) expect(available.has(core)).toBe(true);
    }
  });

  it("offers a new card only the core fields, which a card can have before it exists", () => {
    expect([...availableFields(ctx({ isNew: true }))]).toEqual(["sprint", "epic", "pr"]);
  });

  it("offers a roadmap item only on a client board, and never on a commitment's card", () => {
    expect(availableFields(ctx({ isClientBoard: true, hasBacklog: true })).has("roadmap")).toBe(true);
    expect(availableFields(ctx({ isClientBoard: true, hasBacklog: true, isCommitment: true })).has("roadmap")).toBe(false);
    expect(availableFields(ctx({ hasBacklog: true })).has("roadmap")).toBe(false);
  });
});
