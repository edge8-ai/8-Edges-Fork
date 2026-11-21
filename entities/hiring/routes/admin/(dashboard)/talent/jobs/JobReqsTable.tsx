"use client";

import { useMemo, useState } from "react";
import { useClientTable } from "@/kernel/ui/useClientTable";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { humanize } from "@/kernel/ui/format";
import { JobReqManage, type JobReqManageData } from "./JobReqManage";
import type { JobFieldOptions } from "./JobPeopleFields";
import { AtsSectionHead } from "@/kernel/ui/talent";
import { OpenRoleCards, type RoleCandidate } from "./OpenRoleCards";
import { pastStatusLabel } from "./roles";
import { PastRow } from "./PastJobRow";
import type { MayProp } from "@/kernel/identity/may-prop";

export type JobReqRow = JobReqManageData & {
  createdAt: string;
  /** Live applications by the name of the stage they are in. */
  stageCounts: Record<string, number>;
  /** Every application to the job, archived ones included; empty unless the job is open. */
  candidates: RoleCandidate[];
};

const PAGE_SIZES = [25, 50, 100];

// Jobs move open → (on hold) → filled/closed/cancelled; draft first.
const STATUS_ORDER = ["draft", "open", "on_hold", "filled", "closed", "cancelled"];

// The statuses a job ends in. A table of only these is "Past jobs"; one that
// also holds a draft or a job on hold says "Other jobs", since those are not over.
const ENDED = new Set(["filled", "closed", "cancelled"]);

/** "a, b or c", for the line above the table. */
function orList(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

// Client-owned jobs table: rows and the drawer live in one client tree so a row
// click reliably opens the DetailDrawer (a client shelf injected into a
// server-rendered row preview never opens — same lesson as the applications
// list, commit 0b32585). Every job loads once; search, status filter and paging
// happen client-side.
export function JobReqsTable({ rows, options, may }: { rows: JobReqRow[]; options: JobFieldOptions; may: MayProp }) {
  const [search, setSearch] = useState("");
  // Open jobs are what HR comes here to work, so each one is a card above the
  // table; the table is every other job, filtered by status.
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false); // archived applications stay hidden until asked for

  const past = useMemo(() => rows.filter((r) => r.status !== "open"), [rows]);
  // The filters count every job in the table, whatever the search, so a
  // status's number does not jump while someone types.
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of past) if (r.status) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return counts;
  }, [past]);
  const statuses = useMemo(
    () =>
      STATUS_ORDER.filter((s) => statusCounts.has(s)).concat([...statusCounts.keys()].filter((s) => !STATUS_ORDER.includes(s)).sort()),
    [statusCounts],
  );
  const pastTitle = past.every((r) => ENDED.has(r.status ?? "")) ? "Past jobs" : "Other jobs";
  const kicker = orList(statuses.map((s) => humanize(s).toLowerCase()));

  const query = search.trim().toLowerCase();
  const matches = (r: JobReqRow) =>
    !query || [r.title, r.companyName, r.location, r.hiringManagerName].some((v) => (v ? v.toLowerCase().includes(query) : false));
  // No `compare`: this table has no sortable headers, so the rows stay in the
  // order the server sent them.
  const { pageRows, total, totalPages, start, end, page, setPage, pageSize, setPageSize } = useClientTable(rows, {
    filter: (r) => r.status !== "open" && (!statusFilter || r.status === statusFilter) && matches(r),
  });
  // A search finds a job by its own words or by a candidate under it; when it
  // is the job that matched, all of its candidates stay listed.
  const named = (c: RoleCandidate) => !!c.name && c.name.toLowerCase().includes(query);
  const shows = (r: JobReqRow, c: RoleCandidate) => (showArchived || !c.archived) && (matches(r) || named(c));
  const open = rows.filter((r) => r.status === "open");
  const openRows = open.filter((r) => matches(r) || r.candidates.some((c) => shows(r, c)));
  const hasArchived = open.some((r) => r.candidates.some((c) => c.archived));

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;
  const pick = (s: string) => {
    setStatusFilter(s);
    setPage(1);
  };
  const openDrawer = (id: string) => setSelectedId(id);

  return (
    <>
      {/* The one search serves both sections, so it sits alone above them; the
          status filter and the page size belong to the table and sit with it. */}
      <div className="admin-toolbar u-gap-3 u-wrap">
        <input
          className="admin-input u-max-4"
          type="search"
          placeholder="Search jobs or candidates"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search jobs or candidates"
        />
      </div>

      <OpenRoleCards
        rows={openRows}
        anyOpen={open.length > 0}
        query={search.trim()}
        showArchived={showArchived}
        onShowArchived={hasArchived ? setShowArchived : undefined}
        pastTitle={pastTitle}
        onEdit={openDrawer}
        shows={shows}
        may={may}
      />

      <AtsSectionHead k={kicker ? kicker.charAt(0).toUpperCase() + kicker.slice(1) : "None yet"} title={pastTitle} />
      {statuses.length > 1 && (
        <ul className="ats-filters" aria-label={`Show ${pastTitle.toLowerCase()} by status`}>
          <li>
            <button type="button" className="ats-filter" aria-pressed={statusFilter === ""} onClick={() => pick("")}>
              All<small>{past.length.toLocaleString()}</small>
            </button>
          </li>
          {statuses.map((s) => (
            <li key={s}>
              <button type="button" className="ats-filter" aria-pressed={statusFilter === s} onClick={() => pick(s)}>
                {pastStatusLabel(s)}
                <small>{(statusCounts.get(s) ?? 0).toLocaleString()}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="admin-table-wrap">
        {pageRows.length === 0 ? (
          <div className="admin-empty">
            {past.length === 0 ? (
              `No ${pastTitle.toLowerCase()} yet.`
            ) : query ? (
              <>
                No job here matches “{search.trim()}”.{" "}
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                >
                  Clear search
                </button>
              </>
            ) : (
              "No job here matches."
            )}
          </div>
        ) : (
          <div className="admin-table-scroll">
            {/* Six fixed columns, each cell at most two lines, so every field a
                staffing job carries fits a laptop without scrolling sideways.
                On a narrow page each row becomes a block (talent-ats.css). */}
            <table className="admin-table ats-past">
              <thead>
                <tr>
                  <th className="c-job">Job</th>
                  <th className="c-client">Client and manager</th>
                  <th className="c-pay">Pay</th>
                  <th className="c-apps u-right">Applicants</th>
                  <th className="c-status">Status</th>
                  <th className="c-dates">Closed</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <PastRow key={r.id} r={r} onOpen={openDrawer} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="admin-pagination">
            <span>
              {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="admin-pagination-controls">
              <select
                className="admin-select ats-pagesize"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                }}
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
              <button type="button" className="admin-pagebtn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Prev
              </button>
              <span className="admin-pagebtn u-no-events" aria-disabled>
                {page} / {totalPages}
              </span>
              <button type="button" className="admin-pagebtn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <DetailDrawer open={!!selected} onClose={() => setSelectedId(null)} eyebrow="Job" title={selected?.title || "(untitled job)"}>
        {selected && <JobReqManage key={selected.id} req={selected} options={options} may={may} />}
      </DetailDrawer>
    </>
  );
}
