import { canReleaseMember, isPartSubmitted, type Answer, type ClientReviewFacts } from "./rules";

// What the person running a client review may do to one member's review from
// the cycle overview (CR.2.4) and the member's own page (CR.3.3), as rules
// over the same facts the rest of the rules module reads. The pages offer
// exactly the actions these allow and the commands refuse the rest, so the
// two never disagree (the CR.2 code review found the page working the
// conditions out itself). Pure, like ./rules: no reads, no clock.

const YES = { ok: true } as const;
const no = <Reason extends string>(reason: Reason): { ok: false; reason: Reason } => ({ ok: false, reason });

/** The owner's actions on one member, from the cycle overview (CR.2.4) and the member's page (CR.3.3). */
export type OwnerAction =
  | "unlock"
  | "reopen_member"
  | "reopen_client_manager"
  | "new_link"
  | "change_client_manager"
  | "withdraw"
  | "edit_summary"
  | "waive_skip"
  | "release";

export type OwnerRefusal =
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
 * - a new link: only for a client manager who has a part;
 * - a change of client manager: never once theirs is sent, because a sent
 *   part is not handed to someone else; it is reopened first (story 21);
 * - withdraw: any member still in an open cycle whose review is not released;
 * - the HR summary: until release, after which the member reads it as it was
 *   released (story 50, the CR.3.1 prototype as approved);
 * - waiving the skip-manager's mark: only while the cycle has a skip-manager
 *   and the mark is neither given nor waived (story 52);
 * - release: exactly when the rules module's canReleaseMember says yes.
 *
 * Whether the person acting is the member is not a fact here: the commands
 * refuse that before anything is read.
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
    case "new_link":
      return clientManager === null ? no("no_client_manager") : YES;
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
  "new_link",
  "change_client_manager",
  "withdraw",
  "edit_summary",
  "waive_skip",
  "release",
];

/** Every owner action and whether it may be taken now, for the pages to offer exactly those. */
export function ownerActionsOn(facts: ClientReviewFacts): Readonly<Record<OwnerAction, boolean>> {
  return Object.fromEntries(OWNER_ACTIONS.map((a) => [a, canOwnerDo(facts, a).ok])) as Record<OwnerAction, boolean>;
}
