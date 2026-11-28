import type { AnswerBeside } from "./beside";
import { canSkipManagerOpenMember, canStillEditPart, isPartSubmitted, type Answer, type ClientReviewFacts, type LinkRefusal, type PresentedLink } from "./rules";

// What the skip-manager's link may do with one member (CR.3.2, stories 44 to
// 49), as rules over the same facts the rest of the rules module reads. It
// sits beside ./rules for the file-size cap, as ./owner-rules does, and adds
// no rule of its own that ./rules already answers: opening a member, and the
// lock on a sent part, are asked of it here. Pure: no reads, no clock.

const YES = { ok: true } as const;
const no = <Reason extends string>(reason: Reason): { ok: false; reason: Reason } => ({ ok: false, reason });

/** How far one member's review has got, as the skip-manager's list says it. A withdrawn member is not listed. */
export type SkipListStage = "with_member" | "with_client_manager" | "ready" | "reviewed";

// The shapes the skip-manager's pages draw (./skip-view builds them). They sit
// here, in a module with no reads, so the browser door can name them.

/** One member on the skip-manager's list. */
export type SkipListRow = {
  teamMemberId: string;
  name: string;
  clientManagerName: string | null;
  stage: SkipListStage;
  /** When the client manager sent their part, once they have. */
  clientManagerSentAt: string | null;
  /** When the skip-manager marked the member Reviewed, once they have. */
  reviewedAt: string | null;
};

/** One question with both parts' answers beside it and the skip-manager's note. */
export type SkipQuestion = {
  /** The key the question's answers are stored under, and the note's key. */
  key: string;
  title: string;
  member: AnswerBeside | null;
  clientManager: AnswerBeside | null;
  note: string;
};

/**
 * Where one member stands for the skip-manager. Reviewed once their own part
 * is sent; ready once they may open the member (the client manager's part is
 * in); otherwise with whoever has not sent their part yet. Read for a valid
 * link only: the list is not shown to any other.
 */
export function skipListStage(facts: ClientReviewFacts): SkipListStage {
  if (isPartSubmitted(facts.parts.skipManager)) return "reviewed";
  if (canSkipManagerOpenMember(facts, { tokenMatches: true }).ok) return "ready";
  return isPartSubmitted(facts.parts.member) ? "with_client_manager" : "with_member";
}

export type SkipWriteRefusal = LinkRefusal | "waiting_on_client_manager" | "already_reviewed" | "no_part";

/**
 * Whether the skip-manager may write a note on one member or mark them
 * Reviewed. They must be able to open the member, and their own part must
 * still be open: marking Reviewed sends it, which locks the notes (the
 * prototype as approved on 13 Nov). A cycle that has a skip-manager gave every
 * member a part on opening; one without a part has nothing to write to.
 */
export function canSkipManagerWrite(facts: ClientReviewFacts, link: PresentedLink): Answer<SkipWriteRefusal> {
  const open = canSkipManagerOpenMember(facts, link);
  if (!open.ok) return open;
  if (facts.parts.skipManager === null) return no("no_part");
  if (!canStillEditPart(facts, "skipManager")) return no("already_reviewed");
  return YES;
}
