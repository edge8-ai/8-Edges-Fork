"use client";

import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { ChainItem } from "@/entities/crm/lib/meeting-actions/items";
import { markFollowupItem } from "@/entities/crm/lib/meeting-followup-actions";
import type { MeetingCards } from "@/entities/crm/lib/meeting-actions/view";

// The actions half of the meeting panel (Z.13): Edge8's actions, each with its
// card, owner and board, or why it is not filed yet, and the line it was said
// in; in shadow, Useful / Not useful on each. Then the client's own actions,
// which go in the email and never become cards.

function chipFor(item: ChainItem, shadow: boolean): { label: string; tone: BadgeTone } {
  if (shadow) {
    if (item.shadowMark === "useful") return { label: "Useful", tone: "ok" };
    if (item.shadowMark === "not_useful") return { label: "Not useful", tone: "neutral" };
    return { label: "Proposed", tone: "info" };
  }
  if (item.fileState === "filed") return { label: "Card filed", tone: "ok" };
  if (item.fileState === "needs_board") return { label: "Needs a board", tone: "warn" };
  if (item.fileState === "dismissed") return { label: "Dismissed", tone: "neutral" };
  return { label: "Filing", tone: "neutral" };
}

type Props = { meetingId: string; client: string; shadow: boolean; edge8: ChainItem[]; theirs: ChainItem[]; cards: MeetingCards; may: MayProp };

export function FollowupItems({ meetingId, client, shadow, edge8, theirs, cards, may }: Props) {
  const { note, pending, run } = useActionRunner();
  const canMark = shadow && may["crm.calls"] === true;

  return (
    <>
      {note && <p className={`admin-alert ${note.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>{note.text}</p>}
      {edge8.length === 0 ? (
        <p className="admin-hint">No action for Edge8 was found in the transcript.</p>
      ) : (
        <div className="admin-list">
          {edge8.map((item) => {
            const chip = chipFor(item, shadow);
            const card = item.taskId ? cards.cards[item.taskId] : undefined;
            const where = shadow ? (cards.wouldGoOn ? `would go on ${cards.wouldGoOn}` : "no single board yet") : card ? `on ${card.boardName}` : "not filed yet";
            const who = card?.assigneeName ? `assigned to ${card.assigneeName}` : !shadow && item.fileState === "filed" ? "unassigned" : null;
            return (
              <div key={item.id} className="admin-list-row u-wrap">
                <div className="admin-list-main u-grow">
                  <div className="admin-list-title">{item.title}</div>
                  <div className="admin-list-sub">
                    {[`Owner said: ${item.ownerName ?? "nobody named"}`, who, where, item.dueDate ? `due ${item.dueDate}` : "no date said"].filter(Boolean).join(" · ")}
                  </div>
                  {item.fileNote && item.fileState === "filed" && <div className="admin-list-sub">{item.fileNote}</div>}
                  {item.evidence && (
                    <details className="u-mt-1">
                      <summary className="admin-hint u-pointer">Where it was said</summary>
                      <p className="admin-quote admin-hint u-mt-1">&ldquo;{item.evidence}&rdquo;</p>
                    </details>
                  )}
                </div>
                <div className="admin-list-aside admin-list-aside--row u-wrap">
                  <Badge tone={chip.tone}>{chip.label}</Badge>
                  {card && (
                    <Link href={card.href} className="admin-btn admin-btn--sm">
                      Open card
                    </Link>
                  )}
                  {canMark &&
                    (["useful", "not_useful"] as const).map((mark) => (
                      <button
                        key={mark}
                        type="button"
                        className={`admin-btn admin-btn--sm ${item.shadowMark === mark ? "admin-btn--primary" : ""}`}
                        aria-pressed={item.shadowMark === mark}
                        disabled={pending}
                        onClick={() => run(() => markFollowupItem(meetingId, item.id, mark), mark === "useful" ? "Marked useful." : "Marked not useful.")}
                      >
                        {mark === "useful" ? "Useful" : "Not useful"}
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {theirs.length > 0 && (
        <div className="u-mt-4">
          <div className="admin-shelf-heading">On {client}&apos;s side</div>
          <p className="admin-hint u-m-0">Listed in the follow-up email. Never filed as cards: they are the client&apos;s work, not Edge8&apos;s.</p>
          <ul className="u-list-inset u-mt-1">
            {theirs.map((i) => (
              <li key={i.id}>{i.ownerName ? `${i.ownerName}: ${i.title}` : i.title}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
