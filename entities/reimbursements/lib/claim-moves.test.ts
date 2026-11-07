import { describe, expect, it } from "vitest";
import { CLAIM_STATUSES, CLAIM_STATUS_TONE, type ClaimStatus } from "./claim-rules";
import { OWN_CLAIM, movesFor, noticeTone, ownClaimRefusal, waitsOn, type ClaimViewer } from "./claim-moves";

// What may happen to a claim now (A.34): one answer for the decider's page,
// the admin page's links and the server's refusals. Every status is walked for
// every kind of viewer, own claim and not, because a wrong answer here is a
// button that should not be there or a decision on your own money.

const OWNER = "p-owner";
const OTHER = "p-other";
const claim = (status: ClaimStatus, personId = OWNER) => ({ status, personId });
const viewer = (over: Partial<ClaimViewer> = {}): ClaimViewer => ({ personId: OTHER, mayDecideOwn: false, mayCheck: false, mayApprove: false, ...over });

describe("waitsOn", () => {
  it("a claim waits on the checker only while submitted, and on the approver only while checked", () => {
    for (const s of CLAIM_STATUSES) {
      expect(waitsOn(s, "checker")).toBe(s === "submitted");
      expect(waitsOn(s, "approver")).toBe(s === "checked");
    }
  });
});

describe("ownClaimRefusal", () => {
  it("lets a decider decide someone else's claim", () => {
    expect(ownClaimRefusal(claim("submitted"), { kind: "checker", personId: OTHER, mayDecideOwn: false })).toBeNull();
    expect(ownClaimRefusal(claim("checked"), { kind: "approver", personId: OTHER, mayDecideOwn: false })).toBeNull();
  });

  it("refuses a checker or an approver their own claim", () => {
    expect(ownClaimRefusal(claim("submitted"), { kind: "checker", personId: OWNER, mayDecideOwn: false })).toBe(OWN_CLAIM);
    expect(ownClaimRefusal(claim("checked"), { kind: "approver", personId: OWNER, mayDecideOwn: false })).toBe(OWN_CLAIM);
  });

  it("lets the Employer decide their own claim (design §1.6)", () => {
    expect(ownClaimRefusal(claim("submitted"), { kind: "checker", personId: OWNER, mayDecideOwn: true })).toBeNull();
  });

  it("keeps the owner's moves to the owner", () => {
    expect(ownClaimRefusal(claim("draft"), { kind: "owner", personId: OWNER, mayDecideOwn: false })).toBeNull();
    expect(ownClaimRefusal(claim("draft"), { kind: "owner", personId: OTHER, mayDecideOwn: false })).toBe("Claim not found.");
    expect(ownClaimRefusal(claim("draft"), { kind: "owner", personId: null, mayDecideOwn: false })).toBe("Claim not found.");
  });

  it("asks nothing of the payer or the cron: paying and entering a run decide nothing", () => {
    expect(ownClaimRefusal(claim("in_run"), { kind: "payer", personId: OWNER, mayDecideOwn: false })).toBeNull();
    expect(ownClaimRefusal(claim("approved"), { kind: "cron", personId: null, mayDecideOwn: false })).toBeNull();
  });
});

describe("movesFor", () => {
  it("offers a checker the check only while the claim is submitted", () => {
    for (const s of CLAIM_STATUSES) {
      const m = movesFor(claim(s), viewer({ mayCheck: true }));
      expect(m.check).toBe(s === "submitted");
      expect(m.approve).toBe(false);
    }
  });

  it("offers an approver the approval only while the claim is checked", () => {
    for (const s of CLAIM_STATUSES) {
      const m = movesFor(claim(s), viewer({ mayApprove: true }));
      expect(m.approve).toBe(s === "checked");
      expect(m.check).toBe(false);
    }
  });

  it("never offers a decision on the viewer's own claim, and says why", () => {
    for (const s of CLAIM_STATUSES) {
      const m = movesFor(claim(s), viewer({ personId: OWNER, mayCheck: true, mayApprove: true }));
      expect(m.check).toBe(false);
      expect(m.approve).toBe(false);
      // The note shows only where a decision would otherwise wait on them.
      expect(m.blockedAsOwn).toBe(s === "submitted" || s === "checked");
    }
  });

  it("offers the Employer their own claim's decisions", () => {
    expect(movesFor(claim("submitted"), viewer({ personId: OWNER, mayDecideOwn: true, mayCheck: true })).check).toBe(true);
    expect(movesFor(claim("checked"), viewer({ personId: OWNER, mayDecideOwn: true, mayApprove: true })).approve).toBe(true);
  });

  it("offers nothing to decide to a viewer with no person record, though the claim waits on their kind", () => {
    const m = movesFor(claim("submitted"), viewer({ personId: null, mayCheck: true }));
    expect(m.check).toBe(false);
    expect(m.waitsOnViewer).toBe(true);
    expect(m.blockedAsOwn).toBe(false);
  });

  it("offers nothing to a viewer who holds neither permission", () => {
    for (const s of CLAIM_STATUSES) {
      expect(movesFor(claim(s), viewer())).toEqual({ check: false, approve: false, reread: false, waitsOnViewer: false, blockedAsOwn: false });
    }
  });

  // A re-read decides nothing (RB.9), so a checker may ask for one on any
  // claim, their own included; the database still freezes a checked claim's
  // money columns, and the re-read writes none of them.
  it("offers a re-read to any checker on any claim", () => {
    for (const s of CLAIM_STATUSES) {
      expect(movesFor(claim(s), viewer({ mayCheck: true })).reread).toBe(true);
      expect(movesFor(claim(s), viewer({ personId: OWNER, mayCheck: true })).reread).toBe(true);
      expect(movesFor(claim(s), viewer({ mayApprove: true })).reread).toBe(false);
    }
  });
});

describe("noticeTone", () => {
  it("is the status badge's tone, so the banner and the badge never disagree", () => {
    for (const s of CLAIM_STATUSES) {
      const tone = CLAIM_STATUS_TONE[s];
      expect(noticeTone(s)).toBe(tone === "neutral" ? "info" : tone);
    }
    // The reported mismatch: a sent-back claim's banner read "info" while its badge read "warn".
    expect(noticeTone("sent_back")).toBe("warn");
  });
});
