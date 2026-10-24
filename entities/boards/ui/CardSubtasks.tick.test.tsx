import { describe, expect, it } from "vitest";
import type { Subtask } from "@/entities/boards/lib/data";
import { withTick } from "./CardSubtasks";

// W.194. The drawer shows a tick before the server has answered, through
// useOptimistic and this rule. The rule is the whole of what the person sees
// change, so it must change the one box and leave every other fact alone: a
// rule that dropped `setAside` would strike a "not doing" subtask back in.

const sub = (id: string, over: Partial<Subtask> = {}): Subtask => ({
  id,
  title: `Subtask ${id}`,
  done: false,
  human_tokens: 0.05,
  assignee_id: null,
  assignee_name: null,
  ...over,
});

describe("withTick (W.194)", () => {
  it("ticks the one subtask clicked", () => {
    const out = withTick([sub("s1"), sub("s2")], { id: "s2", done: true });
    expect(out.map((s) => s.done)).toEqual([false, true]);
  });

  it("unticks as readily as it ticks", () => {
    expect(withTick([sub("s1", { done: true })], { id: "s1", done: false })[0].done).toBe(false);
  });

  it("keeps everything else the subtask carries", () => {
    const before = sub("s1", { setAside: true, human_tokens: 0.3, assignee_name: "Pat Example" });
    expect(withTick([before], { id: "s1", done: true })[0]).toEqual({ ...before, done: true });
  });

  it("leaves the list as it was for an id it does not hold", () => {
    const list = [sub("s1"), sub("s2", { done: true })];
    expect(withTick(list, { id: "gone", done: true })).toEqual(list);
  });
});
