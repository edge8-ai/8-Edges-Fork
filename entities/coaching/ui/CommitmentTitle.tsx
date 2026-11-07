"use client";

import { useEffect, useRef, useState } from "react";

// The commitment's own words on the card: three lines on the board, and the
// whole thing the moment you click them.
//
// Both halves answer one complaint. The title was clamped to three lines with
// no way past the clamp, and neither kind of card offered one: a card the
// viewer may reword opened a single-line <input>, which cut the sentence a
// second time, and a card they may not — their coach's promises, in the
// read-only column — opened nothing at all, because the button was disabled.
// A long commitment was unreadable on the board it lives on (2026-09-22).
//
// So clicking the title always opens it, and what "open" means follows from
// who may write it: an owner gets an editor grown to hold the whole sentence,
// and everyone else gets the clamp lifted.

export function CommitmentTitle({
  title,
  canEdit,
  busy,
  onRetitle,
}: {
  title: string;
  canEdit: boolean;
  busy: boolean;
  onRetitle: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const boxRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // The server is the tiebreaker: a refresh after someone else's edit replaces
  // what this card is showing, unless the viewer is mid-edit.
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  // Grow the editor to its content, so opening a long commitment shows all of
  // it. A textarea has no intrinsic height, so its own scrollHeight after the
  // value lands is the only thing that knows how tall the sentence is.
  //
  // The border has to be added back: admin inputs are border-box, where `height`
  // means the whole box, while scrollHeight counts only content and padding.
  // Assigning scrollHeight alone leaves the box two pixels short and clips the
  // last line's descenders — measured, not guessed (offsetHeight - clientHeight
  // is exactly the horizontal borders).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [draft, editing]);

  // Whether the clamp is hiding anything, which is what decides whether a
  // read-only title is clickable at all. Measured rather than guessed from the
  // string's length, because the answer depends on the column's width and the
  // reader's font size and only the browser knows both. Measured only while
  // closed: an opened box always reports scrollHeight === clientHeight, so
  // re-measuring there would say "nothing to see" and take the affordance away
  // mid-read.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || open) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [title, open]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    onRetitle(next);
  }

  if (editing) {
    return (
      <textarea
        ref={editorRef}
        className="admin-input admin-cboard-card-input"
        value={draft}
        rows={1}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter commits rather than breaking the line. The textarea is here
          // to show the whole sentence, not to turn a commitment into prose.
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        aria-label="Commitment"
      />
    );
  }

  // A short read-only title has nothing behind the clamp, so it stays the plain
  // text it always was rather than becoming a control that does nothing.
  const clickable = canEdit || clipped || open;

  return (
    <button
      ref={boxRef}
      type="button"
      className={`admin-cboard-card-title${canEdit ? "" : " is-read"}${open ? " is-open" : ""}`}
      disabled={!clickable || busy}
      aria-expanded={canEdit ? undefined : open}
      onClick={() => (canEdit ? setEditing(true) : setOpen((v) => !v))}
      title={canEdit ? "Click to reword" : clickable ? "Click to read it all" : undefined}
    >
      {title}
    </button>
  );
}
