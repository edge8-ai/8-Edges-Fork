import type { CommentMention, TaskComment } from "@/entities/boards/lib/data";
import type { CardHop } from "@/entities/boards/lib/card-history";

/**
 * One card, one stream (W.92.6).
 *
 * A card used to answer "what has happened here?" twice: a Comments panel and,
 * three panels further down, a History strip. Reading them together meant
 * reading both and interleaving the timestamps by eye, which is exactly the
 * work a computer is for. They are the same question — what happened, and
 * when — so they are now one list in one order.
 *
 * HOUSE RULE, unchanged and load-bearing: a move says WHAT moved and WHEN,
 * never WHO moved it. `CardHop` carries no `moved_by` because the read does
 * not select one, and nothing here reintroduces a person for a move. A comment
 * keeps its author, because a comment is somebody speaking — that is the
 * comment, not a measurement of them.
 */
export type ReplyItem = {
  id: string;
  commentId: string;
  at: string;
  author: string;
  body: string;
  mentions: CommentMention[];
};

/**
 * A top-level comment and the thread under it (W.143). `resolved` is the
 * thread's state, read off its top-level comment. A resolved thread is still
 * an item in the stream, in its place; the UI greys it and never hides or
 * folds it (the house rule).
 */
export type CommentItem = ReplyItem & {
  kind: "comment";
  resolved: { at: string; by: string | null } | null;
  replies: ReplyItem[];
};

export type ActivityItem = CommentItem | { kind: "move"; id: string; at: string; label: string; note: string | null };

/**
 * One hop in words. A row with no `from` is the card arriving — either it was
 * made there or it came off another board — and "to Review" with nothing
 * before it reads as a gap rather than a beginning, so it says "Started in".
 */
export function hopLabel(h: Pick<CardHop, "from" | "to">): string {
  if (h.to === null) return h.from ? `Left ${h.from}` : "Moved";
  if (h.from === null) return `Started in ${h.to}`;
  return `${h.from} → ${h.to}`;
}

/**
 * The two sources in one time order, oldest first — the order a story is read
 * in, and the order the composer sits at the end of.
 *
 * Ties break comment-after-move: a comment written the same second as a move
 * is almost always about the move, and reading the reason before the thing it
 * explains is backwards. The sort is stable on `at`, so rows that share a
 * timestamp within one source keep the order their read returned them in.
 *
 * Only top-level comments take part in that order (W.143). A reply sits under
 * the comment it answers, oldest first: a reply placed in time order among the
 * moves would be an answer separated from its question.
 */
export function mergeActivity(comments: TaskComment[], hops: CardHop[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...hops.map((h): ActivityItem => ({ kind: "move", id: `hop-${h.id}`, at: h.at, label: hopLabel(h), note: h.note })),
    ...threadComments(comments),
  ];
  return items.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    if (a.kind === b.kind) return 0;
    return a.kind === "move" ? -1 : 1;
  });
}

function replyOf(c: TaskComment): ReplyItem {
  return { id: `comment-${c.id}`, commentId: c.id, at: c.createdAt, author: c.author, body: c.body, mentions: c.mentions ?? [] };
}

/**
 * Comments grouped into threads: each top-level comment with its replies,
 * oldest reply first.
 *
 * Nothing a person wrote is ever dropped. A reply whose parent is not among
 * the comments read heads a thread of its own. A reply to a reply — which the
 * server refuses, so only an older or hand-written row could hold one — joins
 * the thread its parent belongs to, one level deep like every other reply.
 */
export function threadComments(comments: TaskComment[]): CommentItem[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const heads = (c: TaskComment) => !c.parentId || !byId.has(c.parentId);
  // The thread head a comment sits under. Bounded by the number of comments,
  // so a cycle in bad data ends — its comment then heads its own thread.
  const headOf = (c: TaskComment): TaskComment => {
    let cur = c;
    for (let steps = 0; steps <= comments.length; steps++) {
      if (heads(cur)) return cur;
      cur = byId.get(cur.parentId as string) as TaskComment;
    }
    return c;
  };

  const threads = new Map<string, CommentItem>();
  const replies: [headId: string, reply: ReplyItem][] = [];
  for (const c of comments) {
    const head = headOf(c);
    if (head.id !== c.id) {
      replies.push([head.id, replyOf(c)]);
      continue;
    }
    threads.set(c.id, {
      ...replyOf(c),
      kind: "comment",
      resolved: c.resolvedAt ? { at: c.resolvedAt, by: c.resolvedBy ?? null } : null,
      replies: [],
    });
  }
  for (const [headId, reply] of replies) threads.get(headId)?.replies.push(reply);
  for (const t of threads.values()) t.replies.sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1));
  return [...threads.values()];
}
