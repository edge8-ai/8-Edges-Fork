"use client";

// What both Inbox pages do with a row (TH.2, shared since TH.8 so the admin
// Inbox and the team Inbox cannot drift apart): open it, mark it done with an
// Undo a click away, and move through the list with GitHub's and Linear's keys.
//
// A failed action says so; a refresh that quietly shows the old state reads as
// the click having done nothing. Every action ends in a refresh, which also
// redraws the team sidebar's count from the server.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";
import type { InboxRow } from "./inbox-rows";

export type InboxActions = {
  markRead: (ids: string[]) => Promise<Result>;
  markAllRead: () => Promise<Result>;
  markDone: (ids: string[]) => Promise<Result>;
  undoDone: (ids: string[]) => Promise<Result>;
  setMuted: (kind: string, muted: boolean) => Promise<Result>;
  setLarkEcho: (on: boolean) => Promise<Result>;
  // TH.8.3: "Remind me tomorrow" on an ask, and its undo. The team Inbox has
  // them; a page without them offers no such button.
  snooze?: (ids: string[]) => Promise<Result>;
  unsnooze?: (ids: string[]) => Promise<Result>;
};

/** What the toast's Undo reverses: a Done, or a Remind me tomorrow. */
type Toast = { ids: string[]; text: string; undoes: "done" | "snooze" };

/** Keys a list handles only when the person is not typing somewhere. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function useInboxActions(actions: InboxActions) {
  const router = useRouter();
  const [pending, start] = useTransition();
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
  const open = (row: { ids: string[]; unread: boolean }) => (href: string) =>
    start(async () => {
      if (row.unread) await actions.markRead(row.ids);
      router.push(href, { scroll: !href.startsWith(`${window.location.pathname}?`) });
    });

  /** Marks these done and offers Undo; `text` is what the toast says. */
  const finish = (ids: string[], text = "Marked done") => run(() => actions.markDone(ids), () => setToast({ ids, text, undoes: "done" }));
  const done = (row: InboxRow) => finish(row.ids);
  /** Puts an ask away until nine tomorrow morning, with Undo (TH.8.3). */
  const { snooze, unsnooze } = actions;
  const later = snooze ? (row: InboxRow) => run(() => snooze(row.ids), () => setToast({ ids: row.ids, text: "Back tomorrow at 9:00", undoes: "snooze" })) : null;
  const undo = () => {
    if (!toast) return;
    const { ids, undoes } = toast;
    setToast(null);
    if (undoes === "snooze") {
      if (unsnooze) run(() => unsnooze(ids));
      return;
    }
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

  /** Mutes or unmutes every kind a settings row stands for, stopping at the first refusal. */
  const mute = (kinds: readonly string[], muted: boolean) =>
    run(async () => {
      for (const kind of kinds) {
        const r = await actions.setMuted(kind, muted);
        if (!r.ok) return r;
      }
      return { ok: true };
    });

  return { root, pending, error, toast, run, open, done, finish, later, mute, undo };
}
