// Domains across every board (W.53), built from the admin design system: a KPI
// strip, then a DataTable with a side car per row, the same as every other list
// page. Every row names its board because epics are board-scoped (W.41): two
// boards may each have a "Marketing" and they are two different domains.

import Link from "next/link";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { formatTokens } from "@/entities/boards/lib/tokens";
import { DONE_VISIBLE_DAYS } from "@/entities/boards/lib/workboard";
import { MOVING_DAYS, type DomainRow, type DomainsModel } from "./domain-rows";

const BASE_PATH = "/admin/edges/domains";
const SORTABLE = new Set(["epicName", "boardName", "open", "openTokens", "movedRecently"]);

type Row = DomainRow & { id: string; open: number };

function compareRows(a: Row, b: Row, sort: string, dir: "asc" | "desc"): number {
  const sign = dir === "desc" ? -1 : 1;
  const byName = a.epicName.localeCompare(b.epicName, undefined, { sensitivity: "base" });
  if (sort === "epicName") return sign * byName;
  if (sort === "boardName") return sign * a.boardName.localeCompare(b.boardName, undefined, { sensitivity: "base" }) || byName;
  const key = sort as "open" | "openTokens" | "movedRecently";
  return sign * (a[key] - b[key]) || byName;
}

// Is this domain moving? It describes the CARDS (how many changed column, how
// long the freshest open card has sat), never who moved them.
function movement(row: DomainRow) {
  if (row.movedRecently > 0) return <>{row.movedRecently} moved this week</>;
  if (row.stillForDays === null) return <span className="admin-cell-muted">nothing open</span>;
  return <span className="u-warn">still for {row.stillForDays}d</span>;
}

// Every sprint, because the row counts every sprint (W.116): the board on its
// own opens on the active sprint.
const boardHref = (row: DomainRow) => `/admin/boards/${row.boardSlug}?epic=${row.epicId}&sprint=all`;

export function DomainsView({ model, searchParams }: { model: DomainsModel; searchParams: SearchParamsObj }) {
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "openTokens";
  const dir = firstParam(searchParams.dir) === "asc" ? "asc" : "desc";
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();

  const rows: Row[] = [...model.open, ...model.quiet]
    .map((r) => ({ ...r, id: r.key, open: r.totals.open }))
    .filter((r) => !q || r.epicName.toLowerCase().includes(q) || r.boardName.toLowerCase().includes(q))
    .sort((a, b) => compareRows(a, b, sort, dir));

  const columns: Column<Row>[] = [
    {
      key: "epicName",
      header: "Domain",
      sortable: true,
      cell: (r) => (
        <span className="admin-cell-strong u-row u-gap-2">
          <span className="admin-board-epic-dot" data-epic-color={r.colorIndex} />
          {r.epicName}
        </span>
      ),
    },
    { key: "boardName", header: "Board", sortable: true, cell: (r) => r.boardName },
    { key: "open", header: "Open", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => r.open },
    {
      key: "openTokens",
      header: "HT open",
      sortable: true,
      align: "right",
      className: "admin-cell-mono",
      cell: (r) => (r.openTokens > 0 ? formatTokens(r.openTokens) : "—"),
    },
    { key: "movedRecently", header: "Movement", sortable: true, cell: (r) => movement(r) },
  ];

  return (
    <>
      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Human Tokens open" value={formatTokens(model.openTokens)} />
        <MetricCard label="Open cards" value={model.openCards} />
        <MetricCard label="Domains with open work" value={model.open.length} sub={`${model.quiet.length} with nothing open`} />
        <MetricCard label="Boards" value={model.boards} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        sort={sort}
        dir={dir}
        basePath={BASE_PATH}
        searchParams={searchParams}
        searchPlaceholder="Search domains or boards…"
        emptyText="No domains yet. A board divides its work into domains on its own Epics page, and they show up here."
        getRowPreview={(r) => ({
          eyebrow: r.boardName,
          title: r.epicName,
          body: (
            <>
              <dl className="admin-kv u-mb-4">
                <dt>Board</dt>
                <dd>{r.boardName}</dd>
                <dt>Description</dt>
                <dd>{r.description || "—"}</dd>
                <dt>Open</dt>
                <dd className="admin-cell-mono">{r.totals.open}</dd>
                <dt>Done</dt>
                <dd className="admin-cell-mono">{r.totals.done}</dd>
                <dt>HT open</dt>
                <dd className="admin-cell-mono">{r.openTokens > 0 ? formatTokens(r.openTokens) : "—"}</dd>
                <dt>Movement</dt>
                <dd>{movement(r)}</dd>
              </dl>
              <Link className="admin-btn admin-btn--sm" href={boardHref(r)}>
                Open its cards
              </Link>
            </>
          ),
        })}
      />

      <p className="admin-hint u-mt-4">
        A domain belongs to one board, so two boards with the same domain name are two rows and are never added
        together. &ldquo;Moved this week&rdquo; means a card changed column in the last {MOVING_DAYS} days; finished cards
        leave this cross-board read after {DONE_VISIBLE_DAYS} days, so Done here is recent work.
      </p>
    </>
  );
}
