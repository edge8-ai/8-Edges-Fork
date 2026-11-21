"use client";

import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import type { JobReqRow } from "./JobReqsTable";
import { pastStatusLabel, salaryBand } from "./roles";

// One job in the table. A cell's second line holds what used to be a column of
// its own: the type and place under the title, the hiring manager under the
// client, the opening date under the closing one. The labels only show on a
// narrow page, where the cells stack and lose their column headings.
export function PastRow({ r, onOpen }: { r: JobReqRow; onOpen: (id: string) => void }) {
  const band = salaryBand(r.salaryMinCents, r.salaryMaxCents, r.currency);
  const kind = [humanize(r.employmentType), r.location, r.remotePolicy ? humanize(r.remotePolicy) : null].filter(Boolean).join(" · ");
  return (
    <tr
      className="is-clickable"
      onClick={() => onOpen(r.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(r.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-haspopup="dialog"
    >
      <td className="c-job">
        <span className="admin-cell-strong">{r.title || "(untitled job)"}</span>
        {kind && <span className="ats-cell-sub">{kind}</span>}
      </td>
      <td className="c-client">
        {/* A staffing job is hired for a client, under the client's own
            manager; every other job is ours. */}
        {r.companyName ? <span>{r.companyName}</span> : <span className="admin-cell-muted">In-house</span>}
        {r.hiringManagerName && <span className="ats-cell-sub">{r.hiringManagerName}</span>}
      </td>
      <td className={band ? "c-pay" : "c-pay is-empty"}>{band ?? <span className="admin-cell-muted">—</span>}</td>
      <td className="c-apps admin-cell-mono u-right">
        {r.applicationCount ? r.applicationCount.toLocaleString() : <span className="admin-cell-muted">0</span>}
        <span className="ats-cell-label">{r.applicationCount === 1 ? " applicant" : " applicants"}</span>
      </td>
      <td className="c-status">
        {r.status ? <Badge tone={statusTone(r.status)}>{pastStatusLabel(r.status)}</Badge> : <span className="admin-cell-muted">—</span>}
      </td>
      <td className={r.closedAt || r.openedAt ? "c-dates" : "c-dates is-empty"}>
        <span className="ats-cell-label">Closed </span>
        {r.closedAt ? formatDate(r.closedAt) : <span className="admin-cell-muted">—</span>}
        {r.openedAt && <span className="ats-cell-sub">Opened {formatDate(r.openedAt)}</span>}
      </td>
    </tr>
  );
}
