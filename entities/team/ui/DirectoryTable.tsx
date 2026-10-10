"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DirectoryEntry } from "@/entities/team/lib/data";
import { initials, searchFold } from "@/kernel/ui/format";

// Client-side search / sort / filter over the roster. The directory is small
// (a couple dozen people), so everything runs in memory — no round-trips, no
// URL state — while reusing the admin table + search styling.

type SortKey = "name" | "positionTitle" | "departmentName" | "location" | "managerName";
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "positionTitle", label: "Position" },
  { key: "departmentName", label: "Department" },
  { key: "location", label: "Location" },
  { key: "managerName", label: "Manager" },
];

// Sorted, de-duped, non-null option list for a filter dropdown.
function optionsFor(entries: DirectoryEntry[], key: "departmentName" | "managerName"): string[] {
  const set = new Set<string>();
  for (const e of entries) if (e[key]) set.add(e[key]!);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function DirectoryTable({ entries }: { entries: DirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [manager, setManager] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const deptOptions = useMemo(() => optionsFor(entries, "departmentName"), [entries]);
  const managerOptions = useMemo(() => optionsFor(entries, "managerName"), [entries]);

  const rows = useMemo(() => {
    // Fold diacritics on both sides so "dang" finds "Đặng" and "le" finds "Lê".
    const q = searchFold(query.trim());
    const filtered = entries.filter((e) => {
      if (dept && e.departmentName !== dept) return false;
      if (manager && e.managerName !== manager) return false;
      if (!q) return true;
      return [e.name, e.positionTitle, e.departmentName, e.location, e.managerName]
        .some((v) => v && searchFold(v).includes(q));
    });
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Blanks always sort to the bottom regardless of direction.
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv) * dir;
    });
  }, [entries, query, dept, manager, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const filtering = !!(query || dept || manager);

  return (
    <>
      <div className="admin-toolbar">
        <div className="admin-search">
          <svg className="admin-search-icon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, role, department…"
            aria-label="Search directory"
          />
          {query && (
            <button type="button" className="admin-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
              <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <select className="admin-select u-w-auto" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department">
          <option value="">All departments</option>
          {deptOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select className="admin-select u-w-auto" value={manager} onChange={(e) => setManager(e.target.value)} aria-label="Filter by manager">
          <option value="">All managers</option>
          {managerOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <span className="admin-team-dir-count">
          {rows.length} {rows.length === 1 ? "person" : "people"}{filtering ? ` of ${entries.length}` : ""}
        </span>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key}>
                    <button type="button" className="admin-th-sort" onClick={() => toggleSort(c.key)} aria-label={`Sort by ${c.label}`}>
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="admin-cell-muted admin-empty--tall u-center-text">
                    No one matches those filters.
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id}>
                    <td className="admin-cell-strong">
                      <Link href={`/team/directory/${e.id}`} className="admin-dir-name">
                        <span className="admin-avatar admin-avatar--md" aria-hidden>
                          {e.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                            <img src={e.avatarUrl} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span>{initials(e.name)}</span>
                          )}
                        </span>
                        {e.name}
                      </Link>
                    </td>
                    <td>{e.positionTitle || <span className="admin-cell-muted">—</span>}</td>
                    <td>{e.departmentName || <span className="admin-cell-muted">—</span>}</td>
                    <td>{e.location || <span className="admin-cell-muted">—</span>}</td>
                    <td>{e.managerName || <span className="admin-cell-muted">—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
