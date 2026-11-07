import { describe, expect, it } from "vitest";
import { sprintLockHolds, sprintLockRefusal, type LockableSprint } from "./sprint-lock";

// W.120. A locked sprint refuses card changes on the server, but only until
// it starts: locked_at is never cleared on its own, so an all-week rule would
// have refused every mid-week add.

const sprint = (over: Partial<LockableSprint> = {}): LockableSprint => ({
  name: "Sprint 4",
  locked_at: "2026-09-22T09:00:00Z",
  starts_on: "2026-09-23",
  ...over,
});

describe("sprintLockHolds", () => {
  it("holds before the start date, and not from it", () => {
    expect(sprintLockHolds(sprint(), "2026-09-22")).toBe(true);
    expect(sprintLockHolds(sprint(), "2026-09-23")).toBe(false);
    expect(sprintLockHolds(sprint(), "2026-09-26")).toBe(false);
  });

  it("never holds on an unlocked sprint", () => {
    expect(sprintLockHolds(sprint({ locked_at: null }), "2026-09-22")).toBe(false);
  });

  it("holds on a locked sprint with no start date, since nothing says it has begun", () => {
    expect(sprintLockHolds(sprint({ starts_on: null }), "2026-09-30")).toBe(true);
  });
});

describe("sprintLockRefusal", () => {
  const before = "2026-09-22";

  it("refuses adding a card to a locked sprint that has not started", () => {
    expect(sprintLockRefusal(null, sprint(), before)).toContain("Sprint 4 is locked");
  });

  it("refuses taking a card out of one", () => {
    expect(sprintLockRefusal(sprint(), null, before)).toContain("Sprint 4 is locked");
    expect(sprintLockRefusal(sprint(), sprint({ name: "Sprint 5", locked_at: null }), before)).toContain("Sprint 4 is locked");
  });

  it("says where Unlock is", () => {
    expect(sprintLockRefusal(null, sprint(), before)).toContain("Sprint planning");
  });

  it("lets the move through once the sprint has started, or when nothing is locked", () => {
    expect(sprintLockRefusal(null, sprint(), "2026-09-23")).toBeNull();
    expect(sprintLockRefusal(sprint({ locked_at: null }), null, before)).toBeNull();
    expect(sprintLockRefusal(null, null, before)).toBeNull();
  });
});
