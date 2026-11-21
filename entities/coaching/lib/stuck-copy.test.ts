import { describe, expect, it } from "vitest";
import { stuckMoveHint } from "./stuck-copy";

// The hint is the only part of the Stuck copy that varies, and the variation is
// the whole point: it has to stay an offer of help whether or not the member
// has a coach on record.
describe("stuckMoveHint", () => {
  it("names the coach when there is one", () => {
    expect(stuckMoveHint("Coach")).toBe("Ask Coach for a hand");
  });

  it("still offers a hand when there is no coach", () => {
    expect(stuckMoveHint(null)).toBe("Ask for a hand");
    expect(stuckMoveHint(undefined)).toBe("Ask for a hand");
  });

  // A whitespace-only name is a blank name; it must not produce "Ask  for a hand".
  it("treats a blank name as no coach", () => {
    expect(stuckMoveHint("   ")).toBe("Ask for a hand");
  });
});
