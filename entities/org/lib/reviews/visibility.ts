// Company reviews (A.95): who sees which row of one cycle, decided once from
// plain rows and the viewer's roles. getReviewDetail reads the rows and works
// out the roles, then asks here; it must not re-derive a rule, because a rule
// written twice is how two screens come to disagree about who may read a
// review. The module is pure on purpose, like the client review rules in
// ../client-reviews/rules.ts: it reads no database and imports nothing, so
// every rule can be tested as a sentence over plain rows.
//
// A client review never reaches this module. Its own rules decide what each of
// its viewers sees, and getReviewDetail refuses a client row before asking.

// ---------------------------------------------------------------------------
// One status vocabulary
// ---------------------------------------------------------------------------

// The shared reviews table allows five statuses (the check constraint in
// supabase/migrations/20260812150000_performance_reviews_cycles.sql). A row is
// written as "open" or "draft", sent as "submitted", closed by its manager of
// record as "finalized", and read by the person it is about as
// "acknowledged". Every caller asks these two questions instead of spelling
// the sets out again, because the spellings had already drifted: one reader
// counted only "finalized" as closed while four others also counted
// "acknowledged".
const SENT_STATUSES = new Set(["submitted", "finalized", "acknowledged"]);
const CLOSED_STATUSES = new Set(["finalized", "acknowledged"]);

/** Whether a review row has left its writer's hands. A missing row has not. */
export function isReviewSent(status: string | null | undefined): boolean {
  return typeof status === "string" && SENT_STATUSES.has(status);
}

/** Whether a review row is closed: finalized by its manager of record, or past that. A missing row is not. */
export function isReviewClosed(status: string | null | undefined): boolean {
  return typeof status === "string" && CLOSED_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// What a viewer sees
// ---------------------------------------------------------------------------

/**
 * The viewer's relationship to the cycle, as getReviewDetail works it out.
 * Subject and reviewer are not mutually exclusive: someone who is their own
 * reviewer-of-record (the founder) holds both. "Reviewer" means the manager of
 * record. An extra reviewer is neither of those two, and an observer (the
 * subject's coach, or a people.pay holder) is none of the other three.
 */
export type ReviewViewerRoles = {
  isSubject: boolean;
  isReviewer: boolean;
  isExtraReviewer: boolean;
  isObserver: boolean;
};

/**
 * The rows of one cycle. `others` holds every extra reviewer's row, team or
 * external, the viewer's own included; `ownExtra` holds the viewer's own team
 * reviewer rows among them.
 */
export type ReviewCycleRows<Row> = {
  self: Row | null;
  manager: Row | null;
  others: readonly Row[];
  ownExtra: readonly Row[];
};

export type ReviewViewerSees<Row> = {
  self: Row | null;
  manager: Row | null;
  others: Row[];
  canFinalize: boolean;
};

/**
 * What one viewer may see of one cycle, or null when that is nothing, so the
 * page answers "not found" rather than an empty review.
 *
 * | Viewer          | Self row                          | Manager row | Extra reviewers' rows |
 * |-----------------|-----------------------------------|-------------|-----------------------|
 * | Subject         | always                            | once closed | none                  |
 * | Reviewer        | once their manager row is sent    | always      | each once sent        |
 * | Extra reviewer  | never                             | never       | their own, always     |
 * | Observer        | once sent                         | once sent   | each once sent        |
 * | Anyone else     | never                             | never       | none                  |
 *
 * The reviewer waits for their own row to go before reading the self row so
 * that they draft blind, and even then reads a self row only while it is
 * exactly "submitted", as getReviewDetail always has; the tests pin that.
 * An observer never reads a draft, only what its writer has sent. Only the reviewer may finalize, and only a submitted manager row;
 * finalizeReview checks the reviewer again before it writes.
 */
export function whatReviewViewerSees<Row extends { status: string }>(
  rows: ReviewCycleRows<Row>,
  roles: ReviewViewerRoles,
): ReviewViewerSees<Row> | null {
  const { self, manager } = rows;
  const managerSent = isReviewSent(manager?.status);

  const visibleSelf = roles.isSubject
    ? self
    : roles.isReviewer && managerSent && self?.status === "submitted"
      ? self
      : roles.isObserver && isReviewSent(self?.status)
        ? self
        : null;
  const visibleManager = roles.isReviewer
    ? manager
    : roles.isSubject && isReviewClosed(manager?.status)
      ? manager
      : roles.isObserver && managerSent
        ? manager
        : null;
  const visibleOthers = roles.isExtraReviewer
    ? [...rows.ownExtra]
    : roles.isReviewer || roles.isObserver
      ? rows.others.filter((r) => isReviewSent(r.status))
      : [];

  if (!visibleSelf && !visibleManager && visibleOthers.length === 0) return null;
  return {
    self: visibleSelf,
    manager: visibleManager,
    others: visibleOthers,
    canFinalize: roles.isReviewer && manager?.status === "submitted",
  };
}
