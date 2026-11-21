"use client";

import type { AutosaveStatus } from "./useAutosave";

/**
 * Inline "Saving… / Saved" indicator for autosave forms. Errors are
 * deliberately not shown here — render a full-width admin-alert--err below
 * the form instead so a failure isn't easy to miss.
 */
export function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status.state === "saving") return <span className="admin-cell-muted">saving…</span>;
  if (status.state === "saved") return <span className="admin-cell-muted">saved</span>;
  return null;
}
