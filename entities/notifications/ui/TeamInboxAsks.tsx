"use client";

// "From teammates" on the team Inbox (TH.8): what a teammate asked of the
// person and is not done yet. It leads the page because it is the only part
// where someone is waiting, and it is what the sidebar's count counts. Each
// row is one link (the whole row opens the card in place), with one primary
// action, Remind me tomorrow (TH.8.3), which puts it away until nine the next
// morning, and Done, which takes it off; both offer Undo.
//
// No hooks here: the page owns what a click does (use-inbox-actions).
import type { NotificationKind } from "@/entities/notifications/lib/kinds";
import { Icon } from "@/kernel/ui/Icon";
import type { InboxRow } from "./inbox-rows";
import { openWith } from "./open-in-place";

/** What kind of ask a row is, said under it. */
const SOURCE: Partial<Record<NotificationKind, string>> = {
  "card.assigned": "Handed to you",
  "card.mentioned": "Mention",
  "card.commented": "Comment on your card",
  "approval.waiting": "Approval",
  "card.replied": "Reply to you",
  "blocker.handed": "Blocker",
  "coaching.one_on_one": "1-1",
  "review.needs_you": "Review",
};

export function TeamInboxAsks({
  asks,
  pending,
  onOpen,
  onDone,
  onLater,
}: {
  asks: InboxRow[];
  pending: boolean;
  onOpen: (row: InboxRow) => (href: string) => void;
  onDone: (row: InboxRow) => void;
  /** Remind me tomorrow; null where the page has no snooze. */
  onLater: ((row: InboxRow) => void) | null;
}) {
  return (
    <section className="ti-card ti-sec" aria-labelledby="ti-asks-h">
      <div className="ti-sec-head">
        <div>
          <p className="ti-k">Waiting on you</p>
          <h2 className="ti-h" id="ti-asks-h">
            From teammates
          </h2>
        </div>
        <span className={asks.length ? "ti-pill" : "ti-pill ti-pill-calm"}>{asks.length ? `${asks.length} waiting` : "Nothing waiting"}</span>
      </div>
      {asks.length === 0 ? (
        <div className="ti-empty">
          <svg width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden="true">
            <path className="ti-ground" d="M6 70h108" strokeWidth="2" strokeLinecap="round" />
            <path className="ti-trail" d="M10 22c18 2 26 14 40 22" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" />
            <g transform="translate(50 40) rotate(14)">
              <path className="ti-plane" d="M0 18 42 0 30 34 20 24Z" strokeWidth="2" strokeLinejoin="round" />
              <path className="ti-plane-fold" d="M42 0 20 24 19 33 25 27" strokeWidth="2" strokeLinejoin="round" />
            </g>
          </svg>
          <div>
            <p className="ti-empty-h">Nobody is waiting on you right now.</p>
            <p className="ti-empty-p">When a teammate mentions you, hands you a card or replies to you, it lands here first, and the count on Inbox shows it.</p>
          </div>
        </div>
      ) : (
        <div>
          {asks.map((row) => (
            <article key={row.ids[0]} className={`ti-ask${row.unread ? " is-unread" : ""}`} data-inbox-row="">
              <span className="ti-av" aria-hidden="true">
                {row.face?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                  <img src={row.face.avatarUrl} alt="" loading="lazy" decoding="async" />
                ) : row.face ? (
                  row.face.initials
                ) : (
                  <Icon name={row.icon} />
                )}
              </span>
              <div>
                {row.unread && <span className="u-sr-only">Unread. </span>}
                {row.href ? (
                  <a className="ti-link" href={row.href} data-inbox-open="" onClick={openWith(row.href, onOpen(row))}>
                    <p className="ti-ask-t">{row.title}</p>
                  </a>
                ) : (
                  <p className="ti-ask-t">{row.title}</p>
                )}
                {row.body && <p className={`ti-quote${row.kind === "card.assigned" ? " is-handover" : ""}`}>{row.body}</p>}
                <p className="ti-meta">{[SOURCE[row.kind], row.bundle, row.when].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="ti-ask-acts">
                {row.href && (
                  <button type="button" className="ti-btn" disabled={pending} onClick={() => onOpen(row)(row.href as string)}>
                    {row.action}
                  </button>
                )}
                {onLater && (
                  <button type="button" className="ti-icbtn" aria-label="Remind me tomorrow" title="Remind me tomorrow" disabled={pending} onClick={() => onLater(row)}>
                    <Icon name="clock" />
                  </button>
                )}
                <button type="button" className="ti-icbtn" data-inbox-done="" aria-label="Done" title="Done (E)" disabled={pending} onClick={() => onDone(row)}>
                  <Icon name="check" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="ti-keys">
        <kbd>J</kbd> <kbd>K</kbd> move · <kbd>Enter</kbd> open · <kbd>E</kbd> done
      </p>
    </section>
  );
}
