"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useClientTable } from "@/kernel/ui/useClientTable";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { appPath } from "@/kernel/config/slug";

export type AppRow = {
  id: string;
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  headline: string | null;
  currentTitle: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  doNotHire: boolean;
  personId: string | null;
  jobReqId: string | null;
  jobReqTitle: string | null;
  jobReqStatus: string | null;
  stageName: string | null;
  currentStageId: string | null;
  status: string | null;
  rating: number | null;
  aiRating: number | null; // AI fit 0-5: family screen first, else per-req screen
  rejectionReason: string | null;
  appliedAt: string | null;
  decidedAt: string | null;
  resumeDocumentId: string | null;
  archivedAt: string | null;
};

const PAGE_SIZES = [25, 50, 100];

type SortKey = "candidate" | "jobReq" | "stage" | "ai" | "recruiter" | "status" | "applied";
const DESC_FIRST: SortKey[] = ["ai", "recruiter", "applied"]; // numbers/dates read best highest/newest-first

// Canonical status order for the filter dropdown (pipeline-ish, ends terminal).
const STATUS_ORDER = [
  "active",
  "on_hold",
  "future_consideration",
  "passive",
  "withdrawn",
  "hired",
  "rejected",
];

// Client-owned applications table. All rows load once; search, filters, paging,
// and sort happen client-side. A row click navigates to the full-page applicant
// profile (/admin/talent/applications/<name>-<short-code>) — the shareable
// canonical view.
export function ApplicationsTable({ rows }: { rows: AppRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [reqFilter, setReqFilter] = useState(""); // "" = all reqs
  const [statusFilter, setStatusFilter] = useState(""); // "" = all statuses
  const [stageFilter, setStageFilter] = useState(""); // "" = all stages
  const [showArchived, setShowArchived] = useState(false); // hide archived by default

  // Job reqs for the filter dropdown: only reqs that are still open — closed
  // roles' applications remain findable via search/status/stage.
  const reqOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.jobReqId && r.jobReqStatus === "open") m.set(r.jobReqId, r.jobReqTitle || "(untitled req)");
    }
    return [...m.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rows]);

  // Statuses present in the data, in canonical pipeline order.
  const statusOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.status).filter((s): s is string => Boolean(s)));
    return STATUS_ORDER.filter((s) => present.has(s)).concat(
      [...present].filter((s) => !STATUS_ORDER.includes(s)).sort(),
    );
  }, [rows]);

  // Stage names present in the data. Stages belong to a req, but names repeat
  // across reqs ("Interview", "Offer"), so filtering by name works globally.
  const stageOptions = useMemo(() => {
    return [...new Set(rows.map((r) => r.stageName).filter((s): s is string => Boolean(s)))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [rows]);

  const query = search.trim().toLowerCase();
  // Every column header sorts; the default ranks by AI fit, highest first. The
  // paging arithmetic and the sort toggle are the shared ones — see
  // entities/company-os/ui/useClientTable.ts. Unlike the other two tables this
  // one deliberately stays on the current page when the sort changes.
  const cellFor = (r: AppRow, key: SortKey): string | number | null => {
    switch (key) {
      case "ai":
        return r.aiRating;
      case "recruiter":
        return r.rating;
      case "applied":
        return r.appliedAt ? new Date(r.appliedAt).getTime() : null;
      case "candidate":
        return r.candidateName;
      case "jobReq":
        return r.jobReqTitle;
      case "stage":
        return r.stageName;
      case "status":
        return r.status ? humanize(r.status) : null;
    }
  };

  const { pageRows, startIdx, total, totalPages, start, end, page, setPage, pageSize, setPageSize, sort,
    toggleSort: onSort } = useClientTable<AppRow, SortKey>(rows, {
    filter: (r) => {
      if (r.archivedAt && !showArchived) return false;
      if (reqFilter && r.jobReqId !== reqFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (stageFilter && r.stageName !== stageFilter) return false;
      if (!query) return true;
      return [r.candidateName, r.headline, r.jobReqTitle, r.stageName, r.status ? humanize(r.status) : null].some(
        (v) => (v ? v.toLowerCase().includes(query) : false),
      );
    },
    compare: (a, b, s) => {
      const av = cellFor(a, s.key);
      const bv = cellFor(b, s.key);
      // Empty/unrated always sinks to the bottom, regardless of direction.
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const d = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return s.dir === "desc" ? -d : d;
    },
    initialSort: { key: "ai", dir: "desc" },
    descFirst: DESC_FIRST,
    resetPageOnSort: false,
  });

  const sortArrow = (key: SortKey) => (sort?.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  function open(row: AppRow) {
    router.push(appPath(row.candidateName, row.id));
  }

  return (
    <>
      <div className="admin-toolbar u-gap-3 u-wrap">
        <input
          className="admin-input u-max-4"
          placeholder="Search candidate, headline, or role…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search applications"
        />
        <select
          className="admin-select u-max-3"
          value={reqFilter}
          onChange={(e) => {
            setReqFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by job req"
        >
          <option value="">All open job reqs</option>
          {reqOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
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
          className="admin-select u-max-3"
          value={stageFilter}
          onChange={(e) => {
            setStageFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by stage"
        >
          <option value="">All stages</option>
          {stageOptions.map((s) => (
            <option key={s} value={s}>
              {s}
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
        <button
          type="button"
          className={`admin-btn admin-btn--sm${showArchived ? " admin-btn--primary" : ""}`}
          onClick={() => {
            setShowArchived((v) => !v);
            setPage(1);
          }}
          aria-pressed={showArchived}
          title="Include archived (deleted) applications"
        >
          {showArchived ? "Showing archived" : "Show archived"}
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-th--xs">#</th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("candidate")}>
                    Candidate{sortArrow("candidate")}
                  </button>
                </th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("jobReq")}>
                    Job req{sortArrow("jobReq")}
                  </button>
                </th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("stage")}>
                    Stage{sortArrow("stage")}
                  </button>
                </th>
                <th className="u-right">
                  <button type="button" className="admin-th-sort" onClick={() => onSort("ai")}>
                    AI fit{sortArrow("ai")}
                  </button>
                </th>
                <th className="u-right">
                  <button type="button" className="admin-th-sort" onClick={() => onSort("recruiter")}>
                    Recruiter{sortArrow("recruiter")}
                  </button>
                </th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("status")}>
                    Status{sortArrow("status")}
                  </button>
                </th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("applied")}>
                    Applied{sortArrow("applied")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="admin-empty">No applications match.</div>
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr
                    key={r.id}
                    className="is-clickable"
                    onClick={() => open(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(r);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    style={r.archivedAt ? { opacity: 0.6 } : undefined}
                  >
                    <td className="admin-cell-mono">{startIdx + i + 1}</td>
                    <td>
                      <span className={r.candidateName ? "admin-cell-strong" : "admin-cell-muted"}>
                        {r.candidateName || "—"}
                      </span>
                      {r.archivedAt && (
                        <span className="u-ml-2">
                          <Badge tone="neutral">Archived</Badge>
                        </span>
                      )}
                    </td>
                    <td>{r.jobReqTitle || <span className="admin-cell-muted">—</span>}</td>
                    <td>{r.stageName || <span className="admin-cell-muted">—</span>}</td>
                    <td className="admin-cell-mono u-right">
                      {r.aiRating != null ? r.aiRating.toFixed(1) : <span className="admin-cell-muted">—</span>}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {r.rating != null ? `${r.rating}★` : <span className="admin-cell-muted">—</span>}
                    </td>
                    <td>
                      {r.status ? (
                        <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge>
                      ) : (
                        <span className="admin-cell-muted">—</span>
                      )}
                    </td>
                    <td>{r.appliedAt ? formatDate(r.appliedAt) : <span className="admin-cell-muted">—</span>}</td>
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
    </>
  );
}
