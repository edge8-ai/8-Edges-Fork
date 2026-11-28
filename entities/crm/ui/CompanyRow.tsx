"use client";

import { useRouter } from "next/navigation";
import { useSurfaceBase } from "@/kernel/shell/surface-client";
import type { MouseEvent, ReactNode } from "react";

// Clickable company row for the Companies and Clients lists: the whole row
// deep-links to a detail page. `detailBasePath` sets where (the company 360 on
// the viewer's surface by default; the team clients list points it at the team hub). Inner controls
// (the Clients page's action buttons) are excluded so they act on their own
// click, not navigate.

export type CompanyRow = {
  id: string;
  name: string | null;
  website_url: string | null;
  industry: string | null;
  industry_normalized: string | null;
  size_band: string | null;
  country: string | null;
  priority: string | null;
  archived_at: string | null;
  created_at: string;
};

export function CompanyLinkRow({
  row,
  children,
  detailBasePath,
  hrefQuery,
}: {
  row: CompanyRow;
  children: ReactNode;
  detailBasePath?: string;
  // Optional query (e.g. "?from=clients") so the detail page can show a
  // context-aware back-link.
  hrefQuery?: string;
}) {
  const router = useRouter();
  const surface = useSurfaceBase();
  const href = `${detailBasePath ?? `${surface}/revenue/companies`}/${row.id}${hrefQuery ?? ""}`;

  // closest() matches the row itself too, so exclude currentTarget — otherwise
  // the guard swallows every click and the row never navigates.
  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      router.push(href);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="link">
      {children}
    </tr>
  );
}
