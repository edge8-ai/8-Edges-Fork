"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { BoardPerson } from "@/entities/boards/lib/data";
import { insertMention, matchPeople, mentionQuery, mentionsInText } from "./comment-mentions";
import { useDraftFlag } from "./card-drawer-sections";

/**
 * The comment box, for a new thread and for a reply to one (W.143).
 *
 * Typing "@" opens a picker of the people who can be on this board; arrow
 * keys move through it, Enter or a click chooses, and Escape closes the
 * picker WITHOUT closing the drawer around it — the drawer listens for Escape
 * on the document, so the key stops here while the picker is open. Choosing
 * someone writes "@Name" into the text and remembers their id; what is sent is
 * the ids whose name is still in the text, so deleting a name untags them.
 */
export function CommentComposer({
  people,
  saving,
  label,
  submitLabel,
  onSubmit,
  onCancel,
  onDraftChange,
  autoFocus = false,
}: {
  people: BoardPerson[];
  saving: boolean;
  label: string;
  submitLabel: string;
  onSubmit: (body: string, mentions: string[], onSent: () => void) => void;
  onCancel?: () => void;
  /** Told whether the box holds an unsent draft, so a parent can ask before replacing it (W.143). */
  onDraftChange?: (has: boolean) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<BoardPerson[]>([]);
  const [typing, setTyping] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  // The "@" whose picker Escape closed. Without it React's onSelect, which it
  // fires from the same Escape keydown, found the same "@b" and opened the
  // picker again at once, so Escape seemed to do nothing (seen in a browser).
  // A ref, not state: that onSelect runs in the same event, before a state
  // update would be visible to it. A different "@" opens the picker again.
  const dismissed = useRef<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  // An unsent comment or reply counts toward the drawer's "Discard your
  // changes?" question (W.141), under a key of its own so the main box and an
  // open reply box are two drafts, not one.
  const hasDraft = text.trim() !== "";
  useDraftFlag(`composer-${listId}`, hasDraft);
  useEffect(() => onDraftChange?.(hasDraft), [onDraftChange, hasDraft]);

  const matches = typing ? matchPeople(people, typing.query) : [];
  const open = matches.length > 0;

  function track(value: string, caret: number) {
    const found = mentionQuery(value, caret);
    if (found?.start !== dismissed.current) dismissed.current = null;
    const next = found && found.start === dismissed.current ? null : found;
    // A new query starts the highlight at the top; the same query keeps it.
    if (next?.query !== typing?.query) setActive(0);
    setTyping(next);
  }

  function choose(person: BoardPerson) {
    if (!typing) return;
    const caret = box.current?.selectionStart ?? text.length;
    const next = insertMention(text, typing.start, caret, person.name);
    setText(next.text);
    setPicked((p) => (p.some((x) => x.id === person.id) ? p : [...p, person]));
    // This "@" is finished. Left open, the caret landing after "@Ann Lee "
    // read as a query still matching Ann Lee and offered her again.
    dismissed.current = typing.start;
    setTyping(null);
    // Put the caret after the name so typing carries on in the sentence.
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.caret, next.caret);
    });
  }

  // Escape handled here must not also reach the drawer's document listener.
  // In the App Router React's root IS the document, so React's own
  // stopPropagation stops nothing there; stopImmediatePropagation does,
  // because React's root listener was added at hydration, before any drawer's.
  // Proved in a browser: without it the drawer's listener saw every Escape.
  function keepEscape(e: KeyboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) {
      if (e.key === "Escape" && onCancel && !text.trim()) {
        // An empty reply box closes on Escape; the drawer stays open.
        keepEscape(e);
        onCancel();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(matches[Math.min(active, matches.length - 1)]);
    } else if (e.key === "Escape") {
      keepEscape(e);
      dismissed.current = typing?.start ?? null;
      setTyping(null);
    }
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    onSubmit(body, mentionsInText(body, picked), () => {
      setText("");
      setPicked([]);
      setTyping(null);
      dismissed.current = null;
    });
  }

  return (
    <div className="u-row u-mt-2">
      <div className="admin-record-menu-wrap u-grow">
        <textarea
          ref={box}
          className="admin-textarea wb-comment-box"
          rows={1}
          aria-label={label}
          // One line at rest, as the canvas draws it (W.159); it grows as it is typed into.
          placeholder={label === "Add a comment" ? "Write a comment, @ to mention" : `${label}, @ to mention`}
          value={text}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            track(e.target.value, e.target.selectionStart);
          }}
          onSelect={(e) => track(e.currentTarget.value, e.currentTarget.selectionStart)}
          onBlur={() => setTyping(null)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <ul id={listId} className="admin-record-menu wb-mention-menu" role="listbox" aria-label="Mention someone">
            {matches.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`admin-record-menu-item${i === active ? " wb-mention-opt--active" : ""}`}
                // mousedown, not click: a click lands after the textarea's
                // blur has already closed the picker.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
              >
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="wb-comment-buttons">
        {onCancel && (
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            // A written reply is a draft like any other (W.143 review): Cancel
            // asks before throwing it away, the way closing the drawer does.
            onClick={() => (!hasDraft || window.confirm("Discard this reply?")) && onCancel()}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        <button type="button" className="admin-btn u-self-end" onClick={send} disabled={saving || !text.trim()}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
