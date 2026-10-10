"use client";

import { timeAgo } from "@/kernel/ui/format";
import type { BoardPerson, CommentMention } from "@/entities/boards/lib/data";
import type { CommentItem } from "./card-activity";
import { splitMentions } from "./comment-mentions";
import { CommentComposer } from "./CommentComposer";

/** A comment's text with the people it tagged highlighted (W.143). */
function CommentBody({ body, mentions }: { body: string; mentions: CommentMention[] }) {
  return (
    <p className="wb-activity-body">
      {splitMentions(body, mentions).map((part, i) =>
        part.mention ? (
          <mark key={i} className="wb-mention">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

/**
 * One thread in the Activity stream (W.143): the top-level comment, its
 * replies indented under it, and — where the reader may comment — Reply and
 * Resolve. A resolved thread keeps its place and its text, greyed, and says
 * who resolved it; it is never hidden or folded (the house rule). A reply has
 * no Reply of its own, because a reply is never replied to.
 */
export function CommentThread({
  item,
  people,
  saving,
  readOnly,
  replying,
  onReplyOpen,
  onReplyClose,
  onReplyDraft,
  onReply,
  onResolve,
}: {
  item: CommentItem;
  people: BoardPerson[];
  saving: boolean;
  readOnly: boolean;
  replying: boolean;
  onReplyOpen: () => void;
  onReplyClose: () => void;
  /** Whether this thread's open reply box holds a draft (W.143 review). */
  onReplyDraft?: (has: boolean) => void;
  onReply: (body: string, mentions: string[], onSent: () => void) => void;
  onResolve: (resolved: boolean) => void;
}) {
  const resolved = item.resolved !== null;
  return (
    <li className={`wb-activity-item${resolved ? " wb-activity-item--resolved" : ""}`}>
      <span className="wb-activity-author">{item.author}</span>
      <time className="wb-activity-when" dateTime={item.at}>
        {timeAgo(item.at)}
      </time>
      <CommentBody body={item.body} mentions={item.mentions} />

      {item.replies.length > 0 && (
        <ol className="wb-activity-replies" aria-label={`Replies to ${item.author}`}>
          {item.replies.map((r) => (
            <li key={r.id} className="wb-activity-item wb-activity-reply">
              <span className="wb-activity-author">{r.author}</span>
              <time className="wb-activity-when" dateTime={r.at}>
                {timeAgo(r.at)}
              </time>
              <CommentBody body={r.body} mentions={r.mentions} />
            </li>
          ))}
        </ol>
      )}

      {item.resolved && (
        <p className="wb-activity-resolved">{item.resolved.by ? `Resolved by ${item.resolved.by}` : "Resolved"}</p>
      )}

      {!readOnly && (
        <div className="wb-activity-actions">
          {!replying && (
            <button type="button" className="admin-btn-reset wb-activity-action" onClick={onReplyOpen} disabled={saving}>
              Reply
            </button>
          )}
          <button type="button" className="admin-btn-reset wb-activity-action" onClick={() => onResolve(!resolved)} disabled={saving}>
            {resolved ? "Reopen" : "Resolve"}
          </button>
        </div>
      )}

      {!readOnly && replying && (
        <div className="wb-activity-reply-box">
          <CommentComposer
            people={people}
            saving={saving}
            label="Reply"
            submitLabel="Reply"
            onSubmit={onReply}
            onCancel={onReplyClose}
            onDraftChange={onReplyDraft}
            autoFocus
          />
        </div>
      )}
    </li>
  );
}
