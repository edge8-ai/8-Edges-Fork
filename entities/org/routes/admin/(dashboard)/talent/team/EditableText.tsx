"use client";

import { useState } from "react";

// A click-to-edit text value inside a Team drawer <dd>: a button showing the
// value, an input while editing, saved on blur or Enter. Escape cancels the
// edit without closing the drawer: DetailDrawer's Escape-to-close listener
// lives on `document`, the same node React delegates its events to, so only
// stopImmediatePropagation on the native event stops that sibling listener.
// Its own file since S.23.5, so TeamShelf and TeamNameFields share one copy.
export function EditableText({
  value,
  onSave,
  type = "text",
  placeholder = "Add…",
  listId,
  options,
  hint,
}: {
  value: string;
  onSave: (v: string) => void;
  type?: string;
  placeholder?: string;
  listId?: string;
  options?: string[];
  // Shown under the input while editing.
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className="admin-editable"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value ? value : <span className="admin-editable-empty">{placeholder}</span>}
      </button>
    );
  }
  const commitDraft = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  return (
    <>
      <input
        className="admin-input"
        type={type}
        autoFocus
        value={draft}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.nativeEvent.stopImmediatePropagation();
            setDraft(value);
            setEditing(false);
          }
        }}
      />
      {hint && <div className="admin-hint u-mt-1">{hint}</div>}
      {listId && options && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  );
}
