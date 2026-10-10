"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { timeAgo } from "@/kernel/ui/format";
import type { BoardCard, BoardPerson } from "@/entities/boards/lib/data";
import { addComment } from "@/entities/boards/lib/actions";
import { resolveThread } from "@/entities/boards/lib/comment-actions";
import { getCardHistory, type CardHop } from "@/entities/boards/lib/card-history";
import { mergeActivity } from "./card-activity";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import type { RunAction } from "./board-view-types";

/**
 * Activity — everything that has happened to this card, in one order (W.92.6).
 *
 * Comments and column moves were two panels with two headings, and the reader
 * did the interleaving. Now the moves (W.34, `task_stage_log`) and the
 * comments are one stream, oldest first, with the composer at the end of it
 * where a reply belongs.
 *
 * The hops load on open rather than with the board: one query per card
 * actually inspected, against a table indexed by `task_id`. Putting it in the
 * board read would pay for every card on screen to answer a question about
 * one. A failed load degrades to comments alone with the reason stated — the
 * comments are already in hand and hiding them would be a worse answer than a
 * partial stream.
 *
 * NOBODY IS NAMED ON A MOVE, ever: `CardHop` has no `moved_by` because the
 * read does not select one.
 *
 * Comments are threads (W.143): a top-level comment keeps its place in time
 * among the moves, its replies sit indented under it, and it can be resolved
 * and reopened in place. `people` feeds the @mention picker — the people who
 * can be on this board; without it the composer still works, with no picker.
 */
export function CardActivity({
  card,
  slug,
  saving,
  run,
  readOnly = false,
  people = [],
}: {
  card: BoardCard;
  slug: string;
  saving: boolean;
  run: RunAction;
  readOnly?: boolean;
  people?: BoardPerson[];
}) {
  // The one thread whose reply box is open. One at a time, so the drawer never
  // holds two half-written replies the reader has to keep track of.
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // Whether the open reply box holds text: opening another thread's reply
  // box closes this one, so it asks first rather than drop the words.
  const replyDraft = useRef(false);
  const setReplyDraft = useCallback((has: boolean) => {
    replyDraft.current = has;
  }, []);
  const openReply = (id: string) => {
    if (replyTo && replyTo !== id && replyDraft.current && !window.confirm("Discard this reply?")) return;
    replyDraft.current = false;
    setReplyTo(id);
  };
  const [history, setHistory] = useState<{ hops: CardHop[] } | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    setHistory(null);
    setReplyTo(null);
    void getCardHistory(card.id).then((res) => {
      if (!live) return;
      setHistory(res.ok ? { hops: res.hops } : { error: res.error });
    });
    // A drawer closed and reopened on another card must not show the first
    // card's hops while the second card's load is in flight.
    return () => {
      live = false;
    };
  }, [card.id]);

  const hops = history && "hops" in history ? history.hops : [];
  const items = mergeActivity(card.comments, hops);
  // Every entry counts, replies included: the heading says how much happened.
  const count = items.reduce((n, i) => n + 1 + (i.kind === "comment" ? i.replies.length : 0), 0);

  function post(body: string, mentions: string[], onSent: () => void, parentCommentId: string | null = null) {
    run(
      () => addComment(card.id, body, slug, { parentCommentId, mentions }),
      () => {
        onSent();
        if (parentCommentId) setReplyTo(null);
      },
    );
  }

  return (
    <section className="wb-drawer-block">
      <h3 className="wb-drawer-heading">Activity</h3>

      {history && "error" in history && <p className="admin-hint u-err">{history.error}</p>}
      {card.comments_error && <p className="admin-hint u-err">{card.comments_error}</p>}

      {items.length === 0 && history !== null && !("error" in history) && (
        <p className="admin-hint">Nothing has happened to this card yet.</p>
      )}

      <ol className="wb-activity">
        {items.map((item) =>
          item.kind === "move" ? (
            <li key={item.id} className="wb-activity-item wb-activity-item--move">
              <span className="wb-activity-move">{item.label}</span>
              <time className="wb-activity-when" dateTime={item.at}>
                {timeAgo(item.at)}
              </time>
              {item.note && <span className="wb-activity-note">{item.note}</span>}
            </li>
          ) : (
            <CommentThread
              key={item.id}
              item={item}
              people={people}
              saving={saving}
              readOnly={readOnly}
              replying={replyTo === item.commentId}
              onReplyOpen={() => openReply(item.commentId)}
              onReplyClose={() => setReplyTo(null)}
              onReplyDraft={setReplyDraft}
              onReply={(body, mentions, onSent) => post(body, mentions, onSent, item.commentId)}
              onResolve={(resolved) => run(() => resolveThread(card.id, item.commentId, resolved, slug))}
            />
          ),
        )}
      </ol>

      {!readOnly && (
        <CommentComposer people={people} saving={saving} label="Add a comment" submitLabel="Comment" onSubmit={(body, mentions, onSent) => post(body, mentions, onSent)} />
      )}
    </section>
  );
}
