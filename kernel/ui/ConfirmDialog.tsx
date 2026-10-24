"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ActionResult = { ok: true } | { ok: false; error: string };

// The confirm modal itself, with no opinion about what opens it.
//
// It was the second half of ConfirmButton until a menu item needed to raise a
// confirm without being a button that owns one (2026-09-22): the commitment
// card's ⋯ menu closes on a click outside itself, so a dialog rendered INSIDE
// that menu unmounts under the reader's own click on Cancel. The dialog now
// belongs to whoever is still on screen after the menu has gone.
//
// It portals to the body for the same family of reasons the commitment card's
// bottom sheet does: `position: fixed` resolves against a transformed ancestor
// rather than the viewport, and a `z-index` anywhere above it caps the whole
// dialog inside that ancestor's stacking context. At the body there is no
// ancestor to be trapped by.
export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  typeToConfirm,
  onConfirm,
  onClose,
  onDone,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  /** For irreversible actions: the confirm stays disabled until this is typed. */
  typeToConfirm?: string;
  onConfirm: () => Promise<ActionResult>;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  // Focus the dialog's first control on open, and only then. Sharing the effect
  // above meant re-focusing on every `pending` flip, so a slow confirm that came
  // back refused pulled focus off whatever the reader had moved to.
  useEffect(() => {
    (typeToConfirm ? inputRef.current : confirmRef.current)?.focus();
  }, [typeToConfirm]);

  const matched = !typeToConfirm || typed.trim() === typeToConfirm.trim();

  async function run() {
    if (!matched || pending) return;
    setPending(true);
    setError(null);
    const r = await onConfirm();
    setPending(false);
    if (r.ok) {
      onClose();
      onDone?.();
    } else {
      setError(r.error);
    }
  }

  // Nothing to portal into while rendering on the server; a dialog is only ever
  // opened by something the reader did, so the first client render has a body.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="admin-modal-backdrop" onClick={() => !pending && onClose()}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-title">{title}</div>
        <div className="admin-modal-body">{body}</div>

        {typeToConfirm && (
          <input
            ref={inputRef}
            className="admin-input u-mt-3"
            placeholder={`Type "${typeToConfirm}" to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            aria-label={`Type ${typeToConfirm} to confirm`}
          />
        )}

        {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={run}
            disabled={!matched || pending}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
