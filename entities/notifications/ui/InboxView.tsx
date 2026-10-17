"use client";

// The inbox page's body (S.3, TH.2), shared by /team/inbox and /admin/inbox,
// laid out as the approved canvas:
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
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";
import { Icon } from "@/kernel/ui/Icon";
import { InboxLineItem } from "./InboxLineItem";
import { InboxPrefs } from "./InboxPrefs";
import type { InboxDay, InboxRow } from "./inbox-rows";

export type InboxPref = { kind: string; label: string; muted: boolean; alwaysOn: boolean };
export type InboxActions = {
  markRead: (ids: string[]) => Promise<Result>;
  markAllRead: () => Promise<Result>;
  markDone: (ids: string[]) => Promise<Result>;
  undoDone: (ids: string[]) => Promise<Result>;
  setMuted: (kind: string, muted: boolean) => Promise<Result>;
  setLarkEcho: (on: boolean) => Promise<Result>;
};

type Toast = { ids: string[]; text: string };

/** Keys a list handles only when the person is not typing somewhere. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

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
  const router = useRouter();
  const [pending, start] = useTransition();
  // A failed action says so; a refresh that quietly shows the old state reads
  // as the click having done nothing.
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const run = (work: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await work();
      setError(r.ok ? null : r.error);
      if (r.ok) after?.();
      router.refresh();
    });

  // A card opened in place (TH.2.6) is this page's own address with ?card=,
  // so the list stays where it was scrolled; any other link is a new page.
  const open = (row: InboxRow) => (href: string) =>
    start(async () => {
      if (row.unread) await actions.markRead(row.ids);
      router.push(href, { scroll: !href.startsWith(`${window.location.pathname}?`) });
    });

  const done = (row: InboxRow) => run(() => actions.markDone(row.ids), () => setToast({ ids: row.ids, text: "Marked done" }));
  const undo = () => {
    if (!toast) return;
    const ids = toast.ids;
    setToast(null);
    run(() => actions.undoDone(ids));
  };

  // The toast leaves on its own; Undo stays a click away while it shows.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  // J and K move between rows, Enter opens (the row's own link), E marks a
  // request done — GitHub's and Linear's keys. Only while not typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      // A card's drawer open over the list (TH.2.6) has the keyboard: J, K and
      // E must not move or finish rows hidden behind it.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "e") return;
      const links = [...(root.current?.querySelectorAll<HTMLElement>("[data-inbox-open]") ?? [])];
      if (links.length === 0) return;
      const at = links.indexOf(document.activeElement as HTMLElement);
      if (key === "e") {
        const check = (document.activeElement as HTMLElement | null)?.closest("[data-inbox-row]")?.querySelector<HTMLButtonElement>("[data-inbox-done]");
        if (check) {
          e.preventDefault();
          check.click();
        }
        return;
      }
      e.preventDefault();
      const next = key === "j" ? Math.min(links.length - 1, at + 1) : Math.max(0, at === -1 ? 0 : at - 1);
      links[next]?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        onMute={(kind, muted) => run(() => actions.setMuted(kind, muted))}
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
