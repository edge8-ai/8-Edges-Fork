import { describe, expect, it } from "vitest";
import type { Blocker } from "@/entities/boards/lib/data";
import { withResolved } from "./CardBlockers";

// W.205. The drawer shows a tick before the server has answered, through
// useOptimistic and this rule. The rule is the whole of what the person sees
// change, so it must change the one box and leave every other fact alone: a
// rule that dropped `blocked_by` would take the card link off the row.

const blocker = (id: string, over: Partial<Blocker> = {}): Blocker => ({
  id,
  body: `Blocker ${id}`,
  assignee_id: null,
  assignee_name: null,
  resolved: false,
  blocked_by: null,
  ...over,
});

describe("withResolved (W.205)", () => {
  it("ticks the one blocker clicked", () => {
    const out = withResolved([blocker("b1"), blocker("b2")], { id: "b2", resolved: true });
    expect(out.map((b) => b.resolved)).toEqual([false, true]);
  });

  it("unticks as readily as it ticks", () => {
    expect(withResolved([blocker("b1", { resolved: true })], { id: "b1", resolved: false })[0].resolved).toBe(false);
  });

  it("keeps everything else the blocker carries", () => {
    const before = blocker("b1", { assignee_id: "p1", assignee_name: "Pat Example", blocked_by: { id: "c1", title: "The card it waits on" } });
    expect(withResolved([before], { id: "b1", resolved: true })[0]).toEqual({ ...before, resolved: true });
  });

  it("leaves the list as it was for an id it does not hold", () => {
    const list = [blocker("b1"), blocker("b2", { resolved: true })];
    expect(withResolved(list, { id: "gone", resolved: true })).toEqual(list);
  });
});
