import { describe, expect, it } from "vitest";
import type { ClientReviewFacts, ReviewPartFacts } from "./rules";
import { canSkipManagerWrite, skipListStage } from "./skip-rules";

// CR.3.2: what the skip-manager's link may do with one member, and how the
// list words where each member stands.

const open: ReviewPartFacts = { status: "open" };
const sent: ReviewPartFacts = { status: "submitted" };

function facts(over: { member?: ReviewPartFacts | null; cm?: ReviewPartFacts | null; skip?: ReviewPartFacts | null; closed?: boolean; cancelled?: boolean; withdrawn?: boolean } = {}): ClientReviewFacts {
  return {
    cycle: { closedAt: over.closed ? "2026-12-05T00:00:00Z" : null, hasSkipManager: true, skipManagerLinkCancelled: over.cancelled ?? false },
    member: { withdrawnAt: over.withdrawn ? "2026-11-19T00:00:00Z" : null, raterUnlockedAt: null, skipWaivedAt: null, releasedAt: null },
    parts: {
      member: over.member === undefined ? sent : over.member,
      clientManager: over.cm === undefined ? { ...sent, linkCancelled: false } : over.cm && { ...over.cm, linkCancelled: false },
      skipManager: over.skip === undefined ? open : over.skip,
    },
  };
}

const link = { tokenMatches: true };

describe("skipListStage", () => {
  it("is with the member until they send, then with the client manager, then ready, then reviewed", () => {
    expect(skipListStage(facts({ member: open, cm: open }))).toBe("with_member");
    expect(skipListStage(facts({ cm: open }))).toBe("with_client_manager");
    expect(skipListStage(facts())).toBe("ready");
    expect(skipListStage(facts({ skip: sent }))).toBe("reviewed");
  });

  it("is ready once the client manager's part is in, even when the member's was reopened", () => {
    expect(skipListStage(facts({ member: { status: "open", reopened: true } }))).toBe("ready");
  });

  it("is with the client manager again while their part is reopened", () => {
    expect(skipListStage(facts({ cm: { status: "open", reopened: true } }))).toBe("with_client_manager");
  });
});

describe("canSkipManagerWrite", () => {
  it("lets the skip-manager write on a member whose client manager has sent their part", () => {
    expect(canSkipManagerWrite(facts(), link)).toEqual({ ok: true });
  });

  it("refuses a wrong token before anything else, so a guessed link learns nothing", () => {
    expect(canSkipManagerWrite(facts({ skip: sent, closed: true }), { tokenMatches: false })).toEqual({ ok: false, reason: "no_match" });
  });

  it("refuses a cancelled link and a closed cycle", () => {
    expect(canSkipManagerWrite(facts({ cancelled: true }), link)).toEqual({ ok: false, reason: "cancelled" });
    expect(canSkipManagerWrite(facts({ closed: true }), link)).toEqual({ ok: false, reason: "cycle_closed" });
  });

  it("refuses a withdrawn member and one whose client manager has not sent their part", () => {
    expect(canSkipManagerWrite(facts({ withdrawn: true }), link)).toEqual({ ok: false, reason: "member_withdrawn" });
    expect(canSkipManagerWrite(facts({ cm: open }), link)).toEqual({ ok: false, reason: "waiting_on_client_manager" });
  });

  it("refuses once the member is marked Reviewed: marking sends the notes as they are", () => {
    expect(canSkipManagerWrite(facts({ skip: sent }), link)).toEqual({ ok: false, reason: "already_reviewed" });
  });

  it("refuses a member with no skip-manager part to write to", () => {
    expect(canSkipManagerWrite(facts({ skip: null }), link)).toEqual({ ok: false, reason: "no_part" });
  });
});
