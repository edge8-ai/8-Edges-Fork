"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchesPersonQuery } from "@/kernel/config/people-name";

// Searchable person picker. Replaces the plain <select> everywhere a person is
// chosen: issue assignee, metric owner, equipment custody, leave request,
// hiring manager, event staff.
//
// A native select is fine for five options and unusable for fifty: no typing,
// no filtering, and on a long list the only way to find someone is to scroll.
// This keeps the same controlled value/onChange contract so call sites swap in
// place, and adds a filter box, keyboard navigation, and optional groups.
//
// Names come from people.display_name via lib/admin/people-options, already
// ordered by first name. This component does not sort; it renders what it is
// given so a caller can group or prioritise.

export type PersonSelectOption = {
  value: string;
  label: string;
  // Options carrying the same group render together under that heading, in the
  // order the groups first appear. Used by Metrics to separate Team from Agents.
  group?: string;
};

export function PersonSelect({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder = "Search a name…",
  disabled = false,
  compact = false,
  id,
  ariaLabel,
  style,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PersonSelectOption[];
  // When set, an explicit "no one" choice is offered with this label, and it is
  // also what the trigger shows while value is empty. Omit to require a choice.
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const all = useMemo<PersonSelectOption[]>(
    () => (emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options),
    [options, emptyLabel],
  );
  // The "no one" row drops out as soon as anything is typed, so Enter on a
  // search lands on a person rather than clearing the field.
  const shown = useMemo(
    () => all.filter((o) => (o.value === "" ? !query.trim() : matchesPersonQuery(o.label, query))),
    [all, query],
  );
  const selected = all.find((o) => o.value === value) ?? null;

  // Close on outside click or Escape. Both live here rather than on the trigger
  // so a click on any other part of the page dismisses the popover.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  // Keep the highlight on a row that still exists as the filter narrows.
  useEffect(() => setActive(0), [query]);

  function choose(option: PersonSelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!shown.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = shown[active];
      if (option) choose(option);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  // Group headings are emitted inline, on the first option of each group, so
  // the flat `shown` array stays the single source of index truth for the
  // keyboard handler.
  let lastGroup: string | undefined;

  return (
    <div
      ref={rootRef}
      className={`admin-personsel${compact ? " admin-personsel--compact" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      <button
        type="button"
        id={id}
        className="admin-personsel-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected && selected.value ? "" : "admin-personsel-empty"}>
          {selected ? selected.label : (emptyLabel ?? "Select…")}
        </span>
        <svg className="admin-personsel-caret" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="admin-personsel-pop">
          <input
            ref={inputRef}
            className="admin-personsel-input"
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
          />
          <ul className="admin-personsel-list" id={listId} role="listbox">
            {shown.map((o, i) => {
              const heading = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={o.value || "__none"}>
                  {heading && <div className="admin-personsel-group">{heading}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    className={`admin-personsel-option${i === active ? " is-active" : ""}${
                      o.value === value ? " is-selected" : ""
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                  >
                    {o.label}
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="admin-personsel-none">No one matches “{query}”</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
