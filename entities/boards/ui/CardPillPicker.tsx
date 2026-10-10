"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/kernel/ui/Icon";

/**
 * One pill under the card drawer's header, and the small picker it opens
 * (docs/plans/2026-09-29-card-planning-pills.md).
 *
 * EMPTY READS AS EMPTY. Since W.152 an empty field reads "None" in muted ink
 * inside the same outline a value has: it is a field with nothing in it, not
 * an action. (It read "+ Epic", dashed, before; that looked like a button.)
 *
 * THE KEYBOARD IS WHOLE. The pill is a button. The picker opens with focus on
 * its first control, the arrow keys walk its options, Enter chooses. Escape
 * closes the PICKER, not the drawer, and hands focus back to the pill. The
 * picker marks the key handled with preventDefault, and the drawer leaves a
 * handled Escape alone (escapeHandledInside, W.153): stopPropagation alone
 * never kept it from the drawer, whose listener shares `document` with React's.
 *
 * Choosing only changes the form. Nothing is written until Save, like every
 * other field in the drawer, so the close question (W.141) still guards it.
 */
export function CardPillPicker({
  label,
  empty,
  ariaLabel,
  panelLabel,
  className,
  caret,
  children,
}: {
  /** What the pill reads: the value, or "None" when there is none. */
  label: ReactNode;
  empty: boolean;
  /** The pill's accessible name, which says what pressing it does. */
  ariaLabel: string;
  /** The picker's accessible name. */
  panelLabel: string;
  /** An extra class on the chip, for a chip the canvas draws differently (the tinted status chip, W.159). */
  className?: string;
  /** Draw the opening caret; by default only on a chip that holds a value. The canvas draws it on status, epic and sprint, empty or not (W.159). */
  caret?: boolean;
  /** The picker's body; `close` puts focus back on the pill. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  // Focus lands where the picker is used from: its search box or URL field
  // when it has one, its first option otherwise.
  useEffect(() => {
    if (!open || !panel.current) return;
    const first = panel.current.querySelector<HTMLElement>("[data-pill-autofocus]") ?? options(panel.current)[0];
    first?.focus();
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || !panel.current) return;
    const list = options(panel.current);
    if (list.length === 0) return;
    e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    // From the search box, down goes to the first option and up to the last.
    const next = at === -1 ? (step === 1 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    list[next]?.focus();
  }

  return (
    <div
      className="wb-pill-wrap"
      // Tabbing out of an open picker closes it, so a picker is never left
      // open behind the field the person moved on to.
      onBlur={(e) => {
        if (open && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={`wb-pill${empty ? " is-empty" : ""}${className ? ` ${className}` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {(caret ?? !empty) && (
          <span className="wb-pill-caret" aria-hidden>
            <Icon name="caret" />
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div ref={panel} className="wb-pill-panel" role="dialog" aria-label={panelLabel} onKeyDown={onKeyDown}>
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

function options(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-pill-option]"));
}

/** One choice in a picker: a button the arrow keys can reach. */
export function PillOption({
  current,
  onChoose,
  children,
}: {
  current: boolean;
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-pill-option=""
      className={`wb-pill-option${current ? " is-current" : ""}`}
      aria-current={current ? "true" : undefined}
      onClick={onChoose}
    >
      {children}
      {current && <span className="wb-pill-option-tick" aria-hidden>✓</span>}
    </button>
  );
}
