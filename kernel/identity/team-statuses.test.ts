import { describe, expect, it } from "vitest";
import { CURRENT_TEAM_STATUSES, PORTAL_STATUSES } from "./team-statuses";

// The two questions every surface asks of team_members.status (A.58). A filter
// that names a set inherits a change to it, so a change here is a decision
// about every picker, roster and gate at once, and this says what was decided.

const GONE_OR_NEVER_HIRED = ["terminated", "alumni", "candidate"];

describe("the team status vocabulary", () => {
  it("means by staff now or starting: at work, on leave, working out notice, or about to start", () => {
    expect([...PORTAL_STATUSES].sort()).toEqual(["active", "notice", "on_leave", "pre_start"]);
  });

  it("means by on the team now: at work, on leave or working out notice, and not someone yet to start", () => {
    expect([...CURRENT_TEAM_STATUSES].sort()).toEqual(["active", "notice", "on_leave"]);
  });

  it("lets nobody who has gone, or was never hired, into either set", () => {
    for (const status of GONE_OR_NEVER_HIRED) {
      expect(PORTAL_STATUSES).not.toContain(status);
      expect(CURRENT_TEAM_STATUSES as readonly string[]).not.toContain(status);
    }
  });

  it("keeps on the team now inside staff now or starting", () => {
    for (const status of CURRENT_TEAM_STATUSES) expect(PORTAL_STATUSES).toContain(status);
  });
});
