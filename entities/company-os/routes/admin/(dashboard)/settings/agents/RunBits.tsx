import type { RoutineRunStatus } from "@/kernel/audit/routine-runs";

// Small presentational pieces shared by the Agents list and a routine's run
// history: the status badge, a token figure and a duration.

// A run is `running` from its claim until it closes, `waiting` while parked on
// an approval or a delayed send, and `died` when the routine reaper found it
// past its step deadline — killed or timed out before it could say how it
// ended, so it reads as a failure.
const TONE: Record<RoutineRunStatus, string> = {
  ok: "ok",
  skipped: "warn",
  error: "err",
  running: "info",
  waiting: "info",
  died: "err",
};
const TEXT: Record<RoutineRunStatus, string> = {
  ok: "Ran",
  skipped: "Skipped",
  error: "Failed",
  running: "Running",
  waiting: "Waiting",
  died: "Died",
};

export function RunStatusBadge({ status }: { status: RoutineRunStatus | null }) {
  // The base badge already paints the muted ground and ink, which is the
  // neutral look this state wants; the tone modifiers exist to depart from it.
  if (!status) return <span className="admin-badge">Never run</span>;
  return <span className={`admin-badge admin-badge--${TONE[status]} admin-badge--dot`}>{TEXT[status]}</span>;
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function duration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}
