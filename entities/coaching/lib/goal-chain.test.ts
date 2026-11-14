import { describe, expect, it } from "vitest";
import { buildGoalChain, chainRungs, type ChainGoal } from "./goal-chain";

function goal(over: Partial<ChainGoal> & { id: string }): ChainGoal {
  return { title: "A goal", status: "achieved", quarterLabel: "2026-Q1", ...over };
}

const active = goal({ id: "now", title: "Ship the rebuild", status: "active", quarterLabel: "2026-Q3" });

describe("buildGoalChain", () => {
  it("orders the earlier goals by quarter label, oldest first", () => {
    const chain = buildGoalChain(
      [goal({ id: "b", quarterLabel: "2026-Q2" }), active, goal({ id: "a", quarterLabel: "2025-Q4" })],
      active,
    );
    expect(chain.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("leaves the active goal out of its own chain", () => {
    expect(buildGoalChain([active], active)).toEqual([]);
  });

  it("reads the end state from the status", () => {
    const chain = buildGoalChain(
      [
        goal({ id: "a", status: "achieved", quarterLabel: "2026-Q1" }),
        goal({ id: "b", status: "dropped", quarterLabel: "2026-Q2" }),
      ],
      active,
    );
    expect(chain.map((s) => s.endState)).toEqual(["achieved", "dropped"]);
  });

  it("calls an unclosed goal from an earlier quarter carried", () => {
    const chain = buildGoalChain(
      [goal({ id: "a", status: "active", title: "Something else", quarterLabel: "2026-Q1" }), active],
      active,
    );
    expect(chain).toEqual([
      { id: "a", title: "Something else", quarterLabel: "2026-Q1", endState: "carried" },
    ]);
  });

  it("calls a goal with the active one's title carried, whatever its quarter", () => {
    const chain = buildGoalChain(
      [goal({ id: "a", status: "draft", title: "ship the rebuild ", quarterLabel: null }), active],
      active,
    );
    expect(chain.map((s) => s.endState)).toEqual(["carried"]);
  });

  it("leaves out a draft that is not history", () => {
    const chain = buildGoalChain(
      [goal({ id: "a", status: "draft", title: "Later", quarterLabel: "2026-Q4" })],
      active,
    );
    expect(chain).toEqual([]);
  });

  it("still reads closed goals when there is no active goal", () => {
    const chain = buildGoalChain([goal({ id: "a", status: "dropped" })], null);
    expect(chain.map((s) => s.endState)).toEqual(["dropped"]);
  });

  it("sorts a goal with no quarter label after the labelled ones", () => {
    const chain = buildGoalChain(
      [goal({ id: "a", title: "No quarter", quarterLabel: null }), goal({ id: "b", quarterLabel: "2026-Q2" })],
      active,
    );
    expect(chain.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("chainRungs", () => {
  it("draws a muted past rung with the quarter and the end state, and no number", () => {
    const [rung] = chainRungs(buildGoalChain([goal({ id: "a", title: "Ten demos" })], active));
    expect(rung).toMatchObject({
      kind: "past",
      label: "Ten demos",
      eyebrow: "2026-Q1 · achieved",
      detail: null,
      progressPct: null,
      currentValue: null,
    });
  });

  it("says Earlier when the goal carries no quarter label", () => {
    const [rung] = chainRungs(buildGoalChain([goal({ id: "a", quarterLabel: null })], active));
    expect(rung.eyebrow).toBe("Earlier · achieved");
  });
});
