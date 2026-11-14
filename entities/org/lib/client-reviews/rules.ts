// Client reviews (CR.1.2): every rule about who may see or do what in a client
// review, decided once from plain facts. The screens, the server actions and
// the submit endpoint are to ask this module (CR.2 and CR.3 wire them) and
// none may re-derive a rule, because
// a rule written twice is how a link page and a command come to disagree about
// who may read a review. The module is pure on purpose: it reads no database
// and imports nothing, so the browser may ask it the same questions the server
// does, and every rule can be tested as a sentence over plain rows.
//
// The spec is docs/engineering/2026-11-10-client-reviews-spec.md ("One rules
// module"); the words are defined in entities/org/GLOSSARY.md.

// ---------------------------------------------------------------------------
// The facts
// ---------------------------------------------------------------------------

/** The statuses the shared reviews table allows on a row. */
export type ReviewPartStatus = "open" | "draft" | "submitted" | "finalized" | "acknowledged";

/** One person's part of one member's review: the row their answers sit on. `reopened`: the owner put it back to open after it was sent (CR.2.4), still true once resent. */
export type ReviewPartFacts = { status: ReviewPartStatus; reopened?: boolean };

/** The client manager's part also carries their personal link, which the owner can cancel. */
export type ClientManagerPartFacts = ReviewPartFacts & { linkCancelled: boolean };

/** One holding of a client review. Times are ISO strings, or null while the thing has not happened. */
export type CycleFacts = {
  closedAt: string | null;
  hasSkipManager: boolean;
  skipManagerLinkCancelled: boolean;
};

/** One member's place in a cycle. */
export type CycleMemberFacts = {
  withdrawnAt: string | null;
  /** When the owner unlocked the client manager's part before the member had submitted. */
  raterUnlockedAt: string | null;
  /** When the owner waived the skip-manager's Reviewed mark for this member. */
  skipWaivedAt: string | null;
  releasedAt: string | null;
};

/** The three parts of one member's review. A part is null while its row does not exist. */
export type ReviewParts = {
  member: ReviewPartFacts | null;
  clientManager: ClientManagerPartFacts | null;
  /** The skip-manager's comments on this member; submitting it is pressing Reviewed. */
  skipManager: ReviewPartFacts | null;
};

export type ReviewPartName = keyof ReviewParts;

/** Everything the rules need to know about one member's review in one cycle. */
export type ClientReviewFacts = { cycle: CycleFacts; member: CycleMemberFacts; parts: ReviewParts };

/**
 * A link somebody presented. The caller compares the token, because that takes
 * the stored token, and says only whether it matched. A stored token that is
 * missing matches nothing: the caller must never count null against null as a
 * match.
 */
export type PresentedLink = { tokenMatches: boolean };

/**
 * Who is asking to see a review. A person who is more than one of these is
 * named by the widest that is true of them: a review admin first, then the
 * member, then the manager of record or the coach.
 */
export type ReviewViewer =
  | { kind: "member" | "review_admin" | "manager_of_record" | "coach" | "other" }
  | { kind: "client_manager_link" | "skip_manager_link"; tokenMatches: boolean };

/** Yes, or no with the one reason a page can say plainly. */
export type Answer<Reason extends string> = { ok: true } | { ok: false; reason: Reason };

const YES = { ok: true } as const;
const no = <Reason extends string>(reason: Reason): { ok: false; reason: Reason } => ({ ok: false, reason });

// ---------------------------------------------------------------------------
// Submitted
// ---------------------------------------------------------------------------

// The shared reviews table also allows "finalized" and "acknowledged", which
// the company's own reviews reach after "submitted". A client review never
// moves a row there, but a row that somehow carries one is past its writer's
// hands, so it counts as submitted rather than falling back to editable.
const SUBMITTED_STATUSES = new Set<ReviewPartStatus>(["submitted", "finalized", "acknowledged"]);

/** Whether a part has been submitted. A part that does not exist has not. */
export function isPartSubmitted(part: ReviewPartFacts | null | undefined): boolean {
  return part !== null && part !== undefined && SUBMITTED_STATUSES.has(part.status);
}

/**
 * Whether the review still waits for the skip-manager's Reviewed mark. A cycle
 * with no skip-manager never waits, and neither does a member whose mark the
 * owner waived. A cancelled skip-manager link is not a waiver: the owner either
 * issues a new link or waives, and both are recorded.
 */
/** The member's part was reopened for a correction and is not sent again yet, so the review waits on it. */
function awaitsMemberCorrection(facts: ClientReviewFacts): boolean {
  return facts.parts.member?.reopened === true && !isPartSubmitted(facts.parts.member);
}

function awaitsSkipManagerMark(facts: ClientReviewFacts): boolean {
  return facts.cycle.hasSkipManager && facts.member.skipWaivedAt === null && !isPartSubmitted(facts.parts.skipManager);
}

// ---------------------------------------------------------------------------
// 1. The member's stage
// ---------------------------------------------------------------------------

export type ClientReviewStage =
  | "withdrawn"
  | "waiting_on_member"
  | "waiting_on_client_manager"
  | "waiting_on_skip_manager"
  | "ready_to_release"
  | "released";

/**
 * Where one member's review has got to. It is derived on every read and never
 * stored, so it cannot disagree with the rows it is read from.
 *
 * Withdrawn wins over everything and released wins next. After that the stage
 * names the first thing still outstanding. Closing the cycle does not change
 * it, because closing only stops the links.
 *
 * The unlocked case is a judgement. When the owner unlocks the client
 * manager's part for a member who has not submitted, both of them may now
 * fill in their part. While neither has, the stage stays "waiting on the
 * member": that is still the first thing missing, and it is what the overview
 * said before the unlock, so an unlock does not make a silent member look as
 * if they had submitted. Once the client manager submits through the unlock,
 * the review moves on without the member, whose part is no longer what blocks
 * it. That is what the unlock is for (story 22).
 *
 * A reopened member's part is the other way round: the owner put it back for
 * a correction, so the review waits on the member again until they resend it,
 * whatever the client manager has done.
 */
export function memberStage(facts: ClientReviewFacts): ClientReviewStage {
  if (facts.member.withdrawnAt !== null) return "withdrawn";
  if (facts.member.releasedAt !== null) return "released";
  if (!isPartSubmitted(facts.parts.clientManager)) {
    return isPartSubmitted(facts.parts.member) ? "waiting_on_client_manager" : "waiting_on_member";
  }
  if (awaitsMemberCorrection(facts)) return "waiting_on_member";
  return awaitsSkipManagerMark(facts) ? "waiting_on_skip_manager" : "ready_to_release";
}

// ---------------------------------------------------------------------------
// 2. Whether a link is valid
// ---------------------------------------------------------------------------

export type LinkRefusal = "no_match" | "cancelled" | "cycle_closed" | "member_withdrawn";

/**
 * Whether a client manager's personal link still works for the one member it
 * was issued for, and why not when it does not.
 *
 * The order of the reasons is deliberate. A token that does not match learns
 * nothing else, so no later reason can be read off a guessed link. Cancelled
 * comes before closed, because it is the fact about the link itself and the
 * person holding it may be the wrong address it was cancelled for. A part that
 * does not exist has no link, so nothing can match it.
 */
export function isClientManagerLinkValid(facts: ClientReviewFacts, link: PresentedLink): Answer<LinkRefusal> {
  const part = facts.parts.clientManager;
  if (!link.tokenMatches || part === null) return no("no_match");
  if (part.linkCancelled) return no("cancelled");
  if (facts.cycle.closedAt !== null) return no("cycle_closed");
  if (facts.member.withdrawnAt !== null) return no("member_withdrawn");
  return YES;
}

/**
 * Whether the skip-manager's one link to the whole cycle still works. A
 * withdrawn member does not make this link invalid, because it covers every
 * member: whether one member can be opened through it is
 * `canSkipManagerOpenMember`. A cycle with no skip-manager has no such link,
 * so nothing can match it.
 */
export function isSkipManagerLinkValid(cycle: CycleFacts, link: PresentedLink): Answer<Exclude<LinkRefusal, "member_withdrawn">> {
  if (!link.tokenMatches || !cycle.hasSkipManager) return no("no_match");
  if (cycle.skipManagerLinkCancelled) return no("cancelled");
  if (cycle.closedAt !== null) return no("cycle_closed");
  return YES;
}

// ---------------------------------------------------------------------------
// 3. Whether the client manager's part can be filled
// ---------------------------------------------------------------------------

/**
 * Whether the client manager may fill in their part now. The link's own reason
 * comes first, so a closed cycle reads as closed even for a part already
 * submitted. "already_submitted" means the page shows their answers read-only
 * (story 42). "not_yet" means the member has not submitted and the owner has
 * not unlocked the part, and the page says so plainly (story 41). A member
 * whose part the owner reopened holds the client manager back the same way
 * until they submit again.
 */
export function canClientManagerFillPart(
  facts: ClientReviewFacts,
  link: PresentedLink,
): Answer<LinkRefusal | "already_submitted" | "not_yet"> {
  const linkAnswer = isClientManagerLinkValid(facts, link);
  if (!linkAnswer.ok) return linkAnswer;
  if (isPartSubmitted(facts.parts.clientManager)) return no("already_submitted");
  if (!isPartSubmitted(facts.parts.member) && facts.member.raterUnlockedAt === null) return no("not_yet");
  return YES;
}

// ---------------------------------------------------------------------------
// 4. Whether a part can still be edited
// ---------------------------------------------------------------------------

/**
 * Whether a part is still open to its own writer. Never after it is submitted,
 * by anyone: the owner reopening a part puts it back to not submitted, which
 * is the only way through this. Never once the cycle is closed. And never for
 * a withdrawn member, whose review only review admins still see, since nobody
 * may edit what they may not open. A part whose row does not exist yet has not
 * been submitted, so it can still be written.
 *
 * This is the lock alone. Whether the person asking is the part's writer, and
 * for the client manager whether the member has gone first, are the questions
 * beside this one.
 */
export function canStillEditPart(facts: ClientReviewFacts, name: ReviewPartName): boolean {
  if (facts.cycle.closedAt !== null || facts.member.withdrawnAt !== null) return false;
  return !isPartSubmitted(facts.parts[name]);
}

// ---------------------------------------------------------------------------
// 5. Whether the skip-manager can open a member
// ---------------------------------------------------------------------------

/**
 * Whether the skip-manager may open one member through their link. They read
 * the client manager's answers, so there is nothing to open until those are
 * submitted: "waiting_on_client_manager" means the member is listed as
 * waiting, and "member_withdrawn" means the member is not listed at all. The
 * link's own reason comes first.
 */
export function canSkipManagerOpenMember(
  facts: ClientReviewFacts,
  link: PresentedLink,
): Answer<LinkRefusal | "waiting_on_client_manager"> {
  const linkAnswer = isSkipManagerLinkValid(facts.cycle, link);
  if (!linkAnswer.ok) return linkAnswer;
  if (facts.member.withdrawnAt !== null) return no("member_withdrawn");
  if (!isPartSubmitted(facts.parts.clientManager)) return no("waiting_on_client_manager");
  return YES;
}

// ---------------------------------------------------------------------------
// 6. Whether a member can be released
// ---------------------------------------------------------------------------

export type ReleaseRefusal = "member_withdrawn" | "already_released" | "client_manager_not_submitted" | "member_part_reopened" | "skip_manager_not_reviewed";

/**
 * Whether the owner may release this member's review. The client manager must
 * have submitted, and the skip-manager must have marked the member Reviewed
 * unless the cycle has no skip-manager or the owner waived the mark. The
 * member's own part is not asked for: an unlocked review can be released with
 * only the client manager's answers. A closed cycle does not stop a release,
 * because closing only stops the links. This says yes exactly when
 * `memberStage` says "ready_to_release".
 */
export function canReleaseMember(facts: ClientReviewFacts): Answer<ReleaseRefusal> {
  if (facts.member.withdrawnAt !== null) return no("member_withdrawn");
  if (facts.member.releasedAt !== null) return no("already_released");
  if (!isPartSubmitted(facts.parts.clientManager)) return no("client_manager_not_submitted");
  if (awaitsMemberCorrection(facts)) return no("member_part_reopened");
  if (awaitsSkipManagerMark(facts)) return no("skip_manager_not_reviewed");
  return YES;
}

// ---------------------------------------------------------------------------
// 7. What a viewer sees
// ---------------------------------------------------------------------------

/** The sections of one member's review, each seen or not. */
export type ReviewVisibility = Readonly<{
  memberPart: boolean;
  clientManagerPart: boolean;
  selfAverage: boolean;
  clientManagerAverage: boolean;
  hrSummary: boolean;
  skipManagerComments: boolean;
}>;

const NOTHING: ReviewVisibility = {
  memberPart: false,
  clientManagerPart: false,
  selfAverage: false,
  clientManagerAverage: false,
  hrSummary: false,
  skipManagerComments: false,
};

const EVERYTHING: ReviewVisibility = {
  memberPart: true,
  clientManagerPart: true,
  selfAverage: true,
  clientManagerAverage: true,
  hrSummary: true,
  skipManagerComments: true,
};

// What release shows the people inside the company. The skip-manager's
// comments are a note meant for HR (story 55), so release never carries them.
const THE_RELEASED_REVIEW: ReviewVisibility = { ...EVERYTHING, skipManagerComments: false };

// What either link shows of the two parts. Neither link shows an average or
// the HR summary: those are the company's reading of the review, not the
// client's.
const BOTH_PARTS: ReviewVisibility = { ...NOTHING, memberPart: true, clientManagerPart: true };

/**
 * What one viewer may see of one member's review. Every screen that shows any
 * of it asks here, section by section.
 *
 * | Viewer                            | Before release                        | After release                          |
 * |-----------------------------------|---------------------------------------|----------------------------------------|
 * | The member                        | their own part                        | both parts, both averages, HR summary  |
 * | A review admin                    | everything                            | everything                             |
 * | The client manager, by valid link | the member's part and their own       | the same, until the cycle closes       |
 * | The skip-manager, by valid link   | both parts and their own comments     | the same, until the cycle closes       |
 * | The manager of record, the coach  | nothing                               | both parts, both averages, HR summary  |
 * | Anyone else                       | nothing                               | nothing                                |
 *
 * Three things the table does not say by itself:
 *
 * - A withdrawn member's review is seen by review admins only, whatever had
 *   been released before the withdrawal.
 * - Before release the member also sees their own average, once their own
 *   part is submitted. It is the mean of ratings they typed themselves, so it
 *   tells them nothing new, and holding it back until release would only make
 *   the read-only view of their answers differ from the released one for no
 *   reason. Before they submit there is no settled set of ratings to average.
 * - The skip-manager sees nothing of a member until the client manager has
 *   submitted, because that is when they may open the member at all.
 *
 * The skip-manager's comments reach review admins and the skip-manager's own
 * valid link, and nobody else, ever.
 */
export function whatViewerSees(facts: ClientReviewFacts, viewer: ReviewViewer): ReviewVisibility {
  if (viewer.kind === "review_admin") return EVERYTHING;
  if (facts.member.withdrawnAt !== null) return NOTHING;
  const released = facts.member.releasedAt !== null;
  switch (viewer.kind) {
    case "member":
      return released ? THE_RELEASED_REVIEW : { ...NOTHING, memberPart: true, selfAverage: isPartSubmitted(facts.parts.member) };
    case "manager_of_record":
    case "coach":
      return released ? THE_RELEASED_REVIEW : NOTHING;
    case "client_manager_link":
      return isClientManagerLinkValid(facts, viewer).ok ? BOTH_PARTS : NOTHING;
    case "skip_manager_link":
      return canSkipManagerOpenMember(facts, viewer).ok ? { ...BOTH_PARTS, skipManagerComments: true } : NOTHING;
    default:
      // Anyone else, and any kind of viewer this module has not been taught,
      // sees nothing.
      return NOTHING;
  }
}

// ---------------------------------------------------------------------------
// 8. An average
// ---------------------------------------------------------------------------

/**
 * The mean of the ratings the framework's key list names, to two decimals, or
 * null unless every one of those keys holds a finite number. An average over a
 * form with a gap in it would read as a score nobody gave, so it does not
 * exist until the last rating does. Keys outside the list are never counted,
 * which is what keeps a comment or a closing question beside the ratings from
 * moving the figure. A number written as text is not a rating: the form writes
 * numbers, so text there means the answer is not what the framework expects.
 */
export function averageOfRatings(
  ratings: Readonly<Record<string, unknown>> | null | undefined,
  ratingKeys: readonly string[],
): number | null {
  if (!ratings || ratingKeys.length === 0) return null;
  let sum = 0;
  for (const key of ratingKeys) {
    const rating = ratings[key];
    if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
    sum += rating;
  }
  return Math.round((sum / ratingKeys.length) * 100) / 100;
}
