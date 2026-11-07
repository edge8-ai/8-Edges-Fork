import { describe, expect, it } from "vitest";

import { shouldAdoptServerValue } from "@/kernel/ui/hooks/useServerSyncedState";

// The hook itself needs a React renderer and there is no DOM environment in
// this test runner, so the sync decision is tested through the pure function
// the hook delegates to. Every branch the hook contract cares about is here.
describe("shouldAdoptServerValue", () => {
  it("adopts a new server value while nothing is in flight", () => {
    const prev = [{ id: "a" }];
    const next = [{ id: "a" }];
    expect(shouldAdoptServerValue(prev, next, 0)).toBe(true);
  });

  it("compares by reference, not by content, so a same-identity prop is a no-op", () => {
    const same = [{ id: "a" }];
    expect(shouldAdoptServerValue(same, same, 0)).toBe(false);
  });

  it("ignores a new server value while a mutation is in flight", () => {
    const prev = [{ id: "a" }];
    const next = [{ id: "a" }];
    expect(shouldAdoptServerValue(prev, next, 1)).toBe(false);
    expect(shouldAdoptServerValue(prev, next, 2)).toBe(false);
  });

  it("syncs the next prop change once pending returns to zero", () => {
    const seenWhilePending = [{ id: "a" }];
    const actionResponse = [{ id: "a" }];
    // While pending the hook records the prop it saw without adopting it, so the
    // comparison after end() is against that recorded value. The next value is
    // normally the move action's own re-rendered response, which lands after
    // end() (W.196).
    expect(shouldAdoptServerValue(seenWhilePending, seenWhilePending, 0)).toBe(false);
    expect(shouldAdoptServerValue(seenWhilePending, actionResponse, 0)).toBe(true);
  });

  it("works for plain object snapshots as well as arrays", () => {
    const prev = { stageId: "s1", status: "open" };
    const next = { stageId: "s2", status: "open" };
    expect(shouldAdoptServerValue(prev, next, 0)).toBe(true);
    expect(shouldAdoptServerValue(prev, prev, 0)).toBe(false);
  });
});
