"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";

export type HubStatus = "active" | "inactive" | "all";

// URL-driven so the choice survives a reload and can be linked to. The page
// stays a server component and does the filtering; this only rewrites the
// query string. Uses .admin-viewtoggle, the shared segmented control.
const OPTIONS: { key: HubStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "all", label: "All" },
];

export function ClientHubFilter({
  active,
  defaultStatus,
  counts,
  searchParams,
}: {
  active: HubStatus;
  defaultStatus: HubStatus;
  counts: Record<HubStatus, number>;
  searchParams: SearchParamsObj;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(next: HubStatus) {
    // Selecting the default drops the param so the canonical URL stays clean.
    const query = mergeQuery(searchParams, { status: next === defaultStatus ? null : next });
    startTransition(() => router.push(`/admin/client-hubs${query}`, { scroll: false }));
  }

  return (
    <div className="admin-viewtoggle" role="group" aria-label="Client status">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={option.key === active ? "is-active" : ""}
          aria-pressed={option.key === active}
          disabled={pending}
          onClick={() => select(option.key)}
        >
          {option.label} ({counts[option.key].toLocaleString()})
        </button>
      ))}
    </div>
  );
}
