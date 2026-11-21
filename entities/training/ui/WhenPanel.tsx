"use client";

// When a session is, with Move and Cancel for its organiser (QS.5c; the
// approved artboard "QS.5b Host way back", row 2). The page draws it only
// before the session starts, the one time either move is allowed, and only for
// a reader its guard and mayRunSession already let run this session (ADR 0014:
// no control a reader cannot use). A Raid's Host moves the time and nothing
// else, so their move sends the date and start alone, at the session's own
// length; an organiser's move keeps the title and notes as they are, because
// their update always writes them.
import { useState, type KeyboardEvent } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { ActionNote } from "./ActionNote";

/**
 * What a move sends: the time alone for a Host, whose move may change nothing
 * else (QS.5b), and for an organiser the title and notes as they are, since
 * their update writes both.
 */
export function moveInput(keep: { title: string; notes: string | null } | null, time: { date: string; start: string; minutes: number }): Record<string, unknown> {
  return keep ? { title: keep.title, ...(keep.notes ? { notes: keep.notes } : {}), ...time } : { ...time };
}

/** Why a move cannot be saved yet, as a form's required fields would say it; null when it can. */
export function moveRefusal(date: string, start: string): string | null {
  if (!date && !start) return "Pick a date and a start time.";
  if (!date) return "Pick a date.";
  if (!start) return "Pick a start time.";
  return null;
}

/** What cancelling says will happen: Quests is named only for a taught session, the kind a fire is lit as. */
export function cancelBody(taught: boolean): string {
  return taught
    ? "It comes off everyone's My Training, and if it was lit as a fire on Quests, the fire goes out and its topic is wanted again. This cannot be undone."
    : "It comes off everyone's My Training. This cannot be undone.";
}

export function WhenPanel({
  sessionId,
  when,
  parts,
  keep,
  taught,
  leaveTo,
  actions,
}: {
  sessionId: string;
  /** "Thu 30 Oct · 16:00 · 20 min", in Vietnam time. */
  when: string;
  /** The session's time as the form shows it back. */
  parts: { date: string; start: string; minutes: number };
  /** The title and notes an organiser's update must carry unchanged; null for a Host, whose move sends the time alone. */
  keep: { title: string; notes: string | null } | null;
  /** A taught session, which a fire on Quests may have been lit as: cancelling says the fire goes out too. */
  taught: boolean;
  /** Where a cancel takes the reader: a Host may hold no session left to open, so they go to their own training; null stays and refreshes. */
  leaveTo: string | null;
  actions: { update: (id: string, input: unknown) => Promise<Result>; cancel: (id: string) => Promise<Result> };
}) {
  const { note, setNote, pending, run, router } = useActionRunner();
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(parts.date);
  const [start, setStart] = useState(parts.start);
  const time = { date, start, minutes: parts.minutes };
  // The fields sit in a div (see below), so what a form would do is done here:
  // an empty date or time is refused with a word, and Enter in either saves.
  const save = () => {
    const refused = moveRefusal(date, start);
    if (refused) return setNote({ tone: "err", text: refused });
    run(() => actions.update(sessionId, moveInput(keep, time)), "Moved.", () => setMoving(false));
  };
  const saveOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!pending) save();
  };
  return (
    <section className="admin-card admin-section-card tr-card" aria-label="When">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">When</h2>
          <p className="tr-hint">{when} · Vietnam time. You can move it or cancel it until it starts.</p>
        </div>
        <div className="tr-when-moves">
          <button type="button" className="admin-btn" aria-expanded={moving} onClick={() => setMoving((m) => !m)} disabled={pending}>
            Move
          </button>
          <ConfirmButton
            label="Cancel the session"
            title="Cancel this session?"
            body={cancelBody(taught)}
            confirmLabel="Cancel the session"
            dismissLabel="Keep it"
            disabled={pending}
            onConfirm={() => actions.cancel(sessionId)}
            onDone={() => (leaveTo ? router.push(leaveTo) : router.refresh())}
          />
        </div>
      </div>
      <ActionNote note={note} />
      {moving && (
        // A div, not a form: the site's bare `form` rule reaches shell pages (globals.css), as the board's drawers learned.
        <div className="admin-form-row tr-when-form" role="group" aria-label="Move the session">
          <label className="admin-field">
            <span className="admin-label">Date</span>
            <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} onKeyDown={saveOnEnter} required aria-required="true" />
          </label>
          <label className="admin-field">
            <span className="admin-label">Starts (Vietnam time)</span>
            <input className="admin-input" type="time" value={start} step={900} onChange={(e) => setStart(e.target.value)} onKeyDown={saveOnEnter} required aria-required="true" />
          </label>
          <span className="tr-hint tr-when-length">{parts.minutes} minutes</span>
          <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending}>
            Save the new time
          </button>
        </div>
      )}
    </section>
  );
}
