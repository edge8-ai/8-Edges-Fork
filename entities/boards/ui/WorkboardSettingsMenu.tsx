"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/kernel/ui/Icon";

// Sprints, Epics, Archived and Board settings, collapsed into one menu (W.26).
// Four buttons that each open something ELSE about the board were sitting in
// the same row as the filters that change what is on screen, and the row was
// what pushed the board below the fold. They are one thing — "manage this
// board" — and they are used a few times a week, not a few times an hour.
//
// It follows the OS's one menu pattern (absolute flyout + full-screen
// click-catcher), the same as MultiSelect and the record kebab in admin.css,
// because there is no other menu primitive to share.
export function WorkboardSettingsMenu({
  boardBase,
  epicCount,
  sprintCount,
  archivedCount,
  canManage,
  onOpen,
}: {
  boardBase: string;
  epicCount: number;
  sprintCount: number;
  archivedCount: number;
  canManage: boolean;
  onOpen: (drawer: "sprints" | "archived" | "settings") => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="admin-record-menu-wrap">
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Board settings and tools"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="gear" /> Board
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={close} />
          <div className="admin-record-menu" role="menu" aria-label="Board settings and tools">
            <button type="button" role="menuitem" className="admin-record-menu-item" onClick={() => { close(); onOpen("sprints"); }}>
              Sprints{sprintCount > 0 ? ` (${sprintCount})` : ""}
            </button>
            <Link role="menuitem" className="admin-record-menu-item" href={`${boardBase}/epics`} onClick={close}>
              Epics{epicCount > 0 ? ` (${epicCount})` : ""}
            </Link>
            {archivedCount > 0 && (
              <button type="button" role="menuitem" className="admin-record-menu-item" onClick={() => { close(); onOpen("archived"); }}>
                Archived ({archivedCount})
              </button>
            )}
            {canManage && (
              <button type="button" role="menuitem" className="admin-record-menu-item" onClick={() => { close(); onOpen("settings"); }}>
                Board settings
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
