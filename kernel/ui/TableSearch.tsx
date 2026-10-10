"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mergeQuery, firstParam, type SearchParamsObj } from "@/kernel/ui/url";

// The only interactive island in DataTable: pushes ?q=… (resetting page) on
// submit, preserving all other params. DataTable itself stays a server
// component so column cell renderers never cross the client boundary.
export function TableSearch({
  basePath,
  searchParams,
  placeholder = "Search…",
  paramName = "q",
}: {
  basePath: string;
  searchParams: SearchParamsObj;
  placeholder?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(firstParam(searchParams[paramName]) ?? "");

  function go(next: string | null) {
    router.push(basePath + mergeQuery(searchParams, { [paramName]: next, page: 1 }));
  }

  return (
    <form
      className="admin-search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value.trim() || null);
      }}
    >
      <svg className="admin-search-icon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
      />
      {value && (
        <button
          type="button"
          className="admin-search-clear"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            go(null);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </form>
  );
}
