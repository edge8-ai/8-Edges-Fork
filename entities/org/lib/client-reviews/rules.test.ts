import { describe, expect, it } from "vitest";
import {
  averageOfRatings,
  canClientManagerFillPart,
  canReleaseMember,
  canSkipManagerOpenMember,
  canStillEditPart,
  isClientManagerLinkValid,
  isPartSubmitted,
  isSkipManagerLinkValid,
  memberStage,
  whatViewerSees,
  type ClientManagerPartFacts,
  type ClientReviewFacts,
  type ClientReviewStage,
  type CycleFacts,
  type CycleMemberFacts,
  type LinkRefusal,
  type PresentedLink,
  type ReleaseRefusal,
  type ReviewPartFacts,
  type ReviewPartName,
  type ReviewPartStatus,
  type ReviewParts,
  type ReviewViewer,
  type ReviewVisibility,
} from "./rules";

// CR.1.2. Every rule of a client review is decided once, in rules.ts, from
// plain facts. These tests state each rule the way a person would say it, and
// reach it only through the questions the module exports.

const WHEN = "2026-11-12T03:00:00Z";

type Over = { cycle?: Partial<CycleFacts>; member?: Partial<CycleMemberFacts>; parts?: Partial<ReviewParts> };

const part = (status: ReviewPartStatus): ReviewPartFacts => ({ status });
const managerPart = (status: ReviewPartStatus, linkCancelled = false): ClientManagerPartFacts => ({ status, linkCancelled });

/** An open cycle with a skip-manager, one member, and nothing filled in yet. */
const review = (over: Over = {}): ClientReviewFacts => ({
  cycle: { closedAt: null, hasSkipManager: true, skipManagerLinkCancelled: false, ...over.cycle },
  member: { withdrawnAt: null, raterUnlockedAt: null, skipWaivedAt: null, releasedAt: null, ...over.member },
  parts: { member: part("open"), clientManager: managerPart("open"), skipManager: null, ...over.parts },
});

const MEMBER_SUBMITTED: Partial<ReviewParts> = { member: part("submitted") };
const BOTH_SUBMITTED: Partial<ReviewParts> = { member: part("submitted"), clientManager: managerPart("submitted") };
const ALL_SUBMITTED: Partial<ReviewParts> = { ...BOTH_SUBMITTED, skipManager: part("submitted") };

const WITHDRAWN = { withdrawnAt: WHEN };
const RELEASED = { releasedAt: WHEN };
const UNLOCKED = { raterUnlockedAt: WHEN };
const WAIVED = { skipWaivedAt: WHEN };
const CLOSED = { closedAt: WHEN };
const NO_SKIP_MANAGER = { hasSkipManager: false };

const RIGHT_LINK: PresentedLink = { tokenMatches: true };
const WRONG_LINK: PresentedLink = { tokenMatches: false };
const YES = { ok: true };
const no = (reason: string) => ({ ok: false, reason });

describe("a part counts as submitted only once its writer has let go of it", () => {
  const cases: Array<[string, ReviewPartFacts | null | undefined, boolean]> = [
    ["an open part is not submitted", part("open"), false],
    ["a draft is not submitted", part("draft"), false],
    ["a submitted part is submitted", part("submitted"), true],
    ["a finalized part is submitted, because the shared table allows that status", part("finalized"), true],
    ["an acknowledged part is submitted, for the same reason", part("acknowledged"), true],
    ["a part that does not exist is not submitted", null, false],
    ["a part nobody passed is not submitted", undefined, false],
  ];
  it.each(cases)("%s", (_label, facts, expected) => {
    expect(isPartSubmitted(facts)).toBe(expected);
  });
});

describe("a member's stage says what the review is waiting on", () => {
  const cases: Array<[string, Over, ClientReviewStage]> = [
    ["nothing is filled in: waiting on the member", {}, "waiting_on_member"],
    ["the member is still drafting: waiting on the member", { parts: { member: part("draft") } }, "waiting_on_member"],
    ["the member's row does not exist yet: waiting on the member", { parts: { member: null } }, "waiting_on_member"],
    ["the member submitted: waiting on the client manager", { parts: MEMBER_SUBMITTED }, "waiting_on_client_manager"],
    [
      "the client manager is drafting: still waiting on the client manager",
      { parts: { ...MEMBER_SUBMITTED, clientManager: managerPart("draft") } },
      "waiting_on_client_manager",
    ],
    [
      "the client manager's row does not exist yet: still waiting on the client manager",
      { parts: { ...MEMBER_SUBMITTED, clientManager: null } },
      "waiting_on_client_manager",
    ],
    ["both submitted: waiting on the skip-manager", { parts: BOTH_SUBMITTED }, "waiting_on_skip_manager"],
    [
      "the skip-manager commented but has not pressed Reviewed: still waiting on the skip-manager",
      { parts: { ...BOTH_SUBMITTED, skipManager: part("draft") } },
      "waiting_on_skip_manager",
    ],
    ["the skip-manager pressed Reviewed: ready to release", { parts: ALL_SUBMITTED }, "ready_to_release"],
    [
      "a cycle with no skip-manager goes from the client manager's submit straight to ready to release",
      { cycle: NO_SKIP_MANAGER, parts: BOTH_SUBMITTED },
      "ready_to_release",
    ],
    [
      "a waived skip mark goes from the client manager's submit straight to ready to release",
      { member: WAIVED, parts: BOTH_SUBMITTED },
      "ready_to_release",
    ],
    ["a waiver does not stand in for the client manager", { member: WAIVED, parts: MEMBER_SUBMITTED }, "waiting_on_client_manager"],
    [
      "a cancelled skip-manager link is not a waiver: still waiting on the skip-manager",
      { cycle: { skipManagerLinkCancelled: true }, parts: BOTH_SUBMITTED },
      "waiting_on_skip_manager",
    ],
    ["released: released", { member: RELEASED, parts: ALL_SUBMITTED }, "released"],
    [
      "released on a waiver, the skip-manager never having marked it: released",
      { member: { ...WAIVED, ...RELEASED }, parts: BOTH_SUBMITTED },
      "released",
    ],
    [
      "closing the cycle does not change a stage, because closing only stops the links",
      { cycle: CLOSED, parts: MEMBER_SUBMITTED },
      "waiting_on_client_manager",
    ],
    ["withdrawn with nothing filled in: withdrawn", { member: WITHDRAWN }, "withdrawn"],
    ["withdrawn with every part submitted: withdrawn", { member: WITHDRAWN, parts: ALL_SUBMITTED }, "withdrawn"],
    ["withdrawn after release: withdrawn wins over released", { member: { ...RELEASED, ...WITHDRAWN }, parts: ALL_SUBMITTED }, "withdrawn"],
  ];
  it.each(cases)("%s", (_label, over, expected) => {
    expect(memberStage(review(over))).toBe(expected);
  });

  it("an unlocked member who has not submitted is still waiting on the member while the client manager has not submitted either", () => {
    expect(memberStage(review({ member: UNLOCKED }))).toBe("waiting_on_member");
  });

  it("a client manager who submitted through an unlock moves the review on, though the member never submitted", () => {
    const parts = { clientManager: managerPart("submitted") };
    expect(memberStage(review({ member: UNLOCKED, parts }))).toBe("waiting_on_skip_manager");
    expect(memberStage(review({ member: UNLOCKED, parts, cycle: NO_SKIP_MANAGER }))).toBe("ready_to_release");
  });
});

describe("a client manager's link works only while it is theirs, live, and in an open cycle", () => {
  it("a matching link in an open cycle is valid, whether or not the member has submitted", () => {
    expect(isClientManagerLinkValid(review(), RIGHT_LINK)).toEqual(YES);
    expect(isClientManagerLinkValid(review({ parts: BOTH_SUBMITTED }), RIGHT_LINK)).toEqual(YES);
  });

  it("a link stays valid after release, until the cycle closes", () => {
    expect(isClientManagerLinkValid(review({ member: RELEASED, parts: ALL_SUBMITTED }), RIGHT_LINK)).toEqual(YES);
  });

  const refusals: Array<[string, Over, PresentedLink, LinkRefusal]> = [
    ["a token that does not match is refused as no match", {}, WRONG_LINK, "no_match"],
    ["a cancelled link is refused as cancelled", { parts: { clientManager: managerPart("open", true) } }, RIGHT_LINK, "cancelled"],
    ["a link into a closed cycle is refused as closed", { cycle: CLOSED }, RIGHT_LINK, "cycle_closed"],
    ["a link to a withdrawn member is refused as withdrawn", { member: WITHDRAWN }, RIGHT_LINK, "member_withdrawn"],
    ["a link to a part that does not exist matches nothing", { parts: { clientManager: null } }, RIGHT_LINK, "no_match"],
    [
      "a wrong token learns nothing more, even when the link was cancelled, the cycle closed and the member withdrawn",
      { cycle: CLOSED, member: WITHDRAWN, parts: { clientManager: managerPart("open", true) } },
      WRONG_LINK,
      "no_match",
    ],
    [
      "a cancelled link in a closed cycle is told it was cancelled, the fact about the link itself",
      { cycle: CLOSED, parts: { clientManager: managerPart("open", true) } },
      RIGHT_LINK,
      "cancelled",
    ],
    ["a closed cycle is said before a withdrawal", { cycle: CLOSED, member: WITHDRAWN }, RIGHT_LINK, "cycle_closed"],
  ];
  it.each(refusals)("%s", (_label, over, link, reason) => {
    expect(isClientManagerLinkValid(review(over), link)).toEqual(no(reason));
  });
});

describe("the skip-manager's one link works for the whole cycle while it is live and the cycle is open", () => {
  it("a matching link in an open cycle is valid", () => {
    expect(isSkipManagerLinkValid(review().cycle, RIGHT_LINK)).toEqual(YES);
  });

  const refusals: Array<[string, Partial<CycleFacts>, PresentedLink, LinkRefusal]> = [
    ["a token that does not match is refused as no match", {}, WRONG_LINK, "no_match"],
    ["a cancelled link is refused as cancelled", { skipManagerLinkCancelled: true }, RIGHT_LINK, "cancelled"],
    ["a link into a closed cycle is refused as closed", CLOSED, RIGHT_LINK, "cycle_closed"],
    ["a cycle with no skip-manager has no such link to match", NO_SKIP_MANAGER, RIGHT_LINK, "no_match"],
    ["a wrong token learns nothing more", { ...CLOSED, skipManagerLinkCancelled: true }, WRONG_LINK, "no_match"],
    ["a cancelled link in a closed cycle is told it was cancelled", { ...CLOSED, skipManagerLinkCancelled: true }, RIGHT_LINK, "cancelled"],
  ];
  it.each(refusals)("%s", (_label, cycle, link, reason) => {
    expect(isSkipManagerLinkValid(review({ cycle }).cycle, link)).toEqual(no(reason));
  });
});

describe("a client manager fills their part after the member, once, through a valid link", () => {
  it("a client manager cannot open their part before the member submits", () => {
    expect(canClientManagerFillPart(review(), RIGHT_LINK)).toEqual(no("not_yet"));
    expect(canClientManagerFillPart(review({ parts: { member: part("draft") } }), RIGHT_LINK)).toEqual(no("not_yet"));
    expect(canClientManagerFillPart(review({ parts: { member: null } }), RIGHT_LINK)).toEqual(no("not_yet"));
  });

  it("a client manager can fill their part once the member has submitted", () => {
    expect(canClientManagerFillPart(review({ parts: MEMBER_SUBMITTED }), RIGHT_LINK)).toEqual(YES);
    expect(canClientManagerFillPart(review({ parts: { ...MEMBER_SUBMITTED, clientManager: managerPart("draft") } }), RIGHT_LINK)).toEqual(YES);
  });

  it("a client manager can fill an unlocked part though the member never submitted", () => {
    expect(canClientManagerFillPart(review({ member: UNLOCKED }), RIGHT_LINK)).toEqual(YES);
  });

  it("a client manager who has submitted cannot fill their part again: it is read-only", () => {
    expect(canClientManagerFillPart(review({ parts: BOTH_SUBMITTED }), RIGHT_LINK)).toEqual(no("already_submitted"));
    expect(canClientManagerFillPart(review({ member: UNLOCKED, parts: { clientManager: managerPart("submitted") } }), RIGHT_LINK)).toEqual(
      no("already_submitted"),
    );
  });

  it("a member whose part was reopened holds the client manager back until they submit again", () => {
    expect(canClientManagerFillPart(review({ parts: { member: part("open") } }), RIGHT_LINK)).toEqual(no("not_yet"));
  });

  const linkRefusals: Array<[string, Over, PresentedLink, LinkRefusal]> = [
    ["a wrong token", { parts: MEMBER_SUBMITTED }, WRONG_LINK, "no_match"],
    ["a cancelled link", { parts: { ...MEMBER_SUBMITTED, clientManager: managerPart("open", true) } }, RIGHT_LINK, "cancelled"],
    ["a closed cycle", { cycle: CLOSED, parts: MEMBER_SUBMITTED }, RIGHT_LINK, "cycle_closed"],
    ["a withdrawn member", { member: WITHDRAWN, parts: MEMBER_SUBMITTED }, RIGHT_LINK, "member_withdrawn"],
    ["a closed cycle, even for a part already submitted", { cycle: CLOSED, parts: BOTH_SUBMITTED }, RIGHT_LINK, "cycle_closed"],
    ["a wrong token, even when the member has not submitted", {}, WRONG_LINK, "no_match"],
  ];
  it.each(linkRefusals)("the link's own reason is given first: %s", (_label, over, link, reason) => {
    expect(canClientManagerFillPart(review(over), link)).toEqual(no(reason));
  });
});

describe("a part locks when it is submitted, and every part locks when the cycle closes", () => {
  const everyPart: Array<[string, ReviewPartName]> = [
    ["the member's", "member"],
    ["the client manager's", "clientManager"],
    ["the skip-manager's", "skipManager"],
  ];
  const withStatus = (name: ReviewPartName, status: ReviewPartStatus): Partial<ReviewParts> => {
    if (name === "member") return { member: part(status) };
    if (name === "clientManager") return { clientManager: managerPart(status) };
    return { skipManager: part(status) };
  };

  it.each(everyPart)("%s part can be edited while it is open or a draft", (_label, name) => {
    expect(canStillEditPart(review({ parts: withStatus(name, "open") }), name)).toBe(true);
    expect(canStillEditPart(review({ parts: withStatus(name, "draft") }), name)).toBe(true);
  });

  it.each(everyPart)("%s part can never be edited after it is submitted", (_label, name) => {
    expect(canStillEditPart(review({ parts: withStatus(name, "submitted") }), name)).toBe(false);
    expect(canStillEditPart(review({ parts: withStatus(name, "finalized") }), name)).toBe(false);
    expect(canStillEditPart(review({ parts: withStatus(name, "acknowledged") }), name)).toBe(false);
  });

  it.each(everyPart)("%s part cannot be edited once the cycle is closed, submitted or not", (_label, name) => {
    expect(canStillEditPart(review({ cycle: CLOSED, parts: withStatus(name, "open") }), name)).toBe(false);
    expect(canStillEditPart(review({ cycle: CLOSED, parts: withStatus(name, "draft") }), name)).toBe(false);
  });

  it.each(everyPart)("%s part cannot be edited once the member is withdrawn", (_label, name) => {
    expect(canStillEditPart(review({ member: WITHDRAWN, parts: withStatus(name, "open") }), name)).toBe(false);
  });

  it("a part nobody has started can still be written while the cycle is open", () => {
    expect(canStillEditPart(review({ parts: { skipManager: null } }), "skipManager")).toBe(true);
    expect(canStillEditPart(review({ cycle: CLOSED, parts: { skipManager: null } }), "skipManager")).toBe(false);
  });

  it("one submitted part does not lock another", () => {
    expect(canStillEditPart(review({ parts: MEMBER_SUBMITTED }), "clientManager")).toBe(true);
    expect(canStillEditPart(review({ parts: BOTH_SUBMITTED }), "skipManager")).toBe(true);
  });
});

describe("the skip-manager opens a member only once the client manager has submitted", () => {
  it("a member whose client manager has not submitted is listed as waiting", () => {
    expect(canSkipManagerOpenMember(review(), RIGHT_LINK)).toEqual(no("waiting_on_client_manager"));
    expect(canSkipManagerOpenMember(review({ parts: MEMBER_SUBMITTED }), RIGHT_LINK)).toEqual(no("waiting_on_client_manager"));
  });

  it("a member whose client manager has submitted can be opened", () => {
    expect(canSkipManagerOpenMember(review({ parts: BOTH_SUBMITTED }), RIGHT_LINK)).toEqual(YES);
  });

  it("a member can be opened again after Reviewed and after release, while the cycle is open", () => {
    expect(canSkipManagerOpenMember(review({ parts: ALL_SUBMITTED }), RIGHT_LINK)).toEqual(YES);
    expect(canSkipManagerOpenMember(review({ member: RELEASED, parts: ALL_SUBMITTED }), RIGHT_LINK)).toEqual(YES);
  });

  it("a withdrawn member is not listed at all", () => {
    expect(canSkipManagerOpenMember(review({ member: WITHDRAWN, parts: BOTH_SUBMITTED }), RIGHT_LINK)).toEqual(no("member_withdrawn"));
  });

  const linkRefusals: Array<[string, Over, PresentedLink, LinkRefusal]> = [
    ["a wrong token", { parts: BOTH_SUBMITTED }, WRONG_LINK, "no_match"],
    ["a cancelled link", { cycle: { skipManagerLinkCancelled: true }, parts: BOTH_SUBMITTED }, RIGHT_LINK, "cancelled"],
    ["a closed cycle", { cycle: CLOSED, parts: BOTH_SUBMITTED }, RIGHT_LINK, "cycle_closed"],
    ["a cycle with no skip-manager", { cycle: NO_SKIP_MANAGER, parts: BOTH_SUBMITTED }, RIGHT_LINK, "no_match"],
    ["a wrong token, even for a withdrawn member", { member: WITHDRAWN }, WRONG_LINK, "no_match"],
  ];
  it.each(linkRefusals)("the link's own reason is given first: %s", (_label, over, link, reason) => {
    expect(canSkipManagerOpenMember(review(over), link)).toEqual(no(reason));
  });
});

describe("a member is released once the client's side is done, and only once", () => {
  const allowed: Array<[string, Over]> = [
    ["the client manager submitted and the skip-manager marked them Reviewed", { parts: ALL_SUBMITTED }],
    ["the client manager submitted and the cycle has no skip-manager", { cycle: NO_SKIP_MANAGER, parts: BOTH_SUBMITTED }],
    ["the client manager submitted and the skip-manager's mark was waived", { member: WAIVED, parts: BOTH_SUBMITTED }],
    ["the cycle is already closed, because closing only stops the links", { cycle: CLOSED, parts: ALL_SUBMITTED }],
    [
      "the member never submitted but the client manager did, through an unlock",
      { member: UNLOCKED, parts: { clientManager: managerPart("submitted"), skipManager: part("submitted") } },
    ],
  ];
  it.each(allowed)("a member can be released when %s", (_label, over) => {
    expect(canReleaseMember(review(over))).toEqual(YES);
  });

  const refused: Array<[string, Over, ReleaseRefusal]> = [
    ["the client manager has not submitted", { parts: MEMBER_SUBMITTED }, "client_manager_not_submitted"],
    ["nothing is filled in", {}, "client_manager_not_submitted"],
    ["the skip-manager has not marked them Reviewed", { parts: BOTH_SUBMITTED }, "skip_manager_not_reviewed"],
    [
      "the skip-manager has only commented",
      { parts: { ...BOTH_SUBMITTED, skipManager: part("draft") } },
      "skip_manager_not_reviewed",
    ],
    ["the mark was waived but the client manager has not submitted", { member: WAIVED, parts: MEMBER_SUBMITTED }, "client_manager_not_submitted"],
    [
      "the cycle has no skip-manager but the client manager has not submitted",
      { cycle: NO_SKIP_MANAGER, parts: MEMBER_SUBMITTED },
      "client_manager_not_submitted",
    ],
    ["they are withdrawn", { member: WITHDRAWN, parts: ALL_SUBMITTED }, "member_withdrawn"],
    ["they are already released", { member: RELEASED, parts: ALL_SUBMITTED }, "already_released"],
    ["they were released and then withdrawn", { member: { ...RELEASED, ...WITHDRAWN }, parts: ALL_SUBMITTED }, "member_withdrawn"],
  ];
  it.each(refused)("a member cannot be released when %s", (_label, over, reason) => {
    expect(canReleaseMember(review(over))).toEqual(no(reason));
  });

  it("the overview's Ready to release stage and the release command never disagree", () => {
    // Eight yes-or-no facts decide both answers, so all 256 combinations are
    // walked: one switch per binary digit of the counter.
    for (let combination = 0; combination < 256; combination += 1) {
      const on = (digit: number) => Math.floor(combination / 2 ** digit) % 2 === 1;
      const status = (digit: number): ReviewPartStatus => (on(digit) ? "submitted" : "open");
      const moment = (digit: number) => (on(digit) ? WHEN : null);
      const facts = review({
        cycle: { hasSkipManager: on(0), closedAt: moment(1) },
        member: { skipWaivedAt: moment(2), withdrawnAt: moment(3), releasedAt: moment(4) },
        parts: { member: part(status(5)), clientManager: managerPart(status(6)), skipManager: part(status(7)) },
      });
      expect(canReleaseMember(facts).ok, JSON.stringify(facts)).toBe(memberStage(facts) === "ready_to_release");
    }
  });
});

describe("what a viewer sees of one member's review", () => {
  const sees = (...sections: Array<keyof ReviewVisibility>): ReviewVisibility => ({
    memberPart: sections.includes("memberPart"),
    clientManagerPart: sections.includes("clientManagerPart"),
    selfAverage: sections.includes("selfAverage"),
    clientManagerAverage: sections.includes("clientManagerAverage"),
    hrSummary: sections.includes("hrSummary"),
    skipManagerComments: sections.includes("skipManagerComments"),
  });
  const NOTHING = sees();
  const EVERYTHING = sees("memberPart", "clientManagerPart", "selfAverage", "clientManagerAverage", "hrSummary", "skipManagerComments");
  const THE_RELEASED_REVIEW = sees("memberPart", "clientManagerPart", "selfAverage", "clientManagerAverage", "hrSummary");
  const BOTH_PARTS = sees("memberPart", "clientManagerPart");

  const MEMBER: ReviewViewer = { kind: "member" };
  const ADMIN: ReviewViewer = { kind: "review_admin" };
  const CLIENT_MANAGER: ReviewViewer = { kind: "client_manager_link", tokenMatches: true };
  const SKIP_MANAGER: ReviewViewer = { kind: "skip_manager_link", tokenMatches: true };
  const MANAGER_OF_RECORD: ReviewViewer = { kind: "manager_of_record" };
  const COACH: ReviewViewer = { kind: "coach" };
  const ANYONE_ELSE: ReviewViewer = { kind: "other" };
  const EVERY_VIEWER = [MEMBER, ADMIN, CLIENT_MANAGER, SKIP_MANAGER, MANAGER_OF_RECORD, COACH, ANYONE_ELSE];

  // Before release: both parts are in and the skip-manager is reading. After
  // release: every part is in and the owner has released it.
  const BEFORE: Over = { parts: BOTH_SUBMITTED };
  const AFTER: Over = { member: RELEASED, parts: ALL_SUBMITTED };

  describe("the visibility table, cell by cell", () => {
    const cells: Array<[string, ReviewViewer, Over, ReviewVisibility]> = [
      ["before release, the member sees their own part, and its average once they have submitted", MEMBER, BEFORE, sees("memberPart", "selfAverage")],
      ["after release, the member sees both parts, both averages and the HR summary", MEMBER, AFTER, THE_RELEASED_REVIEW],
      ["before release, a review admin sees everything, the skip-manager's comments included", ADMIN, BEFORE, EVERYTHING],
      ["after release, a review admin sees everything", ADMIN, AFTER, EVERYTHING],
      ["before release, the client manager sees the member's part and their own, by a valid link", CLIENT_MANAGER, BEFORE, BOTH_PARTS],
      ["after release, the client manager sees the same, while the cycle is open", CLIENT_MANAGER, AFTER, BOTH_PARTS],
      ["after the cycle closes, the client manager sees nothing", CLIENT_MANAGER, { ...AFTER, cycle: CLOSED }, NOTHING],
      [
        "before release, the skip-manager sees both parts and their own comments, by a valid link",
        SKIP_MANAGER,
        BEFORE,
        sees("memberPart", "clientManagerPart", "skipManagerComments"),
      ],
      [
        "after release, the skip-manager sees the same, while the cycle is open",
        SKIP_MANAGER,
        AFTER,
        sees("memberPart", "clientManagerPart", "skipManagerComments"),
      ],
      ["after the cycle closes, the skip-manager sees nothing", SKIP_MANAGER, { ...AFTER, cycle: CLOSED }, NOTHING],
      ["before release, the manager of record sees nothing", MANAGER_OF_RECORD, BEFORE, NOTHING],
      ["after release, the manager of record sees both parts, both averages and the HR summary", MANAGER_OF_RECORD, AFTER, THE_RELEASED_REVIEW],
      ["before release, the coach sees nothing", COACH, BEFORE, NOTHING],
      ["after release, the coach sees both parts, both averages and the HR summary", COACH, AFTER, THE_RELEASED_REVIEW],
      ["before release, anyone else sees nothing", ANYONE_ELSE, BEFORE, NOTHING],
      ["after release, anyone else sees nothing", ANYONE_ELSE, AFTER, NOTHING],
    ];
    it.each(cells)("%s", (_label, viewer, over, expected) => {
      expect(whatViewerSees(review(over), viewer)).toEqual(expected);
    });
  });

  it("before release, a member who has not submitted sees their own part and no average yet", () => {
    expect(whatViewerSees(review(), MEMBER)).toEqual(sees("memberPart"));
    expect(whatViewerSees(review({ parts: { member: part("draft") } }), MEMBER)).toEqual(sees("memberPart"));
  });

  it("before release, a member never sees the client manager's part, however far the review has got", () => {
    expect(whatViewerSees(review({ parts: ALL_SUBMITTED }), MEMBER)).toEqual(sees("memberPart", "selfAverage"));
    expect(whatViewerSees(review({ member: WAIVED, parts: BOTH_SUBMITTED }), MEMBER)).toEqual(sees("memberPart", "selfAverage"));
  });

  it("the people inside the company keep seeing a released review after the cycle closes", () => {
    const closed = review({ ...AFTER, cycle: CLOSED });
    expect(whatViewerSees(closed, MEMBER)).toEqual(THE_RELEASED_REVIEW);
    expect(whatViewerSees(closed, MANAGER_OF_RECORD)).toEqual(THE_RELEASED_REVIEW);
    expect(whatViewerSees(closed, COACH)).toEqual(THE_RELEASED_REVIEW);
    expect(whatViewerSees(closed, ADMIN)).toEqual(EVERYTHING);
  });

  it("closing the cycle does not show an unreleased review to the manager of record or the coach", () => {
    const closed = review({ ...BEFORE, cycle: CLOSED });
    expect(whatViewerSees(closed, MANAGER_OF_RECORD)).toEqual(NOTHING);
    expect(whatViewerSees(closed, COACH)).toEqual(NOTHING);
    expect(whatViewerSees(closed, MEMBER)).toEqual(sees("memberPart", "selfAverage"));
  });

  const eitherSideOfRelease: Array<[string, Over]> = [
    ["before release", BEFORE],
    ["after release", AFTER],
  ];
  it.each(eitherSideOfRelease)("%s, a withdrawn member's review is seen by review admins only", (_label, over) => {
    const withdrawn = review({ ...over, member: { ...over.member, ...WITHDRAWN } });
    for (const viewer of EVERY_VIEWER) {
      expect(whatViewerSees(withdrawn, viewer), viewer.kind).toEqual(viewer === ADMIN ? EVERYTHING : NOTHING);
    }
  });

  it("the skip-manager's comments reach review admins and the skip-manager's own valid link, and nobody else, ever", () => {
    const states: Over[] = [{}, { parts: MEMBER_SUBMITTED }, BEFORE, { parts: ALL_SUBMITTED }, AFTER, { ...AFTER, cycle: CLOSED }, { ...BEFORE, cycle: NO_SKIP_MANAGER }];
    for (const over of states) {
      for (const viewer of EVERY_VIEWER) {
        if (viewer === ADMIN || viewer === SKIP_MANAGER) continue;
        expect(whatViewerSees(review(over), viewer).skipManagerComments, `${viewer.kind} ${JSON.stringify(over)}`).toBe(false);
      }
    }
  });

  it("a link that does not match shows nothing", () => {
    expect(whatViewerSees(review(BEFORE), { kind: "client_manager_link", tokenMatches: false })).toEqual(NOTHING);
    expect(whatViewerSees(review(BEFORE), { kind: "skip_manager_link", tokenMatches: false })).toEqual(NOTHING);
  });

  it("a cancelled link shows nothing", () => {
    const cancelledManagerLink = review({ parts: { ...BOTH_SUBMITTED, clientManager: managerPart("submitted", true) } });
    expect(whatViewerSees(cancelledManagerLink, CLIENT_MANAGER)).toEqual(NOTHING);
    expect(whatViewerSees(review({ ...BEFORE, cycle: { skipManagerLinkCancelled: true } }), SKIP_MANAGER)).toEqual(NOTHING);
  });

  it("a closed cycle shows a link nothing, released or not", () => {
    expect(whatViewerSees(review({ ...BEFORE, cycle: CLOSED }), CLIENT_MANAGER)).toEqual(NOTHING);
    expect(whatViewerSees(review({ ...BEFORE, cycle: CLOSED }), SKIP_MANAGER)).toEqual(NOTHING);
  });

  it("the skip-manager sees nothing of a member until the client manager has submitted", () => {
    expect(whatViewerSees(review(), SKIP_MANAGER)).toEqual(NOTHING);
    expect(whatViewerSees(review({ parts: MEMBER_SUBMITTED }), SKIP_MANAGER)).toEqual(NOTHING);
  });

  it("the client manager never sees an average, the HR summary or the skip-manager's comments", () => {
    const states: Over[] = [{}, BEFORE, { parts: ALL_SUBMITTED }, AFTER];
    for (const over of states) {
      const seen = whatViewerSees(review(over), CLIENT_MANAGER);
      expect([seen.selfAverage, seen.clientManagerAverage, seen.hrSummary, seen.skipManagerComments]).toEqual([false, false, false, false]);
    }
  });
});

describe("an average is the mean of the framework's rating keys, or nothing at all", () => {
  const EIGHT = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];
  const eight = (...values: unknown[]): Record<string, unknown> => Object.fromEntries(EIGHT.map((key, i) => [key, values[i]]));

  it("is the mean of every rating when all eight are there", () => {
    expect(averageOfRatings(eight(4, 3, 3, 3, 4, 3, 3, 3), EIGHT)).toBe(3.25);
    expect(averageOfRatings(eight(4, 4, 4, 4, 4, 4, 4, 4), EIGHT)).toBe(4);
  });

  it("is rounded to two decimals", () => {
    // 23 / 8 = 2.875, and 11 / 3 = 3.666…
    expect(averageOfRatings(eight(3, 3, 3, 3, 3, 3, 3, 2), EIGHT)).toBe(2.88);
    expect(averageOfRatings({ a: 4, b: 4, c: 3 }, ["a", "b", "c"])).toBe(3.67);
  });

  it("does not exist while one rating is missing", () => {
    expect(averageOfRatings(eight(4, 3, 3, 3, 4, 3, 3), EIGHT)).toBeNull();
    expect(averageOfRatings(eight(4, 3, 3, null, 4, 3, 3, 3), EIGHT)).toBeNull();
    expect(averageOfRatings({}, EIGHT)).toBeNull();
    expect(averageOfRatings(null, EIGHT)).toBeNull();
    expect(averageOfRatings(undefined, EIGHT)).toBeNull();
  });

  const notNumbers: Array<[string, unknown]> = [
    ["a number written as text", "3"],
    ["not-a-number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["a yes or no", true],
    ["a list", [3]],
  ];
  it.each(notNumbers)("does not exist when a rating is %s", (_label, value) => {
    expect(averageOfRatings(eight(4, 3, 3, value, 4, 3, 3, 3), EIGHT)).toBeNull();
  });

  it("follows whichever key list the framework supplies", () => {
    const ratings = { focus: 2, craft: 4, care: 3, r1: 1 };
    expect(averageOfRatings(ratings, ["focus", "craft", "care"])).toBe(3);
    expect(averageOfRatings(ratings, ["focus", "craft"])).toBe(3);
    expect(averageOfRatings(ratings, ["care"])).toBe(3);
    expect(averageOfRatings(ratings, ["focus", "r1"])).toBe(1.5);
  });

  it("never counts a key that is not in the list", () => {
    expect(averageOfRatings({ ...eight(4, 4, 4, 4, 4, 4, 4, 4), bonus: 1 }, EIGHT)).toBe(4);
    expect(averageOfRatings({ ...eight(4, 4, 4, 4, 4, 4, 4, 4), comment: "steady", extra: null }, EIGHT)).toBe(4);
  });

  it("does not exist for a framework that names no rating keys", () => {
    expect(averageOfRatings({ r1: 4 }, [])).toBeNull();
  });
});
