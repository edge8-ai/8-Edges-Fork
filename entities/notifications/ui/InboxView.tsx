"use client";

// The admin Inbox's body (S.3, TH.2), laid out as the approved canvas. The
// team Inbox has its own page since TH.8 (TeamInboxView), in the team hub's
// language; both share what a row does (use-inbox-actions).
//  - "Needs you": the requests a person has not marked done. Done takes a row
//    off (undo is a click away), and read is separate from it, as in GitHub and
//    ClickUp. Each row has one primary action and a Done check, in one column.
//  - "What happened": everything else by day, read rows greyed in place.
//  - "What lands here": the kinds and the Lark switch.
// It is a page people choose to open: the only number is how many requests
// wait, which says what state the list is in, and nothing badges elsewhere.
//
// The actions arrive as props because each surface guards its own (ADR 0007);
// the times arrive already worded because formatting a date in the browser is
// how a server render and a client render come to disagree.
import { Icon } from "@/kernel/ui/Icon";
import { InboxLineItem } from "./InboxLineItem";
import { InboxPrefs } from "./InboxPrefs";
import type { InboxDay, InboxRow } from "./inbox-rows";
import { useInboxActions, type InboxActions } from "./use-inbox-actions";

export type { InboxActions };
export type InboxPref = { kind: string; label: string; muted: boolean; alwaysOn: boolean };

export function InboxView({
  needs,
  days,
  prefs,
  larkEcho,
  myWeekHref,
  actions,
}: {
  needs: InboxRow[];
  days: InboxDay[];
  prefs: InboxPref[];
  larkEcho: boolean;
  /** Where the empty "Needs you" points for late cards; null where the page has no My week. */
  myWeekHref: string | null;
  actions: InboxActions;
}) {
  const { root, pending, error, toast, run, open, done, mute, undo } = useInboxActions(actions);

  const anyUnread = days.some((d) => d.rows.some((r) => r.unread));
  const newCount = needs.filter((r) => r.unread).length;

  return (
    <div ref={root} className="inbox">
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <section className="admin-card admin-section-card" aria-labelledby="inbox-needs-h">
        <div className="admin-card-head">
          <h2 className="admin-card-title" id="inbox-needs-h">
            Needs you
          </h2>
          <span className="admin-hint">{needs.length === 0 ? "All done" : `${needs.length} to do${newCount ? `, ${newCount} new` : ""}`}</span>
        </div>
        {needs.length === 0 ? (
          <p className="inbox-empty">
            <b>Nothing is waiting on you.</b>
            {myWeekHref && (
              <>
                {" "}
                Your week, late cards included, is on <a href={myWeekHref}>My week</a>.
              </>
            )}
          </p>
        ) : (
          <div className="inbox-list">
            {needs.map((row) => (
              <InboxLineItem
                key={row.ids[0]}
                row={row}
                onOpen={open(row)}
                aside={
                  <>
                    {row.href && (
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--primary inbox-act" disabled={pending} onClick={() => open(row)(row.href as string)}>
                        {row.action}
                      </button>
                    )}
                    <button type="button" className="inbox-check" data-inbox-done="" aria-label="Done" title="Done (E)" disabled={pending} onClick={() => done(row)}>
                      <Icon name="check" />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
        <p className="inbox-keys">
          <kbd>J</kbd> <kbd>K</kbd> move · <kbd>Enter</kbd> open · <kbd>E</kbd> done
        </p>
      </section>

      <section className="admin-card admin-section-card" aria-labelledby="inbox-happened-h">
        <div className="admin-card-head">
          <h2 className="admin-card-title" id="inbox-happened-h">
            What happened
          </h2>
          <div className="inbox-head-r">
            <span className="admin-hint">Read ones stay here for 30 days</span>
            {anyUnread && (
              <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(actions.markAllRead)}>
                Mark all read
              </button>
            )}
          </div>
        </div>
        {days.length === 0 ? (
          <p className="inbox-empty">Nothing has happened on your work in the last 30 days.</p>
        ) : (
          days.map((d) => (
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

      <InboxPrefs
        prefs={prefs}
        larkEcho={larkEcho}
        pending={pending}
        onMute={mute}
        onLarkEcho={(on) => run(() => actions.setLarkEcho(on))}
      />

      {toast && (
        <div className="inbox-toast" role="status">
          {toast.text}
          <button type="button" onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
