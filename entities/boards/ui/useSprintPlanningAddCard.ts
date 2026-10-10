"use client";

import type { useRouter } from "next/navigation";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import { archiveCard, createCard } from "@/entities/boards/lib/actions";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import { setCardSprint } from "@/entities/boards/lib/sprint-actions";
import { moveCardColumn } from "@/entities/boards/lib/move-card";
import { useCardForm } from "./useCardForm";
import { useBoardActionRunner } from "./useBoardActionRunner";

// Adding a card on sprint planning, like every other board (W.92.8). Split out
// of SprintPlanning to keep that file under the size cap: the foot's two verbs
// (Enter creates, Shift+Enter opens the drawer), the card form the drawer sits
// on, and the drawer's own lane control. The panel is one board, so the board
// and its next sprint are known — the create needs no board picker the way a
// bare drawer on this all-scope page would.
export function useSprintPlanningAddCard({
  data,
  setBanner,
  router,
}: {
  data: WorkboardData;
  setBanner: (message: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const { saving, startSaving, run } = useBoardActionRunner(setBanner);
  const { form, setForm, openCard, openCreate, save, archive, close, drafts } = useCardForm({ data, sprintFilter: "all", epicFilter: [], setBanner, router, startSaving, run });
  // The lane a new card lands in: the boards' shared first column ("To do").
  // The same lane the drawer files into, so a card added either way is one card.
  const defaultLane = data.lanes[0]?.id ?? "";

  // Enter at the foot: create in the board's To do column, and — under Next
  // sprint — commit it there too. Same defaults openCreate gives the drawer.
  function quickAdd(pb: PlanningBoard, column: "open" | "next", title: string, onDone: () => void, onFail: () => void) {
    // A refusal made here, before the server is asked, takes back the foot's
    // row exactly as the server's own refusal does (W.141).
    const refuse = (message: string) => {
      setBanner(message);
      onFail();
    };
    const columnId = pb.board.laneColumn[defaultLane];
    if (!columnId) return refuse(`${pb.board.name} has no column to add a card to.`);
    const sprintId = column === "next" ? pb.next?.id ?? null : null;
    if (column === "next" && !sprintId) return refuse(`${pb.board.name} has no next sprint yet; the Monday routine opens one.`);
    run(async () => {
      const created = await createCard({ boardId: pb.board.id, columnId, title });
      if (!created.ok) return created;
      if (created.id && sprintId) {
        const r = await setCardSprint(created.id, sprintId, pb.board.slug);
        if (!r.ok) return r;
      }
      return { ok: true };
    }, onDone, onFail);
  }

  // Shift+Enter, or the button when nothing is typed: the full drawer,
  // pointed at this panel's board and (under Next sprint) its next sprint.
  function openDrawer(pb: PlanningBoard, column: "open" | "next", title: string) {
    openCreate(defaultLane, undefined, title, { boardId: pb.board.id, sprintId: column === "next" ? pb.next?.id ?? undefined : undefined });
  }

  // The drawer's own lane control (and a blocker's card link) still work: a
  // lane is a column name, resolved to the card's board's own column.
  function moveLaneFromDrawer(cardId: string, laneId: string) {
    const card = data.cards.find((c) => c.id === cardId);
    const board = card ? data.boards.find((b) => b.id === card.board_id) : undefined;
    const columnId = board?.laneColumn[laneId];
    if (!board || !columnId) return;
    run(() => moveCardColumn(cardId, columnId, board.slug));
  }

  // A click on a planning card opens it (W.115) — by its board LANE, because
  // the planning columns (Not done, Next sprint, Done) are not lanes and the
  // drawer's lane picker would otherwise show one the card is not in.
  function openPlanningCard(c: WorkboardCard) {
    openCard({ ...c, columnId: c.laneId });
  }

  // The card menu's Archive (W.115): the reversible way to clear a card
  // nobody will pick up again. Permanent delete stays in the board's Archived
  // drawer.
  function archiveFromMenu(c: WorkboardCard) {
    const board = data.boards.find((b) => b.id === c.board_id);
    if (!board) return;
    run(() => archiveCard(c.id, board.slug));
  }

  return { form, setForm, openCard, save, archive, close, drafts, saving, run, quickAdd, openDrawer, moveLaneFromDrawer, openPlanningCard, archiveFromMenu };
}
