import { describe, expect, it } from "vitest";
import { epicTotals } from "./epic-totals";

describe("epicTotals", () => {
  it("counts each card's own tokens under its status, per epic, without re-adding its subtasks", () => {
    const { byEpic, none, total } = epicTotals([
      { epic_id: "a", status: "doing", human_tokens: 2.3 },
      { epic_id: "a", status: "done", human_tokens: null },
      { epic_id: null, status: "todo", human_tokens: 4 },
    ]);
    expect(byEpic.get("a")).toEqual({ open: 1, done: 1, openTokens: 2.3, doneTokens: 0 });
    expect(none).toEqual({ open: 1, done: 0, openTokens: 4, doneTokens: 0 });
    expect(total).toEqual({ open: 2, done: 1, openTokens: 6.3, doneTokens: 0 });
  });
});
