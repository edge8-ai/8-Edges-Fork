"use client";

import Link from "next/link";
import type { EpicRow } from "@/entities/boards/lib/types";

export type WorkboardTab = "stories" | "sprints";

/**
 * The board page's tabs: the cards, the sprints they belong to, and a link to
 * the board's Epics page, which is its own route rather than a panel here.
 *
 * Only a single-board page has them — a sprint belongs to one board, so
 * across boards there is nothing for the second tab to show. The Sprints tab
 * carries its count in the label because the reason to open it is usually to
 * find out whether there are any.
 */
export function WorkboardTabs({
  tab,
  sprintCount,
  epics,
  boardBase,
  onSelect,
}: {
  tab: WorkboardTab;
  sprintCount: number;
  epics: EpicRow[];
  boardBase: string;
  onSelect: (tab: WorkboardTab) => void;
}) {
  const epicCount = epics.filter((e) => e.status !== "archived").length;
  return (
    <div className="admin-tabs u-mb-3" role="tablist">
      {(["stories", "sprints"] as const).map((t) => (
        <button
          key={t}
          className={`admin-tab${tab === t ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => onSelect(t)}
        >
          {t === "stories" ? "Stories" : `Sprints${sprintCount > 0 ? ` (${sprintCount})` : ""}`}
        </button>
      ))}
      <Link className="admin-tab u-link-plain" href={`${boardBase}/epics`}>
        {`Epics${epicCount > 0 ? ` (${epicCount})` : ""}`}
      </Link>
    </div>
  );
}
