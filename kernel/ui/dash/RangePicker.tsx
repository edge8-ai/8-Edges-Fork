"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type RangeOption = { value: string; label: string };

// The period every tab of a hub reads: a quiet segmented control beside the
// tabs that rewrites one search param and keeps the rest. Route-based like
// PillTabs, so the range survives a tab change and a deep link opens on it.
export function RangePicker({ options, current, param = "range", ariaLabel = "Period" }: { options: RangeOption[]; current: string; param?: string; ariaLabel?: string }) {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const hrefFor = (value: string) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set(param, value);
    return `${pathname}?${next.toString()}`;
  };
  return (
    <nav className="dash-range" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Link key={o.value} href={hrefFor(o.value)} className={`dash-range-opt${active ? " is-active" : ""}`} aria-current={active ? "true" : undefined} scroll={false}>
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
