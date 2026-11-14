"use client";

// The team Inbox's body (TH.8), as the approved canvas lays it out
// (https://claude.ai/artifact/X23oprxriPpthYXjvbKmXi): a greeting that says
// whether anyone is waiting, chips that show one part at a time, asks from
// teammates first, the routine's reminders below them, what happened, and a
// rail that says what the sidebar's count counts, beside the settings.
//
// Since TH.11 the decisions that wait on the person lead the page, ahead of
// the asks (https://claude.ai/artifact/3NZjRa4BHJ31Dv1tUvrHXv). Time-off draws
// that section and hands it over through a slot with its count; a deployment
// without it has no Decisions chip.
//
// The actions arrive as props because the page guards its own (ADR 0007), and
// the words arrive already shaped on the server (team-inbox.ts), so the server
// render and the browser's agree.
import { useState, type ReactNode } from "react";
import { InboxLineItem } from "./InboxLineItem";
import { InboxPrefs } from "./InboxPrefs";
import type { InboxPref } from "./InboxView";
import { TeamInboxAsks } from "./TeamInboxAsks";
import { TeamInboxReminders } from "./TeamInboxReminders";
import type { TeamInbox } from "./team-inbox";
import { useInboxActions, type InboxActions } from "./use-inbox-actions";

export type InboxPart = "all" | "decisions" | "asks" | "dates" | "updates";

function headline(waiting: number): string {
  if (waiting === 0) return "Nobody is waiting on you.";
  return waiting === 1 ? "One thing is waiting on you." : `${waiting} things are waiting on you.`;
}

function subline(asks: number, due: number, updates: number): string {
  const parts = [due ? `${due} of your ${due === 1 ? "card" : "cards"} slipped past ${due === 1 ? "its" : "their"} date` : null, updates ? `${updates} ${updates === 1 ? "update" : "updates"} came in` : null].filter(Boolean);
  if (parts.length === 0) return asks ? "Start there. Everything else is quiet." : "Everything is quiet. Enjoy it.";
  const said = parts.join(", and ");
  return asks ? `Start there. ${said[0].toUpperCase()}${said.slice(1)}.` : `${said[0].toUpperCase()}${said.slice(1)}. Take them when you’re ready.`;
}

export function TeamInboxView({
  inbox,
  hello,
  prefs,
  larkEcho,
  myWeekHref,
  actions,
  decisions = null,
  decisionCount = 0,
  initialPart = "all",
}: {
  inbox: TeamInbox;
  /** "Good evening, Khoa", worded on the server by the Saigon clock. */
  hello: string;
  prefs: InboxPref[];
  larkEcho: boolean;
  myWeekHref: string | null;
  actions: InboxActions;
  /** The Decisions section (time-off's, through the inboxDecisions slot); null draws none. */
  decisions?: ReactNode;
  decisionCount?: number;
  /** Which part the page opens on: /team/approvals leads here with "decisions". */
  initialPart?: InboxPart;
}) {
  const { root, pending, error, toast, run, open, done, finish, later, mute, undo } = useInboxActions(actions);
  const [part, setPart] = useState<InboxPart>(decisions || initialPart !== "decisions" ? initialPart : "all");
  const asks = inbox.asks.length;
  const waiting = asks + decisionCount;
  const due = inbox.dueIds.length;
  const shows = (p: InboxPart) => part === "all" || part === p;
  const chips: { key: InboxPart; label: string; n: number }[] = [
    { key: "all", label: "Everything", n: waiting + due + inbox.unreadUpdates },
    ...(decisions ? [{ key: "decisions" as const, label: "Decisions", n: decisionCount }] : []),
    { key: "asks", label: "From teammates", n: asks },
    { key: "dates", label: "Past their date", n: due },
    { key: "updates", label: "Updates", n: inbox.unreadUpdates },
  ];
  const anyUnread = inbox.days.some((d) => d.rows.some((r) => r.unread));

  return (
    <div ref={root} className="ti-page">
      <div className="ti">
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
        <section className="ti-hero" aria-labelledby="ti-head">
          <svg className="ti-hero-art" viewBox="0 0 300 150" fill="none" aria-hidden="true">
            <path className="ti-trail" d="M8 128c40-6 62-30 92-28s38 26 70 18 46-46 78-62" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
            <g transform="translate(228 22) rotate(-12)">
              <path className="ti-plane" d="M0 26 56 0 40 50 27 34Z" strokeWidth="2.4" strokeLinejoin="round" />
              <path className="ti-plane-fold" d="M56 0 27 34 26 48 34 39" strokeWidth="2.4" strokeLinejoin="round" />
            </g>
            <circle className="ti-spark" cx="60" cy="40" r="3" />
            <circle className="ti-spark-blue" cx="150" cy="22" r="2" />
            <circle className="ti-spark" cx="196" cy="118" r="2.5" />
          </svg>
          <p className="ti-hello">{hello}</p>
          <h1 className="ti-head" id="ti-head">
            {headline(waiting)}
          </h1>
          <p className="ti-sub">{subline(waiting, due, inbox.unreadUpdates)}</p>
          <ul className="ti-chips" aria-label="Show">
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" className="ti-chip" aria-pressed={part === c.key} onClick={() => setPart(c.key)}>
                  {c.label} <b>{c.n}</b>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="ti-grid">
          <div className="ti-col">
            {decisions && shows("decisions") && decisions}
            {shows("asks") && <TeamInboxAsks asks={inbox.asks} pending={pending} onOpen={open} onDone={done} onLater={later} />}
            {shows("dates") && (
              <TeamInboxReminders dates={inbox.dates} dueIds={inbox.dueIds} cleared={inbox.cleared} myWeekHref={myWeekHref} pending={pending} onOpen={open} onClear={finish} />
            )}
            {shows("updates") && (
              <section className="ti-card ti-sec ti-updates" aria-labelledby="ti-updates-h">
                <div className="ti-sec-head">
                  <div>
                    <p className="ti-k">For your information</p>
                    <h2 className="ti-h" id="ti-updates-h">
                      What happened
                    </h2>
                  </div>
                  <div className="ti-acts">
                    <span className="admin-hint">Read ones stay here for 30 days</span>
                    {anyUnread && (
                      <button type="button" className="ti-btn ti-btn-ghost" disabled={pending} onClick={() => run(actions.markAllRead)}>
                        Mark all read
                      </button>
                    )}
                  </div>
                </div>
                {inbox.days.length === 0 ? (
                  <p className="ti-empty-p">Nothing has happened on your work in the last 30 days.</p>
                ) : (
                  inbox.days.map((d) => (
                    <div key={d.label} className="inbox-day">
                      <div className="inbox-day-label">{d.label}</div>
                      <div className="inbox-list">
                        {d.rows.map((row) => (
                          <InboxLineItem key={row.ids[0]} row={row} onOpen={open(row)} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}
          </div>

          <aside className="ti-rail" aria-label="How your Inbox works">
            <section className="ti-card ti-panel" aria-labelledby="ti-rule-h">
              <p className="ti-k">The count on Inbox</p>
              <h2 className="ti-h" id="ti-rule-h">
                What waits on you counts
              </h2>
              <div className="ti-rule">
                <div className="ti-rule-row">
                  <span className="ti-rule-mark" aria-hidden="true">
                    <span className="admin-nav-count">3</span>
                  </span>
                  <span>
                    <b>A teammate asked you something, or a decision waits on you.</b> A mention, a card handed to you, a reply, a leave request, a claim to check, a draft to approve. It counts until it is done.
                  </span>
                </div>
                <div className="ti-rule-row">
                  <span className="ti-rule-mark" aria-hidden="true">
                    <span className="ti-rule-quiet" />
                  </span>
                  <span>
                    <b>Reminders and updates stay quiet.</b> Cards past their date and news wait here for when you look. No count, no dot.
                  </span>
                </div>
              </div>
            </section>
            <InboxPrefs
              prefs={prefs}
              larkEcho={larkEcho}
              pending={pending}
              onMute={mute}
              onLarkEcho={(on) => run(() => actions.setLarkEcho(on))}
            />
          </aside>
        </div>
      </div>

      {toast && (
        <div className="ti-toast" role="status">
          {toast.text}
          <button type="button" onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
