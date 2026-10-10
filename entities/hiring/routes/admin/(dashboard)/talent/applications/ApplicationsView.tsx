"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { ApplicationsTable, type AppRow } from "./ApplicationsTable";
import type { StageMap } from "./ApplicationsBoard";

// The board pulls in @hello-pangea/dnd. The view defaults to list and only swaps
// to board after a localStorage check, so load the board lazily to keep the DnD
// library out of first-load JS for the (common) list-only user. Mirrors the
// CockpitDeals precedent.
const ApplicationsBoard = dynamic(() => import("./ApplicationsBoard").then((m) => m.ApplicationsBoard), {
  loading: () => <div className="admin-empty">Loading…</div>,
});

const VIEW_KEY = "edge8-admin-applications-view";

// List/board switcher. Renders list on the server pass and swaps to the
// remembered view after mount — reading localStorage in the initial render
// would mismatch hydration.
export function ApplicationsView({
  rows,
  stageColumns,
  stageMap,
}: {
  rows: AppRow[];
  stageColumns: KanbanColumn[];
  stageMap: StageMap;
}) {
  const [view, setView] = useState<"list" | "board">("list");

  useEffect(() => {
    if (localStorage.getItem(VIEW_KEY) === "board") setView("board");
  }, []);

  function pick(v: "list" | "board") {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  return (
    <>
      <div className="admin-toolbar u-gap-2 u-mb-1">
        <button
          type="button"
          className={`admin-btn admin-btn--sm${view === "list" ? " admin-btn--primary" : ""}`}
          onClick={() => pick("list")}
          aria-pressed={view === "list"}
        >
          List
        </button>
        <button
          type="button"
          className={`admin-btn admin-btn--sm${view === "board" ? " admin-btn--primary" : ""}`}
          onClick={() => pick("board")}
          aria-pressed={view === "board"}
        >
          Board
        </button>
      </div>
      {view === "list" ? (
        <ApplicationsTable rows={rows} />
      ) : (
        <ApplicationsBoard rows={rows} columns={stageColumns} stageMap={stageMap} />
      )}
    </>
  );
}
