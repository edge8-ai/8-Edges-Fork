import { isPartSubmitted, type ClientReviewFacts } from "./rules";

// The member's window to update the part they already sent (CR.6), beside
// the rules module rather than in it: the same pure question of the facts,
// with no reads and no clock, kept in its own file so rules.ts stays under
// the file-size cap. Access, the team page and the cycle page all ask this.

/**
 * The cycle's due date and today, both as "YYYY-MM-DD" days in the client's
 * calendar. The caller works out today in the client's time zone, so this
 * module stays free of clocks and zones.
 */
export type MemberUpdateWindow = { dueDate: string | null; today: string };

/**
 * Whether the member may still update the part they already sent (CR.6,
 * Khoa, 2026-11-19). It stays theirs until the first of: the due day is over,
 * their client manager sends their part, the review is released, the cycle
 * closes, or they are withdrawn. With no due date only the others end it.
 *
 * The client manager reads the member's answers beside their own form, so a
 * member's answers may change only while nothing has been rated against them
 * yet. That is also why the client manager's own part never reopens this way.
 * A member who has not sent yet is `canStillEditPart`'s case, not this one.
 *
 * Once the client manager sends, this says no, and the member page drops its
 * Update button: a member can infer the manager has sent. Khoa accepted that
 * on the CR.6 prototype rather than let a rated answer change.
 */
export function canMemberUpdateSentPart(facts: ClientReviewFacts, window: MemberUpdateWindow): boolean {
  if (facts.cycle.closedAt !== null || facts.member.withdrawnAt !== null || facts.member.releasedAt !== null) return false;
  if (!isPartSubmitted(facts.parts.member) || isPartSubmitted(facts.parts.clientManager)) return false;
  return window.dueDate === null || window.today <= window.dueDate;
}
