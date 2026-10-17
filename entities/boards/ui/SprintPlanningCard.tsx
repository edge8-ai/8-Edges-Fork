"use client";

import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { LONG_CARRY_SPRINTS } from "@/entities/boards/lib/carry-history";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import { WorkboardCard } from "./WorkboardCard";
import type { Card } from "./board-view-types";

// One card inside a planning panel. Since W.23 the card itself is the one
// workboard card (WB-01) — planning no longer draws a second design, so the
// legibility work on WorkboardCard shows up here without anyone porting it —
// and this file is only the planning-only wrapper around it:
//
//   · the controls that commit (W.22). Everything on this page used to be a
//     drag, so committing twenty cards was twenty drags. A card in Not done
//     carries a right arrow, a card in Next sprint a left one, and a checkbox
//     puts it in the panel's selection for "Commit selected". The writes are
//     the same ones the drag calls, so nothing new reaches the database.
//   · what carrying a card means (W.52). It is a fact, not a failure: one
//     muted line, never the amber the board reserves for overdue and
//     blocked. Where the same card has been committed three weeks running the
//     wrapper asks one quiet question — of the card, never of a person.
//
// Since W.112 the card at rest IS the board's card. The controls float over
// its top-right corner and show while the pointer or the keyboard is on the
// card, while its box is ticked, or while its menu is open; on a touch screen,
// which has no hover, they sit in a row above the card as they always did.
// Opacity rather than display, as the board's tick (W.93): they stay in the
// tab order, so the keyboard reaches them and reveals them in one step. The
// carried chip became plain text for the same reason: a chip at rest was the
// loudest thing on a card the meeting had not decided about yet.
//
// The client and the board are the panel's heading (W.17) and one client is in
// view, so the card leaves both off.
//
// A click on the card opens it in the Workboard's own drawer (W.115), and the
// "…" menu offers the same Open plus Archive, for the card nobody will pick up
// again. Archive, never delete, in a meeting: an archived card comes back from
// the board's Archived drawer, where the permanent delete already lives. Every
// control up here stops its click, or it would open the drawer as well.
export function SprintPlanningCard({
  card,
  board,
  epicById,
  sprintFilter,
  carriedFrom,
  carriedSprints,
  selected,
  onToggleSelected,
  onCommit,
  onUncommit,
  onOpen,
  onArchive,
  busy,
}: {
  card: Card;
  board: WorkboardBoard | undefined;
  epicById: Map<string, EpicRow>;
  // The sprint the panel is committing to, so a committed card does not wear a
  // chip naming the sprint it is sitting in.
  sprintFilter: string;
  // The sprint this card was carried out of, or null when it is backlog or done.
  carriedFrom: string | null;
  // How many sprints this card has been committed to, when that is more than one.
  carriedSprints: number;
  // Null when the viewer cannot change what is committed (no rights, or the
  // sprint is locked): then there is no checkbox and no arrow.
  selected: boolean | null;
  onToggleSelected: () => void;
  onCommit: (() => void) | null;
  onUncommit: (() => void) | null;
  onOpen: () => void;
  // Null when the viewer cannot edit the card.
  onArchive: (() => void) | null;
  // A write from this page is in flight: Archive waits, so one card is never
  // archived twice by a second click.
  busy: boolean;
}) {
  const longCarry = carriedFrom !== null && carriedSprints >= LONG_CARRY_SPRINTS;
  return (
    <>
      <div className={`admin-kanban-card-head sp-card-controls${selected ? " is-shown" : ""}`} onClick={(e) => e.stopPropagation()}>
        {selected !== null && (
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${card.title}`}
            onChange={onToggleSelected}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {onCommit && (
          <button type="button" className="admin-kanban-card-arrow" title="Commit to the next sprint" aria-label={`Commit ${card.title} to the next sprint`} onClick={onCommit}>
            →
          </button>
        )}
        {onUncommit && (
          <button type="button" className="admin-kanban-card-arrow" title="Take out of the next sprint" aria-label={`Take ${card.title} out of the next sprint`} onClick={onUncommit}>
            ←
          </button>
        )}
        <CardMenu title={card.title} busy={busy} onOpen={onOpen} onArchive={onArchive} />
      </div>
      <WorkboardCard
        card={card}
        board={board}
        showBoard={false}
        viewerPersonId={null}
        sprintFilter={sprintFilter}
        sprintName={EMPTY_SPRINT_NAMES}
        epicById={epicById}
        hideClient
        hideSprint
      />
      {carriedFrom && (
        <div className="admin-kanban-card-sub u-muted u-truncate u-mt-1" title={`Carried from ${carriedFrom}`}>
          carried from {carriedFrom}
        </div>
      )}
      {longCarry && (
        <div className="admin-kanban-card-sub u-muted u-mt-1">
          carried {carriedSprints} weeks — is this one card or {carriedSprints}?
        </div>
      )}
    </>
  );
}

// hideSprint is on, so the card never looks a sprint name up. A module-scope
// constant keeps every card from allocating a map it cannot read.
const EMPTY_SPRINT_NAMES: Map<string, string> = new Map();

// The OS's one menu pattern (absolute flyout + full-screen click-catcher), as
// in WorkboardSettingsMenu: there is no menu primitive to share.
function CardMenu({ title, busy, onOpen, onArchive }: { title: string; busy: boolean; onOpen: () => void; onArchive: (() => void) | null }) {
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="admin-record-menu-wrap">
      <button type="button" className="admin-kanban-card-arrow" aria-haspopup="menu" aria-expanded={open} aria-label={`More for ${title}`} title="More" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <>
          <div className="admin-record-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-record-menu" role="menu" aria-label={`More for ${title}`}>
            <button type="button" role="menuitem" className="admin-record-menu-item" onClick={pick(onOpen)}>
              Open card
            </button>
            {onArchive && (
              <button type="button" role="menuitem" className="admin-record-menu-item admin-record-menu-item--danger" disabled={busy} onClick={pick(onArchive)}>
                Archive
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
