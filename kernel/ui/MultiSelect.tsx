"use client";

import { useState } from "react";

export type MultiSelectOption = { value: string; label: string };

// A toolbar filter that takes several values: a select-styled button that
// reads "All clients" / "Acme, Globex" / "3 clients", and a popover of
// checkboxes. Nothing is selected = no filter. The popover follows the OS's
// one menu pattern (absolute flyout + full-screen click-catcher, see the
// record kebab in admin.css); there is no other menu primitive to share.
//
// `name` switches the trigger to the compact form (W.89): the filter's name
// and a count of the values chosen in it, rather than the values themselves.
// A row of seven pickers cannot afford triggers that grow with their contents
// — every tick would move the controls beside it — and a row of names reads as
// the questions you may ask, where a row of answers reads as prose. The
// answers are not lost: the trigger's tooltip carries them, and the filter
// sentence under the toolbar spells each one out with its own dismiss.
export function MultiSelect({
  label,
  noun,
  name,
  options,
  value,
  onChange,
  single = false,
}: {
  // The aria label and the "All …" wording: label "Filter by client", noun "clients".
  label: string;
  noun: string;
  /** Compact trigger: this name plus a count, instead of the chosen values. */
  name?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * One choice at a time (the Workboard's week filter, W.176): radios. A
   * pointer pick closes the menu; arrowing through the radios applies each
   * one as a native select does and keeps the menu open, so a keyboard reader
   * can move down the list without it closing under them. The trigger is the same named button, so a filter
   * of either kind is as wide as its name and not as wide as its value (W.89).
   */
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => value.includes(o.value));
  const text =
    chosen.length === 0 ? `All ${noun}` : chosen.length <= 2 ? chosen.map((o) => o.label).join(", ") : `${chosen.length} ${noun}`;

  function toggle(v: string) {
    if (single) {
      onChange([v]);
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className={`admin-select admin-multiselect-btn${name ? " admin-multiselect-btn--named" : ""}${chosen.length ? " is-filtering" : ""}`}
        aria-label={label}
        title={name && chosen.length > 0 ? chosen.map((o) => o.label).join(", ") : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {name ? (
          <>
            {name}
            {chosen.length > 0 && <span className="admin-multiselect-count">{chosen.length}</span>}
          </>
        ) : (
          text
        )}
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu admin-multiselect-menu" role="listbox" aria-label={label} aria-multiselectable={!single}>
            {options.map((o) => (
              <label
                key={o.value}
                className="admin-multiselect-item"
                role="option"
                aria-selected={value.includes(o.value)}
                // A pointer click has a detail of 1 or more; the click an arrow
                // key or Space synthesises has 0 and leaves the menu open. The
                // pointer path picks here as well as closing: closing unmounts
                // the radio before the browser forwards the click to it, so
                // its change would never arrive.
                onClick={
                  single
                    ? (e) => {
                        if (e.detail === 0) return;
                        onChange([o.value]);
                        setOpen(false);
                      }
                    : undefined
                }
              >
                <input type={single ? "radio" : "checkbox"} name={single ? label : undefined} checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
            {chosen.length > 0 && (
              <button type="button" className="admin-auth-link admin-multiselect-clear" onClick={() => onChange([])}>
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
