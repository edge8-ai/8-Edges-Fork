import Link from "next/link";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { ArchivedToggle } from "@/kernel/ui/ArchivedToggle";
import { Badge } from "@/kernel/ui/Badge";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import type { BoardDetail } from "@/entities/boards/lib/data";
import { epicColorIndex } from "@/entities/boards/lib/types";
import { epicTotals, zeroTotals } from "@/entities/boards/lib/epic-totals";
import { formatTokens } from "@/entities/boards/lib/tokens";
import { EpicPreview } from "./EpicPreview";
import { NewEpicPanel } from "./NewEpicPanel";

// Epics for one board, shared by /admin/boards/[slug]/epics and
// /team/boards/[slug]/epics (the page wrappers authorize; every action
// re-checks on write). Built from the admin design system like every other list
// page: a KPI strip, a DataTable with a side car per row, the archived toggle.
// The bespoke shape bar and meter rows it replaces looked like no other page in
// Edge8 OS (Dave, 2026-09-24).

type EpicTableRow = {
  id: string;
  name: string;
  description: string | null;
  colorIndex: number;
  color: string | null;
  archived: boolean;
  open: number;
  done: number;
  doneTokens: number;
  tokens: number;
  donePct: number;
};

const SORTABLE = new Set(["name", "open", "done", "tokens", "donePct"]);

function compareRows(a: EpicTableRow, b: EpicTableRow, sort: string, dir: "asc" | "desc"): number {
  const sign = dir === "desc" ? -1 : 1;
  if (sort === "name") return sign * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const key = sort as "open" | "done" | "tokens" | "donePct";
  return sign * (a[key] - b[key]) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

// Tokens delivered where the epic has them, cards closed where it has none, so
// an unsized epic still shows how far along it is.
function donePct(t: { open: number; done: number; openTokens: number; doneTokens: number }): number {
  const tokens = t.openTokens + t.doneTokens;
  if (tokens > 0) return Math.round((t.doneTokens / tokens) * 100);
  const cards = t.open + t.done;
  return cards > 0 ? Math.round((t.done / cards) * 100) : 0;
}

export function EpicsView({
  detail,
  surface,
  canManage,
  canCreate = canManage,
  searchParams,
}: {
  detail: BoardDetail;
  surface: "/admin" | "/team";
  /** Rename, recolour and archive the board's epics. */
  canManage: boolean;
  /**
   * Make a new epic. Any board member may, as the server already allows and
   * the card's epic picker offers (W.153); defaults to `canManage` so a
   * surface that says nothing keeps what it had.
   */
  canCreate?: boolean;
  searchParams: SearchParamsObj;
}) {
  const { board, epics, cards } = detail;
  const basePath = `${surface}/boards/${board.slug}/epics`;
  // Each cards link adds &sprint=all (W.116): the counts here are every
  // sprint's, and the board on its own opens on the active sprint only.
  const boardHref = `${surface}/boards/${board.slug}`;

  const showArchived = firstParam(searchParams.archived) === "1";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();

  const { byEpic, none, total } = epicTotals(cards);
  const activeCount = epics.filter((e) => e.status !== "archived").length;

  const rows: EpicTableRow[] = epics
    .filter((e) => showArchived || e.status !== "archived")
    .filter((e) => !q || e.name.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q))
    .map((e) => {
      const t = byEpic.get(e.id) ?? zeroTotals();
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        colorIndex: epicColorIndex(e.color),
        color: e.color,
        archived: e.status === "archived",
        open: t.open,
        done: t.done,
        doneTokens: t.doneTokens,
        tokens: t.openTokens + t.doneTokens,
        donePct: donePct(t),
      };
    })
    .sort((a, b) => compareRows(a, b, sort, dir));

  const totalTokens = total.openTokens + total.doneTokens;
  const noneCards = none.open + none.done;

  const columns: Column<EpicTableRow>[] = [
    {
      key: "name",
      header: "Epic",
      sortable: true,
      cell: (r) => (
        <span className="admin-cell-strong u-row u-gap-2">
          <span className="admin-board-epic-dot" data-epic-color={r.colorIndex} />
          {r.name}
          {r.archived && (
            <>
              {" "}
              <Badge>Archived</Badge>
            </>
          )}
        </span>
      ),
    },
    { key: "open", header: "Open", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => r.open },
    { key: "done", header: "Done", sortable: true, align: "right", className: "admin-cell-mono", cell: (r) => r.done },
    {
      key: "tokens",
      header: "Human Tokens",
      sortable: true,
      align: "right",
      className: "admin-cell-mono",
      cell: (r) => (r.tokens > 0 ? `${formatTokens(r.doneTokens)} / ${formatTokens(r.tokens)}` : "—"),
    },
    {
      key: "donePct",
      header: "Delivered",
      sortable: true,
      align: "right",
      className: "admin-cell-mono",
      cell: (r) => (r.open + r.done > 0 ? `${r.donePct}%` : "—"),
    },
  ];

  return (
    <>
      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Epics" value={activeCount} />
        <MetricCard label="Open cards" value={total.open} sub={`${total.done} done`} />
        <MetricCard
          label="Human Tokens delivered"
          value={formatTokens(total.doneTokens)}
          sub={`of ${formatTokens(totalTokens)}`}
        />
        <MetricCard
          label="No epic"
          value={noneCards}
          sub={noneCards > 0 ? "cards to file" : "every card is filed"}
          href={noneCards > 0 ? `${boardHref}?epic=none&sprint=all` : undefined}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        sort={sort}
        dir={dir}
        basePath={basePath}
        searchParams={searchParams}
        searchPlaceholder="Search epics…"
        emptyText={epics.length === 0 ? "No epics yet. An epic groups this board's cards into one feature." : "No epics match."}
        filterBar={<ArchivedToggle basePath={basePath} searchParams={searchParams} showArchived={showArchived} />}
        getRowPreview={(r) => ({
          eyebrow: "Epic",
          title: r.name,
          body: (
            <EpicPreview
              epic={{ id: r.id, name: r.name, description: r.description, color: r.color, archived: r.archived }}
              figures={{ open: r.open, done: r.done, doneTokens: r.doneTokens, tokens: r.tokens }}
              cardsHref={`${boardHref}?epic=${r.id}&sprint=all`}
              slug={board.slug}
              canManage={canManage}
            />
          ),
        })}
      />

      {canCreate && <NewEpicPanel boardId={board.id} slug={board.slug} />}

      <p className="admin-hint u-mt-4">
        Open and Done count cards, not subtasks. Human Tokens are delivered of estimated, the card&rsquo;s own estimate
        plus its subtasks&rsquo;; archived cards are not counted. <Link href={`${boardHref}?sprint=all`}>Open the board</Link>
      </p>
    </>
  );
}
