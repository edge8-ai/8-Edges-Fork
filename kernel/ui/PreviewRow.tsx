"use client";

import { useState, type ReactNode, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { DetailDrawer } from "./DetailDrawer";

// A clickable table row that opens the record in the side car (DetailDrawer).
// The whole row is the target — no per-cell links — but clicks on genuinely
// interactive elements inside the row (buttons, links, inputs) are left alone so
// inline actions still work. The drawer is portalled to <body> so it never nests
// invalid markup inside <table>.
export function PreviewRow({
  children,
  title,
  eyebrow,
  preview,
  className,
}: {
  children: ReactNode; // the <td> cells for this row
  title: ReactNode;
  eyebrow?: ReactNode;
  preview: ReactNode; // drawer body
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // The row itself carries role="button", so exclude it from the interactive-
  // element guard — closest() matches the element AND its ancestors, and a
  // guard that can match the row swallows every click (dead preview).
  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <>
      <tr
        className={`is-clickable${className ? ` ${className}` : ""}`}
        onClick={onClick}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="button"
        aria-haspopup="dialog"
      >
        {children}
      </tr>
      {open &&
        createPortal(
          <DetailDrawer open onClose={() => setOpen(false)} title={title} eyebrow={eyebrow}>
            {preview}
          </DetailDrawer>,
          document.body,
        )}
    </>
  );
}
