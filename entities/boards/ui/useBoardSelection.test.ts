import { describe, expect, it } from "vitest";
import { keepOnScreen } from "./useBoardSelection";

// A selection is over the cards on screen (W.70): a card a filter hides, or
// one that moves somewhere it cannot be ticked, leaves the selection, so a
// press never reaches a card the person cannot see (review of W.202, (a)2).
describe("keepOnScreen", () => {
  it("drops the ticked ids that are no longer on screen", () => {
    expect([...keepOnScreen(new Set(["a", "b", "c"]), new Set(["a", "c"]))]).toEqual(["a", "c"]);
  });

  it("returns the same set when nothing left the screen, so React keeps its state", () => {
    const s = new Set(["a"]);
    expect(keepOnScreen(s, new Set(["a", "b"]))).toBe(s);
  });
});
