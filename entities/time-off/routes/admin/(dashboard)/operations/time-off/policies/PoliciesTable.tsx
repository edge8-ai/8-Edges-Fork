"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { setPolicyAutoApprove } from "./actions";

export type PolicyRow = {
  id: string;
  name: string;
  autoApprove: boolean;
  activeMembers: number;
};

export function PoliciesTable({ rows }: { rows: PolicyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(row: PolicyRow) {
    setError(null);
    startTransition(async () => {
      const res = await setPolicyAutoApprove(row.id, !row.autoApprove);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Policy</th>
              <th>Approval</th>
              <th>Active members</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="admin-cell-muted">No leave policies yet.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/operations/time-off/policies/${r.id}`} className="admin-cell-strong u-link-plain">
                      {r.name}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={r.autoApprove ? "ok" : "warn"}>
                      {r.autoApprove ? "auto-approved" : "manual approval"}
                    </Badge>
                  </td>
                  <td>{r.activeMembers}</td>
                  <td>
                    <button
                      className="admin-btn admin-btn--sm"
                      disabled={pending}
                      onClick={() => toggle(r)}
                    >
                      {r.autoApprove ? "Switch to manual" : "Switch to auto-approve"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
