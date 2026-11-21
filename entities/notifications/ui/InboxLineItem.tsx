"use client";

// One row of the inbox (TH.2): the unread dot in the margin, who acted (or the
// kind's icon when no one person did), the sentence, the words it quotes, and
// when. No hooks, so both lists draw it.
//
// Opening a row marks it read FIRST and then navigates: a plain link would
// leave the page while the mark was still in flight and lose it. A modified
// click (new tab) is left to the browser.
import type { ReactNode } from "react";
import { Icon } from "@/kernel/ui/Icon";
import type { InboxRow } from "./inbox-rows";

export function InboxLineItem({ row, onOpen, aside }: { row: InboxRow; onOpen: (href: string) => void; aside?: ReactNode }) {
  const href = row.href;
  const title = href ? (
    <a
      href={href}
      className="inbox-title"
      data-inbox-open=""
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(href);
      }}
    >
      {row.title}
    </a>
  ) : (
    <span className="inbox-title">{row.title}</span>
  );
  return (
    <div className={`inbox-row${row.unread ? " is-unread" : " is-read"}`} data-inbox-row="">
      <span className="inbox-dot" aria-hidden="true" />
      {row.unread && <span className="u-sr-only">Unread. </span>}
      {row.face ? (
        // Who acted (TH.2.8): the product's 28 px avatar, their photo or their
        // initials. A row no one person raised keeps the kind's icon.
        <span className="admin-avatar admin-avatar--md inbox-face" aria-hidden="true">
          {row.face.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
            <img src={row.face.avatarUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            row.face.initials
          )}
        </span>
      ) : (
        <span className="inbox-icon" aria-hidden="true">
          <Icon name={row.icon} />
        </span>
      )}
      <div className="inbox-main">
        {title}
        {row.body && <p className={`inbox-quote${row.kind === "card.assigned" ? " is-handover" : ""}`}>{row.body}</p>}
        <div className="inbox-meta">
          {row.done && <span className="inbox-tag">Done</span>}
          {[row.bundle, row.when].filter(Boolean).join(" · ")}
        </div>
      </div>
      {aside && <div className="inbox-aside">{aside}</div>}
    </div>
  );
}
