import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";
import { TableSearch } from "./TableSearch";
import { PreviewRow } from "./PreviewRow";

export type Column<T> = {
  key: string;
  header: string;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "right";
  className?: string;
  // Phone cards (TH.22), read only when the table sets `phoneCards`: the
  // column that heads each card, a small line above that heading, and when a
  // cell has nothing to say, so the card leaves the field out.
  phone?: "title" | "eyebrow";
  phoneEmpty?: (row: T) => boolean;
};

// When provided, the whole row is clickable and opens this content in the side
// car (DetailDrawer). Rendered server-side, so cells/body can use any component.
export type RowPreview = { title: ReactNode; eyebrow?: ReactNode; body: ReactNode };

// Server component. URL-driven: sortable headers and pagination are plain
// <Link>s (no client JS); only the search box is a client island. Column cell
// renderers run server-side, so they never need to be serialized.
export function DataTable<T extends { id?: string | number }>({
  columns,
  rows,
  total,
  page,
  pageSize,
  sort,
  dir,
  basePath,
  searchParams,
  searchPlaceholder,
  emptyText = "No records.",
  filterBar,
  getRowPreview,
  renderRow,
  pageSizeOptions,
  view = "list",
  renderCards,
  phoneCards = false,
}: {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
  dir?: "asc" | "desc";
  basePath: string;
  searchParams: SearchParamsObj;
  searchPlaceholder?: string;
  emptyText?: string;
  filterBar?: ReactNode;
  getRowPreview?: (row: T) => RowPreview;
  // Escape hatch for pages that need a client-owned row (e.g. an interactive
  // shelf). Receives the server-rendered cells; must return a <tr>.
  renderRow?: (row: T, cells: ReactNode) => ReactNode;
  // When set, renders a page-size switcher (URL-driven, resets to page 1).
  pageSizeOptions?: number[];
  // When renderCards is set, the toolbar shows a URL-driven list/cards toggle
  // (?view=), and `view` selects which body to render. Search, filters, and
  // pagination stay shared across both. Backward-compatible: without
  // renderCards the toggle never appears and the table renders as before.
  view?: "list" | "cards";
  renderCards?: (rows: T[]) => ReactNode;
  // On a phone, each row becomes a card: the title column first, every other
  // field under its column's name, empty fields left out, and the sortable
  // columns as a row of buttons above the list. Opt-in (TH.22): the team
  // pages use it; admin tables keep their scrolling table.
  phoneCards?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function sortHref(col: Column<T>): string {
    const nextDir = sort === col.key && dir !== "desc" ? "desc" : "asc";
    return basePath + mergeQuery(searchParams, { sort: col.key, dir: nextDir, page: 1 });
  }
  const sortMark = (col: Column<T>) => (sort === col.key ? (dir === "desc" ? " ↓" : " ↑") : "");

  function headerContent(col: Column<T>): ReactNode {
    if (!col.sortable) return col.header;
    return (
      <Link href={sortHref(col)}>
        {col.header}
        {sortMark(col)}
      </Link>
    );
  }

  function cellClass(col: Column<T>, row: T): string | undefined {
    if (!phoneCards) return col.className;
    const phone = col.phone === "title" ? "admin-cell-phone-title" : col.phone === "eyebrow" ? "admin-cell-phone-eyebrow" : "";
    const empty = col.phoneEmpty?.(row) ? "is-phone-empty" : "";
    return [col.className, phone, empty].filter(Boolean).join(" ") || undefined;
  }
  const phoneSortable = phoneCards && view === "list" ? columns.filter((c) => c.sortable) : [];

  return (
    <div>
      <div className="admin-toolbar">
        <TableSearch basePath={basePath} searchParams={searchParams} placeholder={searchPlaceholder} />
        {filterBar}
        {renderCards && (
          <div className="admin-viewtoggle u-ml-auto">
            <Link
              href={basePath + mergeQuery(searchParams, { view: null })}
              className={view === "list" ? "is-active" : ""}
              aria-current={view === "list" ? "true" : undefined}
            >
              List
            </Link>
            <Link
              href={basePath + mergeQuery(searchParams, { view: "cards" })}
              className={view === "cards" ? "is-active" : ""}
              aria-current={view === "cards" ? "true" : undefined}
            >
              Cards
            </Link>
          </div>
        )}
      </div>

      {phoneSortable.length > 0 && (
        <div className="admin-phone-sort" role="group" aria-label="Sort">
          <span className="admin-phone-sort-l">Sort</span>
          {phoneSortable.map((c) => (
            <Link key={c.key} href={sortHref(c)} className="admin-pagebtn" aria-current={sort === c.key ? "true" : undefined}>
              {c.header}
              {sortMark(c)}
            </Link>
          ))}
        </div>
      )}

      {/* Card view: the cards are their own chrome, so they sit directly on the
          canvas; wrapping them in the white table panel made white-on-white
          cards with invisible edges. The pagination bar keeps the panel. */}
      {view === "cards" && renderCards && rows.length > 0 && renderCards(rows)}
      <div className={`admin-table-wrap${view === "cards" && renderCards && rows.length > 0 ? " admin-cards-pager" : ""}`}>
        {view === "cards" && renderCards ? (
          rows.length === 0 ? <div className="admin-empty">{emptyText}</div> : null
        ) : (
        <div className="admin-table-scroll">
        <table className={phoneCards ? "admin-table admin-table--phone" : "admin-table"}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.align === "right" ? { textAlign: "right" } : undefined}>
                  {headerContent(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="admin-empty">{emptyText}</div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const cells = columns.map((c) => (
                  <td
                    key={c.key}
                    className={cellClass(c, row)}
                    data-label={phoneCards ? c.header : undefined}
                    style={c.align === "right" ? { textAlign: "right" } : undefined}
                  >
                    {c.cell ? c.cell(row) : ((row as Record<string, unknown>)[c.key] as ReactNode) ?? "—"}
                  </td>
                ));
                if (renderRow) {
                  return <Fragment key={row.id ?? i}>{renderRow(row, cells)}</Fragment>;
                }
                if (getRowPreview) {
                  const p = getRowPreview(row);
                  return (
                    <PreviewRow key={row.id ?? i} title={p.title} eyebrow={p.eyebrow} preview={p.body}>
                      {cells}
                    </PreviewRow>
                  );
                }
                return <tr key={row.id ?? i}>{cells}</tr>;
              })
            )}
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
              {pageSizeOptions && (
                <span className="admin-pagesize">
                  {pageSizeOptions.map((n) => (
                    <Link
                      key={n}
                      className="admin-pagebtn"
                      aria-current={n === pageSize ? "true" : undefined}
                      href={basePath + mergeQuery(searchParams, { size: n, page: 1 })}
                    >
                      {n}
                    </Link>
                  ))}
                </span>
              )}
              <Link
                className="admin-pagebtn"
                aria-disabled={page <= 1}
                href={basePath + mergeQuery(searchParams, { page: Math.max(1, page - 1) })}
              >
                Prev
              </Link>
              <span className="admin-pagebtn u-no-events" aria-disabled>
                {page} / {totalPages}
              </span>
              <Link
                className="admin-pagebtn"
                aria-disabled={page >= totalPages}
                href={basePath + mergeQuery(searchParams, { page: Math.min(totalPages, page + 1) })}
              >
                Next
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
