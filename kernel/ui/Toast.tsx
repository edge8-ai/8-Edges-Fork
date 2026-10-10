"use client";

// A short-lived message with one optional action — the board's "Moved "W.12" to
// Doing — Undo" (W.50).
//
// It mounts itself. Every other primitive in kernel/ui is a component a page
// renders, but the moves this exists for are made from three places that do not
// share a parent anyone may edit (the kanban drag, the list's Status cell, the
// card drawer's lane picker) and the message has to outlive whichever of them
// was on screen — a lane change from the drawer closes the drawer. So the toast
// lives in its own root on <body>: one line at the call site, no provider, and
// nothing above it has to know it exists.
//
// It never blocks the page. The layer it sits in takes no pointer events, so a
// drag that passes over it still lands on the board underneath; only the toast
// itself is clickable, and it sits in the bottom gutter of the viewport rather
// than over a column.
import { useCallback, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

export type ToastResult = { ok: true } | { ok: false; error: string };

export type ToastAction = {
  label: string;
  /** Runs when the action is pressed. Its refusal replaces the message. */
  run: () => Promise<ToastResult>;
};

export type ToastRequest = {
  message: string;
  action?: ToastAction;
  /** How long the toast stays, in milliseconds. Ten seconds by default. */
  ms?: number;
  /** Runs after the action succeeded — normally router.refresh(). */
  onActionDone?: () => void;
};

const DEFAULT_MS = 10_000;

function Toast({ message, action, ms = DEFAULT_MS, onActionDone, onClose }: ToastRequest & { onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // The clock stops while the action is in flight: a toast that vanished
  // mid-undo would leave the person unsure whether the undo had happened.
  useEffect(() => {
    if (running) return;
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [running, ms, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const press = useCallback(async () => {
    if (!action) return;
    setRunning(true);
    try {
      const result = await action.run();
      if (result.ok) {
        onActionDone?.();
        onClose();
        return;
      }
      setFailure(result.error);
    } catch {
      // A server action rejects when the request never completed at all; the
      // person must hear that rather than watch a button go quiet.
      setFailure("The server did not answer — reload the page and try again.");
    }
    setRunning(false);
  }, [action, onActionDone, onClose]);

  return (
    <div className="admin-toast" role="status" aria-live="polite">
      <span className="admin-toast-text">{failure ?? message}</span>
      {action && !failure && (
        <button type="button" className="admin-toast-action" onClick={() => void press()} disabled={running}>
          {running ? "Undoing…" : action.label}
        </button>
      )}
      <button type="button" className="admin-toast-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
// A fresh key per request remounts the toast, so a second move restarts the
// clock instead of inheriting the first one's remaining time.
let shown = 0;

/** Shows a toast, replacing whichever one is on screen. Client-only. */
export function showToast(request: ToastRequest) {
  if (typeof document === "undefined") return;
  if (!container) {
    container = document.createElement("div");
    container.className = "admin-toast-layer";
    document.body.appendChild(container);
  }
  root ??= createRoot(container);
  shown += 1;
  const close = () => root?.render(null);
  root.render(<Toast key={shown} {...request} onClose={close} />);
}
