"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import type { PendingRequest } from "@/entities/org/lib/equipment";
import { decideEquipmentRequest } from "./actions";
import { personName } from "@/kernel/config/people-name";

// Open asks from /team, above the register. Approving does not create anything:
// an admin still adds the item and assigns it, then marks the request fulfilled.
// Pretending to automate procurement would be worse than the two steps.
export function RequestsPanel({ requests }: { requests: PendingRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function decide(id: string, status: "approved" | "declined") {
    setBusy(id);
    setErr(null);
    const r = await decideEquipmentRequest(id, status);
    setBusy(null);
    if (r.ok) router.refresh();
    else setErr(r.error);
  }

  return (
    <div className="admin-card admin-section-card u-mb-4">
      <div className="admin-shelf-heading u-mb-3">
        Equipment requests
        <Badge tone="warn">{requests.length} open</Badge>
      </div>
      {err && <div className="admin-alert admin-alert--err u-mb-3">{err}</div>}
      <ul className="u-stack u-gap-3 u-m-0 u-p-0 u-list-plain">
        {requests.map((r) => (
          <li
            key={r.id}
            className="u-row u-wrap u-between u-gap-3 admin-quote"
          >
            <div className="u-min-0">
              <div className="admin-cell-strong">
                {personName(r.person, "Unknown")} · {humanize(r.type)}
              </div>
              {r.reason && <div className="u-sm">{r.reason}</div>}
              <div className="admin-cell-muted u-sm">
                Asked {formatDate(r.created_at)}
                {r.needed_by && ` · needed by ${formatDate(r.needed_by)}`}
              </div>
            </div>
            <div className="u-row u-shrink-0">
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                disabled={busy === r.id}
                onClick={() => decide(r.id, "declined")}
              >
                Decline
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--sm admin-btn--primary"
                disabled={busy === r.id}
                onClick={() => decide(r.id, "approved")}
              >
                Approve
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
