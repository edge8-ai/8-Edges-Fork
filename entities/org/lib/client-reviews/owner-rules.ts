import { canReleaseMember, isPartSubmitted, type Answer, type ClientReviewFacts, type ReviewVisibility } from "./rules";

// What the person running a client review may do to one member's review from
// the cycle overview (CR.2.4) and the member's own page (CR.3.3), as rules
// over the same facts the rest of the rules module reads. The pages offer
// exactly the actions these allow and the commands refuse the rest, so the
// two never disagree (the CR.2 code review found the page working the
// conditions out itself). Pure, like ./rules: no reads, no clock.
//
// It also says what the owner's screens show of one's own review (A.97): a
// review admin who is a member of the cycle is a viewer these rules know, so
// the overview, the spreadsheet, the member page and the commands all
// withhold and refuse one list instead of each re-deriving it.

const YES = { ok: true } as const;
const no = <Reason extends string>(reason: Reason): { ok: false; reason: Reason } => ({ ok: false, reason });

// ---------------------------------------------------------------------------
// One's own review, on the owner's screens
// ---------------------------------------------------------------------------

/**
 * The person asking on the owner's screens and commands, as far as their own
 * review goes: every team-member row of their person (./access,
 * teamMemberIdsOf). One person can hold more than one engagement, and each row
 * is them, so a second engagement is still their own review.
 */
export type ViewerSelf = Readonly<{ ownTeamMemberIds: readonly string[] }>;

/** Whether one member's review is the viewer's own. */
export function isOwnReview(teamMemberId: string, self: ViewerSelf): boolean {
  return self.ownTeamMemberIds.includes(teamMemberId);
}

/**
 * Whether the viewer is reviewed in a cycle, from the members still in it (a
 * withdrawn member is not). The skip-manager's one link reaches every member,
 * so someone reviewed in the cycle neither sees it nor looks after it: it
 * would open the client manager's part of their own review before release.
 */
export function isReviewedInCycle(stillInTeamMemberIds: readonly string[], self: ViewerSelf): boolean {
  return stillInTeamMemberIds.some((id) => isOwnReview(id, self));
}

/**
 * The viewer the owner's screens are asked about for one member's row, as
 * one of the rules module's viewers (./rules, ReviewViewer). Only a review
 * admin reaches those screens, and a review admin who is the member is named
 * the member, in the order ReviewViewer gives and ./team-view-rules,
 * teamViewer, keeps on the team side.
 */
export type OwnerScreenViewer = { kind: "member" | "review_admin" };

export function ownerScreenViewer(teamMemberId: string, self: ViewerSelf): OwnerScreenViewer {
  return isOwnReview(teamMemberId, self) ? { kind: "member" } : { kind: "review_admin" };
}

/** Where the owner reads a cycle: a page in the app, or the spreadsheet that leaves it. */
export type OwnerSurface = "screen" | "file";

/** What the owner's screens show of one member's review: the sections of ./rules, whatViewerSees, and the owner's own tools beside them. */
export type OwnerReviewView = ReviewVisibility &
  Readonly<{
    /** The review is the viewer's own: they are a review admin who is reviewed in the cycle. */
    own: boolean;
    /** The client manager's personal link, which would let its holder fill the part that rates the member. */
    clientManagerLink: boolean;
    /** When each part was sent. */
    sentDates: boolean;
    /** The owner's actions on the member; the commands refuse them too (canOwnerActOn). */
    actions: boolean;
    /** The owner's page for this one member, with both parts, the notes and the release. */
    memberPage: boolean;
  }>;

// A review admin sees every section of every review (./rules, whatViewerSees)
// and every tool the owner has.
const THE_OWNERS_VIEW: OwnerReviewView = {
  memberPart: true,
  clientManagerPart: true,
  selfAverage: true,
  clientManagerAverage: true,
  hrSummary: true,
  skipManagerComments: true,
  own: false,
  clientManagerLink: true,
  sentDates: true,
  actions: true,
  memberPage: true,
};

// A review admin's own row. Their review reaches them on the team side, as
// the visibility table allows the member, and nothing of it reaches them
// through the permission to run reviews: not the client manager's answers or
// average, not the link that rates them, not the HR summary, not the dates,
// and no action and no per-member page. The row still says who they are, who
// their client manager is, the stage and when it was released.
const OWN_ROW: OwnerReviewView = {
  memberPart: false,
  clientManagerPart: false,
  selfAverage: false,
  clientManagerAverage: false,
  hrSummary: false,
  skipManagerComments: false,
  own: true,
  clientManagerLink: false,
  sentDates: false,
  actions: false,
  memberPage: false,
};

/**
 * What the owner's screens show one viewer of one member's review. Every
 * owner screen and the spreadsheet ask here for each row, and the commands
 * refuse on the same answer (canOwnerActOn), so no screen decides for itself
 * what a review admin who is the member may see.
 *
 * A review admin sees all of it. A review admin who is the member sees their
 * row bare (OWN_ROW), with one difference between a screen and a file. A
 * screen still shows them the mean of their own ratings once their part is
 * sent with every rating: they typed those ratings, so it tells them nothing
 * new, which is the visibility table's reason for showing the member their own
 * average. A file leaves the app and can be passed on, so the spreadsheet
 * carries nothing of their part at all, not even that mean.
 */
export function whatOwnerSees(viewer: OwnerScreenViewer, surface: OwnerSurface): OwnerReviewView {
  if (viewer.kind === "review_admin") return THE_OWNERS_VIEW;
  return surface === "screen" ? { ...OWN_ROW, selfAverage: true } : OWN_ROW;
}

// ---------------------------------------------------------------------------
// The owner's actions
// ---------------------------------------------------------------------------

/** The owner's actions on one member, from the cycle overview (CR.2.4) and the member's page (CR.3.3). */
export type OwnerAction =
  | "unlock"
  | "reopen_member"
  | "reopen_client_manager"
  | "change_client_manager"
  | "withdraw"
  | "edit_summary"
  | "waive_skip"
  | "release";

export type OwnerRefusal =
  | "own_review"
  | "cycle_closed"
  | "member_withdrawn"
  | "released"
  | "no_client_manager"
  | "already_unlocked"
  | "member_submitted"
  | "not_submitted"
  | "client_manager_submitted"
  | "no_skip_manager"
  | "already_waived"
  | "skip_manager_reviewed"
  | "client_manager_not_submitted"
  | "member_part_reopened"
  | "skip_manager_not_reviewed";

/**
 * The actions a closed cycle still allows. Closing stops the links, so nobody
 * outside can answer any more, but the company's own reading of what was sent
 * goes on: the summary, a waiver and the release (./rules, canReleaseMember).
 */
const AFTER_CLOSE: ReadonlySet<OwnerAction> = new Set<OwnerAction>(["edit_summary", "waive_skip", "release"]);

/** Whether an action is still open to the owner once the cycle has closed. */
export function allowedAfterClose(action: OwnerAction): boolean {
  return AFTER_CLOSE.has(action);
}

/**
 * Whether the owner may take one action on one member's review now. Nothing is
 * done to a withdrawn member, a closed cycle allows only the company's own
 * reading (AFTER_CLOSE), and a released review keeps its parts and its summary
 * as they were. Then:
 *
 * - unlock: only while the member has not sent theirs, the part exists, and
 *   it is not unlocked already (story 22);
 * - reopen: only a part that was sent (story 54);
 * - a change of client manager: never once theirs is sent, because a sent
 *   part is not handed to someone else; it is reopened first (story 21);
 * - withdraw: any member still in an open cycle whose review is not released;
 * - the HR summary: until release, after which the member reads it as it was
 *   released (story 50, the CR.3.1 prototype as approved);
 * - waiving the skip-manager's mark: only while the cycle has a skip-manager
 *   and the mark is neither given nor waived (story 52);
 * - release: exactly when the rules module's canReleaseMember says yes.
 *
 * Whether the person acting is the member is not a fact here, because it is
 * not a fact about the review: the commands ask `canOwnerActOn` first, before
 * anything is read.
 */
export function canOwnerDo(facts: ClientReviewFacts, action: OwnerAction): Answer<OwnerRefusal> {
  if (facts.cycle.closedAt !== null && !AFTER_CLOSE.has(action)) return no("cycle_closed");
  if (facts.member.withdrawnAt !== null) return no("member_withdrawn");
  const { member, clientManager, skipManager } = facts.parts;
  switch (action) {
    case "unlock":
      if (clientManager === null) return no("no_client_manager");
      if (facts.member.raterUnlockedAt !== null) return no("already_unlocked");
      return isPartSubmitted(member) ? no("member_submitted") : YES;
    case "reopen_member":
    case "reopen_client_manager":
      if (facts.member.releasedAt !== null) return no("released");
      return isPartSubmitted(action === "reopen_member" ? member : clientManager) ? YES : no("not_submitted");
    case "change_client_manager":
      return isPartSubmitted(clientManager) ? no("client_manager_submitted") : YES;
    case "withdraw":
      return facts.member.releasedAt !== null ? no("released") : YES;
    case "edit_summary":
      return facts.member.releasedAt !== null ? no("released") : YES;
    case "waive_skip":
      if (facts.member.releasedAt !== null) return no("released");
      if (!facts.cycle.hasSkipManager) return no("no_skip_manager");
      if (facts.member.skipWaivedAt !== null) return no("already_waived");
      return isPartSubmitted(skipManager) ? no("skip_manager_reviewed") : YES;
    case "release": {
      const may = canReleaseMember(facts);
      if (may.ok) return YES;
      return no(may.reason === "already_released" ? "released" : may.reason);
    }
  }
}

const OWNER_ACTIONS: readonly OwnerAction[] = [
  "unlock",
  "reopen_member",
  "reopen_client_manager",
  "change_client_manager",
  "withdraw",
  "edit_summary",
  "waive_skip",
  "release",
];

/**
 * Whether the person acting may act on this member's review at all. Nobody
 * acts on their own review, a colleague does (whatOwnerSees). Every
 * command asks this before it reads anything, so the refusal waits on no read
 * and says nothing about the review.
 */
export function canOwnerActOn(teamMemberId: string, self: ViewerSelf): Answer<Extract<OwnerRefusal, "own_review">> {
  return isOwnReview(teamMemberId, self) ? no("own_review") : YES;
}

/**
 * Every owner action and whether it may be taken now, for the pages to offer
 * exactly those. `sees` is what the owner's screens show this viewer of the
 * row (whatOwnerSees): on their own review it allows no action, so
 * the page offers none, and the commands refuse them all (canOwnerActOn).
 */
export function ownerActionsOn(facts: ClientReviewFacts, sees: Pick<OwnerReviewView, "actions"> = { actions: true }): Readonly<Record<OwnerAction, boolean>> {
  return Object.fromEntries(OWNER_ACTIONS.map((a) => [a, sees.actions && canOwnerDo(facts, a).ok])) as Record<OwnerAction, boolean>;
}
