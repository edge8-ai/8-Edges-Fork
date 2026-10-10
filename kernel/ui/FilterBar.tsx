"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { mergeQuery, firstParam, type SearchParamsObj } from "@/kernel/ui/url";

export type FilterOption = { value: string; label: string };
export type FilterDef = { key: string; label: string; options: FilterOption[] };

// Client island: native <select>s that push to the URL (mirrors TableSearch's
// pattern). Sits alongside the search box in DataTable's toolbar.
export function FilterBar({
  basePath,
  searchParams,
  filters,
}: {
  basePath: string;
  searchParams: SearchParamsObj;
  filters: FilterDef[];
}) {
  const router = useRouter();
  const active = filters.some((f) => !!firstParam(searchParams[f.key])) || !!firstParam(searchParams.q);

  function go(key: string, value: string) {
    router.push(basePath + mergeQuery(searchParams, { [key]: value || null, page: 1 }));
  }

  const clearOverrides: Record<string, string | number | null> = { q: null, page: 1 };
  for (const f of filters) clearOverrides[f.key] = null;

  return (
    <div className="u-row u-wrap">
      {filters.map((f) => (
        <select
          key={f.key}
          className="admin-select u-w-auto"
          aria-label={f.label}
          value={firstParam(searchParams[f.key]) ?? ""}
          onChange={(e) => go(f.key, e.target.value)}
        >
          <option value="">{f.label}: All</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {active && (
        <Link href={basePath + mergeQuery(searchParams, clearOverrides)} className="admin-cell-muted u-sm">
          Clear all
        </Link>
      )}
    </div>
  );
}
