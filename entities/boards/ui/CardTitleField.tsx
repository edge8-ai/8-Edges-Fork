"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * The drawer's title: one line of text that wraps, as the approved canvas
 * draws it (W.159). It was an `<input>`, and an input never wraps, so a long
 * title ran off the drawer's edge ("…always on disp"). A textarea wraps; it
 * still holds a single line, because Enter is refused and a pasted line break
 * becomes a space — a card title is never two paragraphs.
 *
 * CSS `field-sizing: content` grows it where the browser has it; the layout
 * effect measures it where it does not, so no browser shows a scrolling box.
 */
export function CardTitleField({
  value,
  isNew,
  readOnly,
  onChange,
}: {
  value: string;
  isNew: boolean;
  readOnly: boolean;
  onChange: (title: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    // An inline height would pin the box and stop field-sizing re-wrapping it
    // when the drawer's width changes, so the fallback runs only without it.
    if (!el || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    // NO autoFocus on a card being READ (W.104.3): it is opened to be read far
    // more often than renamed, and the caret landing here made the first
    // keystroke edit the title. A NEW card is the exception (W.129): its title
    // is the one thing it must have. DetailDrawer records the opener before
    // this focus lands, so closing still returns focus to the New card button.
    <textarea
      ref={ref}
      rows={1}
      className={`wb-drawer-title-input${isNew ? " is-new" : ""}`}
      autoFocus={isNew && !readOnly}
      value={value}
      aria-label="Card title"
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      placeholder="What is the work?"
    />
  );
}
