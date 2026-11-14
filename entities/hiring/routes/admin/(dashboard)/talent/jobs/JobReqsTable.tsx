"use client";

import { useMemo, useState } from "react";
import { useClientTable } from "@/kernel/ui/useClientTable";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { JobReqCreate } from "./JobReqCreate";
import { JobReqManage, type JobReqManageData } from "./JobReqManage";
import { AtsSectionHead } from "@/kernel/ui/talent";
import { OpenRoleCards, salaryBand, type RoleCandidate } from "./OpenRoleCards";

export type JobReqRow = JobReqManageData & {
  createdAt: string;
  /** How many people the role hires; null when the req does not say. */
  headcount: number | null;
  /** Live applications by the name of the stage they are in. */
  stageCounts: Record<string, number>;
  /** Every application to the role, archived ones included; empty unless the req is open. */
  candidates: RoleCandidate[];
};

const PAGE_SIZES = [25, 50, 100];

// Reqs move open → (on hold) → filled/closed/cancelled; draft first.
const STATUS_ORDER = ["draft", "open", "on_hold", "filled", "closed", "cancelled"];

// Client-owned job reqs table: rows + manage shelf live in one client tree so a
// row click reliably opens the DetailDrawer (a client shelf injected into a
// server-rendered row preview never opens — same lesson as the applications
// list, commit 0b32585). All reqs load once; search, status filter, and paging
// happen client-side.
export type ManagerOption = { id: string; name: string };

export function JobReqsTable({ rows, managers }: { rows: JobReqRow[]; managers: ManagerOption[] }) {
  const [search, setSearch] = useState("");
  // Open reqs are what a recruiter comes here to work, so each one is a card
  // above the table; the table is every other req, filtered by status.
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false); // archived applications stay hidden until asked for

  const statusOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.status).filter((s): s is string => Boolean(s)));
    present.delete("open");
    return STATUS_ORDER.filter((s) => present.has(s)).concat(
      [...present].filter((s) => !STATUS_ORDER.includes(s)).sort(),
    );
  }, [rows]);

  const query = search.trim().toLowerCase();
  const matches = (r: JobReqRow) =>
    !query || [r.title, r.companyName, r.location, r.hiringManagerName].some((v) => (v ? v.toLowerCase().includes(query) : false));
  // No `compare`: this table has no sortable headers, so the rows stay in the
  // order the server sent them.
  const { pageRows, total, totalPages, start, end, page, setPage, pageSize, setPageSize } = useClientTable(rows, {
    filter: (r) => r.status !== "open" && (!statusFilter || r.status === statusFilter) && matches(r),
  });
  // A search finds a role by its own words or by a candidate under it; when it
  // is the role that matched, all of its candidates stay listed.
  const named = (c: RoleCandidate) => !!c.name && c.name.toLowerCase().includes(query);
  const shows = (r: JobReqRow, c: RoleCandidate) => (showArchived || !c.archived) && (matches(r) || named(c));
  const openRows = rows.filter((r) => r.status === "open" && (matches(r) || r.candidates.some((c) => shows(r, c))));

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  return (
    <>
      <div className="admin-toolbar u-gap-3 u-wrap">
        <input
          className="admin-input u-max-4"
          placeholder="Search role, candidate, location, or hiring manager…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search job reqs"
        />
        <select
          className="admin-select u-max-2"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <select
          className="admin-select u-max-1"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
          }}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <button type="button" className={`admin-btn admin-btn--sm${showArchived ? " admin-btn--primary" : ""}`} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)} title="Include archived applications in each role's list">
          {showArchived ? "Showing archived" : "Show archived"}
        </button>
        <div className="u-ml-auto">
          <JobReqCreate />
        </div>
      </div>

      <OpenRoleCards rows={openRows} onEdit={setSelectedId} shows={shows} />

      <AtsSectionHead k="Filled, closed, on hold and draft" title="Every other role" />
      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Hiring manager</th>
                <th>Type</th>
                <th>Location</th>
                <th className="u-right">Salary</th>
                <th className="u-right">Applicants</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="admin-empty">No job reqs match.</div>
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr
                    key={r.id}
                    className="is-clickable"
                    onClick={() => setSelectedId(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(r.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-haspopup="dialog"
                  >
                    <td>
                      <span className="admin-cell-strong">{r.title || "(untitled req)"}</span>
                      {r.isPublic && r.status === "open" && (
                        <>
                          {" "}
                          <Badge tone="ok">Live</Badge>
                        </>
                      )}
                    </td>
                    <td>{r.companyName || <span className="admin-cell-muted">—</span>}</td>
                    <td>
                      {r.hiringManagerName || (
                        <span className="admin-cell-muted">{r.status === "open" ? "Unassigned" : "—"}</span>
                      )}
                    </td>
                    <td>
                      <Badge>{humanize(r.employmentType)}</Badge>
                    </td>
                    <td>
                      {[r.location, r.remotePolicy ? humanize(r.remotePolicy) : null].filter(Boolean).join(" · ") || (
                        <span className="admin-cell-muted">—</span>
                      )}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {salaryBand(r.salaryMinCents, r.salaryMaxCents, r.currency) || (
                        <span className="admin-cell-muted">—</span>
                      )}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {r.applicationCount || <span className="admin-cell-muted">0</span>}
                    </td>
                    <td>
                      {r.status ? (
                        <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge>
                      ) : (
                        <span className="admin-cell-muted">—</span>
                      )}
                    </td>
                    <td>{r.openedAt ? formatDate(r.openedAt) : <span className="admin-cell-muted">—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="admin-pagination">
            <span>
              {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="admin-pagination-controls">
              <button
                type="button"
                className="admin-pagebtn"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Prev
              </button>
              <span className="admin-pagebtn u-no-events" aria-disabled>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="admin-pagebtn"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        eyebrow="Job req"
        title={selected?.title || "(untitled req)"}
      >
        {selected && <JobReqManage req={selected} managers={managers} />}
      </DetailDrawer>
    </>
  );
}
