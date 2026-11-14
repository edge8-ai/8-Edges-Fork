"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { CommitmentStatus } from "@/entities/coaching/lib/types";
import { OPEN_COMMITMENT_STATUSES } from "@/entities/coaching/lib/types";
import { formatDate } from "@/kernel/ui/format";

export function CarriedOverCard({ detail, todayIso }: { detail: CoachProfileDetail; todayIso: string }) {
  const lastHeldOn = detail.meetings
    .filter((m) => m.status === "held")
    .reduce<string | null>((latest, m) => (!latest || m.heldOn > latest ? m.heldOn : latest), null);
  if (!lastHeldOn) return null;

  const carried = detail.commitments
    .filter((c) => (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status))
    .filter((c) => c.createdAt.slice(0, 10) < lastHeldOn)
    .sort((a, b) => {
      const aOverdue = a.dueOn && a.dueOn < todayIso ? 0 : 1;
      const bOverdue = b.dueOn && b.dueOn < todayIso ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.dueOn && b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
      if (a.dueOn) return -1;
      if (b.dueOn) return 1;
      return a.sortOrder - b.sortOrder;
    });
  if (carried.length === 0) return null;

  return (
    <section className="admin-card admin-coach-section admin-coach-carried">
      <div className="admin-card-title">
        Carried over{" "}
        <span className="admin-cell-muted">still open from before your 1-1 on {lastHeldOn ? formatDate(lastHeldOn) : "-"}</span>
      </div>
      <div className="admin-hint">
        Close the loop, or carry it forward on purpose. Nothing agreed last time should slip quietly.
      </div>
      {carried.map((c) => {
        const overdue = Boolean(c.dueOn && c.dueOn < todayIso);
        return (
          <div key={c.id} className="admin-coach-carried-row">
            <span className="admin-badge">{c.owner === "coach" ? "me" : "them"}</span>
            <span className="admin-coach-carried-title">{c.title}</span>
            {c.dueOn && (
              <span className={`admin-badge ${overdue ? "admin-badge--warn" : ""}`}>
                {overdue ? "overdue" : "due"} {c.dueOn ? formatDate(c.dueOn) : "-"}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
