"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cardSlug } from "@/kernel/config/slug";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import { CardDrawer } from "./CardDrawer";
import { useCardForm } from "./useCardForm";
import { useBoardActionRunner } from "./useBoardActionRunner";

// One card's drawer over a page that is not its board (TH.2.6): the board's own
// drawer, form and writes, on the one board the card lives on, so a card opened
// from the Inbox is the same card, with the same controls, as on its board.
//
// The host page owns the address: it renders this while its URL names a card,
// and closing goes to `closeHref`, the page without that `?card=`. Leaving
// through the address rather than by hiding the drawer keeps the back button
// and a pasted link agreeing with what is on screen.
export function CardPeekDrawer({
  data,
  cardId,
  section,
  closeHref,
  viewerPersonId,
  onMove,
}: {
  data: WorkboardData;
  cardId: string;
  section: "/team" | "/admin";
  closeHref: string;
  viewerPersonId: string;
  onMove: (cardId: string, columnId: string, boardSlug: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);
  const { saving, startSaving, run } = useBoardActionRunner(setBanner);
  const { form, setForm, openCard, save, archive, close, drafts, autosave } = useCardForm({ data, sprintFilter: "all", epicFilter: [], setBanner, router, startSaving, run, viewerPersonId });
  const board = data.boards[0];
  const activeCard = form?.id ? data.cards.find((c) => c.id === form.id) ?? null : null;

  // Open the card the address names, once per name: a refresh after a save
  // brings new data, not a new card, and must not reopen it over an edit.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (opened.current === cardId) return;
    const c = data.cards.find((x) => x.id === cardId);
    if (!c) return;
    opened.current = cardId;
    openCard({ ...c, columnId: c.laneId });
  }, [cardId, data.cards, openCard]);

  // However the drawer closes (the cross, Escape, a save, an archive), the
  // page goes back to its own address, and that render drops this drawer.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (form) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    router.replace(closeHref, { scroll: false });
  }, [form, closeHref, router]);

  return (
    <CardDrawer
      form={form}
      setForm={setForm}
      data={data}
      activeCard={activeCard}
      lanes={data.lanes}
      currentLaneId={activeCard?.laneId}
      viewerPersonId={viewerPersonId}
      readOnly={false}
      shareUrl={activeCard && board ? `${section}/boards/${board.slug}?card=${cardSlug(activeCard.title, activeCard.id)}` : null}
      // The way through to the whole board, since the page behind is not it.
      boardHref={board ? `${section}/boards/${board.slug}` : null}
      saving={saving}
      run={run}
      onMoveLane={(id, laneId) => {
        const columnId = board?.laneColumn[laneId];
        if (board && columnId) run(() => onMove(id, columnId, board.slug));
      }}
      onOpenCard={(taskId) => {
        const target = data.cards.find((c) => c.id === taskId);
        if (target) openCard({ ...target, columnId: target.laneId });
      }}
      onSave={save}
      onArchive={archive}
      onClose={close}
      error={banner}
      drafts={drafts}
      autosave={autosave}
    />
  );
}

/**
 * The card cannot be opened here: it was archived, or it is on a board the
 * reader is not on. Said in the same drawer rather than by nothing happening,
 * with the board's own page when the reader may open that.
 */
export function CardPeekClosed({ boardHref, closeHref }: { boardHref: string | null; closeHref: string }) {
  const router = useRouter();
  return (
    <DetailDrawer open onClose={() => router.replace(closeHref, { scroll: false })} title="This card can't open here">
      <p className="admin-cell-muted">
        It may have been archived, or it sits on a board you are not on.
        {boardHref && (
          <>
            {" "}
            <Link href={boardHref}>Open its board</Link> to look for it there.
          </>
        )}
      </p>
    </DetailDrawer>
  );
}
