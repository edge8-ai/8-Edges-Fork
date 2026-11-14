import { describe, expect, it } from "vitest";
import { canOwnerDo, ownerActionsOn, type OwnerAction } from "./owner-rules";
import { canReleaseMember, memberStage, type ClientReviewFacts, type ReviewPartStatus } from "./rules";

// What the owner may do to one member's review (CR.2.4), as the overview
// offers it and the commands refuse it, and what a reopened part does to the
// stage (the CR.2 code review).

type Over = {
  closedAt?: string | null;
  withdrawnAt?: string | null;
  releasedAt?: string | null;
  raterUnlockedAt?: string | null;
  member?: { status: ReviewPartStatus; reopened?: boolean } | null;
  clientManager?: { status: ReviewPartStatus; reopened?: boolean } | null;
  hasSkip?: boolean;
  skipWaivedAt?: string | null;
  skip?: { status: ReviewPartStatus } | null;
};

function facts(over: Over = {}): ClientReviewFacts {
  const cm = over.clientManager === undefined ? { status: "open" as const } : over.clientManager;
  return {
    cycle: { closedAt: over.closedAt ?? null, hasSkipManager: over.hasSkip ?? false, skipManagerLinkCancelled: false },
    member: { withdrawnAt: over.withdrawnAt ?? null, raterUnlockedAt: over.raterUnlockedAt ?? null, skipWaivedAt: over.skipWaivedAt ?? null, releasedAt: over.releasedAt ?? null },
    parts: {
      member: over.member === undefined ? { status: "open" } : over.member,
      clientManager: cm ? { ...cm, linkCancelled: false } : null,
      skipManager: over.skip ?? null,
    },
  };
}

const NONE: Record<OwnerAction, boolean> = {
  unlock: false,
  reopen_member: false,
  reopen_client_manager: false,
  new_link: false,
  change_client_manager: false,
  withdraw: false,
  edit_summary: false,
  waive_skip: false,
  release: false,
};

describe("ownerActionsOn", () => {
  it("offers only the company's own reading on a closed cycle, and nothing on a withdrawn member", () => {
    expect(ownerActionsOn(facts({ closedAt: "2026-12-05T00:00:00Z" }))).toEqual({ ...NONE, edit_summary: true });
    expect(ownerActionsOn(facts({ withdrawnAt: "2026-11-19T00:00:00Z" }))).toEqual(NONE);
  });

  it("offers unlock, a new link, a change and withdraw while nobody has sent", () => {
    expect(ownerActionsOn(facts())).toEqual({ ...NONE, unlock: true, new_link: true, change_client_manager: true, withdraw: true, edit_summary: true });
  });

  it("offers reopening each sent part, and no change of a client manager who has sent", () => {
    const both = facts({ member: { status: "submitted" }, clientManager: { status: "submitted" } });
    // No skip-manager in this cycle, so release opens once the client manager has sent.
    expect(ownerActionsOn(both)).toEqual({ ...NONE, reopen_member: true, reopen_client_manager: true, new_link: true, withdraw: true, edit_summary: true, release: true });
  });

  it("keeps a released review as it was, but still lets a new link be issued", () => {
    const released = facts({ releasedAt: "2026-11-21T00:00:00Z", member: { status: "submitted" }, clientManager: { status: "submitted" } });
    expect(ownerActionsOn(released)).toEqual({ ...NONE, new_link: true });
  });

  it("offers no unlock once it is unlocked, or for a member with no client manager", () => {
    expect(canOwnerDo(facts({ raterUnlockedAt: "2026-11-15T00:00:00Z" }), "unlock")).toEqual({ ok: false, reason: "already_unlocked" });
    expect(canOwnerDo(facts({ clientManager: null }), "unlock")).toEqual({ ok: false, reason: "no_client_manager" });
    expect(canOwnerDo(facts({ clientManager: null }), "new_link")).toEqual({ ok: false, reason: "no_client_manager" });
  });

  it("refuses unlocking once the member has sent theirs", () => {
    expect(canOwnerDo(facts({ member: { status: "submitted" } }), "unlock")).toEqual({ ok: false, reason: "member_submitted" });
  });
});

// CR.3.3: the summary, the waiver and the release.
describe("the summary, the waiver and the release", () => {
  const sent = { member: { status: "submitted" as const }, clientManager: { status: "submitted" as const } };

  it("keeps the summary editable until release, even once the cycle closes", () => {
    expect(canOwnerDo(facts({ closedAt: "2026-12-05T00:00:00Z" }), "edit_summary")).toEqual({ ok: true });
    expect(canOwnerDo(facts({ ...sent, releasedAt: "2026-11-21T00:00:00Z" }), "edit_summary")).toEqual({ ok: false, reason: "released" });
  });

  it("waives the skip-manager's mark only while there is one to wait for", () => {
    expect(canOwnerDo(facts({ ...sent, hasSkip: true }), "waive_skip")).toEqual({ ok: true });
    expect(canOwnerDo(facts({ ...sent }), "waive_skip")).toEqual({ ok: false, reason: "no_skip_manager" });
    expect(canOwnerDo(facts({ ...sent, hasSkip: true, skipWaivedAt: "2026-11-20T00:00:00Z" }), "waive_skip")).toEqual({ ok: false, reason: "already_waived" });
    expect(canOwnerDo(facts({ ...sent, hasSkip: true, skip: { status: "submitted" } }), "waive_skip")).toEqual({ ok: false, reason: "skip_manager_reviewed" });
  });

  it("releases exactly when the rules module says so, a closed cycle included", () => {
    expect(canOwnerDo(facts({ member: { status: "submitted" } }), "release")).toEqual({ ok: false, reason: "client_manager_not_submitted" });
    expect(canOwnerDo(facts({ ...sent, hasSkip: true }), "release")).toEqual({ ok: false, reason: "skip_manager_not_reviewed" });
    expect(canOwnerDo(facts({ ...sent, hasSkip: true, skipWaivedAt: "2026-11-20T00:00:00Z" }), "release")).toEqual({ ok: true });
    expect(canOwnerDo(facts({ ...sent, hasSkip: true, skip: { status: "submitted" }, closedAt: "2026-12-05T00:00:00Z" }), "release")).toEqual({ ok: true });
    expect(canOwnerDo(facts({ ...sent, releasedAt: "2026-11-21T00:00:00Z" }), "release")).toEqual({ ok: false, reason: "released" });
  });

  it("keeps a withdrawn member out of all three", () => {
    for (const action of ["edit_summary", "waive_skip", "release"] as const) {
      expect(canOwnerDo(facts({ ...sent, hasSkip: true, withdrawnAt: "2026-11-19T00:00:00Z" }), action)).toEqual({ ok: false, reason: "member_withdrawn" });
    }
  });
});

describe("a reopened member's part", () => {
  const reopenedAfterClientManager = facts({ member: { status: "open", reopened: true }, clientManager: { status: "submitted" } });

  it("holds the review on the member until they resend it", () => {
    expect(memberStage(reopenedAfterClientManager)).toBe("waiting_on_member");
    expect(canReleaseMember(reopenedAfterClientManager)).toEqual({ ok: false, reason: "member_part_reopened" });
  });

  it("lets it move on once resent", () => {
    const resent = facts({ member: { status: "submitted", reopened: true }, clientManager: { status: "submitted" } });
    expect(memberStage(resent)).toBe("ready_to_release");
    expect(canReleaseMember(resent)).toEqual({ ok: true });
  });

  it("leaves an unlocked review moving on without a member who never sent", () => {
    const unlocked = facts({ raterUnlockedAt: "2026-11-15T00:00:00Z", clientManager: { status: "submitted" } });
    expect(memberStage(unlocked)).toBe("ready_to_release");
  });
});
