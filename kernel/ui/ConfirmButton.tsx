"use client";

import { useState, type ReactNode } from "react";
import { ConfirmDialog, type ActionResult } from "./ConfirmDialog";

// A danger/secondary button that gates an async action behind a confirm modal.
// For irreversible actions (GDPR erasure) pass `typeToConfirm` — the confirm
// button stays disabled until the operator types that exact string.
//
// The modal itself is ConfirmDialog, which also serves callers whose trigger is
// not a button of their own (a menu item that closes its menu, say).
export function ConfirmButton({
  label,
  children,
  className = "admin-btn admin-btn--danger",
  title,
  body,
  confirmLabel = "Confirm",
  typeToConfirm,
  disabled,
  onConfirm,
  onDone,
}: {
  label?: string;
  children?: ReactNode;
  className?: string;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  typeToConfirm?: string;
  disabled?: boolean;
  onConfirm: () => Promise<ActionResult>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {children ?? label}
      </button>

      {open && (
        <ConfirmDialog
          title={title}
          body={body}
          confirmLabel={confirmLabel}
          typeToConfirm={typeToConfirm}
          onConfirm={onConfirm}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}
