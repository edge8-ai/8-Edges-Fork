// Where a claim stands, as the steps a decider reads at a glance (RB.14):
// submitted, approved, paid, each with who took it and when, read
// from the claim's own history. The step waiting on someone is marked current,
// and a claim sent back or rejected says so at the step where it stopped. The
// next payment run's date stands in for "paid" until it is.
import { formatDate } from "@/kernel/ui/format";
import type { ClaimStatus } from "../lib/claim-rules";
import type { MyEvent } from "../lib/my-claims";

// Everyone reads three steps, the checker included (Dave, 2026-10-12: there
// is no Checked phase). A claim under the approval limit is approved by its
// check; one at or over it waits for the approver at "checked", which reads as
// waiting at Approved.

type Step = { key: string; label: string; to: ClaimStatus[] };
const STEPS: Step[] = [
  { key: "submitted", label: "Submitted", to: ["submitted"] },
  { key: "approved", label: "Approved", to: ["approved"] },
  { key: "paid", label: "Paid", to: ["paid"] },
];

/** The index of the step a claim in this status waits at; the step count when it is paid. */
const WAITS_AT: Record<ClaimStatus, number> = { draft: 0, submitted: 1, sent_back: 0, rejected: 1, checked: 1, approved: 2, in_run: 2, paid: 3 };

export function ClaimStages({ status, events, nextRun }: { status: ClaimStatus; events: MyEvent[]; nextRun: string | null }) {
  const at = WAITS_AT[status];
  // The latest event that reached each step: a resubmitted claim was submitted twice.
  const reached = (to: ClaimStatus[]) => [...events].reverse().find((e) => to.includes(e.to)) ?? null;
  const stopped = status === "sent_back" || status === "rejected" ? reached([status]) : null;
  return (
    <ol className="admin-rb-stages admin-rb-stages--three" aria-label="Where this claim stands">
      {STEPS.map((step, i) => {
        const done = i < at || (i === 0 && at > 0);
        const current = !stopped && i === at;
        const ev = done ? reached(step.to) : null;
        const halted = stopped && i === at;
        const state = halted ? "is-stopped" : done ? "is-done" : current ? "is-current" : "";
        const sub = halted
          ? `${status === "rejected" ? "Rejected" : "Sent back"}${stopped.actorName ? ` by ${stopped.actorName}` : ""}`
          : ev
            ? [ev.actorName, formatDate(ev.at)].filter(Boolean).join(" · ")
            : current
              ? "Waiting"
              : step.key === "paid" && nextRun
                ? `Next run, ${formatDate(nextRun)}`
                : "Not yet";
        return (
          <li key={step.key} className={`admin-rb-stage ${state}`} aria-current={current ? "step" : undefined}>
            <span className="admin-rb-stage-dot" aria-hidden="true">
              {done ? "✓" : i + 1}
            </span>
            <span className="admin-rb-stage-text">
              <span className="admin-rb-stage-label">{step.label}</span>
              <span className="admin-list-sub">{sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
