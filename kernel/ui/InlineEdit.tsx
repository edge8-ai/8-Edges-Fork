"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { formatDate } from "@/kernel/ui/format";
import { Expandable } from "./Expandable";

// Read-first click-to-edit fields for record detail rails: a value renders as
// text and swaps to an input on click, committing on blur / Enter and reporting
// its own saving / error state. Generalized from the Team roster shelf's local
// editors, made async so each field persists through a server action and surfaces
// the outcome in place. Pair with the existing .admin-kv--editable / .admin-editable
// CSS. Optimistic: a committed value shows immediately without waiting for a
// parent refetch, and still re-syncs if the parent later passes a new value.

export type InlineSaveResult = { ok: true } | { ok: false; error: string };
type Save = (value: string) => Promise<InlineSaveResult>;

// DetailDrawer listens for Escape on document (the same node React delegates to),
// so a plain stopPropagation cannot cancel an edit without also closing the
// drawer. stopImmediatePropagation on the native event does.
function stopEsc(e: React.KeyboardEvent) {
  if (e.key === "Escape") e.nativeEvent.stopImmediatePropagation();
}

function SaveNote({ saving, error }: { saving: boolean; error: string | null }) {
  if (saving) return <span className="admin-cell-muted admin-editable-note">saving…</span>;
  if (error) return <span className="admin-editable-note admin-editable-note--err">{error}</span>;
  return null;
}

// Adjust local state when the incoming value prop actually changes (parent
// refetch), without clobbering an in-flight optimistic value during typing.
function useSynced(value: string): [string, (v: string) => void] {
  const [current, setCurrent] = useState(value);
  const seen = useRef(value);
  if (seen.current !== value) {
    seen.current = value;
    setCurrent(value);
  }
  return [current, setCurrent];
}

export function EditableText({
  value,
  onSave,
  type = "text",
  placeholder = "Add…",
  ariaLabel,
  render,
  fallback,
}: {
  value: string;
  onSave: Save;
  type?: string;
  placeholder?: string;
  ariaLabel?: string;
  render?: (value: string) => ReactNode;
  // Shown (with an "AI" tag) when the field is empty, in place of the placeholder —
  // e.g. the AI-screen value a recruiter hasn't overridden yet. Editing starts
  // empty, so saving records the recruiter's own value and the tag drops away.
  fallback?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [current, setCurrent] = useSynced(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setEditing(false);
    if (draft === current) return;
    const next = draft;
    setSaving(true);
    setError(null);
    const r = await onSave(next);
    setSaving(false);
    // The onSave wrappers persist `.trim() || null`, so mirror that in the
    // optimistic value: a whitespace-only entry becomes empty (placeholder
    // returns) rather than a blank, untrimmed string that no longer matches.
    if (r.ok) setCurrent(next.trim());
    else setError(r.error);
  }

  if (!editing) {
    return (
      <span className="admin-editable-row">
        <button
          type="button"
          className="admin-editable"
          aria-label={ariaLabel}
          onClick={() => {
            setDraft(current);
            setError(null);
            setEditing(true);
          }}
        >
          {current ? (
            render ? render(current) : current
          ) : fallback ? (
            <span className="admin-editable-fallback">
              {fallback}
              <span className="admin-editable-aitag">AI</span>
            </span>
          ) : (
            <span className="admin-editable-empty">{placeholder}</span>
          )}
        </button>
        <SaveNote saving={saving} error={error} />
      </span>
    );
  }
  return (
    <input
      className="admin-input"
      type={type}
      autoFocus
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.nativeEvent.stopImmediatePropagation();
          setDraft(current);
          setEditing(false);
        }
      }}
    />
  );
}

// A URL field: the value reads as a real clickable link (opens in a new tab) with
// a small pencil to edit — a link can't live inside the editable button because
// clicking it would enter edit mode instead of navigating.
export function EditableLink({
  value,
  onSave,
  placeholder = "Add link…",
  ariaLabel,
}: {
  value: string;
  onSave: Save;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [current, setCurrent] = useSynced(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setEditing(false);
    if (draft === current) return;
    const next = draft;
    setSaving(true);
    setError(null);
    const r = await onSave(next);
    setSaving(false);
    // The onSave wrappers persist `.trim() || null`, so mirror that in the
    // optimistic value: a whitespace-only entry becomes empty (placeholder
    // returns) rather than a blank, untrimmed string that no longer matches.
    if (r.ok) setCurrent(next.trim());
    else setError(r.error);
  }

  if (editing) {
    return (
      <input
        className="admin-input"
        type="url"
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.nativeEvent.stopImmediatePropagation();
            setDraft(current);
            setEditing(false);
          }
        }}
      />
    );
  }
  const href = current.startsWith("http") ? current : `https://${current}`;
  return (
    <span className="admin-editable-row">
      {current ? (
        <span className="admin-editable-link">
          <a href={href} target="_blank" rel="noreferrer">
            {current.replace(/^https?:\/\//, "")} ↗
          </a>
          <button
            type="button"
            className="admin-editable-pencil"
            aria-label={`Edit ${ariaLabel ?? "link"}`}
            onClick={() => {
              setDraft(current);
              setError(null);
              setEditing(true);
            }}
          >
            ✎
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="admin-editable"
          aria-label={ariaLabel}
          onClick={() => {
            setDraft(current);
            setError(null);
            setEditing(true);
          }}
        >
          <span className="admin-editable-empty">{placeholder}</span>
        </button>
      )}
      <SaveNote saving={saving} error={error} />
    </span>
  );
}

export function EditableTextarea({
  value,
  onSave,
  placeholder = "Add…",
  ariaLabel,
  rows = 3,
  collapsedHeight,
}: {
  value: string;
  onSave: Save;
  placeholder?: string;
  ariaLabel?: string;
  rows?: number;
  // When set, the read view clamps to this height with a Show more toggle. The
  // edit textarea is never clamped.
  collapsedHeight?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [current, setCurrent] = useSynced(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setEditing(false);
    if (draft === current) return;
    const next = draft;
    setSaving(true);
    setError(null);
    const r = await onSave(next);
    setSaving(false);
    // The onSave wrappers persist `.trim() || null`, so mirror that in the
    // optimistic value: a whitespace-only entry becomes empty (placeholder
    // returns) rather than a blank, untrimmed string that no longer matches.
    if (r.ok) setCurrent(next.trim());
    else setError(r.error);
  }

  if (!editing) {
    const display = (
      <div className="admin-editable-row">
        <button
          type="button"
          className="admin-editable admin-editable--block"
          aria-label={ariaLabel}
          onClick={() => {
            setDraft(current);
            setError(null);
            setEditing(true);
          }}
        >
          {current ? (
            <span className="u-prewrap">{current}</span>
          ) : (
            <span className="admin-editable-empty">{placeholder}</span>
          )}
        </button>
        <SaveNote saving={saving} error={error} />
      </div>
    );
    return collapsedHeight ? <Expandable collapsedHeight={collapsedHeight}>{display}</Expandable> : display;
  }
  return (
    <textarea
      className="admin-input"
      rows={rows}
      autoFocus
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={stopEsc}
    />
  );
}

export function EditableSelect({
  value,
  options,
  onSave,
  placeholder = "Set…",
  ariaLabel,
  render,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: Save;
  placeholder?: string;
  ariaLabel?: string;
  render?: (value: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useSynced(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = options.find((o) => o.value === current)?.label ?? current;

  async function commit(next: string) {
    setEditing(false);
    if (next === current) return;
    setSaving(true);
    setError(null);
    const r = await onSave(next);
    setSaving(false);
    // The onSave wrappers persist `.trim() || null`, so mirror that in the
    // optimistic value: a whitespace-only entry becomes empty (placeholder
    // returns) rather than a blank, untrimmed string that no longer matches.
    if (r.ok) setCurrent(next.trim());
    else setError(r.error);
  }

  if (!editing) {
    return (
      <span className="admin-editable-row">
        <button type="button" className="admin-editable" aria-label={ariaLabel} onClick={() => setEditing(true)}>
          {current ? render ? render(current) : label : <span className="admin-editable-empty">{placeholder}</span>}
        </button>
        <SaveNote saving={saving} error={error} />
      </span>
    );
  }
  // Preserve an out-of-vocabulary stored value so re-selecting it stays possible.
  const known = !current || options.some((o) => o.value === current);
  return (
    <select
      className="admin-select"
      autoFocus
      defaultValue={current}
      aria-label={ariaLabel}
      onKeyDown={stopEsc}
      onBlur={() => setEditing(false)}
      onChange={(e) => commit(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {!known && <option value={current}>{current}</option>}
    </select>
  );
}

export function EditableDate({
  value,
  onSave,
  placeholder = "Set date…",
  ariaLabel,
}: {
  value: string;
  onSave: Save;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useSynced(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(next: string) {
    setEditing(false);
    if (next === current) return;
    setSaving(true);
    setError(null);
    const r = await onSave(next);
    setSaving(false);
    // The onSave wrappers persist `.trim() || null`, so mirror that in the
    // optimistic value: a whitespace-only entry becomes empty (placeholder
    // returns) rather than a blank, untrimmed string that no longer matches.
    if (r.ok) setCurrent(next.trim());
    else setError(r.error);
  }

  if (!editing) {
    return (
      <span className="admin-editable-row">
        <button type="button" className="admin-editable" aria-label={ariaLabel} onClick={() => setEditing(true)}>
          {current ? formatDate(current) : <span className="admin-editable-empty">{placeholder}</span>}
        </button>
        <SaveNote saving={saving} error={error} />
      </span>
    );
  }
  return (
    <input
      className="admin-input"
      type="date"
      autoFocus
      defaultValue={current}
      aria-label={ariaLabel}
      onKeyDown={stopEsc}
      onBlur={() => setEditing(false)}
      onChange={(e) => commit(e.target.value)}
    />
  );
}
