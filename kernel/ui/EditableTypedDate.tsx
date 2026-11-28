"use client";

import { useId, useRef, useState } from "react";
import { formatDate } from "@/kernel/ui/format";
import { isoToDmy, maskDmy, parseDmy } from "@/kernel/ui/dmy-date";
import { SaveNote, useSynced, type Save } from "./inline-edit-core";

// A date typed as DD/MM/YYYY, for a date someone already knows and would
// rather type than find in a calendar. The value and onSave speak calendar
// dates (YYYY-MM-DD, "" for none). A typo is refused before it is sent: Enter
// keeps the field open with the reason under it, and leaving the field puts
// the saved date back with the reason beside it, so nothing half-typed saves.
export function EditableTypedDate({
  value,
  onSave,
  validate,
  placeholder = "Set date…",
  ariaLabel,
}: {
  value: string;
  onSave: Save;
  /** A rule beyond "is a real date" (not after today, not before another date): the reason, or null. */
  validate?: (iso: string) => string | null;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [current, setCurrent] = useSynced(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Enter and Escape close the field themselves; the blur that can follow
  // the input leaving the page must not commit a second time.
  const settled = useRef(false);
  const hintId = useId();

  function start() {
    settled.current = false;
    setDraft(current ? isoToDmy(current) : "");
    setError(null);
    setEditing(true);
  }

  async function commit(fromBlur: boolean) {
    if (settled.current) return;
    const text = draft.trim();
    const refuse = (reason: string) => {
      if (!fromBlur) return setError(reason);
      settled.current = true;
      setEditing(false);
      setError(`Not saved: ${reason}`);
    };
    let next = "";
    // An untouched date is not re-checked: a rule added after it was saved
    // must not trap someone who only clicked in and out.
    if (text !== (current ? isoToDmy(current) : "") && text) {
      const parsed = parseDmy(text);
      if (!parsed.ok) return refuse(parsed.error);
      const wrong = validate?.(parsed.iso);
      if (wrong) return refuse(wrong);
      next = parsed.iso;
    } else if (text) {
      next = current;
    }
    settled.current = true;
    setEditing(false);
    setError(null);
    if (next === current) return;
    setSaving(true);
    const r = await onSave(next);
    setSaving(false);
    if (r.ok) setCurrent(next);
    else setError(r.error);
  }

  if (!editing) {
    return (
      <span className="admin-editable-row">
        <button type="button" className="admin-editable" aria-label={ariaLabel} onClick={start}>
          {current ? formatDate(current) : <span className="admin-editable-empty">{placeholder}</span>}
        </button>
        <SaveNote saving={saving} error={error} />
      </span>
    );
  }
  return (
    <span className="admin-editable-typed">
      <input
        className="admin-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="DD/MM/YYYY"
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        onChange={(e) => {
          setDraft(maskDmy(e.target.value, draft));
          setError(null);
        }}
        onBlur={() => void commit(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(false);
          } else if (e.key === "Escape") {
            e.nativeEvent.stopImmediatePropagation();
            settled.current = true;
            setError(null);
            setEditing(false);
          }
        }}
      />
      <span id={hintId} className={error ? "admin-editable-note admin-editable-note--err" : "admin-hint"}>
        {error ?? "DD/MM/YYYY · Enter saves, Esc cancels"}
      </span>
    </span>
  );
}
