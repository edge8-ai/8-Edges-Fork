"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Form } from "./board-view-types";
import {
  HANDOVER_WAIT_MS,
  PICK_DELAY_MS,
  changedBy,
  delayFor,
  handoverPending,
  serverHolds,
  stored,
  unsavedFields,
  type SaveState,
  type SavedField,
} from "./card-autosave";

/** Writes the given fields of a saved card; true when every write landed. */
export type PersistEdits = (form: Form, fields: SavedField[]) => Promise<boolean>;

/** What the drawer needs to show and steer the save (CardSaveStatus, CardHandoverNote). */
export type AutosaveControl = {
  state: SaveState;
  retry: () => void;
  /** The handover line's box gained or lost focus: the reassignment waits while it is in use. */
  noteFocus: (focused: boolean) => void;
};

type Snapshot = { form: Form | null; opened: Form | null; persist: PersistEdits; viewerPersonId: string | null };
type Sent = Partial<Record<SavedField, string | boolean>>;
/**
 * One save: the form to save, whether it skips the handover wait (closing,
 * switching card), the card it was for, and that card's record of values
 * sent. A final job also reports back to whoever is waiting to leave.
 */
type Job = { snap: Snapshot; final: boolean; card: number; sent: Sent; settle?: (ok: boolean) => void };

/**
 * The card drawer saving on its own (TH.3.2). Only the person's edits start a
 * save — they come through `edit`, the drawer's setter — never the board's
 * resync of the live card. One save runs at a time. An edit made while one is
 * running is saved when it finishes, and a final save asked for meanwhile
 * (the drawer closing, another card opening) waits its turn rather than
 * replacing one already waiting. `flush` saves now, handover included, and
 * answers whether it landed, so the drawer can stay on a card whose save
 * failed instead of losing the edit.
 *
 * The timers read the form the drawer last rendered, kept in a ref after each
 * commit, because the callback that set a timer closed over an older render.
 */
export function useCardAutosave({
  form,
  opened,
  setForm,
  viewerPersonId,
  persist,
  onEdit,
}: {
  form: Form | null;
  opened: Form | null;
  setForm: Dispatch<SetStateAction<Form | null>>;
  viewerPersonId: string | null;
  persist: PersistEdits;
  /** Told which fields the person changed, before their save is scheduled. */
  onEdit: (changed: (keyof Form)[], after: Form) => void;
}) {
  const [state, setState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Snapshot>({ form, opened, persist, viewerPersonId });
  const running = useRef(false);
  // Waiting for the running save: final saves in the order asked, and
  // whether the open card was edited meanwhile.
  const finals = useRef<Job[]>([]);
  const again = useRef(false);
  // Stored values just sent, until the board's refresh brings them back. A
  // new object per card, so a save still finishing for the last card writes
  // into that card's record, not this one's.
  const sent = useRef<Sent>({});
  // A reassignment waits for its line: while the box is in use, or until the
  // wait runs out if the box was never touched.
  const hold = useRef({ until: 0, focused: false, touched: false });
  // Which card the status speaks for: a save for the card the drawer just left
  // must not paint its answer on the next one.
  const card = useRef(0);
  // The fields of the save now running, until it answers.
  const inFlight = useRef<SavedField[]>([]);
  // Whether the board page is still there, for questions asked after a wait.
  const alive = useRef(true);

  useEffect(() => {
    latest.current = { form, opened, persist, viewerPersonId };
  });

  const job = (final: boolean): Job => ({ snap: latest.current, final, card: card.current, sent: sent.current });
  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const schedule = (ms: number) => {
    stopTimer();
    timer.current = setTimeout(() => void run(job(false)), ms);
  };
  const waitingForLine = (f: Form, viewer: string | null) =>
    handoverPending(f, viewer) && (hold.current.focused || (!hold.current.touched && Date.now() < hold.current.until));

  async function run(j: Job): Promise<boolean> {
    if (!j.final) timer.current = null;
    const { form: f, opened: o } = j.snap;
    if (!f?.id || !o) return true;
    if (running.current) {
      if (!j.final) {
        again.current = true;
        return true;
      }
      return new Promise<boolean>((settle) => finals.current.push({ ...j, settle }));
    }
    const mine = () => j.card === card.current;
    const lineWait = !j.final && waitingForLine(f, j.snap.viewerPersonId);
    const fields = unsavedFields(f, o, j.sent).filter((k) => !(lineWait && k === "assigneeId"));
    if (fields.length === 0) {
      if (lineWait && !hold.current.focused) schedule(Math.max(0, hold.current.until - Date.now()));
      if (mine()) setState(lineWait ? "saving" : "saved");
      return true;
    }
    running.current = true;
    inFlight.current = fields;
    if (mine()) setState("saving");
    const values = Object.fromEntries(fields.map((k) => [k, stored(k, f[k])]));
    const ok = await j.snap.persist(f, fields).catch(() => false);
    running.current = false;
    inFlight.current = [];
    if (ok) Object.assign(j.sent, values);
    // The saves that waited go now, oldest first, each answering its caller.
    while (finals.current.length > 0) {
      const next = finals.current.shift()!;
      next.settle?.(await run(next));
    }
    const more = again.current || (ok && lineWait);
    again.current = false;
    if (more) schedule(PICK_DELAY_MS);
    if (mine()) setState(!ok ? "failed" : more ? "saving" : "saved");
    return ok;
  }

  // Closing the board page mid-pause still saves what was typed. `alive` is
  // set on every mount, not only at first: React's StrictMode mounts, unmounts
  // and mounts again in development, and a flag left false by that rehearsal
  // made every leave that waited for a save refuse to close the drawer.
  useEffect(
    () => {
      alive.current = true;
      return () => {
        alive.current = false;
        stopTimer();
        void run(job(true));
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on unmount: `run` reads the refs, not the render
    [],
  );

  /** The drawer's setter. An edit to a saved card schedules its save. */
  const edit: Dispatch<SetStateAction<Form | null>> = (next) => {
    const before = latest.current.form;
    const after = typeof next === "function" ? next(before) : next;
    setForm(next);
    const changed = changedBy(before, after);
    if (!after?.id || changed.length === 0) return;
    onEdit(changed, after);
    for (const k of changed) delete sent.current[k as SavedField];
    if (changed.includes("assigneeId")) hold.current = { until: Date.now() + HANDOVER_WAIT_MS, focused: false, touched: false };
    setState("saving");
    schedule(delayFor(changed, after, viewerPersonId));
  };

  return {
    edit,
    /** Save now, without waiting for a pause or a handover line; true when it landed. */
    flush: (): Promise<boolean> => {
      stopTimer();
      return run(job(true));
    },
    /** A card opened in the drawer starts with nothing sent and nothing held. */
    reset: () => {
      stopTimer();
      card.current += 1;
      sent.current = {};
      hold.current = { until: 0, focused: false, touched: false };
      setState("saved");
    },
    /** A step outside autosave (Create card's later ones) failed on this card. */
    markFailed: () => setState("failed"),
    /** Which card the drawer holds now, to tell after an await whether it moved on. */
    current: () => card.current,
    /** The board page is still mounted. */
    alive: () => alive.current,
    /**
     * A field whose value the server has not confirmed yet: it is being sent,
     * or was sent and the board has not come back with it. Its edit stays the
     * person's until then, even when it reads like what the drawer opened with.
     */
    unconfirmed: (k: SavedField) => {
      const { form: f, opened: o } = latest.current;
      if (inFlight.current.includes(k)) return true;
      return !!f && !!o && k in sent.current && sent.current[k] !== stored(k, serverHolds(k, f, o));
    },
    /** Nothing to save and nothing saving: leaving needs no wait. */
    idle: () => {
      const { form: f, opened: o } = latest.current;
      const unsaved = !!f?.id && !!o && unsavedFields(f, o, sent.current).length > 0;
      return !running.current && !timer.current && finals.current.length === 0 && !unsaved;
    },
    control: {
      state,
      retry: () => schedule(0),
      noteFocus: (focused: boolean) => {
        hold.current = { ...hold.current, focused, touched: true };
        if (!focused) schedule(0);
      },
    } satisfies AutosaveControl,
  };
}
