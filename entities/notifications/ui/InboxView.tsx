"use client";

// The inbox page's body (S.3), shared by /team/inbox and /admin/inbox. What is
// waiting comes first, then what was read in the last thirty days, then the
// kinds a person can mute. It is a page people choose to open: no counts, no
// badges, and nothing it does reaches outside the page.
//
// The actions arrive as props because each surface guards its own (ADR 0007);
// the times arrive already worded because formatting a date in the browser is
// how a server render and a client render come to disagree.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";

export type InboxRow = { id: string; title: string; body: string | null; href: string | null; when: string };
export type InboxPref = { kind: string; label: string; muted: boolean };
export type InboxActions = {
  markRead: (ids: string[]) => Promise<Result>;
  markAllRead: () => Promise<Result>;
  setMuted: (kind: string, muted: boolean) => Promise<Result>;
};

// Opening an unread item marks it read FIRST and then navigates: a plain link
// would leave the page while the mark was still in flight and lose it.
function Row({ row, onRead, onOpen }: { row: InboxRow; onRead?: () => void; onOpen?: (href: string) => void }) {
  const href = row.href;
  const title = href ? (
    <a
      href={href}
      className="admin-list-title"
      onClick={(e) => {
        if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(href);
      }}
    >
      {row.title}
    </a>
  ) : (
    <div className="admin-list-title">{row.title}</div>
  );
  return (
    <div className="admin-list-row">
      <div className="admin-list-main">
        {title}
        <div className="admin-list-sub">{[row.body, row.when].filter(Boolean).join(" · ")}</div>
      </div>
      {onRead && (
        <div className="admin-list-aside">
          <button type="button" className="admin-btn admin-btn--sm" onClick={onRead}>
            Mark read
          </button>
        </div>
      )}
    </div>
  );
}

export function InboxView({
  unread,
  read,
  prefs,
  actions,
}: {
  unread: InboxRow[];
  read: InboxRow[];
  prefs: InboxPref[];
  actions: InboxActions;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // A failed action says so; a refresh that quietly shows the old state reads
  // as the click having done nothing.
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<Result>) =>
    start(async () => {
      const r = await work();
      setError(r.ok ? null : r.error);
      router.refresh();
    });

  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <section className="admin-card admin-section-card">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Waiting for you</h2>
          {unread.length > 0 && (
            <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(actions.markAllRead)}>
              Mark all read
            </button>
          )}
        </div>
        {unread.length === 0 ? (
          <p className="admin-empty">Nothing has changed on your work since you last looked.</p>
        ) : (
          <div className="admin-list">
            {unread.map((row) => (
              <Row
                key={row.id}
                row={row}
                onRead={() => run(() => actions.markRead([row.id]))}
                onOpen={(href) =>
                  start(async () => {
                    await actions.markRead([row.id]);
                    router.push(href);
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      {read.length > 0 && (
        <section className="admin-card admin-section-card">
          <div className="admin-card-head">
            <h2 className="admin-card-title">Read in the last 30 days</h2>
          </div>
          <div className="admin-list">
            {read.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </div>
        </section>
      )}

      <section className="admin-card admin-section-card">
        <div className="admin-card-head">
          <h2 className="admin-card-title">What lands here</h2>
        </div>
        <p className="admin-hint">Untick a kind and it stops landing in your inbox. Nothing here is ever sent to chat or email.</p>
        <div className="admin-list">
          {prefs.map((p) => (
            <label key={p.kind} className="admin-list-row">
              <span className="admin-list-main">{p.label}</span>
              <input
                type="checkbox"
                checked={!p.muted}
                disabled={pending}
                onChange={(e) => run(() => actions.setMuted(p.kind, !e.target.checked))}
              />
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
