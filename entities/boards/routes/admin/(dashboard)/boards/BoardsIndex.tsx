"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { initials } from "@/entities/boards/lib/types";
import type { BoardListItem } from "@/entities/boards/lib/data";
import { NewBoardForm } from "./NewBoardForm";
import { clientLabel } from "@/entities/boards/lib/card-facts";

const VIEW_KEY = "boards:view";
type View = "cards" | "list";

type SortKey = "name" | "client" | "sprint" | "open" | "done" | "members";

const LIST_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Board" },
  { key: "client", label: "Client" },
  { key: "sprint", label: "Current sprint" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "members", label: "Members" },
];

export function BoardsIndex({
  boards,
  clients,
}: {
  boards: BoardListItem[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  // List on first paint (SSR-safe); the stored preference applies after mount.
  const [view, setView] = useState<View>("list");
  useEffect(() => {
    if (localStorage.getItem(VIEW_KEY) === "cards") setView("cards");
  }, []);
  function pick(v: View) {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((a) => !a);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  }
  // null sortKey = the boards' own sort_order, as the server returned them.
  const sorted = useMemo(() => {
    if (!sortKey) return boards;
    const val = (b: BoardListItem): string | number => {
      switch (sortKey) {
        case "name":
          return b.name.toLowerCase();
        case "client":
          return (b.client_name ?? "").toLowerCase();
        case "sprint":
          return (b.current_sprint?.name ?? "").toLowerCase();
        case "open":
          return b.open_count;
        case "done": {
          const total = b.open_count + b.done_count;
          return total ? b.done_count / total : -1;
        }
        case "members":
          return b.member_names.length;
      }
    };
    return [...boards].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
  }, [boards, sortKey, sortAsc]);

  return (
    <>
      <div className="u-row u-gap-3 u-between u-mb-4">
        <button
          className="admin-btn admin-btn--primary admin-btn--sm"
          onClick={() => setCreating(true)}
          disabled={creating}
        >
          New board
        </button>
        <div className="admin-viewtoggle" role="group" aria-label="Boards view">
          <button className={view === "cards" ? "is-active" : ""} onClick={() => pick("cards")}>
            Cards
          </button>
          <button className={view === "list" ? "is-active" : ""} onClick={() => pick("list")}>
            List
          </button>
        </div>
      </div>

      {creating && <NewBoardForm clients={clients} onClose={() => setCreating(false)} />}

      {boards.length === 0 ? (
        <div className="admin-card admin-section-card">
          <span className="admin-cell-muted">No boards yet.</span>
        </div>
      ) : view === "cards" ? (
        <div className="admin-kpi-grid">
          {boards.map((b) => {
            const total = b.open_count + b.done_count;
            const pct = total > 0 ? Math.round((b.done_count / total) * 100) : 0;
            const shown = b.member_names.slice(0, 4);
            const extra = b.member_names.length - shown.length;
            return (
              <Link
                key={b.id}
                href={`/admin/boards/${b.slug}`}
                className="admin-card admin-section-card is-clickable u-stack u-link-plain"
              >
                <div className="u-row u-between">
                  <span className="admin-cell-strong u-lg">
                    {b.name}
                  </span>
                  {b.client_name && <Badge tone="info">Client</Badge>}
                </div>
                <div className="admin-cell-muted u-mt-1">{clientLabel(b)}</div>
                <div className="u-mt-4">
                  <div
                    className="admin-cell-muted u-row u-between u-mb-1 u-sm"
                  >
                    <span>
                      {total === 0 ? "No cards yet" : b.open_count === 0 ? "All done" : `${b.open_count} open`}
                    </span>
                    {total > 0 && <span>{pct}% done</span>}
                  </div>
                  <div className="admin-meter admin-meter--hairline">
                    <div className="admin-meter-fill" style={{ width: `${pct}%` }} /* layout-ok: data-driven progress width */ />
                  </div>
                </div>
                <div className="u-row u-between u-mt-3">
                  <span className="admin-board-avatar-stack">
                    {shown.map((name, i) => (
                      <span key={`${name}-${i}`} className="admin-avatar admin-avatar--sm admin-avatar--soft" title={name}>
                        {initials(name)}
                      </span>
                    ))}
                    {extra > 0 && <span className="admin-board-avatar-more">+{extra}</span>}
                    {b.member_names.length === 0 && (
                      <span className="admin-cell-muted u-sm">
                        No members
                      </span>
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  {LIST_COLUMNS.map((c) => (
                    <th key={c.key}>
                      <button
                        type="button"
                        className="admin-th-sort is-clickable"
                        onClick={() => toggleSort(c.key)}
                        aria-label={`Sort by ${c.label}`}
                      >
                        {c.label}
                        <span className="admin-team-dir-caret" aria-hidden>
                          {sortKey === c.key ? (sortAsc ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => {
                  const total = b.open_count + b.done_count;
                  const pct = total > 0 ? Math.round((b.done_count / total) * 100) : 0;
                  const shown = b.member_names.slice(0, 5);
                  const extra = b.member_names.length - shown.length;
                  return (
                    <tr
                      key={b.id}
                      tabIndex={0}
                      onClick={() => router.push(`/admin/boards/${b.slug}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") router.push(`/admin/boards/${b.slug}`);
                      }}
                    >
                      <td className="admin-cell-strong">{b.name}</td>
                      <td>
                        {b.client_name ? (
                          <span className="u-row">
                            {b.client_name} <Badge tone="info">Client</Badge>
                          </span>
                        ) : (
                          <span className="admin-cell-muted">Internal</span>
                        )}
                      </td>
                      <td>
                        {b.current_sprint ? (
                          <Link
                            href={`/admin/boards/${b.slug}/sprints/${b.current_sprint.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="admin-link-accent"
                            title={b.current_sprint.ends_on ? `Ends ${b.current_sprint.ends_on}` : undefined}
                          >
                            {b.current_sprint.name}
                          </Link>
                        ) : (
                          <span className="admin-cell-muted">—</span>
                        )}
                      </td>
                      <td className="admin-cell-mono">{b.open_count}</td>
                      <td>
                        {total === 0 ? (
                          <span className="admin-cell-muted">—</span>
                        ) : (
                          <span className="u-row">
                            <span className="admin-meter admin-meter--hairline u-inline-block u-w-90">
                              <span className="admin-meter-fill" style={{ width: `${pct}%`, display: "block" }} /* layout-ok: data-driven progress width */ />
                            </span>
                            <span className="admin-cell-mono">{pct}%</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="admin-board-avatar-stack">
                          {shown.map((name, i) => (
                            <span key={`${name}-${i}`} className="admin-avatar admin-avatar--sm admin-avatar--soft" title={name}>
                              {initials(name)}
                            </span>
                          ))}
                          {extra > 0 && <span className="admin-board-avatar-more">+{extra}</span>}
                          {b.member_names.length === 0 && <span className="admin-cell-muted">—</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
