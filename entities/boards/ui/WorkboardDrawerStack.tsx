"use client";

import type { Dispatch, SetStateAction } from "react";
import { cardSlug } from "@/kernel/config/slug";
import type { BoardPerson } from "@/entities/boards/lib/data";
import type { WorkboardBoard, WorkboardCard, WorkboardData } from "@/entities/boards/lib/workboard";
import { CardDrawer } from "./CardDrawer";
import type { Drafts } from "./card-drawer-sections";
import { BoardDrawers, type BoardDrawer } from "./BoardDrawers";
import type { Card, Form, RunAction } from "./board-view-types";
import type { WorkboardFilters } from "./useWorkboardFilters";

// Everything the workboard opens OVER itself: the card drawer, and — on a
// single board with the page chrome — the sprints, archived and settings
// drawers. Split out of Workboard.tsx, which keeps the state and the
// mutations while the stories tab and this file keep the two halves of what
// is on screen.
//
// The card's own links live here rather than in Workboard because they are
// only ever the drawer's: a shareable `?card=` link (CU-01) and, on a
// many-board scope, the way through to the card's own board page.
export function WorkboardDrawerStack({
  form,
  setForm,
  data,
  activeCard,
  boardById,
  single,
  section,
  placement,
  viewerPersonId,
  canEdit,
  extras,
  boardBase,
  drawer,
  setDrawer,
  f,
  saving,
  run,
  teamOptions,
  clientOptions,
  programOptions,
  onBanner,
  onMoveLane,
  onOpenCard,
  onSave,
  onArchive,
  onClose,
  error,
  drafts,
}: {
  form: Form | null;
  /** The drawer's state setter: the epic picker folds a created epic in with an updater (W.163 F11). */
  setForm: Dispatch<SetStateAction<Form | null>>;
  data: WorkboardData;
  activeCard: WorkboardCard | null;
  boardById: Map<string, WorkboardBoard>;
  single: WorkboardBoard | null;
  /** "/admin" or "/team": board links stay in the section they were opened from. */
  section: string;
  /** Optimistic lanes, so a drawer opened mid-move shows where the card went. */
  placement: Record<string, string>;
  viewerPersonId: string | null;
  canEdit: boolean;
  extras: boolean;
  boardBase: string;
  drawer: BoardDrawer;
  setDrawer: (drawer: BoardDrawer) => void;
  f: WorkboardFilters;
  saving: boolean;
  run: RunAction;
  teamOptions: BoardPerson[];
  clientOptions: { id: string; name: string }[];
  programOptions: { id: string; name: string; company_id: string }[];
  onBanner: (message: string | null) => void;
  onMoveLane: (cardId: string, laneId: string) => void;
  /** Opens another card by id, for a blocker's card link (W.56). */
  onOpenCard: (card: Card) => void;
  onSave: () => void;
  onArchive: () => void;
  /** Close the card drawer, asking first when edits would be lost (W.141). */
  onClose: () => void;
  /** The board's banner, shown inside the card drawer (W.141). */
  error: string | null;
  /** The drawer sections' unsent drafts, counted by the close question (W.141). */
  drafts: Drafts;
}) {
  const activeBoard = activeCard ? boardById.get(activeCard.board_id ?? "") : undefined;
  // A card's own shareable link (CU-01): the card's board page with a
  // friendly ?card=<name-shortcode> slug, so a reviewer who opens it lands
  // with the card's drawer open.
  const activeCardSlug = activeCard ? cardSlug(activeCard.title, activeCard.id) : null;
  const shareUrl = activeCard && activeBoard ? `${section}/boards/${activeBoard.slug}?card=${activeCardSlug}` : null;

  return (
    <>
      <CardDrawer
        form={form}
        setForm={setForm}
        data={data}
        activeCard={activeCard}
        lanes={data.lanes}
        currentLaneId={form?.id ? placement[form.id] : undefined}
        viewerPersonId={viewerPersonId}
        readOnly={!canEdit}
        shareUrl={shareUrl}
        boardHref={!single && activeBoard && canEdit ? `${section}/boards/${activeBoard.slug}` : null}
        saving={saving}
        run={run}
        onMoveLane={onMoveLane}
        // Following a blocker's card link (W.56) opens that card in this same
        // drawer, which also mirrors it into the address bar — so the link is
        // a link in every sense, back button included.
        onOpenCard={(taskId) => {
          const target = data.cards.find((c) => c.id === taskId);
          if (target) onOpenCard({ ...target, columnId: placement[target.id] ?? target.laneId });
        }}
        onSave={onSave}
        onArchive={onArchive}
        onClose={onClose}
        error={error}
        drafts={drafts}
      />

      {extras && single && (
        <BoardDrawers
          open={drawer}
          onClose={() => setDrawer(null)}
          board={single}
          boardBase={boardBase}
          data={data}
          f={f}
          saving={saving}
          run={run}
          onError={onBanner}
          teamOptions={teamOptions}
          clientOptions={clientOptions}
          programOptions={programOptions}
        />
      )}
    </>
  );
}
