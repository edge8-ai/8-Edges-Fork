// The two rules a comment thread keeps (W.143), as pure functions so the
// server action and its tests read the same sentence.
//
// ONE level of replies: a reply answers a top-level comment, and a reply is
// never itself a parent. Khoa's decision of 2026-09-24 — a thread that nests
// has to be read as a tree, and a card's activity is read as a story, top to
// bottom. The database cannot hold this rule (a check constraint cannot see
// the parent row), so the action reads the parent and asks here.
//
// Resolve belongs to a thread, and a thread is its top-level comment. A reply
// resolves with the thread it sits in, so resolving one on its own is refused
// rather than quietly resolving its parent.

/** The fields of a stored comment the rules look at. */
export type ThreadRow = { task_id: string; parent_comment_id: string | null };

const NOT_ON_CARD = "That comment is not on this card.";

/** Why `parent` cannot be replied to on card `taskId`, or null when it can. */
export function replyParentProblem(parent: ThreadRow | null, taskId: string): string | null {
  if (!parent || parent.task_id !== taskId) return NOT_ON_CARD;
  if (parent.parent_comment_id) return "A reply cannot be replied to. Reply to the thread instead.";
  return null;
}

/** Why `comment` cannot be resolved or reopened on card `taskId`, or null when it can. */
export function resolveProblem(comment: ThreadRow | null, taskId: string): string | null {
  if (!comment || comment.task_id !== taskId) return NOT_ON_CARD;
  if (comment.parent_comment_id) return "A reply is resolved with its thread. Resolve the thread instead.";
  return null;
}

/**
 * Who a new comment's notification goes to: the people it tagged, once each,
 * never its author. Tagging yourself is allowed (the highlight still shows)
 * but a DM telling you what you just wrote is noise.
 */
export function mentionRecipients(mentions: readonly string[], authorPersonId: string | null): string[] {
  return [...new Set(mentions)].filter((id) => id !== authorPersonId);
}
